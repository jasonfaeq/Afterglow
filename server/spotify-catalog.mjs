import { ArtworkError, artworkFrom, artworkKey, normalizedName, validateArtworkSpec } from '../public/js/artwork/shared.mjs';

export class SpotifyCatalog {
  constructor({ clientId = '', clientSecret = '', market = 'DE', fetch = globalThis.fetch, now = Date.now, cacheSize = 5000, cacheTTL = 6 * 3600000, requestLimit = 120 } = {}) {
    Object.assign(this, { clientId, clientSecret, market, fetch, now, cacheSize, cacheTTL, requestLimit });
    this.token = null; this.renewing = null; this.cache = new Map(); this.pending = new Map();
    this.pauseUntil = 0; this.budget = { start: now(), used: 0 };
    if (!/^[A-Z]{2}$/.test(market)) throw new Error('SPOTIFY_MARKET must be a two-letter country code.');
  }
  get configured() { return Boolean(this.clientId && this.clientSecret); }
  status() { return { available: this.configured, retryAfter: Math.max(0, Math.ceil((this.pauseUntil - this.now()) / 1000)) }; }
  async fetchJSON(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await this.fetch(url, { ...options, signal: controller.signal, redirect: 'error', credentials: 'omit' });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, ok: response.ok, headers: response.headers, data };
    } catch { throw new ArtworkError('Artwork is temporarily unavailable. Try again later.', 503, 30); }
    finally { clearTimeout(timer); }
  }
  pause(response) {
    const quota = response.data?.reason === 'QUOTA_EXCEEDED' || response.data?.error?.reason === 'QUOTA_EXCEEDED';
    const delay = Number(response.headers.get('Retry-After'));
    const seconds = Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : quota ? 3600 : 60;
    this.pauseUntil = Math.max(this.pauseUntil, this.now() + seconds * 1000);
    throw new ArtworkError('Artwork is taking a break. Please try again later.', 429, seconds);
  }
  async accessToken(invalidToken) {
    if (!this.configured) throw new ArtworkError('Artwork is unavailable right now.', 503, 60);
    if (this.pauseUntil > this.now()) throw new ArtworkError('Artwork is taking a break. Please try again later.', 429, Math.ceil((this.pauseUntil - this.now()) / 1000));
    if (invalidToken && this.token?.value === invalidToken) this.token = null;
    if (this.token?.expires > this.now() + 30000) return this.token.value;
    if (!this.renewing) {
      this.renewing = (async () => {
        const response = await this.fetchJSON('https://accounts.spotify.com/api/token', {
          method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials' })
        });
        if (response.status === 429) this.pause(response);
        if (!response.ok || typeof response.data.access_token !== 'string' || !(Number(response.data.expires_in) > 0)) {
          this.pauseUntil = this.now() + 60000;
          throw new ArtworkError('Artwork is unavailable right now.', 503, 60);
        }
        this.token = { value: response.data.access_token, expires: this.now() + Number(response.data.expires_in) * 1000 };
        return this.token.value;
      })().finally(() => { this.renewing = null; });
    }
    return this.renewing;
  }
  async request(path, retry = true) {
    if (!/^\/(?:tracks\/[A-Za-z0-9]{22}\?|search\?)/.test(path)) throw new Error('Unsupported catalog request.');
    const token = await this.accessToken();
    if (this.now() - this.budget.start >= 60000) this.budget = { start: this.now(), used: 0 };
    if (this.budget.used >= this.requestLimit) {
      throw new ArtworkError('Artwork is busy. Please try again shortly.', 429, Math.max(1, Math.ceil((this.budget.start + 60000 - this.now()) / 1000)));
    }
    this.budget.used++;
    const response = await this.fetchJSON(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 && retry) { await this.accessToken(token); return this.request(path, false); }
    if (response.status === 404) return null;
    if (response.status === 429) this.pause(response);
    if (!response.ok) {
      if ([401, 403].includes(response.status)) this.pauseUntil = this.now() + 60000;
      throw new ArtworkError('Artwork is temporarily unavailable. Try again later.', 503, 60);
    }
    return response.data;
  }
  async lookup(input) {
    const spec = validateArtworkSpec(input), key = artworkKey(spec);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      this.cache.delete(key); this.cache.set(key, cached); return cached.value;
    }
    this.cache.delete(key);
    if (this.pending.has(key)) return this.pending.get(key);
    // Bound work as well as cache size when many visitors request different items.
    if (this.pending.size >= 32) throw new ArtworkError('Artwork is busy. Please try again shortly.', 429, 5);
    const promise = this.findArtwork(spec).then(value => {
      if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { value, expires: this.now() + (value ? this.cacheTTL : 1800000) });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise); return promise;
  }
  async findArtwork({ kind, name, artist, album, uri }) {
    if (kind === 'track' && uri) {
      const item = await this.request(`/tracks/${uri.split(':')[2]}?${new URLSearchParams({ market: this.market })}`);
      if (item) return artworkFrom(item, 'track');
    }
    const quote = value => `"${String(value).replace(/["\\]/g, ' ')}"`;
    const q = kind === 'artist' ? `artist:${quote(name)}` : `${kind}:${quote(name)} artist:${quote(artist)}`;
    const result = await this.request(`/search?${new URLSearchParams({ q, type: kind, limit: '10', market: this.market })}`);
    const items = result?.[`${kind}s`]?.items;
    const matches = (Array.isArray(items) ? items : []).filter(item => normalizedName(item.name) === normalizedName(name) &&
      (kind === 'artist' || item.artists?.some(a => normalizedName(a.name) === normalizedName(artist))) &&
      (kind !== 'track' || !album || normalizedName(item.album?.name) === normalizedName(album)));
    if (kind === 'artist' && matches.length !== 1) return null;
    return artworkFrom(matches[0], kind);
  }
}
