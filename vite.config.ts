import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { scrapeUrl } from './src/server/scraper';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'scraper-middleware',
      configureServer(server) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          if (req.url?.startsWith('/api/scrape') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const { url } = JSON.parse(body || '{}');
                if (!url) {
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
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Error al procesar la captura.' }));
              }
            });
            return;
          }
          next();
        });
      },
    },
  ],
  build: { rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
});
