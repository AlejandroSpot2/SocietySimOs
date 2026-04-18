import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { getServerConfig } from './config';
import { apiRouter } from './routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function isDevelopmentMode(): boolean {
  return process.argv.includes('--dev') || !process.argv.includes('--production');
}

async function createApp() {
  const app = express();
  const config = getServerConfig();
  const isDev = isDevelopmentMode();

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiRouter);

  if (isDev) {
    const vite = await createViteServer({
      root: rootDir,
      server: {
        middlewareMode: true,
      },
      appType: 'custom',
    });

    app.use(vite.middlewares);
    app.use('*', async (request, response, next) => {
      try {
        const templatePath = path.resolve(rootDir, 'index.html');
        const template = await readFile(templatePath, 'utf8');
        const html = await vite.transformIndexHtml(request.originalUrl, template);
        response.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    const distDir = path.resolve(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_request, response) => {
      response.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(config.port, () => {
    console.log(
      `[society-sim-os] server listening on http://localhost:${config.port} (${isDev ? 'dev' : 'prod'})`,
    );
  });
}

createApp().catch((error) => {
  console.error('[society-sim-os] failed to start server', error);
  process.exit(1);
});
