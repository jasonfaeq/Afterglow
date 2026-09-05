import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAfterglowServer } from '../server.mjs';
import { SpotifyCatalog } from '../server/spotify-catalog.mjs';

const ID = 'B'.repeat(22), IMAGE = 'https://i.scdn.co/image/test-artwork';
const input = { kind: 'track', name: 'Song', artist: 'Artist', uri: `spotify:track:${ID}` };
const artwork = { image: IMAGE, href: `https://open.spotify.com/track/${ID}` };
const jsonRequest = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function running(t, options = {}) {
  const server = createAfterglowServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('artwork works for anonymous visitors and never exposes the app credentials', async t => {
  let tokenCalls = 0, lookups = 0;
  const catalog = new SpotifyCatalog({ clientId: 'owner-id', clientSecret: 'owner-secret', fetch: async url => {
    if (url.includes('/api/token')) { tokenCalls++; return new Response(JSON.stringify({ access_token: 'server-token', expires_in: 3600 })); }
    lookups++; return new Response(JSON.stringify({ id: ID, album: { images: [{ url: IMAGE, width: 300 }] } }));
  } });
  const base = await running(t, { catalog });
  assert.deepEqual(await (await fetch(`${base}/api/artwork/status`)).json(), { available: true, retryAfter: 0 });
  for (let visitor = 0; visitor < 2; visitor++) {
    const response = await fetch(`${base}/api/artwork`, jsonRequest(input));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { artwork }); assert.ok(!body.includes('owner-secret') && !body.includes('server-token'));
  }
  assert.equal(tokenCalls, 1); assert.equal(lookups, 1);
});

test('the app is public while credentials, server code, git, tests and stray exports are not', async t => {
  const base = await running(t, { catalog: { status: () => ({ available: false }) } });
  const home = await fetch(base), html = await home.text();
  assert.equal(home.status, 200); assert.ok(html.includes("connect-src 'self';"));
  for (const path of ['/.env', '/.env.example', '/.git/config', '/server.mjs', '/server/spotify-catalog.mjs', '/tests/server.test.mjs', '/package.json', '/Streaming_History_Audio_2024.json', '/%2eenv', '/assets/../../.env', '/js/../../server.mjs', '/assets/README.md']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/js/artwork/client.mjs`)).status, 200);
  const head = await fetch(`${base}/css/base.css`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});

test('the API checks content type, size, fields, method and origin before touching the catalog', async t => {
  let calls = 0;
  const base = await running(t, { catalog: { status: () => ({ available: true }), lookup: async () => { calls++; return artwork; } } });
  const scenarios = [
    [{ method: 'GET' }, 405],
    [{ method: 'POST', body: '{}' }, 415],
    [{ ...jsonRequest(input), body: 'not-json' }, 400],
    [jsonRequest({ ...input, timestamps: [] }), 400],
    [jsonRequest({ ...input, name: 'x'.repeat(5000) }), 413],
    [{ ...jsonRequest(input), headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } }, 403],
    [{ ...jsonRequest(input), headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } }, 403]
  ];
  for (const [options, expected] of scenarios) assert.equal((await fetch(`${base}/api/artwork`, options)).status, expected);
  assert.equal(calls, 0);
  const valid = await fetch(`${base}/api/artwork`, { ...jsonRequest(input), headers: { 'Content-Type': 'application/json', Origin: base } });
  assert.equal(valid.status, 200); assert.equal(calls, 1);
});

test('the per-visitor limit ignores spoofed forwarded-for headers and sends Retry-After', async t => {
  const base = await running(t, { catalog: { status: () => ({ available: true }), lookup: async () => artwork }, perIPLimit: 1 });
  assert.equal((await fetch(`${base}/api/artwork`, jsonRequest(input))).status, 200);
  const second = await fetch(`${base}/api/artwork`, { ...jsonRequest(input), headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': 'someone-else' } });
  assert.equal(second.status, 429); assert.ok(Number(second.headers.get('Retry-After')) > 0);
});

test('oversized chunked bodies get a 413 without reaching the catalog', async t => {
  let calls = 0;
  const base = await running(t, { catalog: { lookup: async () => { calls++; return artwork; } } });
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ ...input, name: 'x'.repeat(5000) }))); controller.close(); } });
  const result = await fetch(`${base}/api/artwork`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' });
  assert.equal(result.status, 413); assert.equal(calls, 0);
});

test('unexpected errors never leak stack traces, secrets or provider bodies', async t => {
  const base = await running(t, { catalog: { lookup: async () => { throw Error('private-secret-token'); } } });
  const result = await fetch(`${base}/api/artwork`, jsonRequest(input));
  assert.equal(result.status, 503); assert.equal((await result.text()).includes('private-secret-token'), false);
});
