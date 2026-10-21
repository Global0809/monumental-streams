/**
 * Serve dist/ the way GitHub Pages does: under the repository base path, with Range support
 * for video, and unknown paths answered by 404.html (status 404) — the SPA fallback the
 * static build relies on. Lets deep links and refresh be verified locally before deploying.
 *   node scripts/serve-pages.mjs [port]      → http://localhost:4180/monumental-streams/
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist');
const base = process.env.MS_BASE ?? '/monumental-streams/';
const port = Number(process.argv[2] ?? 4180);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.vtt': 'text/vtt',
};

const send = (res, file, status, req) => {
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range && status === 200) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(file).pipe(res);
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(base)) {
    res.writeHead(302, { Location: base });
    return res.end();
  }
  let file = normalize(join(root, path.slice(base.length)));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (existsSync(file)) return send(res, file, 200, req);
  send(res, join(root, '404.html'), 404, req);
}).listen(port, () => console.log(`GitHub Pages preview: http://localhost:${port}${base}`));
