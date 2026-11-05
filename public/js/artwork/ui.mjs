import { ArtworkClient } from './client.mjs';

const PREFERENCE = 'afterglow.artwork.enabled';
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };

// Finds visible [data-art-name] tiles and fills them with real covers, a few at a time.
export function installArtwork({ client = new ArtworkClient() } = {}) {
  const $ = selector => document.querySelector(selector);
  const local = storage();
  let enabled = true;
  try { enabled = local?.getItem(PREFERENCE) !== 'false'; } catch { /* Artwork works without saved preferences. */ }
  $('#artwork-enabled').checked = enabled;
  let seen = new WeakSet(), queue = [], pumping = false, timer, retryTimer, stopped = false, ready = false, checking = false, started = false;

  function status() {
    $('#artwork-status').textContent = !enabled ? 'Artwork is off. Nothing is looked up.' : client.problem ||
      (!started ? 'Real covers can load once you open your own imported library.' : !ready ? 'Checking artwork…' : client.available ? 'Covers and artist photos load as you browse.' : 'Real covers aren’t set up on this site, so you’ll see generated ones.');
    $('#artwork-retry').hidden = !enabled || !client.problem;
    // No real covers on this site at all? Then the switch wouldn't do anything.
    $('#artwork-enabled').closest('.switch').hidden = enabled && started && ready && !client.available && !client.problem;
    $('#artwork-attribution').hidden = !enabled || !client.available;
  }
  function clearArtwork() {
    document.querySelectorAll('[data-art-name]').forEach(tile => {
      tile.querySelector('img.art-real')?.remove(); tile.classList.remove('has-artwork');
      tile.href = tile.dataset.artFallback; tile.title = `Find ${tile.dataset.artName} on Spotify`;
      tile.setAttribute('aria-label', tile.title);
    });
  }
  function applyArtwork(tile, art) {
    if (!tile.isConnected || !enabled || !client.available || !art) return;
    tile.href = art.href; tile.title = `Open ${tile.dataset.artName} on Spotify`; tile.setAttribute('aria-label', tile.title);
    const image = new Image();
    Object.assign(image, { alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer', className: 'art-real' });
    image.addEventListener('load', () => {
      if (!enabled || !tile.contains(image)) return;
      tile.classList.add('has-artwork');
    }, { once: true });
    image.addEventListener('error', () => { image.remove(); tile.classList.remove('has-artwork'); }, { once: true });
    tile.querySelector('img.art-real')?.remove(); tile.append(image); image.src = art.image;
  }
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !enabled || !client.available || !ready) continue;
      intersection.unobserve(entry.target); queue.push(entry.target);
    }
    pump();
  }, { rootMargin: '120px' });
  function scan() {
    if (!ready || !enabled || !client.available) return;
    document.querySelectorAll('[data-art-name]').forEach(tile => { if (!seen.has(tile)) { seen.add(tile); intersection.observe(tile); } });
  }
  function resetQueue() {
    queue = []; seen = new WeakSet(); stopped = false;
    clearTimeout(timer); intersection.disconnect(); scan();
  }
  function scheduleRetry(seconds) {
    clearTimeout(retryTimer);
    if (enabled) retryTimer = setTimeout(() => { if (document.visibilityState === 'visible') begin(); }, Math.min(2147483647, Math.max(10, seconds || 30) * 1000));
  }
  async function pump() {
    if (pumping || stopped || !enabled || !client.available || !ready) return;
    let tile;
    while (queue.length && !tile) {
      const candidate = queue.shift(), box = candidate.getBoundingClientRect();
      if (candidate.isConnected && box.width && box.height && box.bottom > -120 && box.top < innerHeight + 120) tile = candidate;
      else if (candidate.isConnected) { seen.delete(candidate); intersection.observe(candidate); }
    }
    if (!tile) return;
    pumping = true;
    const epoch = client.epoch;
    try {
      const art = await client.lookup({ kind: tile.dataset.artKind, name: tile.dataset.artName, artist: tile.dataset.artArtist ?? '', album: tile.dataset.artAlbum ?? '', uri: tile.dataset.artUri ?? '' });
      if (epoch === client.epoch) applyArtwork(tile, art);
    } catch (error) {
      if (epoch === client.epoch) { stopped = true; client.problem = error.message; status(); scheduleRetry(error.retryAfter); }
    } finally {
      pumping = false;
      if (!stopped && enabled && client.available) timer = setTimeout(pump, 250);
    }
  }
  async function begin() {
    if (!enabled || checking) return;
    if (client.pauseUntil > Date.now()) { status(); scheduleRetry(Math.ceil((client.pauseUntil - Date.now()) / 1000)); return; }
    checking = true;
    const epoch = client.epoch;
    try { await client.checkStatus(); }
    catch (error) { if (epoch === client.epoch) { stopped = true; client.problem = error.message; scheduleRetry(error.retryAfter); } }
    finally {
      checking = false;
      if (epoch === client.epoch) {
        ready = true; status();
        if (client.pauseUntil > Date.now()) scheduleRetry(Math.ceil((client.pauseUntil - Date.now()) / 1000));
        else if (!client.problem) resetQueue();
      } else if (enabled) begin();
    }
  }
  // Only talk to the artwork API once real library tiles are on screen. The demo never needs it.
  function wake() {
    if (started || !enabled || !document.querySelector('[data-art-name]')) return null;
    started = true; status();
    return begin();
  }
  new MutationObserver(() => { wake(); scan(); }).observe(document.body, { childList: true, subtree: true });
  $('#artwork-enabled').addEventListener('change', event => {
    enabled = event.target.checked;
    try { local?.setItem(PREFERENCE, String(enabled)); } catch { /* This visit still honours the choice. */ }
    clearTimeout(timer); clearTimeout(retryTimer); intersection.disconnect(); queue = []; seen = new WeakSet();
    if (!enabled) { client.cancel(); clearArtwork(); ready = true; }
    else if (started) { ready = false; begin(); }
    else wake();
    status();
  });
  $('#artwork-retry').addEventListener('click', begin);
  document.addEventListener('visibilitychange', () => { if (enabled && stopped && document.visibilityState === 'visible') begin(); });
  status();
  return { client, initialization: wake() ?? Promise.resolve() };
}
