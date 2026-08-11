import { normalize, mergeRows, aggregate } from './core.mjs';

let rows = [], files = [];
const post = (type, payload = {}) => self.postMessage({ type, ...payload });

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

async function readFiles(list) {
  const incoming = [], added = [];
  let ignored = 0;
  for (const file of list) {
    post('progress', { message: `Reading ${file.name}…` });
    if (!/\.json$/i.test(file.name)) throw new Error(`“${file.name}” isn’t a JSON file. Choose your Spotify history files.`);
    const result = normalize(JSON.parse(await file.text()));
    for (const row of result.rows) incoming.push(row);
    ignored += result.ignored; added.push(file.name);
  }
  return { incoming, added, ignored };
}

async function handle(data) {
  try {
    if (data.type === 'init') {
      let saved;
      try { saved = await storage('get'); } catch { /* Private windows can block storage. */ }
      if (saved?.rows?.length) { rows = saved.rows; files = saved.files ?? []; }
      post('ready', { files, stats: rows.length ? aggregate(rows, data.filters) : null });
    }
    if (data.type === 'query') post('stats', { id: data.id, stats: aggregate(rows, data.filters) });
    if (data.type === 'import') {
      const { incoming, added, ignored } = await readFiles(data.files);
      if (!incoming.length) throw new Error('No music listening events were found in those files.');
      post('progress', { message: 'Removing duplicates…' });
      const merged = mergeRows(rows, incoming);
      const nextFiles = [...new Set([...files, ...added])];
      let persisted = true;
      try { await storage('put', { rows: merged.rows, files: nextFiles }); } catch { persisted = false; }
      rows = merged.rows; files = nextFiles;
      post('imported', { files, persisted, duplicates: merged.duplicates, ignored, stats: aggregate(rows, data.filters) });
    }
  } catch (error) {
    post('error', { message: error instanceof SyntaxError ? 'A file contains invalid JSON. Your library is unchanged.' : error.message });
  }
}

// An import has to finish writing before the next message is handled.
let queue = Promise.resolve();
if (typeof self !== 'undefined') self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
