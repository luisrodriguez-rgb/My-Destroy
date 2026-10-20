import { chromium, type Browser } from '@playwright/test';

export interface ScrapedPlatform {
  id: string;
  name: string;
  x: number;      // relative to paper coordinates (0..1104)
  y: number;      // relative to paper coordinates (0..488)
  width: number;
  height: number;
  tag: string;
}

export interface ScrapedDetachable {
  id: string;
  x: number;      // relative to paper coordinates (0..1104)
  y: number;      // relative to paper coordinates (0..488)
  width: number;
  height: number;
  tag: string;
}

export interface ScrapedPageResult {
  url: string;
  title: string;
  screenshot: string; // base64 data URL
  width: number;      // 1104
  height: number;     // 488
  platforms: ScrapedPlatform[];
  detachables: ScrapedDetachable[];
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

const VIEWPORT_WIDTH = 1104;
const VIEWPORT_HEIGHT = 488;
const MIN_VERTICAL_GAP = 42;
const MAX_PLATFORMS = 14;
const MAX_DETACHABLES = 8;

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    try {
      browserInstance = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
export function prunePlatforms(candidates: CandidateElement[]): ScrapedPlatform[] {
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
      c.y + c.height <= VIEWPORT_HEIGHT
    );
  });

  // 2. Sort top-to-bottom
  valid.sort((a, b) => a.y - b.y);

  const accepted: ScrapedPlatform[] = [];

  for (let i = 0; i < valid.length; i++) {
    if (accepted.length >= MAX_PLATFORMS) break;

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
export function extractDetachables(candidates: CandidateElement[]): ScrapedDetachable[] {
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
      c.y + c.height <= VIEWPORT_HEIGHT - 10
    );
  });

  // Sort by prominence (area)
  eligible.sort((a, b) => b.width * b.height - a.width * a.height);

  return eligible.slice(0, MAX_DETACHABLES).map((item, idx) => ({
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

    return {
      url: 'https://es.wikipedia.org/wiki/Especial:Aleatoria',
      title: 'Wikipedia, la enciclopedia libre',
      screenshot: '', // generated dynamically if requested
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
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

    return {
      url: 'https://github.com/luisrodriguez-rgb/My-Destroy',
      title: 'luisrodriguez-rgb/My-Destroy · GitHub',
      screenshot: '',
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
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
 * captures screenshot at exactly 1104x488 with deviceScaleFactor=1,
 * and extracts pruned platforms and detachables.
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

  let validUrl = normalized;
  if (validUrl.includes('://')) {
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      throw new Error('Solo se permiten protocolos http:// y https://');
    }
  } else {
    validUrl = 'https://' + validUrl;
  }

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
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
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          text: text.slice(0, 50),
          isMediaOrControl,
        };
      });
    });

    const platforms = prunePlatforms(rawCandidates);
    const detachables = extractDetachables(rawCandidates);

    // 3. Take crisp screenshot at exact 1104x488 viewport
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });

    const screenshotDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    const title = (await page.title()) || validUrl;

    return {
      url: validUrl,
      title,
      screenshot: screenshotDataUrl,
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      platforms,
      detachables,
    };
  } catch (err) {
    // If external network fails or times out, gracefully fall back to Wikipedia preset
    const fallback = getPresetPage('wikipedia');
    fallback.url = validUrl;
    fallback.title = `${validUrl} (Modo Fuera de Línea)`;
    return fallback;
  } finally {
    await context.close();
  }
}
