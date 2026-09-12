import { normalize, mergeRows, aggregate, artistDetail, demoRows } from './core.mjs';

// Two libraries live here: the one you imported (if any) and the made-up sample.
// The page decides which one it's looking at; imports only ever touch yours.
let library = null, sample = null, mode = 'demo';
const post = (type, payload = {}) => self.postMessage({ type, ...payload });
const demo = () => sample ??= demoRows();
const rows = () => mode === 'library' && library ? library.rows : demo();
const summary = () => library && { plays: library.rows.length, files: library.files.length, from: library.rows[0]?.ts ?? null, to: library.rows.at(-1)?.ts ?? null };
// A few facts about the sample listener for the homepage.
function teaser() {
  const s = aggregate(demo(), { minimum: 30000 });
  return { hours: Math.round(s.ms / 3600000), artists: s.artistCount, topArtist: s.artists[0]?.name ?? '', streak: s.streak?.days ?? 0, since: s.start };
}

// The whole normalized library lives in a single IndexedDB record.
const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('afterglow-history', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('history');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function storage(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('history', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('history');
      const request = action === 'get' ? store.get('current') : action === 'delete' ? store.delete('current') : store.put(value, 'current');
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Browser storage is unavailable.'));
    });
  } finally { db.close(); }
}

const MB = 1024 * 1024;
const HISTORY_FILE = /(?:^|\/)(?:Streaming_History_Audio[^/]*|StreamingHistory[^/]*)\.json$/i;

// Reads the ZIP's central directory. Spotify exports use stored or deflate entries, which is all this supports.
export async function unzip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('This ZIP could not be read. Extract it and choose the history JSON files instead.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), totalSize = 0;
  if (count === 0xffff || offset === 0xffffffff) throw new Error('Extract this ZIP first, then select its history JSON files.');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged. Extract the archive and import its JSON files.');
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const packedSize = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!HISTORY_FILE.test(name)) continue;
    totalSize += size;
    if (size > 300 * MB || totalSize > 800 * MB) throw new Error('This archive is too large to unpack in one go. Extract it and import the JSON files in smaller batches.');
    if (flags & 1) throw new Error('Encrypted ZIPs aren’t supported. Extract the archive and import its JSON files.');
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('The ZIP contains an unreadable file. Please extract it first.');
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (start + packedSize > bytes.length) throw new Error('The ZIP is incomplete. Download it again or import the extracted JSON files.');
    entries.push({ name, method, size, data: bytes.subarray(start, start + packedSize) });
  }
  if (!entries.length) throw new Error('No Spotify listening history was found in this ZIP. Look for Streaming_History_Audio or StreamingHistory JSON files.');
  return entries;
}

export async function entryText(entry) {
  if (entry.method === 0) return new TextDecoder().decode(entry.data);
  if (entry.method !== 8) throw new Error('This ZIP compression isn’t supported. Extract it and import the JSON files.');
  let stream;
  try { stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
  catch { throw new Error('Your browser can’t unpack this ZIP. Extract it and choose the JSON files instead.'); }
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > entry.size || size > 300 * MB) { await reader.cancel(); throw new Error('The ZIP has inconsistent file sizes. Extract it and import the JSON files.'); }
    chunks.push(value);
  }
  if (size !== entry.size) throw new Error('The ZIP file is incomplete. Extract it and try the JSON files.');
  return new Blob(chunks).text();
}

async function readFiles(list) {
  const incoming = [], added = [];
  let ignored = 0;
  const add = (name, records) => {
    const result = normalize(records);
    for (const row of result.rows) incoming.push(row);
    ignored += result.ignored; added.push(name.split('/').pop());
  };
  for (const file of list) {
    post('progress', { message: `Reading ${file.name}…` });
    if (file.size > 500 * MB) throw new Error(`“${file.name}” is over 500 MB. Extract it and import the JSON files in batches.`);
    if (/\.zip$/i.test(file.name)) {
      for (const entry of await unzip(file)) {
        post('progress', { message: `Reading ${entry.name.split('/').pop()}…` });
        add(entry.name, JSON.parse(await entryText(entry)));
      }
    } else if (/\.json$/i.test(file.name)) add(file.name, JSON.parse(await file.text()));
    else throw new Error(`“${file.name}” isn’t a JSON or ZIP file. Choose your Spotify history files.`);
  }
  return { incoming, added, ignored };
}

async function handle(data) {
  try {
    if (data.type === 'init') {
      let saved;
      try { saved = await storage('get'); } catch { /* Private windows can block storage. */ }
      if (saved?.rows?.length) library = { rows: saved.rows, files: saved.files ?? [] };
      post('ready', { library: summary(), teaser: teaser() });
    }
    if (data.type === 'use') mode = data.mode === 'library' && library ? 'library' : 'demo';
    if (data.type === 'use' || data.type === 'query') post('stats', { id: data.id, mode, stats: aggregate(rows(), data.filters) });
    if (data.type === 'detail') post('detail', { id: data.id, kind: data.kind, detail: artistDetail(rows(), data.name, data.filters) });
    if (data.type === 'import') {
      const { incoming, added, ignored } = await readFiles(data.files);
      if (!incoming.length) throw new Error('No music listening events were found in those files.');
      post('progress', { message: 'Removing duplicates…' });
      const merged = mergeRows(library?.rows ?? [], incoming);
      const files = [...new Set([...(library?.files ?? []), ...added])];
      let persisted = true;
      try { await storage('put', { rows: merged.rows, files }); } catch { persisted = false; }
      library = { rows: merged.rows, files }; mode = 'library';
      post('imported', { mode, library: summary(), persisted, duplicates: merged.duplicates, enriched: merged.enriched, ignored, stats: aggregate(rows(), data.filters) });
    }
    if (data.type === 'clear') {
      await storage('delete');
      library = null; mode = 'demo';
      post('cleared', { library: null });
    }
  } catch (error) {
    post('error', { message: error instanceof SyntaxError ? 'A file contains invalid JSON. Your library is unchanged.' : error.message });
  }
}

// An import has to finish writing before the next message is handled.
let queue = Promise.resolve();
if (typeof self !== 'undefined') self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
