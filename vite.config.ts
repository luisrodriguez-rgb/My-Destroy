import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { scrapeUrl, SecurityBlockError } from './src/server/scraper';

const MAX_BODY_BYTES = 4096;

function attachScrapeMiddleware(middlewares: { use: (fn: (req: any, res: any, next: any) => void) => void }) {
  middlewares.use((req: any, res: any, next: any) => {
    if (req.url?.startsWith('/api/scrape') && req.method === 'POST') {
      let body = '';
      let byteLength = 0;
      let aborted = false;

      req.on('data', (chunk: any) => {
        if (aborted) return;
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        byteLength += text.length;
        if (byteLength > MAX_BODY_BYTES) {
          aborted = true;
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Solicitud demasiado grande (máximo 4 KB).' }));
          req.destroy?.();
          return;
        }
        body += text;
      });

      req.on('end', async () => {
        if (aborted) return;
        try {
          let parsedBody: { url?: unknown };
          try {
            parsedBody = JSON.parse(body || '{}');
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'JSON de solicitud inválido.' }));
            return;
          }

          const url = typeof parsedBody.url === 'string' ? parsedBody.url : '';
          if (!url.trim()) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Falta el parámetro url.' }));
            return;
          }

          const result = await scrapeUrl(url);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err: any) {
          const isSecurityBlock = err instanceof SecurityBlockError;
          res.statusCode = isSecurityBlock ? 400 : 500;
          res.setHeader('Content-Type', 'application/json');
          const safeMessage = isSecurityBlock
            ? err.message
            : 'Error al procesar la captura de la página solicitada.';
          res.end(JSON.stringify({ error: safeMessage }));
        }
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
  build: { rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
});
