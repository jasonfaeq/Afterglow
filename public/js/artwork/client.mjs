import { ArtworkError, artworkKey, safeArtwork, validateArtworkSpec } from './shared.mjs';

// Talks to this site's own /api/artwork. No Spotify credentials or user login ever live in the browser.
export class ArtworkClient {
  constructor({ fetch = globalThis.fetch.bind(globalThis), now = Date.now } = {}) {
    Object.assign(this, { fetch, now });
    this.available = false; this.problem = ''; this.pauseUntil = 0; this.epoch = 0;
    this.cache = new Map(); this.pending = new Map(); this.controllers = new Set();
  }
  async request(path, options = {}) {
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetch(path, { ...options, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const seconds = Number(response.headers.get('Retry-After'));
        const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 30;
        // Only our own fixed error text is shown. No raw backend response is rendered.
        throw new ArtworkError(response.status === 429 ? 'Artwork is taking a break. It will retry automatically.' : 'Artwork is temporarily unavailable. Your listening insights still work.', response.status, retryAfter);
      }
      return data;
    } catch (error) {
      if (error instanceof ArtworkError) throw error;
      throw new ArtworkError('Artwork is temporarily unavailable. Your listening insights still work.', 503, 30);
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }
  async checkStatus() {
    const epoch = this.epoch;
    const data = await this.request('/api/artwork/status');
    if (epoch !== this.epoch) return false;
    this.available = data.available === true;
    const seconds = Number(data.retryAfter);
    this.pauseUntil = this.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0) * 1000;
    this.problem = this.pauseUntil > this.now() ? 'Artwork is taking a break. It will retry automatically.' : '';
    return this.available;
  }
  async lookup(input) {
    if (!this.available) return null;
    if (this.pauseUntil > this.now()) throw new ArtworkError(this.problem, 429, Math.ceil((this.pauseUntil - this.now()) / 1000));
    const spec = validateArtworkSpec(input), key = artworkKey(spec), epoch = this.epoch;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.request('/api/artwork', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) }).then(data => {
      if (epoch !== this.epoch) return null;
      const artwork = safeArtwork(data.artwork);
      if (data.artwork != null && !artwork) throw new ArtworkError('Artwork is temporarily unavailable. Your listening insights still work.', 503, 60);
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, artwork); return artwork;
    }).catch(error => {
      if (epoch === this.epoch) {
        this.problem = error.message; this.pauseUntil = this.now() + (error.retryAfter || 30) * 1000;
      }
      throw error;
    }).finally(() => { if (epoch === this.epoch) this.pending.delete(key); });
    this.pending.set(key, promise); return promise;
  }
  cancel() {
    this.epoch++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.pending.clear(); this.cache.clear();
    this.available = false; this.problem = ''; this.pauseUntil = 0;
  }
}
