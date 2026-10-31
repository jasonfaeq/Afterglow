import { SpotifyCatalog } from './spotify-catalog.mjs';
import { ArtworkError, validateArtworkSpec } from '../public/js/artwork/shared.mjs';

// The artwork API, shared by the Node server (npm start) and the Vercel functions in /api,
// so both enforce exactly the same rules.

export const catalogFromEnv = (env = process.env) => new SpotifyCatalog({ clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET, market: env.SPOTIFY_MARKET || 'DE' });

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
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
    request.once('aborted', () => reject(new ArtworkError('Artwork request was interrupted.', 400)));
  });
}

// Returns a (request, response) handler for /api/* paths.
// trustProxy: on a platform like Vercel, the edge sets X-Forwarded-For/Host/Proto itself, so they can be trusted.
// On a bare Node server they can be spoofed, so they're ignored.
export function createArtworkHandler({ catalog = catalogFromEnv(), publicOrigin = process.env.PUBLIC_ORIGIN || '', perIPLimit = 120, now = Date.now, trustProxy = false } = {}) {
  const visitors = new Map();
  // A small in-memory budget per visitor address.
  function overBudget(address) {
    let budget = visitors.get(address);
    if (!budget || now() - budget.start >= 60000) {
      if (visitors.size >= 10000) for (const [key, entry] of visitors) if (now() - entry.start >= 60000) visitors.delete(key);
      if (visitors.size >= 10000 && !visitors.has(address)) return 60;
      budget = { start: now(), used: 0 }; visitors.set(address, budget);
    }
    return ++budget.used > perIPLimit ? Math.max(1, Math.ceil((budget.start + 60000 - now()) / 1000)) : 0;
  }
  return async function handleArtwork(request, response) {
    try {
      const path = new URL(request.url, 'http://afterglow.invalid').pathname, headers = request.headers;
      const first = value => String(value ?? '').split(',')[0].trim();
      // Only this site's own pages may use the API.
      const origin = publicOrigin || (trustProxy ? `${first(headers['x-forwarded-proto']) || 'https'}://${first(headers['x-forwarded-host']) || headers.host}` : `http://${headers.host}`);
      if (headers['sec-fetch-site'] === 'cross-site' || (headers.origin && headers.origin !== origin)) return json(response, 403, { error: 'Artwork requests must come from this site.' });
      if (path === '/api/artwork/status' && request.method === 'GET') return json(response, 200, catalog.status());
      if (path !== '/api/artwork') return json(response, 404, { error: 'Not found.' });
      if (request.method !== 'POST') return json(response, 405, { error: 'Use POST for artwork lookups.' }, { Allow: 'POST' });
      if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] ?? '')) return json(response, 415, { error: 'Artwork requests must use application/json.' });
      const wait = overBudget((trustProxy && first(headers['x-forwarded-for'])) || request.socket?.remoteAddress || 'unknown');
      if (wait) return json(response, 429, { error: 'Artwork is busy. Try again shortly.' }, { 'Retry-After': String(wait) });
      const spec = validateArtworkSpec(await readBody(request));
      return json(response, 200, { artwork: await catalog.lookup(spec) });
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const known = error instanceof ArtworkError;
      // Never forward Spotify's raw errors, credentials, tokens or stack traces.
      json(response, known ? error.status : 503, { error: known ? error.message : 'Artwork is temporarily unavailable.' }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
  };
}
