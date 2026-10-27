import { chromium, type Browser, type Page } from '@playwright/test';
import type { TextRunInput } from '../game/text/DOMTextManager';
import { PAPER } from '../game/tuning';
import { foldCount, paperHeightFor } from '../game/pageExtent';

export interface ScrapedPlatform {
  id: string;
  name: string;
  x: number;      // relative to paper coordinates (0..1104)
  y: number;      // relative to paper coordinates (0..page height)
  width: number;
  height: number;
  tag: string;
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

  const records = await resolver(cleanHost);
  if (!records || records.length === 0) {
    throw new Error(`No se pudo resolver el host ${cleanHost}`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new SecurityBlockError('Acceso bloqueado a direcciones de red privadas o locales.');
    }
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
      c.width <= 1000 &&
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

/**
 * Generates an offline fallback preset with rich editorial typography and media.
 */
export function getPresetPage(name: 'demo' | 'wikipedia' | 'github'): ScrapedPageResult {
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

    return {
      url: 'https://es.wikipedia.org/wiki/Especial:Aleatoria',
      title: 'Wikipedia, la enciclopedia libre',
      screenshot: '', // generated dynamically if requested
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    };
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

    return {
      url: 'https://github.com/luisrodriguez-rgb/My-Destroy',
      title: 'luisrodriguez-rgb/My-Destroy · GitHub',
      screenshot: '',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
      textRuns,
    };
  }

  // Default demo
  return {
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
  };
}

/**
 * Scrapes any real live URL via headless Playwright, cleans cookie overlays,
 * captures the first fold at 1104×488, and pages below that fold up to four viewports (1104×1952),
 * with deviceScaleFactor=1, and extracts pruned platforms and detachables.
 */
export async function scrapeUrl(targetUrl: string): Promise<ScrapedPageResult> {
  const normalized = targetUrl.trim();

  // Handle preset shortcuts
  if (normalized.toLowerCase() === 'wikipedia' || normalized.includes('wikipedia.org/demo')) {
    return getPresetPage('wikipedia');
  }
  if (normalized.toLowerCase() === 'github' || normalized.includes('github.com/demo')) {
    return getPresetPage('github');
  }
  if (normalized.toLowerCase() === 'demo' || normalized.includes('the-everyday-internet.demo')) {
    return getPresetPage('demo');
  }

  // Validate URL syntax, protocol, and block SSRF targets (localhost, private IPs, metadata)
  const parsedUrl = validateUrlTarget(normalized);
  const validUrl = parsedUrl.href;

  const cached = getCachedScrape(validUrl);
  if (cached) {
    return cached;
  }

  try {
    await assertPublicHostname(parsedUrl.hostname);
  } catch (err) {
    if (err instanceof SecurityBlockError) {
      throw err;
    }
    // Offline DNS failure -> fall back to preset without launching Chromium
    const fallback = getPresetPage('wikipedia');
    fallback.url = validUrl;
    fallback.title = `${validUrl} (Modo Fuera de Línea)`;
    return fallback;
  }

  await acquireScrapeSlot();
  try {
    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch {
      const fallback = getPresetPage('wikipedia');
      fallback.url = validUrl;
      fallback.title = `${validUrl} (Modo Fuera de Línea)`;
      return fallback;
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
        const selectors = 'h1, h2, h3, h4, button, a.btn, [role="button"], img, nav, blockquote, pre, table, .card, header, figure';
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectors));

        return nodes.map(node => {
          const rect = node.getBoundingClientRect();
          const tag = node.tagName.toLowerCase();
          const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
          const isMediaOrControl = tag === 'img' || tag === 'button' || node.getAttribute('role') === 'button';

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

      const platforms = prunePlatforms(rawCandidates, captureHeight);
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
      };
      setCachedScrape(validUrl, result);
      return result;
    } catch (err) {
      if (err instanceof SecurityBlockError) {
        throw err;
      }
      // If external network fails or times out, gracefully fall back to Wikipedia preset
      const fallback = getPresetPage('wikipedia');
      fallback.url = validUrl;
      fallback.title = `${validUrl} (Modo Fuera de Línea)`;
      return fallback;
    } finally {
      await context.close();
    }
  } finally {
    releaseScrapeSlot();
  }
}
