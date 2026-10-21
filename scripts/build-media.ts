/**
 * Media build: content/media-sources.json → media/
 *
 *   media/protected/<slug>/master.m3u8        HLS master (hand-written, measured BANDWIDTH etc.)
 *   media/protected/<slug>/<height>/…         HLS VOD rendition: index.m3u8 + 4 s MPEG-TS segments
 *   media/protected/<slug>/720.mp4            progressive fallback (highest rendition ≤ 720p)
 *   media/public/captions/<slug>.<lang>.vtt   captions / subtitles (SRT converted, trims applied)
 *   media/public/chapters/<slug>.vtt          chapters (reels: one per loop)
 *   media/public/thumbs/<slug>.webp|.vtt      seek-preview sprite + WebVTT #xywh track
 *   media/manifest.json                       Record<mediaId, MediaAsset> (shared/types.ts)
 *   media/art.json                            Record<stem, art URLs> for the studio loops
 *   docs/ASSET-MANIFEST.md                    human-readable inventory (generated)
 *
 * Usage: node scripts/build-media.ts [--only media:id[,media:id…]] [--force] [--verify-only] [--keep-work]
 *
 * Incremental: each asset's inputs (definition, source files, caption files, encoding
 * settings) are hashed into media/.build-state.json; unchanged assets are skipped unless
 * --force. Every asset is built in media/.work/<slug>/, verified, and only then swapped into
 * place, so a failed build never leaves a half-written asset behind.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { CaptionTrack, MediaAsset, Rendition } from '../shared/types.ts';
import { writeArtRegistry, writeAssetManifestDoc } from './lib/asset-doc.ts';
import { composeReel } from './lib/compose.ts';
import type { ComposedReel } from './lib/compose.ts';
import {
  encodeRenditions,
  FALLBACK_MAX_HEIGHT,
  packageHls,
  pickLadder,
  probeSource,
  spriteLayout,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  thumbnailSprite,
} from './lib/encode.ts';
import type { Trim } from './lib/encode.ts';
import { formatBytes, formatDuration, fromRoot, hashFile, hashString, replacePath, sizeOf, writeJson } from './lib/files.ts';
import { avc1CodecFromMp4, masterPlaylist, measureRendition, verifyHlsPackage } from './lib/hls.ts';
import type { VariantEntry } from './lib/hls.ts';
import { findLoopSources } from './lib/loops.ts';
import { captionFileName, loadMediaSources, slugOf } from './lib/media-sources.ts';
import type { MediaSource } from './lib/media-sources.ts';
import { ffprobe, mapLimit } from './lib/proc.ts';
import { chapterCues } from './lib/reel.ts';
import { parseCues, serializeVtt, shiftCues, validateCues } from './lib/vtt.ts';
import type { Cue } from './lib/vtt.ts';

/** Assets built at once (each ffmpeg already uses every core; three keeps the CPU saturated). */
const CONCURRENCY = 3;

const MEDIA = fromRoot('media');
const PUBLIC = path.join(MEDIA, 'public');
const PROTECTED = path.join(MEDIA, 'protected');
const WORK = path.join(MEDIA, '.work');
const STATE_FILE = path.join(MEDIA, '.build-state.json');
const MANIFEST_FILE = path.join(MEDIA, 'manifest.json');
const PUBLIC_URL = '/media/public';

/** Public directories that hold per-asset files named "<slug>.…". */
const PER_ASSET_PUBLIC_DIRS = ['captions', 'chapters', 'thumbs'];

interface BuildState {
  assets: Record<string, { hash: string; builtAt: string; buildSeconds: number; loudness?: ComposedReel['loudness'] }>;
}

interface BuildOutcome {
  asset: MediaAsset;
  seconds: number;
  loudness?: ComposedReel['loudness'];
}

const log = (id: string, msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${id.padEnd(30)} ${msg}`);

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}

/* ───────────────────────── input hashing ───────────────────────── */

/**
 * Fingerprint of the modules that decide what the encoded output looks and sounds like
 * (ladder, score synthesis, composition, packaging, caption handling). Editing any of them
 * rebuilds every asset; for changes elsewhere in this file, run with --force.
 */
const PIPELINE_MODULES = ['compose.ts', 'encode.ts', 'hls.ts', 'reel.ts', 'score.ts', 'vtt.ts'];
const pipelineFingerprint = hashString(
  PIPELINE_MODULES.map((m) => readFileSync(fromRoot('scripts', 'lib', m), 'utf8')).join('\0'),
);

/** Hash of everything an asset's output depends on. */
async function inputHash(src: MediaSource, loopFiles: Map<string, string>): Promise<string> {
  const files =
    src.type === 'reel' ? src.loops.map((stem) => loopFiles.get(stem) ?? `missing:${stem}`) : [fromRoot(src.source)];
  files.push(...(src.captions ?? []).map((c) => fromRoot(c.src)));
  const fileHashes = await Promise.all(files.map((f) => (existsSync(f) ? hashFile(f) : Promise.resolve(`missing:${f}`))));
  return hashString(JSON.stringify({ pipelineFingerprint, src, fileHashes }));
}

/* ───────────────────────── one asset ───────────────────────── */

const publicUrl = (...parts: string[]) => [PUBLIC_URL, ...parts].join('/');

async function writeVtt(file: string, cues: Cue[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeVtt(cues));
}

/** Probes each HLS variant playlist and checks it decodes at the expected size. */
async function probeVariants(protectedDir: string, renditions: Rendition[]): Promise<void> {
  for (const r of renditions) {
    const playlist = path.join(protectedDir, String(r.height), 'index.m3u8');
    const probe = await ffprobe(playlist);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (v?.codec_name !== 'h264' || v.width !== r.width || v.height !== r.height) {
      throw new Error(`${playlist}: expected h264 ${r.width}x${r.height}, ffprobe saw ${v?.codec_name} ${v?.width}x${v?.height}`);
    }
  }
}

/** Full structural verification of an asset's files (HLS, MP4, public tracks). */
async function verifyAsset(asset: MediaAsset, protectedDir: string, publicDir: string): Promise<void> {
  verifyHlsPackage(path.join(protectedDir, 'master.m3u8'), asset.duration);
  await probeVariants(protectedDir, asset.renditions);
  const mp4 = path.join(protectedDir, path.basename(asset.mp4));
  if (!existsSync(mp4)) throw new Error(`missing progressive fallback ${asset.mp4}`);
  const urls = [...asset.captions.map((c) => c.src), asset.chapters, asset.thumbnails].filter((u): u is string => !!u);
  if (asset.thumbnails) urls.push(asset.thumbnails.replace(/\.vtt$/, '.webp'));
  for (const url of urls) {
    const file = path.join(publicDir, ...url.slice(PUBLIC_URL.length + 1).split('/'));
    if (!existsSync(file)) throw new Error(`missing public file ${url}`);
  }
}

async function buildAsset(src: MediaSource, loopFiles: Map<string, string>, keepWork: boolean): Promise<BuildOutcome> {
  const started = Date.now();
  const slug = slugOf(src.id);
  const work = path.join(WORK, slug);
  const stageProtected = path.join(work, 'protected');
  const stagePublic = path.join(work, 'public');
  await rm(work, { recursive: true, force: true });
  await mkdir(stageProtected, { recursive: true });

  // 1. Resolve the source: a composed mezzanine for reels, the file itself otherwise.
  let input: string;
  let trim: Trim | undefined;
  let composed: ComposedReel | undefined;
  if (src.type === 'reel') {
    log(src.id, `composing ${src.loops.length} loop(s) ×${src.repeat ?? 1} + score`);
    composed = await composeReel(src, loopFiles, work);
    input = composed.file;
  } else {
    input = fromRoot(src.source);
    if (!existsSync(input)) throw new Error(`source file not found: ${src.source}`);
    trim = src.trim;
  }
  const info = await probeSource(input);
  if (trim && trim.start >= info.duration) throw new Error(`trim.start ${trim.start}s is beyond the source (${info.duration.toFixed(1)}s)`);
  if (trim) trim = { start: trim.start, end: Math.min(trim.end, info.duration) };

  // 2. Renditions: one decode, every rung; then HLS per rung.
  const rungs = pickLadder(info.height);
  log(src.id, `encoding ${rungs.map((r) => `${r.height}p`).join(', ')}`);
  const mp4s = await encodeRenditions({ input, src: info, rungs, outDir: path.join(work, 'renditions'), trim });

  const fallbackHeight = (rungs.find((r) => r.height <= FALLBACK_MAX_HEIGHT) ?? rungs[rungs.length - 1]).height;
  const variants: VariantEntry[] = [];
  const renditions: Rendition[] = [];
  for (const rung of rungs) {
    const mp4 = mp4s.get(rung.height)!;
    const dir = path.join(stageProtected, String(rung.height));
    await packageHls(mp4, dir);
    const stats = measureRendition(path.join(dir, 'index.m3u8'));
    const measured = await probeSource(mp4);
    const codecs = [avc1CodecFromMp4(mp4), ...(info.hasAudio ? ['mp4a.40.2'] : [])].join(',');
    variants.push({
      uri: `${rung.height}/index.m3u8`,
      bandwidth: stats.peakBandwidth,
      averageBandwidth: stats.averageBandwidth,
      width: measured.width,
      height: measured.height,
      codecs,
      frameRate: measured.fps,
    });
    renditions.push({ height: measured.height, width: measured.width, bandwidth: stats.averageBandwidth, label: `${measured.height}p` });
  }
  // The default rendition goes first (players start there), then highest → lowest.
  const ordered = [...variants].sort((a, b) =>
    a.height === fallbackHeight ? -1 : b.height === fallbackHeight ? 1 : b.height - a.height,
  );
  await writeFile(path.join(stageProtected, 'master.m3u8'), masterPlaylist(ordered));

  const fallbackName = `${fallbackHeight}.mp4`;
  const fallbackMp4 = path.join(stageProtected, fallbackName);
  await rename(mp4s.get(fallbackHeight)!, fallbackMp4);
  const final = await probeSource(fallbackMp4);
  const duration = Math.round(final.duration * 1000) / 1000;

  // 3. Public tracks: captions, chapters, thumbnails.
  const captions: CaptionTrack[] = [];
  for (const ref of src.captions ?? []) {
    let cues = parseCues(readFileSync(fromRoot(ref.src), 'utf8'));
    if (src.type === 'file') {
      // Delivered subtitle files often overrun the picture by a moment: apply the trim offset,
      // clip to the measured end and report cues that fall outside entirely. Reel captions are
      // authored to the timeline, so for them any overrun is an error.
      const kept = shiftCues(cues, trim?.start ?? 0, duration);
      if (kept.length < cues.length) log(src.id, `${ref.src}: dropped ${cues.length - kept.length} cue(s) outside the ${trim ? 'trimmed ' : ''}media`);
      cues = kept;
    }
    const problems = validateCues(cues, duration);
    if (problems.length) throw new Error(`${ref.src}:\n  ${problems.join('\n  ')}`);
    const name = captionFileName(slug, ref);
    await writeVtt(path.join(stagePublic, 'captions', name), cues);
    captions.push({ lang: ref.lang, label: ref.label, kind: ref.kind, src: publicUrl('captions', name), ...(ref.default ? { default: true } : {}) });
  }

  let chapters: string | undefined;
  if (src.type === 'reel' && src.chapters && composed) {
    await writeVtt(path.join(stagePublic, 'chapters', `${slug}.vtt`), chapterCues(composed.timeline));
    chapters = publicUrl('chapters', `${slug}.vtt`);
  }

  const layout = spriteLayout(duration, final.fps);
  await thumbnailSprite(fallbackMp4, final.fps, layout, path.join(stagePublic, 'thumbs', `${slug}.webp`));
  const spriteUrl = publicUrl('thumbs', `${slug}.webp`);
  const thumbCues: Cue[] = Array.from({ length: layout.count }, (_, k) => ({
    start: k * layout.interval,
    end: Math.min((k + 1) * layout.interval, duration),
    text: `${spriteUrl}#xywh=${(k % layout.columns) * THUMB_WIDTH},${Math.floor(k / layout.columns) * THUMB_HEIGHT},${THUMB_WIDTH},${THUMB_HEIGHT}`,
  }));
  await writeVtt(path.join(stagePublic, 'thumbs', `${slug}.vtt`), thumbCues);

  const top = renditions[0];
  const asset: MediaAsset = {
    id: src.id,
    duration,
    width: top.width,
    height: top.height,
    hasAudio: info.hasAudio,
    renditions,
    hls: `${slug}/master.m3u8`,
    mp4: `${slug}/${fallbackName}`,
    captions,
    ...(chapters ? { chapters } : {}),
    thumbnails: publicUrl('thumbs', `${slug}.vtt`),
    source: sourceNote(src),
  };

  // 4. Verify the staged package, then swap it into place.
  await verifyAsset(asset, stageProtected, stagePublic);
  await replacePath(stageProtected, path.join(PROTECTED, slug));
  await removePublicFiles(slug);
  for (const dir of PER_ASSET_PUBLIC_DIRS) {
    const from = path.join(stagePublic, dir);
    if (!existsSync(from)) continue;
    await mkdir(path.join(PUBLIC, dir), { recursive: true });
    for (const name of readdirSync(from)) await rename(path.join(from, name), path.join(PUBLIC, dir, name));
  }
  if (!keepWork) await rm(work, { recursive: true, force: true });

  const seconds = (Date.now() - started) / 1000;
  log(src.id, `done in ${seconds.toFixed(0)}s — ${formatDuration(duration)}, ${formatBytes(assetBytes(slug))}`);
  return { asset, seconds, loudness: composed?.loudness };
}

function sourceNote(src: MediaSource): string {
  if (src.type === 'reel') {
    const repeat = src.repeat && src.repeat > 1 ? `, each played ${src.repeat}×` : '';
    return (
      `Studio concept reel: Monumental studio motion loops ${src.loops.join(', ')}${repeat}, joined with 0.6 s crossfades; ` +
      `original ambient score generated with ffmpeg (seed ${src.score.seed}, ${src.score.root} ${src.score.mood}).`
    );
  }
  const trim = src.trim ? ` (excerpt ${src.trim.start}–${src.trim.end} s)` : '';
  return `${src.source}${trim} — ${src.licence}. ${src.attribution}`;
}

/** Deletes an asset's per-asset public files ("<slug>.…" in captions/, chapters/, thumbs/). */
async function removePublicFiles(slug: string): Promise<void> {
  for (const dir of PER_ASSET_PUBLIC_DIRS) {
    const abs = path.join(PUBLIC, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) if (name.startsWith(`${slug}.`)) await rm(path.join(abs, name));
  }
}

function publicFilesFor(slug: string): string[] {
  return PER_ASSET_PUBLIC_DIRS.flatMap((dir) => {
    const abs = path.join(PUBLIC, dir);
    return existsSync(abs) ? readdirSync(abs).filter((n) => n.startsWith(`${slug}.`)).map((n) => path.join(abs, n)) : [];
  });
}

/** Bytes on disk for an asset: protected package + its public tracks. */
const assetBytes = (slug: string) =>
  sizeOf(path.join(PROTECTED, slug)) + publicFilesFor(slug).reduce((sum, f) => sum + sizeOf(f), 0);

/* ───────────────────────── main ───────────────────────── */

async function main() {
  const { values } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      force: { type: 'boolean', default: false },
      'verify-only': { type: 'boolean', default: false },
      'keep-work': { type: 'boolean', default: false },
    },
  });
  const sources = loadMediaSources();
  const only = new Set((values.only ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean));
  for (const id of only) if (!sources.some((s) => s.id === id)) throw new Error(`--only ${id}: not in content/media-sources.json`);
  const selected = sources.filter((s) => only.size === 0 || only.has(s.id));

  const manifest = readJson<Record<string, MediaAsset>>(MANIFEST_FILE, {});
  const state = readJson<BuildState>(STATE_FILE, { assets: {} });
  const loopFiles = findLoopSources();

  if (values['verify-only']) {
    let failed = 0;
    for (const src of selected) {
      const asset = manifest[src.id];
      try {
        if (!asset) throw new Error('not built (no manifest entry)');
        await verifyAsset(asset, path.join(PROTECTED, slugOf(src.id)), PUBLIC);
        log(src.id, `ok — ${formatDuration(asset.duration)}, ${asset.renditions.map((r) => r.label).join('/')}, ${formatBytes(assetBytes(slugOf(src.id)))}`);
      } catch (e) {
        failed++;
        log(src.id, `FAILED: ${(e as Error).message}`);
      }
    }
    process.exitCode = failed ? 1 : 0;
    return;
  }

  // Decide what to build.
  const todo: { src: MediaSource; hash: string }[] = [];
  for (const src of selected) {
    const hash = await inputHash(src, loopFiles);
    const slug = slugOf(src.id);
    const prev = manifest[src.id];
    const upToDate =
      !values.force &&
      state.assets[src.id]?.hash === hash &&
      prev !== undefined &&
      existsSync(path.join(PROTECTED, slug, 'master.m3u8')) &&
      existsSync(path.join(PROTECTED, ...prev.mp4.split('/')));
    if (upToDate) log(src.id, 'unchanged — skipped');
    else todo.push({ src, hash });
  }

  const results = await mapLimit(todo, CONCURRENCY, ({ src }) => buildAsset(src, loopFiles, values['keep-work']));
  // Work directories of failed (or --keep-work) assets stay for inspection; drop the parent if empty.
  if (existsSync(WORK) && readdirSync(WORK).length === 0) await rm(WORK, { recursive: true });
  let failed = 0;
  results.forEach((r, i) => {
    const { src, hash } = todo[i];
    if (r.status === 'fulfilled') {
      manifest[src.id] = r.value.asset;
      state.assets[src.id] = {
        hash,
        builtAt: new Date().toISOString(),
        buildSeconds: Math.round(r.value.seconds),
        ...(r.value.loudness ? { loudness: r.value.loudness } : {}),
      };
    } else {
      failed++;
      log(src.id, `FAILED: ${(r.reason as Error).message ?? r.reason}`);
    }
  });

  // Drop assets that are no longer defined (manifest, state and their generated files).
  const defined = new Set(sources.map((s) => s.id));
  for (const id of Object.keys(manifest)) {
    if (defined.has(id)) continue;
    delete manifest[id];
    delete state.assets[id];
    await rm(path.join(PROTECTED, slugOf(id)), { recursive: true, force: true });
    await removePublicFiles(slugOf(id));
    log(id, 'removed (no longer in media-sources.json)');
  }

  const sortedManifest = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeJson(MANIFEST_FILE, sortedManifest);
  await writeJson(STATE_FILE, { assets: state.assets });
  const art = await writeArtRegistry();
  await writeAssetManifestDoc({ sources, manifest: sortedManifest, loopFiles, assetBytes, art });

  // Summary.
  console.log('\nAsset                          Duration   Renditions              Size');
  let total = 0;
  for (const src of sources) {
    const a = sortedManifest[src.id];
    if (!a) continue;
    const bytes = assetBytes(slugOf(src.id));
    total += bytes;
    console.log(`${src.id.padEnd(30)} ${a.duration.toFixed(3).padStart(8)}s  ${a.renditions.map((r) => r.label).join('/').padEnd(22)} ${formatBytes(bytes)}`);
  }
  console.log(`Total playable media: ${formatBytes(total)}; art registry: ${Object.keys(art).length} stems; media/ on disk: ${formatBytes(sizeOf(MEDIA) - sizeOf(WORK))}`);
  if (failed) {
    console.error(`\n${failed} asset(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
