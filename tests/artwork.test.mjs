import test from 'node:test';
import assert from 'node:assert/strict';
import { SpotifyCatalog } from '../server/spotify-catalog.mjs';
import { artworkFrom, artworkKey, safeImageURL, validateArtworkSpec } from '../public/js/artwork/shared.mjs';

const ID = 'B'.repeat(22), CLIENT = 'a'.repeat(32), SECRET = 'server-only-secret';
const IMAGE = 'https://i.scdn.co/image/test-artwork';
const spec = { kind: 'track', name: 'Song', artist: 'Artist', album: 'Album', uri: `spotify:track:${ID}` };
const track = { id: ID, name: 'Song', artists: [{ name: 'Artist' }], album: { name: 'Album', images: [{ url: IMAGE, width: 300 }] } };
const art = { image: IMAGE, href: `https://open.spotify.com/track/${ID}` };
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const service = (fetch, options = {}) => new SpotifyCatalog({ clientId: CLIENT, clientSecret: SECRET, fetch, ...options });
const tokenResponse = () => response({ access_token: 'server-only-token', expires_in: 3600 });

test('artwork lookups carry no history fields, reject malformed names and normalize track ids', () => {
  assert.deepEqual(validateArtworkSpec(spec), spec);
  for (const value of [{ ...spec, timestamp: 'private' }, { ...spec, plays: 50 }, [{ ...spec }], { ...spec, name: 'x'.repeat(301) }, { ...spec, name: '\n' }, { kind: 'track', name: 'Song' }, { ...spec, kind: 'url' }]) assert.throws(() => validateArtworkSpec(value));
  assert.equal(validateArtworkSpec({ ...spec, uri: 'spotify:track:invalid' }).uri, '');
  assert.equal(artworkKey(spec), artworkKey({ ...spec, name: 'Different historical title' }));
});

test('without credentials the catalog is unavailable and never calls Spotify', async () => {
  const catalog = new SpotifyCatalog({ fetch: () => { throw Error('No request expected'); } });
  assert.deepEqual(catalog.status(), { available: false, retryAfter: 0 });
  await assert.rejects(catalog.lookup(spec), /unavailable/);
});

test('the server authenticates with client credentials, adds the market and only returns image metadata', async () => {
  let tokens = 0, catalogCalls = 0;
  const catalog = service(async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.includes('/api/token')) {
      tokens++;
      assert.equal(Buffer.from(options.headers.Authorization.slice(6), 'base64').toString(), `${CLIENT}:${SECRET}`);
      assert.equal(options.body.get('grant_type'), 'client_credentials');
      return tokenResponse();
    }
    catalogCalls++; assert.equal(new URL(url).searchParams.get('market'), 'DE');
    assert.equal(options.headers.Authorization, 'Bearer server-only-token');
    return response(track);
  });
  assert.deepEqual(await catalog.lookup(spec), art);
  assert.equal(tokens, 1); assert.equal(catalogCalls, 1);
  assert.ok(!JSON.stringify(await catalog.lookup(spec)).includes(SECRET));
});

test('a shared cache with single-flight requests reuses artwork across visitors and evicts at capacity', async () => {
  let tokens = 0, lookups = 0, clock = 100000;
  const catalog = service(async url => {
    if (url.includes('/api/token')) { tokens++; return tokenResponse(); }
    lookups++; return response(track);
  }, { now: () => clock, cacheSize: 1, cacheTTL: 1000 });
  await Promise.all([catalog.lookup(spec), catalog.lookup({ ...spec, name: 'Alias' })]);
  await catalog.lookup(spec); assert.equal(lookups, 1);
  await catalog.lookup({ ...spec, uri: `spotify:track:${'C'.repeat(22)}` });
  assert.equal(catalog.cache.size, 1);
  clock += 1001; await catalog.lookup(spec);
  assert.equal(lookups, 3); assert.equal(tokens, 1);
});

test('concurrent lookups share token renewal, and expired tokens renew without anyone signing in', async () => {
  let tokens = 0, clock = 100000;
  const catalog = service(async url => {
    if (url.includes('/api/token')) { tokens++; return tokenResponse(); }
    return response(track);
  }, { now: () => clock });
  await Promise.all([catalog.lookup(spec), catalog.lookup({ ...spec, uri: `spotify:track:${'C'.repeat(22)}` })]);
  assert.equal(tokens, 1);
  clock += 3600001;
  await catalog.lookup({ ...spec, uri: `spotify:track:${'D'.repeat(22)}` });
  assert.equal(tokens, 2);
});

test('unknown track ids fall back to exact title, artist and album matches', async () => {
  const catalog = service(async url => {
    if (url.includes('/api/token')) return tokenResponse();
    if (url.includes('/tracks/')) return response({}, 404);
    const params = new URL(url).searchParams;
    assert.equal(params.get('limit'), '10'); assert.equal(params.get('q'), 'track:"Song" artist:"Artist"');
    return response({ tracks: { items: [{ ...track, artists: [{ name: 'Wrong artist' }] }, { ...track, album: { name: 'Wrong edition', images: [{ url: IMAGE }] } }, track] } });
  });
  assert.deepEqual(await catalog.lookup(spec), art);
});

test('ambiguous artist matches keep the fallback art and misses are cached too', async () => {
  let searches = 0;
  const catalog = service(async url => {
    if (url.includes('/api/token')) return tokenResponse();
    searches++; return response({ artists: { items: [{ id: ID, name: 'Artist', images: [{ url: IMAGE }] }, { id: 'C'.repeat(22), name: 'Artist', images: [{ url: IMAGE }] }] } });
  });
  const input = { kind: 'artist', name: 'Artist' };
  assert.equal(await catalog.lookup(input), null); assert.equal(await catalog.lookup(input), null);
  assert.equal(searches, 1);
});

test('a 401 retries once with a fresh app token', async () => {
  let tokens = 0, lookups = 0;
  const catalog = service(async url => {
    if (url.includes('/api/token')) { tokens++; return tokenResponse(); }
    return ++lookups === 1 ? response({}, 401) : response(track);
  });
  assert.deepEqual(await catalog.lookup(spec), art); assert.equal(tokens, 2); assert.equal(lookups, 2);
});

test('rate and quota limits pause new lookups while cached artwork keeps working', async () => {
  for (const quota of [false, true]) {
    let calls = 0, clock = 100000;
    const catalog = service(async url => {
      if (url.includes('/api/token')) return tokenResponse();
      if (++calls === 1) return response(track);
      return quota ? response({ error: { reason: 'QUOTA_EXCEEDED' } }, 429) : response({}, 429, { 'Retry-After': '20' });
    }, { now: () => clock });
    await catalog.lookup(spec);
    const second = { ...spec, uri: `spotify:track:${'C'.repeat(22)}` };
    await assert.rejects(catalog.lookup(second), error => error.status === 429 && error.retryAfter === (quota ? 3600 : 20));
    await assert.rejects(catalog.lookup(second), /break/); assert.equal(calls, 2);
    assert.deepEqual(await catalog.lookup(spec), art);
    clock += (quota ? 3600001 : 20001); assert.equal(catalog.status().retryAfter, 0);
  }
});

test('bad app credentials never leak provider error bodies and stop repeated token requests', async () => {
  let calls = 0;
  const catalog = service(async () => { calls++; return response({ error_description: SECRET }, 401); });
  await assert.rejects(catalog.lookup(spec), error => !error.message.includes(SECRET) && error.status === 503);
  await assert.rejects(catalog.lookup(spec), /break/); assert.equal(calls, 1);
});

test('a global request budget bounds catalog traffic independently of cache hits', async () => {
  let calls = 0;
  const catalog = service(async url => { if (url.includes('/api/token')) return tokenResponse(); calls++; return response(track); }, { requestLimit: 1 });
  await catalog.lookup(spec);
  await assert.rejects(catalog.lookup({ ...spec, uri: `spotify:track:${'C'.repeat(22)}` }), error => error.status === 429);
  assert.deepEqual(await catalog.lookup(spec), art); assert.equal(calls, 1);
});

test('only Spotify https image hosts and validated source links are accepted', () => {
  for (const url of ['javascript:alert(1)', 'http://i.scdn.co/image', 'https://i.scdn.co.evil.test/image', 'https://user:secret@i.scdn.co/image']) assert.equal(safeImageURL(url), null);
  assert.deepEqual(artworkFrom(track, 'track'), art);
  assert.equal(artworkFrom({ ...track, id: 'invalid' }, 'track'), null);
});
