import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './server/static.mjs';
import { createArtworkHandler, catalogFromEnv } from './server/artwork-api.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'public');

export function createAfterglowServer({ catalog = catalogFromEnv(), publicOrigin = process.env.PUBLIC_ORIGIN || '', perIPLimit = 120, now = Date.now } = {}) {
  // Forwarded-IP headers are deliberately not trusted here: anyone can send them to a bare Node server.
  const artwork = createArtworkHandler({ catalog, publicOrigin, perIPLimit, now, trustProxy: false });
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(request.url, 'http://afterglow.invalid');
    if (url.pathname.startsWith('/api/')) return artwork(request, response);
    try {
      if (['GET', 'HEAD'].includes(request.method) && await serveStatic(publicDir, url.pathname, request, response)) return;
    } catch { if (response.headersSent) { response.destroy(); return; } }
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Not found.' }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(root, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') { console.error('Could not read .env. Check the server configuration file.'); process.exit(1); } }
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 5173);
  const catalog = catalogFromEnv(), server = createAfterglowServer({ catalog });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or set PORT.` : 'afterglow could not start its server.'); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`afterglow is running at http://${host}:${server.address().port}`);
    console.log(catalog.configured ? 'Cover art from the Spotify catalog is on.' : 'No Spotify credentials in .env, so imported libraries get generated covers. See docs/ARTWORK_SETUP.md.');
  });
}
