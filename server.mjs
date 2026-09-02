import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './server/static.mjs';
import { SpotifyCatalog } from './server/spotify-catalog.mjs';
import { ArtworkError, validateArtworkSpec } from './public/js/artwork/shared.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'public');
const catalogFromEnv = () => new SpotifyCatalog({ clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, market: process.env.SPOTIFY_MARKET || 'DE' });

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (Number(request.headers['content-length']) > 4096) { request.resume(); throw new ArtworkError('Artwork request is too large.', 413); }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, exceeded = false;
    request.on('data', chunk => {
      if (exceeded) return; // Drain an oversized body without buffering it.
      size += chunk.length;
      if (size > 4096) { exceeded = true; chunks.length = 0; reject(new ArtworkError('Artwork request is too large.', 413)); }
      else chunks.push(chunk);
    });
    request.once('end', () => {
      if (exceeded) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ArtworkError('Artwork request must be valid JSON.', 400)); }
    });
    request.once('error', () => reject(new ArtworkError('Artwork request could not be read.', 400)));
  });
}

export function createAfterglowServer({ catalog = catalogFromEnv() } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(request.url, 'http://afterglow.invalid');
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/artwork/status' && request.method === 'GET') return json(response, 200, catalog.status());
        if (url.pathname !== '/api/artwork') return json(response, 404, { error: 'Not found.' });
        if (request.method !== 'POST') return json(response, 405, { error: 'Use POST for artwork lookups.' }, { Allow: 'POST' });
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return json(response, 415, { error: 'Artwork requests must use application/json.' });
        const spec = validateArtworkSpec(await readBody(request));
        return json(response, 200, { artwork: await catalog.lookup(spec) });
      }
      if (['GET', 'HEAD'].includes(request.method) && await serveStatic(publicDir, url.pathname, request, response)) return;
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const known = error instanceof ArtworkError;
      // Never forward Spotify's raw errors, credentials, tokens or stack traces.
      json(response, known ? error.status : 503, { error: known ? error.message : 'Artwork is temporarily unavailable.' }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
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
    console.log(catalog.configured ? 'Cover art from the Spotify catalog is on.' : 'No Spotify credentials in .env, so artwork is off. See docs/ARTWORK_SETUP.md.');
  });
}
