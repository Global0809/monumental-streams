/**
 * Renders the procedural category organs into poster artwork (docs/ART-DIRECTION.md).
 *
 *   node --disable-warning=ExperimentalWarning scripts/render-organs.ts
 *        [--only movies,music] [--base http://localhost:5173] [--dpr 2] [--review shots/organs]
 *
 * Needs the Vite dev server (npm run dev:web). For each organ it opens
 * /tools/organ-render.html?organ=<id>&w=1600&h=900 (a pure scene: no UI), waits until the still
 * is drawn, grabs the canvas at 1600×900 × dpr and writes, like scripts/build-previews.sh:
 *   media/public/posters/organ-<id>-1280.webp, organ-<id>-640.webp, organ-<id>-lqip.txt
 * then refreshes media/art.json. With --review <dir> it only writes PNGs there (no media).
 * Deterministic: the same code renders the same images.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ORGAN_SECTIONS, type OrganSection } from '../src/stage/organs/palette.ts';
import { writeArtRegistry } from './lib/asset-doc.ts';
import { fromRoot } from './lib/files.ts';

/** The still each poster shows: a moment (s) and an energy (0..1). Live is always dormant. */
export const POSES: Record<OrganSection, { t: number; energy: number }> = {
  live: { t: 1, energy: 0 },
  movies: { t: 2.4, energy: 0.3 },
  music: { t: 1.7, energy: 0.55 },
  sports: { t: 2.2, energy: 0.4 },
  gaming: { t: 2.0, energy: 0.55 },
  news: { t: 1.3, energy: 0.4 },
  fashion: { t: 1.0, energy: 0.3 },
  culture: { t: 2.6, energy: 0.45 },
  kids: { t: 1.5, energy: 0.35 },
};

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = opt('base', 'http://localhost:5173')!;
const dpr = Number(opt('dpr', '2'));
const review = opt('review');
const only = opt('only')?.split(',').map((s) => s.trim()).filter(Boolean);
const ids = ORGAN_SECTIONS.filter((id) => !only || only.includes(id));
if (only && ids.length !== only.length) {
  console.error(`unknown organ in --only (known: ${ORGAN_SECTIONS.join(', ')})`);
  process.exit(2);
}

const W = 1600;
const H = 900;
const posters = fromRoot('media', 'public', 'posters');
const tmp = mkdtempSync(path.join(tmpdir(), 'organs-'));
const ffmpeg = (...a: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failed = 0;
try {
  if (review) mkdirSync(review, { recursive: true });
  else mkdirSync(posters, { recursive: true });
  for (const id of ids) {
    const pose = POSES[id];
    const started = Date.now();
    errors.length = 0;
    const url = `${base}/tools/organ-render.html?organ=${id}&w=${W}&h=${H}&t=${pose.t}&energy=${pose.energy}&dpr=${dpr}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 180_000 });
    const state = await page.evaluate(() => document.documentElement.dataset.ready);
    if (state !== '1' || errors.some((e) => e.startsWith('pageerror'))) {
      console.error(`✗ ${id}: render failed\n${errors.join('\n')}`);
      failed++;
      continue;
    }
    const dataUrl = await page.evaluate(() => (document.getElementById('organ') as HTMLCanvasElement).toDataURL('image/png'));
    const png = path.join(tmp, `${id}.png`);
    writeFileSync(png, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    const stem = `organ-${id}`;
    if (review) {
      ffmpeg('-i', png, '-vf', `scale=${W}:-2:flags=lanczos`, path.join(review, `${stem}.png`));
    } else {
      ffmpeg('-i', png, '-vf', 'scale=1280:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '86', path.join(posters, `${stem}-1280.webp`));
      ffmpeg('-i', png, '-vf', 'scale=640:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '80', path.join(posters, `${stem}-640.webp`));
      const lq = path.join(tmp, `${stem}-lqip.webp`);
      ffmpeg('-i', png, '-vf', 'scale=24:-2', '-c:v', 'libwebp', '-quality', '40', lq);
      writeFileSync(path.join(posters, `${stem}-lqip.txt`), `data:image/webp;base64,${readFileSync(lq).toString('base64')}`);
    }
    const stats = await page.evaluate(() => (window as unknown as { __organStats?: { triangles: number } }).__organStats);
    console.log(`✓ ${id} (${stats?.triangles ?? '?'} triangles, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
  if (!review && failed < ids.length) {
    await writeArtRegistry();
    console.log('media/art.json refreshed');
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
