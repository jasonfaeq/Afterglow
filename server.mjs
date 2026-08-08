import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './server/static.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'public');

export function createAfterglowServer() {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(request.url, 'http://afterglow.invalid');
    if (['GET', 'HEAD'].includes(request.method) && await serveStatic(publicDir, url.pathname, request, response)) return;
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 5173);
  createAfterglowServer().listen(port, host, () => console.log(`afterglow is running at http://${host}:${port}`));
}
