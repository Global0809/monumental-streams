/**
 * Content loader: authored JSON + generated media registries → CataloguePayload.
 *
 *   CONTENT_DIR/<kind>.json     arrays (membership.json is an object)
 *   CONTENT_DIR/videos/*.json   one Video per file
 *   MEDIA_DIR/manifest.json     Record<mediaId, MediaAsset>  (optional; server-only paths)
 *   MEDIA_DIR/art.json          Record<stem, ArtFiles>       (optional)
 *
 * Content is validated with shared/schema.ts; errors abort with a readable list. Art falls
 * back to conventionally named files in MEDIA_DIR/public (what scripts/build-previews.sh
 * writes) and finally to a neutral gradient, so a missing image never breaks the UI.
 * Protected media paths never leave the server: the payload only carries PublicMediaInfo.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildCatalogue, type Catalogue } from '../shared/catalogue.ts';
import { validateContent } from '../shared/schema.ts';
import type { ArtAsset, ArtUrls, CataloguePayload, ID, MediaAsset, PublicMediaInfo, RawContent, Video } from '../shared/types.ts';

/** Public files for one art stem, as written to MEDIA_DIR/art.json by the media build. */
export interface ArtFiles {
  poster: string;
  posterSmall: string;
  lqip: string;
  preview?: string;
  previewSmall?: string;
}

export interface LoadedContent {
  raw: RawContent;
  payload: CataloguePayload;
  catalogue: Catalogue;
  /** Server-only media facts (with protected paths) for media that is actually on disk. */
  media: Record<ID, MediaAsset>;
  version: string;
  /** Pre-serialised payload for GET /api/catalogue. */
  json: string;
  warnings: string[];
}

export class ContentError extends Error {
  errors: string[];
  warnings: string[];

  constructor(errors: string[], warnings: string[] = []) {
    super(`Content is invalid (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${errors.map((e) => `  • ${e}`).join('\n')}`);
    this.name = 'ContentError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

type ArrayKind = Exclude<keyof RawContent, 'videos' | 'membership'>;
const ARRAY_KINDS: ArrayKind[] = [
  'places',
  'periods',
  'movements',
  'people',
  'categories',
  'themes',
  'routes',
  'programmes',
  'collections',
  'art',
  'activity',
  'external',
];

const PUBLIC_PREFIX = '/media/public/';

/** Neutral dark gradient used when an art stem has no files at all. */
const NEUTRAL_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><defs><linearGradient id="g" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#121217"/><stop offset="1" stop-color="#2b2b35"/></linearGradient></defs>' +
      '<rect width="16" height="9" fill="url(#g)"/></svg>',
  );

/* ───────────── media path helpers (shared with server/playback.ts) ───────────── */

const SAFE_KEY = /^[a-z0-9][a-z0-9._-]*$/i;

/** URL/folder key for a media id: "media:reel-world-wired" → "reel-world-wired". */
export function mediaKey(mediaId: ID): string | null {
  const key = mediaId.startsWith('media:') ? mediaId.slice('media:'.length) : mediaId;
  return SAFE_KEY.test(key) && !key.includes('..') ? key : null;
}

/**
 * Normalises a manifest path ("reel-world-wired/master.m3u8", "protected/<key>/x.mp4" or
 * just "x.mp4") to a path relative to MEDIA_DIR/protected/<key>/. Null when unsafe.
 */
export function assetPathWithinKey(key: string, manifestPath: string): string | null {
  let rel = manifestPath.replaceAll('\\', '/').replace(/^\.?\/+/, '');
  if (rel.startsWith('protected/')) rel = rel.slice('protected/'.length);
  if (rel.startsWith(`${key}/`)) rel = rel.slice(key.length + 1);
  const segments = rel.split('/');
  if (!rel || segments.some((s) => !s || s === '.' || s === '..')) return null;
  return rel;
}

export function protectedDir(mediaDir: string, key: string): string {
  return path.join(mediaDir, 'protected', key);
}

/* ───────────── loading ───────────── */

async function readJson(file: string, label: string, errors: string[]): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    errors.push(`${label}: ${err instanceof SyntaxError ? `invalid JSON — ${err.message}` : (err as Error).message}`);
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function readRawContent(contentDir: string, errors: string[], warnings: string[]): Promise<RawContent> {
  const raw: Partial<Record<keyof RawContent, unknown>> = {};
  for (const kind of ARRAY_KINDS) {
    const file = path.join(contentDir, `${kind}.json`);
    if (!existsSync(file)) {
      warnings.push(`content/${kind}.json not found — treated as empty.`);
      raw[kind] = [];
      continue;
    }
    const value = await readJson(file, `content/${kind}.json`, errors);
    if (value !== undefined && !Array.isArray(value)) errors.push(`content/${kind}.json must contain a JSON array.`);
    raw[kind] = Array.isArray(value) ? value : [];
  }

  const membershipFile = path.join(contentDir, 'membership.json');
  if (existsSync(membershipFile)) {
    const value = await readJson(membershipFile, 'content/membership.json', errors);
    if (value !== undefined && !isRecord(value)) errors.push('content/membership.json must contain a JSON object.');
    raw.membership = value;
  } else errors.push('content/membership.json not found.');

  const videosDir = path.join(contentDir, 'videos');
  const videos: unknown[] = [];
  if (existsSync(videosDir)) {
    const files = (await readdir(videosDir)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      const value = await readJson(path.join(videosDir, f), `content/videos/${f}`, errors);
      if (value === undefined) continue;
      if (!isRecord(value)) errors.push(`content/videos/${f} must contain one video object.`);
      else videos.push(value);
    }
  } else warnings.push('content/videos/ not found — the catalogue has no videos.');
  raw.videos = videos;
  return raw as RawContent;
}

function isMediaAsset(v: unknown): v is MediaAsset {
  return (
    isRecord(v) &&
    typeof v.mp4 === 'string' &&
    typeof v.duration === 'number' &&
    Array.isArray(v.renditions) &&
    Array.isArray(v.captions) &&
    (v.hls === undefined || typeof v.hls === 'string')
  );
}

/** Reads the manifest and keeps only assets whose protected files exist. */
async function readMediaManifest(mediaDir: string, errors: string[], warnings: string[]): Promise<Record<ID, MediaAsset>> {
  const file = path.join(mediaDir, 'manifest.json');
  if (!existsSync(file)) {
    warnings.push('media/manifest.json not found — no video is playable until the media build runs.');
    return {};
  }
  const value = await readJson(file, 'media/manifest.json', errors);
  if (value === undefined) return {};
  if (!isRecord(value)) {
    errors.push('media/manifest.json must contain an object keyed by media id.');
    return {};
  }
  const out: Record<ID, MediaAsset> = {};
  for (const [id, asset] of Object.entries(value)) {
    const key = mediaKey(id);
    if (!key || !isMediaAsset(asset)) {
      warnings.push(`media/manifest.json: entry "${id}" is malformed — skipped.`);
      continue;
    }
    const onDisk = (p: string) => {
      const rel = assetPathWithinKey(key, p);
      return rel !== null && existsSync(path.join(protectedDir(mediaDir, key), rel));
    };
    if (!onDisk(asset.mp4)) {
      warnings.push(`${id}: protected file "${asset.mp4}" is missing — not playable.`);
      continue;
    }
    const entry: MediaAsset = { ...asset, id };
    if (asset.hls && !onDisk(asset.hls)) {
      warnings.push(`${id}: HLS playlist "${asset.hls}" is missing — MP4 only.`);
      delete entry.hls;
    }
    out[id] = entry;
  }
  return out;
}

const publicUrl = (value: string) =>
  value.startsWith('/') || value.startsWith('data:') || /^https?:\/\//.test(value) ? value : `${PUBLIC_PREFIX}${value}`;

/** Files produced by scripts/build-previews.sh for a stem, if present. */
async function conventionalArt(mediaDir: string, stem: string): Promise<ArtFiles | null> {
  const pub = path.join(mediaDir, 'public');
  const has = (rel: string) => existsSync(path.join(pub, rel));
  const poster = has(`posters/${stem}-1280.webp`) ? `posters/${stem}-1280.webp` : null;
  const posterSmall = has(`posters/${stem}-640.webp`) ? `posters/${stem}-640.webp` : poster;
  if (!poster && !posterSmall) return null;
  const lqipFile = path.join(pub, `posters/${stem}-lqip.txt`);
  const lqip = existsSync(lqipFile) ? (await readFile(lqipFile, 'utf8')).trim() : NEUTRAL_IMAGE;
  return {
    poster: publicUrl((poster ?? posterSmall)!),
    posterSmall: publicUrl((posterSmall ?? poster)!),
    lqip,
    preview: has(`previews/${stem}-720.mp4`) ? publicUrl(`previews/${stem}-720.mp4`) : undefined,
    previewSmall: has(`previews/${stem}-480.mp4`) ? publicUrl(`previews/${stem}-480.mp4`) : undefined,
  };
}

async function resolveArt(art: ArtAsset[], mediaDir: string, errors: string[], warnings: string[]): Promise<Record<ID, ArtUrls>> {
  const file = path.join(mediaDir, 'art.json');
  const registry = existsSync(file) ? await readJson(file, 'media/art.json', errors) : {};
  const entries = isRecord(registry) ? registry : {};
  const out: Record<ID, ArtUrls> = {};
  for (const a of art) {
    const listed = entries[a.stem];
    let files: ArtFiles | null = null;
    if (isRecord(listed) && typeof listed.poster === 'string') {
      const l = listed as unknown as ArtFiles;
      files = {
        poster: publicUrl(l.poster),
        posterSmall: publicUrl(l.posterSmall ?? l.poster),
        lqip: l.lqip ?? NEUTRAL_IMAGE,
        preview: l.preview ? publicUrl(l.preview) : undefined,
        previewSmall: l.previewSmall ? publicUrl(l.previewSmall) : undefined,
      };
    } else files = await conventionalArt(mediaDir, a.stem);
    if (!files) warnings.push(`${a.id}: no image files for stem "${a.stem}" — using a neutral placeholder.`);
    const f = files ?? { poster: NEUTRAL_IMAGE, posterSmall: NEUTRAL_IMAGE, lqip: NEUTRAL_IMAGE };
    out[a.id] = {
      poster: f.poster,
      posterSmall: f.posterSmall,
      lqip: f.lqip,
      ...(f.preview ? { preview: f.preview } : {}),
      ...(f.previewSmall ? { previewSmall: f.previewSmall } : {}),
      alt: a.alt,
      provisional: a.provisional,
    };
  }
  return out;
}

function publicMedia(asset: MediaAsset): PublicMediaInfo {
  return {
    duration: asset.duration,
    renditions: asset.renditions,
    captions: asset.captions,
    ...(asset.chapters ? { chapters: asset.chapters } : {}),
    ...(asset.thumbnails ? { thumbnails: asset.thumbnails } : {}),
    hasAudio: asset.hasAudio,
  };
}

export interface LoadContentOptions {
  contentDir: string;
  mediaDir: string;
}

export async function loadContent({ contentDir, mediaDir }: LoadContentOptions): Promise<LoadedContent> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const raw = await readRawContent(contentDir, errors, warnings);
  if (errors.length) throw new ContentError(errors, warnings);

  const result = validateContent(raw);
  warnings.push(...result.warnings);
  if (!result.ok) throw new ContentError(result.errors, warnings);

  const manifest = await readMediaManifest(mediaDir, errors, warnings);
  const art = await resolveArt(raw.art, mediaDir, errors, warnings);
  if (errors.length) throw new ContentError(errors, warnings);

  // Only media referenced by a video is published; unreferenced assets stay private.
  const media: Record<ID, MediaAsset> = {};
  const publicInfo: Record<ID, PublicMediaInfo> = {};
  const unresolved: Video[] = [];
  for (const v of raw.videos) {
    if (!v.media) continue;
    const asset = manifest[v.media];
    if (!asset) {
      unresolved.push(v);
      continue;
    }
    media[v.media] = asset;
    publicInfo[v.media] = publicMedia(asset);
  }
  for (const v of unresolved) warnings.push(`${v.id}: media "${v.media}" is not in the media manifest — shown as unavailable.`);

  const { art: _artRegistry, ...content } = raw;
  const version = createHash('sha1')
    .update(JSON.stringify({ content, art, media: publicInfo }))
    .digest('hex')
    .slice(0, 12);
  const payload: CataloguePayload = { version, content, art, media: publicInfo };

  return {
    raw,
    payload,
    catalogue: buildCatalogue(payload),
    media,
    version,
    json: JSON.stringify(payload),
    warnings,
  };
}
