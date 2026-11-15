import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { scrapeUrl, SecurityBlockError } from './src/server/scraper';

const MAX_BODY_BYTES = 4096;
const MAX_QUERY_BYTES = 4096;

function sendJson(res: any, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function parseForceRefresh(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

async function handleScrape(res: any, url: string, forceRefresh: boolean) {
  if (!url.trim()) {
    sendJson(res, 400, { error: 'Falta el parámetro url.' });
    return;
  }
  try {
    const result = await scrapeUrl(url, { forceRefresh });
    sendJson(res, 200, result);
  } catch (err: any) {
    if (err instanceof SecurityBlockError) {
      sendJson(res, 400, { error: err.message });
    } else if (typeof err?.message === 'string' && err.message.includes('Servidor de capturas ocupado')) {
      sendJson(res, 429, { error: err.message });
    } else {
      sendJson(res, 500, { error: 'Error al procesar la captura de la página solicitada.' });
    }
  }
}

function attachScrapeMiddleware(middlewares: { use: (fn: (req: any, res: any, next: any) => void) => void }) {
  middlewares.use((req: any, res: any, next: any) => {
    const rawUrl: string = req.url ?? '';
    const isScrapePath = rawUrl === '/api/scrape' || rawUrl.startsWith('/api/scrape?') || rawUrl.startsWith('/api/scrape/');
    if (!isScrapePath) {
      next();
      return;
    }

    if (req.method === 'GET') {
      if (rawUrl.length > MAX_QUERY_BYTES) {
        sendJson(res, 413, { error: 'Solicitud demasiado grande (máximo 4 KB).' });
        return;
      }
      const params = new URL(rawUrl, 'http://localhost').searchParams;
      void handleScrape(res, params.get('url') ?? '', parseForceRefresh(params.get('forceRefresh')));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      let byteLength = 0;
      let aborted = false;

      req.on('data', (chunk: any) => {
        if (aborted) return;
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        byteLength += text.length;
        if (byteLength > MAX_BODY_BYTES) {
          aborted = true;
          sendJson(res, 413, { error: 'Solicitud demasiado grande (máximo 4 KB).' });
          req.destroy?.();
          return;
        }
        body += text;
      });

      req.on('end', async () => {
        if (aborted) return;
        let parsedBody: { url?: unknown; forceRefresh?: unknown };
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          sendJson(res, 400, { error: 'JSON de solicitud inválido.' });
          return;
        }
        if (parsedBody === null || typeof parsedBody !== 'object') {
          sendJson(res, 400, { error: 'JSON de solicitud inválido.' });
          return;
        }

        const url = typeof parsedBody.url === 'string' ? parsedBody.url : '';
        await handleScrape(res, url, parseForceRefresh(parsedBody.forceRefresh));
      });
      return;
    }

    next();
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'scraper-middleware',
      configureServer(server) {
        attachScrapeMiddleware(server.middlewares);
      },
      configurePreviewServer(server) {
        attachScrapeMiddleware(server.middlewares);
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          rapier: ['@dimforge/rapier2d-compat'],
        },
      },
    },
  },
});
