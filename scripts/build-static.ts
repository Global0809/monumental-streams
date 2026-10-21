/**
 * Static site for GitHub Pages: run after `vite build` with VITE_STATIC=1 and MS_BASE set.
 *   MS_BASE=/monumental-streams/ VITE_STATIC=1 npx vite build && node scripts/build-static.ts
 * Bakes the catalogue + a playback map into dist/static/, copies public media and one MP4 per
 * title into dist/media/, rewrites absolute /media URLs onto the base path, and adds 404.html
 * so deep links open the app.
 */
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent, protectedDir, mediaKey } from '../server/content.ts';

const root = process.cwd();
const dist = path.join(root, 'dist');
const base = process.env.MS_BASE ?? '/';
const withBase = (s: string) => s.split('"/media/').join(`"${base}media/`);

const loaded = await loadContent({ contentDir: path.join(root, 'content'), mediaDir: path.join(root, 'media') });
mkdirSync(path.join(dist, 'static'), { recursive: true });
writeFileSync(path.join(dist, 'static/catalogue.json'), withBase(loaded.json));

// public media (posters, previews, captions, chapters, thumbnails), with base-aware VTT sprites
cpSync(path.join(root, 'media/public'), path.join(dist, 'media/public'), { recursive: true });
const thumbs = path.join(dist, 'media/public/thumbs');
if (existsSync(thumbs))
  for (const f of readdirSync(thumbs).filter((n) => n.endsWith('.vtt'))) {
    const file = path.join(thumbs, f);
    writeFileSync(file, readFileSync(file, 'utf8').split('/media/').join(`${base}media/`));
  }

// one progressive MP4 per playable title
const playback: Record<string, unknown> = {};
mkdirSync(path.join(dist, 'media/video'), { recursive: true });
for (const v of loaded.raw.videos) {
  if (!v.media) continue;
  const asset = loaded.media[v.media];
  const key = mediaKey(v.media);
  if (!asset || !key) continue;
  const src = path.join(protectedDir(path.join(root, 'media'), key), path.basename(asset.mp4));
  if (!existsSync(src)) continue;
  // compact web copy (≤480p, ~0.5 Mbps) cached outside dist so rebuilds are instant
  const cached = path.join(root, 'media/static-mp4', `${key}.mp4`);
  if (!existsSync(cached)) {
    mkdirSync(path.dirname(cached), { recursive: true });
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', "scale=-2:'min(480,ih)'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-maxrate', '650k', '-bufsize', '1300k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', cached], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${key}`);
  }
  copyFileSync(cached, path.join(dist, 'media/video', `${key}.mp4`));
  const prefix = (u?: string) => (u && u.startsWith('/media/') ? base + u.slice(1) : u);
  playback[v.id] = {
    mp4: `${base}media/video/${key}.mp4`,
    captions: asset.captions.map((c) => ({ ...c, src: prefix(c.src) })),
    chapters: prefix(asset.chapters),
    thumbnails: prefix(asset.thumbnails),
    premium: v.access === 'premium' || v.availability.status === 'early-access',
  };
  playback[v.slug] = playback[v.id];
}
writeFileSync(path.join(dist, 'static/playback.json'), JSON.stringify(playback));

// index.html: base-aware public files; 404.html = SPA fallback for deep links
let html = readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace('src="/boot.js"', `src="${base}boot.js"`).replace('href="/favicon.svg"', `href="${base}favicon.svg"`);
writeFileSync(path.join(dist, 'index.html'), html);
writeFileSync(path.join(dist, '404.html'), html);
writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`static site ready: ${Object.keys(playback).length / 2} playable titles, base ${base}`);
