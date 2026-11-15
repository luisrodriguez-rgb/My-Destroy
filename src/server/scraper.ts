import { chromium, type Browser, type Page } from '@playwright/test';
import type { TextRunInput } from '../game/text/DOMTextManager';
import { PAPER } from '../game/tuning';
import type { PlatformMaterial } from '../game/tuning';
import { foldCount, paperHeightFor } from '../game/pageExtent';

export interface ScrapedPlatform {
  id: string;
  name: string;
  x: number;      // relative to paper coordinates (0..1104)
  y: number;      // relative to paper coordinates (0..page height)
  width: number;
  height: number;
  tag: string;
  material?: PlatformMaterial;
}

export interface ScrapedDetachable {
  id: string;
  x: number;      // relative to paper coordinates (0..1104)
  y: number;      // relative to paper coordinates (0..page height)
  width: number;
  height: number;
  tag: string;
}

export interface ScrapedPageResult {
  url: string;
  title: string;
  screenshot: string; // base64 data URL
  width: number;      // 1104
  height: number;     // 488 for one fold, up to 1952
  platforms: ScrapedPlatform[];
  detachables: ScrapedDetachable[];
  textRuns?: TextRunInput[];
  renderMode?: 'live' | 'html-fallback' | 'preset';
  materialSummary?: Partial<Record<PlatformMaterial, number>>;
}

export interface CandidateElement {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  isMediaOrControl?: boolean;
}

const VIEWPORT_WIDTH = PAPER.width;
const VIEWPORT_HEIGHT = PAPER.height;
const MIN_VERTICAL_GAP = 42;
const MAX_PLATFORMS = 14;
const MAX_DETACHABLES = 8;
const MAX_CACHE_ENTRIES = 16;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_SCRAPES = 2;
const MAX_QUEUE_LENGTH = 6;

export class SecurityBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityBlockError';
  }
}

interface CacheEntry {
  result: ScrapedPageResult;
  expiresAt: number;
}

const scrapeCache = new Map<string, CacheEntry>();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DNS_CACHE_ENTRIES = 256;
/** hostname -> expiry timestamp, only for hosts whose DNS records were all public. */
const dnsSafetyCache = new Map<string, number>();
let activeScrapes = 0;
const waitQueue: Array<() => void> = [];

export function clearScrapeCache(): void {
  scrapeCache.clear();
}

function getCachedScrape(url: string): ScrapedPageResult | undefined {
  const entry = scrapeCache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    scrapeCache.delete(url);
    return undefined;
  }
  // Refresh LRU order
  scrapeCache.delete(url);
  scrapeCache.set(url, entry);
  return entry.result;
}

function setCachedScrape(url: string, result: ScrapedPageResult): void {
  if (scrapeCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = scrapeCache.keys().next().value;
    if (oldestKey) scrapeCache.delete(oldestKey);
  }
  scrapeCache.set(url, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function acquireScrapeSlot(): Promise<void> {
  if (activeScrapes < MAX_CONCURRENT_SCRAPES) {
    activeScrapes++;
    return;
  }
  if (waitQueue.length >= MAX_QUEUE_LENGTH) {
    throw new Error('Servidor de capturas ocupado. Intenta de nuevo en unos segundos.');
  }
  await new Promise<void>(resolve => waitQueue.push(resolve));
  activeScrapes++;
}

function releaseScrapeSlot(): void {
  activeScrapes = Math.max(0, activeScrapes - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function detectIpVersion(ip: string): 0 | 4 | 6 {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255) ? 4 : 0;
  }
  if (ip.includes(':') && /^[0-9a-f:.]+$/i.test(ip)) {
    return 6;
  }
  return 0;
}

async function defaultDnsLookup(host: string): Promise<Array<{ address: string }>> {
  const dnsModule = await (Function('return import("node:dns/promises")')() as Promise<{
    lookup: (hostname: string, options: { all: true }) => Promise<Array<{ address: string }>>;
  }>);
  return dnsModule.lookup(host, { all: true });
}

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, cloud metadata, multicast, or reserved range (SSRF protection).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (detectIpVersion(mapped) === 4) {
      return isPrivateOrReservedIp(mapped);
    }
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isPrivateOrReservedIp(ipv4);
      }
    }
    return true;
  }

  const version = detectIpVersion(normalized);
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
    if (a >= 224) return true; // Multicast (224.0.0.0/4) & reserved/broadcast (240.0.0.0/4)
    return false;
  }

  if (version === 6) {
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized === '0:0:0:0:0:0:0:1' ||
      normalized === '0:0:0:0:0:0:0:0'
    ) {
      return true;
    }
    // Unique local (fc00::/7 -> fc.. or fd..)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-local (fe80::/10 -> fe8.., fe9.., fea.., feb..)
    if (/^fe[89ab]/.test(normalized)) return true;
    // Site-local deprecated (fec0::/10) or multicast (ff00::/8)
    if (/^fe[cdef]/.test(normalized) || normalized.startsWith('ff')) return true;
    return false;
  }

  return true;
}

/**
 * Validates URL syntax, protocol, and blocks private/local hostnames or IP literals.
 */
export function validateUrlTarget(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new SecurityBlockError('La URL no puede estar vacía.');
  }

  let candidate = trimmed;
  if (candidate.includes('://')) {
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      throw new SecurityBlockError('Solo se permiten protocolos http:// y https://');
    }
  } else {
    candidate = 'https://' + candidate;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new SecurityBlockError('Formato de URL inválido.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityBlockError('Solo se permiten protocolos http:// y https://');
  }

  if (parsed.username || parsed.password) {
    throw new SecurityBlockError('No se permiten credenciales incrustadas en la URL.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new SecurityBlockError('Acceso bloqueado a direcciones de red privadas o locales.');
  }

  if (detectIpVersion(host) !== 0 && isPrivateOrReservedIp(host)) {
    throw new SecurityBlockError('Acceso bloqueado a direcciones de red privadas o locales.');
  }

  return parsed;
}

/**
 * Resolves DNS records for a hostname and blocks DNS rebinding / private IP resolution.
 */
export async function assertPublicHostname(
  hostname: string,
  resolver: (host: string) => Promise<Array<{ address: string }>> = defaultDnsLookup
): Promise<void> {
  const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (detectIpVersion(cleanHost) !== 0) {
    if (isPrivateOrReservedIp(cleanHost)) {
      throw new SecurityBlockError('Acceso bloqueado a direcciones de red privadas o locales.');
    }
    return;
  }

  // The DNS cache only applies to the real resolver; injected resolvers (tests) are never cached.
  const useCache = resolver === defaultDnsLookup;
  if (useCache) {
    const expiresAt = dnsSafetyCache.get(cleanHost);
    if (expiresAt !== undefined) {
      if (Date.now() <= expiresAt) return;
      dnsSafetyCache.delete(cleanHost);
    }
  }

  const records = await resolver(cleanHost);
  if (!records || records.length === 0) {
    throw new Error(`No se pudo resolver el host ${cleanHost}`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new SecurityBlockError('Acceso bloqueado a direcciones de red privadas o locales.');
    }
  }

  if (useCache) {
    if (dnsSafetyCache.size >= MAX_DNS_CACHE_ENTRIES) {
      const oldest = dnsSafetyCache.keys().next().value;
      if (oldest) dnsSafetyCache.delete(oldest);
    }
    dnsSafetyCache.set(cleanHost, Date.now() + DNS_CACHE_TTL_MS);
  }
}

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const defaultArgs = env?.CHROMIUM_NO_SANDBOX === 'true'
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : [];
    try {
      browserInstance = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: defaultArgs,
      });
    } catch {
      browserInstance = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }
  return browserInstance;
}

async function capturePagePng(page: Page, height: number): Promise<string> {
  if (height <= VIEWPORT_HEIGHT) {
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });
    return buffer.toString('base64');
  }
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height, scale: 1 },
    }) as { data: string };
    return result.data;
  } finally {
    await session.detach();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Maps a DOM candidate to the physical material of its platform.
 */
export function classifyPlatformMaterial(cand: CandidateElement): PlatformMaterial {
  const tag = cand.tag.toLowerCase();
  if (['button', 'input', 'select', 'summary'].includes(tag) || (tag === 'a' && cand.isMediaOrControl)) {
    return 'elastic';
  }
  if (['img', 'figure', 'video', 'canvas', 'svg', 'picture'].includes(tag)) return 'glass';
  if (['nav', 'pre', 'code', 'table', 'thead', 'tr', 'toolbar'].includes(tag)) return 'metal';
  if (['h1', 'h2', 'header', 'footer', 'hr'].includes(tag)) return 'concrete';
  if (['blockquote', 'aside', 'article', 'section', 'li', 'h3', 'h4', 'card'].includes(tag)) return 'wood';
  return 'paper';
}

const TALL_CONTAINER_TAGS = ['article', 'section', 'table', 'aside', 'main', 'div', 'figure', 'blockquote'];

/**
 * Turns tall containers (height > 220) into walkable ledges: a roof ledge and,
 * for containers of 260px or more, a mezzanine along their base.
 * Normal candidates pass through untouched.
 */
export function expandTallContainers(candidates: CandidateElement[]): CandidateElement[] {
  const result: CandidateElement[] = [];
  for (const cand of candidates) {
    if (TALL_CONTAINER_TAGS.includes(cand.tag) && cand.width >= 60 && cand.height > 220) {
      result.push({
        ...cand,
        height: 22,
        text: cand.text ? `${cand.text} [Techo]` : `<${cand.tag}>`,
      });
      if (cand.height >= 260) {
        result.push({
          ...cand,
          y: cand.y + cand.height - 20,
          height: 20,
          text: `<${cand.tag} base>`,
        });
      }
    } else {
      result.push(cand);
    }
  }
  return result;
}

function summarizeMaterials(platforms: ScrapedPlatform[]): Partial<Record<PlatformMaterial, number>> {
  const summary: Partial<Record<PlatformMaterial, number>> = {};
  for (const platform of platforms) {
    const material = platform.material ?? 'paper';
    summary[material] = (summary[material] ?? 0) + 1;
  }
  return summary;
}

/**
 * Prunes overlapping DOM candidates to produce a playable set of platforms.
 * Enforces width >= 60px, height between 16px and 220px,
 * vertical clearance of at least 42px for horizontally overlapping platforms,
 * and caps output at MAX_PLATFORMS.
 */
export function prunePlatforms(candidates: CandidateElement[], pageHeight = VIEWPORT_HEIGHT): ScrapedPlatform[] {
  const boundsHeight = paperHeightFor(pageHeight);
  const limit = MAX_PLATFORMS * foldCount(pageHeight);
  // 1. Filter candidates within bounds
  const valid = candidates.filter(c => {
    return (
      c.width >= 60 &&
      c.width <= 1088 &&
      c.height >= 16 &&
      c.height <= 220 &&
      c.x >= 0 &&
      c.x + c.width <= VIEWPORT_WIDTH &&
      c.y >= 0 &&
      c.y + c.height <= boundsHeight
    );
  });

  // 2. Sort top-to-bottom
  valid.sort((a, b) => a.y - b.y);

  const accepted: ScrapedPlatform[] = [];

  for (let i = 0; i < valid.length; i++) {
    if (accepted.length >= limit) break;

    const cand = valid[i];
    const candRight = cand.x + cand.width;

    // Check conflict with already accepted platforms
    let conflict = false;
    for (const acc of accepted) {
      const accRight = acc.x + acc.width;
      const overlapsX = Math.max(cand.x, acc.x) < Math.min(candRight, accRight);

      if (overlapsX) {
        const verticalDist = Math.abs(cand.y - acc.y);
        if (verticalDist < MIN_VERTICAL_GAP) {
          conflict = true;
          break;
        }
      }
    }

    if (!conflict) {
      accepted.push({
        id: `plat-${accepted.length + 1}`,
        name: cand.text ? cand.text.slice(0, 30) : `<${cand.tag}>`,
        x: Math.round(cand.x),
        y: Math.round(cand.y),
        width: Math.round(cand.width),
        height: Math.round(cand.height),
        tag: cand.tag,
        material: classifyPlatformMaterial(cand),
      });
    }
  }

  return accepted;
}

/**
 * Extracts prominent visual blocks (images, buttons, cards) to act as detachable physical bodies.
 */
export function extractDetachables(candidates: CandidateElement[], pageHeight = VIEWPORT_HEIGHT): ScrapedDetachable[] {
  const boundsHeight = paperHeightFor(pageHeight);
  const limit = MAX_DETACHABLES * foldCount(pageHeight);
  const eligible = candidates.filter(c => {
    const isDetachableTag = ['img', 'button', 'a', 'header', 'nav', 'figure'].includes(c.tag) || c.isMediaOrControl;
    return (
      isDetachableTag &&
      c.width >= 40 &&
      c.width <= 480 &&
      c.height >= 20 &&
      c.height <= 240 &&
      c.x >= 10 &&
      c.x + c.width <= VIEWPORT_WIDTH - 10 &&
      c.y >= 10 &&
      c.y + c.height <= boundsHeight - 10
    );
  });

  // Sort by prominence (area)
  eligible.sort((a, b) => b.width * b.height - a.width * a.height);

  return eligible.slice(0, limit).map((item, idx) => ({
    id: `detach-${idx + 1}`,
    x: Math.round(item.x),
    y: Math.round(item.y),
    width: Math.round(item.width),
    height: Math.round(item.height),
    tag: item.tag,
  }));
}

type PresetName = 'demo' | 'wikipedia' | 'github' | 'hackernews' | 'mdn';

/** Assigns materials (by explicit id override or tag), render mode and material summary to a preset. */
function finalizePreset(
  page: ScrapedPageResult,
  overrides: Record<string, PlatformMaterial> = {},
): ScrapedPageResult {
  const platforms = page.platforms.map(p => ({
    ...p,
    material: overrides[p.id] ?? classifyPlatformMaterial({ tag: p.tag, x: p.x, y: p.y, width: p.width, height: p.height }),
  }));
  return {
    ...page,
    platforms,
    renderMode: 'preset',
    materialSummary: summarizeMaterials(platforms),
  };
}

/**
 * Generates an offline fallback preset with rich editorial typography and media.
 */
export function getPresetPage(name: PresetName): ScrapedPageResult {
  if (name === 'wikipedia') {
    const platforms: ScrapedPlatform[] = [
      { id: 'p1', name: 'Wikipedia Enciclopedia Libre', x: 48, y: 35, width: 280, height: 28, tag: 'h1' },
      { id: 'p2', name: 'Barra de Búsqueda', x: 740, y: 32, width: 310, height: 34, tag: 'input' },
      { id: 'p3', name: 'Titular Destacado: Arquitectura', x: 48, y: 95, width: 520, height: 36, tag: 'h2' },
      { id: 'p4', name: 'Caja Resumen Artículo', x: 620, y: 95, width: 430, height: 180, tag: 'figure' },
      { id: 'p5', name: 'Primer Párrafo Histórico', x: 48, y: 160, width: 520, height: 60, tag: 'p' },
      { id: 'p6', name: 'Botón Leer en otro idioma', x: 48, y: 245, width: 220, height: 32, tag: 'button' },
      { id: 'p7', name: 'Sección Referencias y Enlaces', x: 48, y: 315, width: 480, height: 42, tag: 'h3' },
      { id: 'p8', name: 'Galería de Imágenes', x: 580, y: 310, width: 470, height: 110, tag: 'div' },
      { id: 'p9', name: 'Pie de Página Wikipedia', x: 48, y: 440, width: 1008, height: 26, tag: 'footer' },
    ];

    const detachables: ScrapedDetachable[] = [
      { id: 'd1', x: 620, y: 95, width: 430, height: 180, tag: 'figure' },
      { id: 'd2', x: 48, y: 245, width: 220, height: 32, tag: 'button' },
      { id: 'd3', x: 580, y: 310, width: 220, height: 110, tag: 'img' },
      { id: 'd4', x: 830, y: 310, width: 220, height: 110, tag: 'img' },
    ];

    const textRuns: TextRunInput[] = [
      { id: 'w-title', text: 'Wikipedia Enciclopedia Libre', x: 48, y: 55, fontSize: 24, fontFamily: 'Georgia', color: '#202122' },
      { id: 'w-h2', text: 'Titular Destacado: Arquitectura', x: 48, y: 120, fontSize: 20, fontFamily: 'Georgia', color: '#202122' },
      { id: 'w-p1', text: 'La arquitectura es el arte y la técnica de proyectar y construir.', x: 48, y: 180, fontSize: 14, fontFamily: 'sans-serif', color: '#54595d' },
      { id: 'w-p2', text: 'Estructuras destinadas a satisfacer las necesidades humanas.', x: 48, y: 205, fontSize: 14, fontFamily: 'sans-serif', color: '#54595d' },
      { id: 'w-btn', text: 'Leer en otro idioma', x: 60, y: 265, fontSize: 12, fontFamily: 'sans-serif', color: '#36414c' },
      { id: 'w-h3', text: 'Sección Referencias y Enlaces', x: 48, y: 340, fontSize: 18, fontFamily: 'Georgia', color: '#202122' },
    ];

    return finalizePreset({
      url: 'https://es.wikipedia.org/wiki/Especial:Aleatoria',
      title: 'Wikipedia, la enciclopedia libre',
      screenshot: '', // generated dynamically if requested
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    }, { p8: 'glass' });
  }

  if (name === 'github') {
    const platforms: ScrapedPlatform[] = [
      { id: 'g1', name: 'Repositorio: luisrodriguez/my-destroy', x: 48, y: 30, width: 440, height: 32, tag: 'h1' },
      { id: 'g2', name: 'Botón Star & Fork', x: 800, y: 28, width: 250, height: 36, tag: 'div' },
      { id: 'g3', name: 'Barra de Pestañas: Code, Issues, PRs', x: 48, y: 85, width: 680, height: 38, tag: 'nav' },
      { id: 'g4', name: 'Banner Release v0.1.0', x: 48, y: 150, width: 1008, height: 46, tag: 'div' },
      { id: 'g5', name: 'Tabla de Archivos del Código', x: 48, y: 220, width: 680, height: 180, tag: 'table' },
      { id: 'g6', name: 'Barra Lateral: About & Tags', x: 760, y: 220, width: 290, height: 180, tag: 'aside' },
      { id: 'g7', name: 'Footer GitHub Global', x: 48, y: 440, width: 1008, height: 26, tag: 'footer' },
    ];

    const detachables: ScrapedDetachable[] = [
      { id: 'gd1', x: 800, y: 28, width: 250, height: 36, tag: 'div' },
      { id: 'gd2', x: 760, y: 220, width: 290, height: 180, tag: 'aside' },
    ];

    const textRuns: TextRunInput[] = [
      { id: 'gh-repo', text: 'luisrodriguez / My-Destroy', x: 48, y: 52, fontSize: 22, fontFamily: 'sans-serif', color: '#0969da' },
      { id: 'gh-nav', text: 'Code   Issues   Pull requests   Actions', x: 48, y: 110, fontSize: 13, fontFamily: 'sans-serif', color: '#656d76' },
      { id: 'gh-banner', text: 'Latest release v0.1.0 · Physics & DOM Destruction', x: 60, y: 178, fontSize: 14, fontFamily: 'sans-serif', color: '#1f2328' },
      { id: 'gh-about', text: 'About: Web destruction engine with Rapier2D physics', x: 760, y: 250, fontSize: 13, fontFamily: 'sans-serif', color: '#656d76' },
    ];

    return finalizePreset({
      url: 'https://github.com/luisrodriguez-rgb/My-Destroy',
      title: 'luisrodriguez-rgb/My-Destroy · GitHub',
      screenshot: '',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    }, { g2: 'elastic', g4: 'wood' });
  }

  if (name === 'hackernews') {
    const platforms: ScrapedPlatform[] = [
      { id: 'hn1', name: 'Barra naranja Hacker News', x: 48, y: 24, width: 1008, height: 32, tag: 'header' },
      { id: 'hn2', name: 'Menú: new | past | comments | ask | show | jobs', x: 48, y: 80, width: 560, height: 28, tag: 'nav' },
      { id: 'hn3', name: '1. Show HN: motor de destrucción web', x: 48, y: 130, width: 700, height: 34, tag: 'li' },
      { id: 'hn4', name: '2. Por qué Rust conquista el backend', x: 48, y: 190, width: 700, height: 34, tag: 'li' },
      { id: 'hn5', name: '3. Ask HN: ¿Qué estás construyendo?', x: 48, y: 250, width: 700, height: 34, tag: 'li' },
      { id: 'hn6', name: '4. Física de cuerpos rígidos en 2D', x: 48, y: 310, width: 700, height: 34, tag: 'li' },
      { id: 'hn7', name: 'Botón upvote', x: 790, y: 130, width: 140, height: 32, tag: 'button' },
      { id: 'hn8', name: 'Botón enviar enlace', x: 790, y: 200, width: 200, height: 32, tag: 'button' },
      { id: 'hn9', name: 'Bloque de código del hilo', x: 790, y: 270, width: 266, height: 70, tag: 'pre' },
      { id: 'hn10', name: 'Pie: Guidelines | FAQ | API | Lists', x: 48, y: 440, width: 1008, height: 26, tag: 'footer' },
    ];

    const detachables: ScrapedDetachable[] = [
      { id: 'hnd1', x: 48, y: 24, width: 480, height: 32, tag: 'header' },
      { id: 'hnd2', x: 790, y: 130, width: 140, height: 32, tag: 'button' },
      { id: 'hnd3', x: 790, y: 200, width: 200, height: 32, tag: 'button' },
    ];

    const textRuns: TextRunInput[] = [
      { id: 'hn-logo', text: 'Hacker News', x: 60, y: 46, fontSize: 18, fontFamily: 'Verdana', color: '#000000' },
      { id: 'hn-nav', text: 'new | past | comments | ask | show | jobs | submit', x: 52, y: 100, fontSize: 13, fontFamily: 'Verdana', color: '#828282' },
      { id: 'hn-s1', text: 'Show HN: motor de destrucción web', x: 56, y: 153, fontSize: 14, fontFamily: 'Verdana', color: '#000000' },
      { id: 'hn-s2', text: 'Por qué Rust conquista el backend', x: 56, y: 213, fontSize: 14, fontFamily: 'Verdana', color: '#000000' },
      { id: 'hn-s3', text: 'Ask HN: ¿Qué estás construyendo?', x: 56, y: 273, fontSize: 14, fontFamily: 'Verdana', color: '#000000' },
      { id: 'hn-s4', text: 'Física de cuerpos rígidos en 2D', x: 56, y: 333, fontSize: 14, fontFamily: 'Verdana', color: '#000000' },
      { id: 'hn-up', text: '▲ upvote', x: 806, y: 152, fontSize: 13, fontFamily: 'Verdana', color: '#ff6600' },
    ];

    return finalizePreset({
      url: 'https://news.ycombinator.com/demo',
      title: 'Hacker News',
      screenshot: '',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    });
  }

  if (name === 'mdn') {
    const platforms: ScrapedPlatform[] = [
      { id: 'mdn1', name: 'Cabecera MDN Web Docs', x: 48, y: 28, width: 1008, height: 36, tag: 'header' },
      { id: 'mdn2', name: 'Migas de pan: Referencia > JavaScript', x: 48, y: 85, width: 480, height: 28, tag: 'nav' },
      { id: 'mdn3', name: 'Array.prototype.map()', x: 48, y: 140, width: 560, height: 36, tag: 'h1' },
      { id: 'mdn4', name: 'Descripción del método map', x: 48, y: 200, width: 560, height: 44, tag: 'p' },
      { id: 'mdn5', name: 'Ejemplo de código interactivo', x: 640, y: 150, width: 416, height: 110, tag: 'pre' },
      { id: 'mdn6', name: 'Tabla de compatibilidad de navegadores', x: 48, y: 275, width: 560, height: 110, tag: 'table' },
      { id: 'mdn7', name: 'En este artículo', x: 640, y: 295, width: 416, height: 90, tag: 'aside' },
      { id: 'mdn8', name: 'Desplegable: Ver especificaciones', x: 48, y: 398, width: 300, height: 30, tag: 'summary' },
      { id: 'mdn9', name: 'Pie de página MDN', x: 48, y: 444, width: 1008, height: 26, tag: 'footer' },
    ];

    const detachables: ScrapedDetachable[] = [
      { id: 'mdnd1', x: 640, y: 150, width: 416, height: 110, tag: 'pre' },
      { id: 'mdnd2', x: 48, y: 398, width: 300, height: 30, tag: 'summary' },
    ];

    const textRuns: TextRunInput[] = [
      { id: 'mdn-logo', text: 'MDN Web Docs', x: 60, y: 54, fontSize: 20, fontFamily: 'sans-serif', color: '#1b1b1b' },
      { id: 'mdn-crumb', text: 'Referencia › JavaScript › Array › map()', x: 52, y: 105, fontSize: 13, fontFamily: 'sans-serif', color: '#4e4e4e' },
      { id: 'mdn-h1', text: 'Array.prototype.map()', x: 48, y: 168, fontSize: 28, fontFamily: 'sans-serif', color: '#1b1b1b' },
      { id: 'mdn-p', text: 'El método map() crea un nuevo array con los resultados de cada elemento.', x: 48, y: 228, fontSize: 14, fontFamily: 'sans-serif', color: '#4e4e4e' },
      { id: 'mdn-code', text: 'const dobles = [1, 2, 3].map(x => x * 2);', x: 652, y: 190, fontSize: 13, fontFamily: 'monospace', color: '#1b1b1b' },
      { id: 'mdn-toc', text: 'En este artículo', x: 652, y: 325, fontSize: 14, fontFamily: 'sans-serif', color: '#1b1b1b' },
    ];

    return finalizePreset({
      url: 'https://developer.mozilla.org/demo',
      title: 'Array.prototype.map() - JavaScript | MDN',
      screenshot: '',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    });
  }

  // Default demo
  return finalizePreset({
    url: 'https://the-everyday-internet.demo',
    title: 'the everyday internet.',
    screenshot: '',
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    platforms: [
      { id: 'footer-shelf', name: 'Estante inferior editorial', x: 48, y: 429, width: 1008, height: 12, tag: 'div' },
      { id: 'button-card', name: 'Tarjeta botón "Al otro lado"', x: 50, y: 338, width: 142, height: 37, tag: 'button' },
      { id: 'story-card', name: 'Subtítulo editorial', x: 598, y: 350, width: 458, height: 28, tag: 'p' },
      { id: 'hero-headline', name: 'Titular "Internet, hecho pedazos"', x: 48, y: 235, width: 480, height: 20, tag: 'h1' },
      { id: 'lead-paragraph', name: 'Párrafo de introducción', x: 50, y: 296, width: 480, height: 16, tag: 'p' },
      { id: 'kicker-tag', name: 'Etiqueta "UNA PÁGINA DE EJEMPLO"', x: 48, y: 110, width: 280, height: 14, tag: 'p' },
      { id: 'landscape-card', name: 'Tarjeta gráfica con sol', x: 598, y: 100, width: 458, height: 235, tag: 'figure' },
    ],
    detachables: [
      { id: 'btn-1', x: 50, y: 338, width: 142, height: 37, tag: 'button' },
      { id: 'fig-1', x: 598, y: 100, width: 458, height: 235, tag: 'figure' },
    ],
  }, { 'footer-shelf': 'concrete', 'story-card': 'wood' });
}

// ---------------------------------------------------------------------------
// HTML fallback: synthesize a playable page from raw HTML when Chromium is unavailable.
// ---------------------------------------------------------------------------

const FALLBACK_FETCH_TIMEOUT_MS = 5000;
const FALLBACK_MAX_REDIRECTS = 5;
const FALLBACK_MAX_HTML_CHARS = 600_000;

interface HtmlItem {
  tag: 'h1' | 'h2' | 'h3' | 'nav' | 'button' | 'a' | 'p' | 'img';
  text: string;
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', copy: '©', middot: '·', raquo: '»', laquo: '«',
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(fragment: string): string {
  return decodeHtmlEntities(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Extracts title and prominent content blocks (document order) from raw HTML. */
export function extractHtmlItems(html: string): { title: string; items: HtmlItem[] } {
  const cleaned = html
    .slice(0, FALLBACK_MAX_HTML_CHARS)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(cleaned);
  const title = titleMatch ? htmlToText(titleMatch[1]).slice(0, 120) : '';

  const items: HtmlItem[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  const caps: Record<HtmlItem['tag'], number> = { h1: 2, h2: 4, h3: 4, nav: 1, button: 3, a: 4, p: 4, img: 2 };
  const pattern = /<(h[1-3]|nav|button|a|p)\b[^>]*>([\s\S]*?)<\/\1\s*>|<img\b([^>]*?)\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    let tag: HtmlItem['tag'];
    let text: string;
    if (match[3] !== undefined) {
      tag = 'img';
      const attrs = match[3];
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '';
      const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '';
      text = htmlToText(alt) || decodeHtmlEntities(src.split('?')[0].split('/').pop() ?? '').slice(0, 40);
    } else {
      tag = match[1].toLowerCase() as HtmlItem['tag'];
      text = htmlToText(match[2]);
    }
    if (tag !== 'img' && text.length < (tag === 'p' ? 20 : 3)) continue;
    if (tag === 'img' && !text) text = 'imagen';
    const key = `${tag}:${text}`;
    if (seen.has(key)) continue;
    if ((counts[tag] ?? 0) >= caps[tag]) continue;
    seen.add(key);
    counts[tag] = (counts[tag] ?? 0) + 1;
    items.push({ tag, text });
    if (items.length >= 24) break;
  }
  return { title, items };
}

/** Lays extracted HTML items out as candidates on a 1104-wide synthetic page. */
function layoutHtmlItems(items: HtmlItem[]): { candidates: CandidateElement[]; height: number } {
  const LEFT_X = 48;
  const LEFT_W = 520;
  const RIGHT_X = 620;
  const RIGHT_W = 430;
  const GAP = 52;
  const candidates: CandidateElement[] = [];
  const cursors = { left: 95, right: 95 };

  const nav = items.find(i => i.tag === 'nav');
  if (nav) {
    candidates.push({ tag: 'nav', x: LEFT_X, y: 24, width: 1008, height: 34, text: nav.text });
  } else {
    cursors.left = 40;
    cursors.right = 40;
  }

  const heights: Record<HtmlItem['tag'], number> = { h1: 36, h2: 32, h3: 28, nav: 34, button: 34, a: 26, p: 44, img: 110 };
  for (const item of items) {
    if (item.tag === 'nav') continue;
    const wantsRight = item.tag === 'img';
    const column: 'left' | 'right' = wantsRight ? 'right' : cursors.left <= cursors.right ? 'left' : 'right';
    const colX = column === 'left' ? LEFT_X : RIGHT_X;
    const colW = column === 'left' ? LEFT_W : RIGHT_W;
    const height = heights[item.tag];
    const isControl = item.tag === 'button' || item.tag === 'a' || item.tag === 'img';
    const width = item.tag === 'button' || item.tag === 'a'
      ? Math.min(colW, Math.max(100, item.text.length * 9 + 40))
      : colW;
    const y = cursors[column];
    candidates.push({
      tag: item.tag,
      x: colX,
      y,
      width,
      height,
      text: item.text,
      isMediaOrControl: isControl,
    });
    cursors[column] = y + height + GAP;
  }

  const bottom = candidates.reduce((max, c) => Math.max(max, c.y + c.height), 0);
  return { candidates, height: paperHeightFor(bottom + 40) };
}

const FALLBACK_FONT_SIZES: Record<HtmlItem['tag'], number> = { h1: 24, h2: 20, h3: 17, nav: 13, button: 13, a: 13, p: 13, img: 12 };

/** Fetches a public URL, validating every redirect hop against the SSRF rules. */
async function fetchPublicHtml(startUrl: string): Promise<{ html: string; finalUrl: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= FALLBACK_MAX_REDIRECTS; hop++) {
    const target = validateUrlTarget(current);
    await assertPublicHostname(target.hostname);
    const response = await fetch(target.href, {
      signal: AbortSignal.timeout(FALLBACK_FETCH_TIMEOUT_MS),
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MyDestroyDemo/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirección sin destino.');
      current = new URL(location, target.href).href;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, FALLBACK_MAX_HTML_CHARS);
    return { html, finalUrl: target.href };
  }
  throw new Error('Demasiadas redirecciones.');
}

/**
 * Builds a playable page from the real HTML of a public URL without a browser.
 * Returns null when the network fails; SecurityBlockError (private redirect targets) is rethrown.
 */
export async function fetchHtmlFallbackPage(validUrl: string): Promise<ScrapedPageResult | null> {
  try {
    const { html, finalUrl } = await fetchPublicHtml(validUrl);
    const { title, items } = extractHtmlItems(html);
    if (items.length === 0) return null;

    const { candidates, height } = layoutHtmlItems(items);
    const platforms = prunePlatforms(candidates, height);
    if (platforms.length === 0) return null;
    const detachables = extractDetachables(candidates, height);

    const textRuns: TextRunInput[] = [];
    for (const cand of candidates) {
      if (cand.tag === 'img' || !cand.text) continue;
      textRuns.push({
        id: `run-${textRuns.length}`,
        text: cand.text.slice(0, 80),
        x: Math.round(cand.x + (cand.tag === 'button' ? 12 : 0)),
        y: Math.round(cand.y + cand.height * 0.75),
        fontSize: FALLBACK_FONT_SIZES[cand.tag as HtmlItem['tag']] ?? 14,
        fontFamily: cand.tag.startsWith('h') ? 'Georgia' : 'sans-serif',
        color: '#202122',
      });
    }

    return {
      url: finalUrl,
      title: title || new URL(finalUrl).hostname,
      screenshot: '', // the scene draws the synthetic canvas
      width: VIEWPORT_WIDTH,
      height,
      platforms,
      detachables,
      textRuns,
      renderMode: 'html-fallback',
      materialSummary: summarizeMaterials(platforms),
    };
  } catch (err) {
    if (err instanceof SecurityBlockError) throw err;
    return null;
  }
}

function offlineFallback(validUrl: string): ScrapedPageResult {
  const fallback = getPresetPage('wikipedia');
  fallback.url = validUrl;
  fallback.title = `${validUrl} (Modo Fuera de Línea)`;
  return fallback;
}

/**
 * Scrapes any real live URL via headless Playwright, cleans cookie overlays,
 * captures the first fold at 1104×488, and pages below that fold up to four viewports (1104×1952),
 * with deviceScaleFactor=1, and extracts pruned platforms and detachables.
 * If Chromium is unavailable or times out, builds a page from the raw HTML instead,
 * and only then falls back to the offline Wikipedia preset.
 */
export async function scrapeUrl(
  targetUrl: string,
  options?: { forceRefresh?: boolean },
): Promise<ScrapedPageResult> {
  const normalized = targetUrl.trim();
  const lowered = normalized.toLowerCase();

  // Handle preset shortcuts
  if (lowered === 'wikipedia' || normalized.includes('wikipedia.org/demo')) {
    return getPresetPage('wikipedia');
  }
  if (lowered === 'github' || normalized.includes('github.com/demo')) {
    return getPresetPage('github');
  }
  if (lowered === 'hackernews' || normalized.includes('news.ycombinator.com/demo')) {
    return getPresetPage('hackernews');
  }
  if (lowered === 'mdn' || normalized.includes('developer.mozilla.org/demo')) {
    return getPresetPage('mdn');
  }
  if (lowered === 'demo' || normalized.includes('the-everyday-internet.demo')) {
    return getPresetPage('demo');
  }

  // Validate URL syntax, protocol, and block SSRF targets (localhost, private IPs, metadata)
  const parsedUrl = validateUrlTarget(normalized);
  const validUrl = parsedUrl.href;

  if (!options?.forceRefresh) {
    const cached = getCachedScrape(validUrl);
    if (cached) {
      return cached;
    }
  }

  try {
    await assertPublicHostname(parsedUrl.hostname);
  } catch (err) {
    if (err instanceof SecurityBlockError) {
      throw err;
    }
    // Offline DNS failure -> fall back to preset without launching Chromium
    return offlineFallback(validUrl);
  }

  await acquireScrapeSlot();
  try {
    const htmlOrOffline = async (): Promise<ScrapedPageResult> =>
      (await fetchHtmlFallbackPage(validUrl)) ?? offlineFallback(validUrl);

    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch {
      return await htmlOrOffline();
    }

    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1, // Crucial for Retina pixel alignment
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MyDestroyDemo/1.0',
    });

    // Block sub-requests and redirects targeting private/local networks or non-http(s) schemes
    await context.route('**/*', async route => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
        await route.continue();
        return;
      }
      try {
        const subTarget = validateUrlTarget(reqUrl);
        await assertPublicHostname(subTarget.hostname);
        await route.continue();
      } catch {
        await route.abort('accessdenied');
      }
    });

    const page = await context.newPage();

    try {
      // Navigate with reasonable timeout
      await page.goto(validUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 12000,
      });

      // Wait a brief moment for fonts / layout
      await page.waitForTimeout(600);

      // 1. Remove large fixed/sticky overlays (GDPR cookie banners, modals, dialogs)
      await page.evaluate(() => {
        const candidates = document.querySelectorAll<HTMLElement>(
          '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [role="dialog"], [aria-modal="true"], .modal, .popup'
        );
        candidates.forEach(el => {
          el.style.display = 'none';
        });

        // Also remove elements with position: fixed/sticky covering > 25% of viewport
        const all = document.querySelectorAll<HTMLElement>('*');
        all.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') {
            const rect = el.getBoundingClientRect();
            if (rect.width * rect.height > (1104 * 488) * 0.25) {
              el.style.display = 'none';
            }
          }
        });
      });

      // 1b. Quick hydration: scroll incrementally so lazy content mounts before measuring.
      await page.evaluate(async ({ step, maxY }) => {
        const root = document.scrollingElement || document.documentElement;
        const limit = Math.min(root?.scrollHeight ?? 0, maxY);
        for (let y = step; y < limit; y += step) {
          window.scrollTo(0, y);
          await new Promise(resolve => setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 80));
      }, { step: VIEWPORT_HEIGHT, maxY: PAPER.height * 4 });

      // The browser viewport stays one fold so 100vh pages do not stretch. Content below it is captured in place.
      await page.evaluate(() => window.scrollTo(0, 0));
      const contentHeight = await page.evaluate(() => {
        const root = document.scrollingElement || document.documentElement;
        const body = document.body;
        return Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0);
      });
      const captureHeight = paperHeightFor(contentHeight);

      // 2. Extract DOM candidate elements for platforms & detachables
      const rawCandidates: CandidateElement[] = await page.evaluate(() => {
        const selectors = 'h1, h2, h3, h4, button, input, select, summary, a.btn, [role="button"], img, video, canvas, nav, blockquote, pre, table, .card, header, figure, article, section, aside, main, li';
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));

        return nodes.map(node => {
          const rect = node.getBoundingClientRect();
          const tag = node.tagName.toLowerCase();
          const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
          const isMediaOrControl = ['img', 'button', 'input', 'select', 'summary', 'video', 'canvas'].includes(tag)
            || node.getAttribute('role') === 'button';

          return {
            tag,
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            text: text.slice(0, 50),
            isMediaOrControl,
          };
        });
      });

      const expandedCandidates = expandTallContainers(rawCandidates);
      const platforms = prunePlatforms(expandedCandidates, captureHeight);
      const detachables = extractDetachables(rawCandidates, captureHeight);

      // 3. Extract text runs for dynamic character splitting physics
      const textRuns: TextRunInput[] = await page.evaluate(({ pageWidth, pageHeight, maxRuns }) => {
        const selectors = 'h1, h2, h3, h4, p, a.btn, [role="button"], button';
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));
        const runs: TextRunInput[] = [];
        let count = 0;
        for (const node of nodes) {
          if (count >= maxRuns) break;
          const rect = node.getBoundingClientRect();
          if (rect.width < 30 || rect.height < 10) continue;
          const top = rect.top + window.scrollY;
          const left = rect.left + window.scrollX;
          const bottom = top + rect.height;
          const right = left + rect.width;
          if (bottom > pageHeight || top < 0 || left < 0 || right > pageWidth) continue;
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) continue;
          const txt = (node.textContent || '').trim().replace(/\s+/g, ' ');
          if (txt.length < 3) continue;

          runs.push({
            id: `run-${count++}`,
            text: txt.slice(0, 80),
            x: Math.round(left),
            y: Math.round(top + rect.height * 0.75),
            fontSize: Math.round(parseFloat(style.fontSize) || 16),
            fontFamily: style.fontFamily || 'sans-serif',
            color: style.color || '#202122',
          });
        }
        return runs;
      }, { pageWidth: VIEWPORT_WIDTH, pageHeight: captureHeight, maxRuns: 20 * foldCount(captureHeight) });

      // 4. One fold stays a viewport screenshot. Taller pages are clipped from the document, up to four folds.
      const screenshotDataUrl = `data:image/png;base64,${await capturePagePng(page, captureHeight)}`;
      const title = (await page.title()) || validUrl;

      const result: ScrapedPageResult = {
        url: validUrl,
        title,
        screenshot: screenshotDataUrl,
        width: VIEWPORT_WIDTH,
        height: captureHeight,
        platforms,
        detachables,
        textRuns,
        renderMode: 'live',
        materialSummary: summarizeMaterials(platforms),
      };
      setCachedScrape(validUrl, result);
      return result;
    } catch (err) {
      if (err instanceof SecurityBlockError) {
        throw err;
      }
      // Chromium failed or timed out: rebuild the page from its raw HTML, then fall back offline.
      return await htmlOrOffline();
    } finally {
      await context.close();
    }
  } finally {
    releaseScrapeSlot();
  }
}
