import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Only files inside `root` are served: no dotfiles, no traversal, no drive letters, and only known types.
export async function serveStatic(root, pathname, request, response) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return false; }
  if (path.endsWith('/')) path += 'index.html';
  const parts = path.split('/').slice(1);
  if (/[\0\\]/.test(path) || parts.some(part => !part || part.startsWith('.') || part.includes(':'))) return false;
  const file = resolve(root, ...parts);
  const type = TYPES[extname(file).toLowerCase()];
  if (!type || !file.startsWith(root + sep)) return false;
  let bytes;
  try { bytes = await readFile(file); } catch { return false; }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
  response.end(request.method === 'HEAD' ? undefined : bytes);
  return true;
}
