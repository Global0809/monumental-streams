/**
 * Imports a finished video file as new playable content.
 *
 *   node scripts/content-add.ts --file <video> --slug <slug> --title "<title>"
 *     [--programme programme:x] [--access free|premium] [--kind feature|episode|short|teaser|reel|archive-film]
 *     [--captions file.srt|file.vtt] [--captions-lang en]
 *     [--licence ".."] [--attribution ".."] [--source-url https://..] [--provenance public-domain|creative-commons]
 *     [--art art:x] [--dry-run]
 *
 * Steps: copy the video to sources/library/<slug>.<ext> (and captions to content/captions/),
 * append a "file" entry to content/media-sources.json, write a skeleton
 * content/videos/<slug>.json (placeholders are marked "TODO:"; the video stays unavailable
 * until an editor completes it), build the media, then print the remaining editorial steps.
 * --dry-run validates everything and prints what would be written, without touching disk.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { VideoSchema } from '../shared/schema.ts';
import type { Access, Video, VideoKind } from '../shared/types.ts';
import { formatBytes, formatDuration, fromRoot, toRootRelative, writeJson } from './lib/files.ts';
import { probeSource } from './lib/encode.ts';
import { loadMediaSources, mediaSourcesSchema, saveMediaSources } from './lib/media-sources.ts';
import type { FileSource } from './lib/media-sources.ts';
import { run } from './lib/proc.ts';
import { parseCues } from './lib/vtt.ts';

const VIDEO_KINDS: VideoKind[] = ['episode', 'feature', 'short', 'teaser', 'reel', 'archive-film'];
const TODO_LICENCE = 'TODO: licence';
const TODO_ATTRIBUTION = 'TODO: attribution';

class UsageError extends Error {}

function fail(message: string): never {
  throw new UsageError(message);
}

const { values: args } = parseArgs({
  options: {
    file: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    programme: { type: 'string' },
    access: { type: 'string', default: 'free' },
    kind: { type: 'string', default: 'feature' },
    captions: { type: 'string' },
    'captions-lang': { type: 'string', default: 'en' },
    licence: { type: 'string' },
    attribution: { type: 'string' },
    'source-url': { type: 'string' },
    provenance: { type: 'string' },
    art: { type: 'string', default: 'art:placeholder' },
    'dry-run': { type: 'boolean', default: false },
  },
});

async function main() {
  /* ── validate everything before writing anything ── */
  const { file, slug, title } = args;
  if (!file || !slug || !title) fail('--file, --slug and --title are required');
  const input = path.resolve(file);
  if (!existsSync(input) || !statSync(input).isFile()) fail(`--file not found: ${file}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('--slug must be lowercase-kebab-case, e.g. "subway-1905"');
  const mediaId = `media:${slug}`;
  const videoFile = fromRoot('content', 'videos', `${slug}.json`);
  const sources = loadMediaSources();
  if (sources.some((s) => s.id === mediaId)) fail(`${mediaId} already exists in content/media-sources.json`);
  if (existsSync(videoFile)) fail(`${toRootRelative(videoFile)} already exists`);

  const access = args.access as Access;
  if (access !== 'free' && access !== 'premium') fail('--access must be free or premium');
  const kind = args.kind as VideoKind;
  if (!VIDEO_KINDS.includes(kind)) fail(`--kind must be one of ${VIDEO_KINDS.join(', ')}`);
  if (!args.art.startsWith('art:')) fail('--art must be an art id such as "art:placeholder"');

  if (args.programme) {
    if (!args.programme.startsWith('programme:')) fail('--programme must be a programme id such as "programme:wavemakers"');
    const programmes = JSON.parse(readFileSync(fromRoot('content', 'programmes.json'), 'utf8')) as { id: string }[];
    if (!programmes.some((p) => p.id === args.programme)) fail(`--programme ${args.programme} is not in content/programmes.json`);
  }

  const licence = args.licence?.trim() || TODO_LICENCE;
  const attribution = args.attribution?.trim() || TODO_ATTRIBUTION;
  const provenance = (args.provenance ?? (/\bCC\b|creative commons/i.test(licence) ? 'creative-commons' : 'public-domain')) as FileSource['provenance'];
  if (provenance !== 'public-domain' && provenance !== 'creative-commons') fail('--provenance must be public-domain or creative-commons');

  const info = await probeSource(input).catch((e: Error) => fail(`--file is not a readable video: ${e.message}`));
  const ext = path.extname(input).toLowerCase();
  const librarySource = `sources/library/${slug}${ext}`;
  if (existsSync(fromRoot(librarySource))) fail(`${librarySource} already exists`);

  let captionTarget: string | undefined;
  if (args.captions) {
    const captionsIn = path.resolve(args.captions);
    const cext = path.extname(captionsIn).toLowerCase();
    if (!existsSync(captionsIn)) fail(`--captions not found: ${args.captions}`);
    if (cext !== '.srt' && cext !== '.vtt') fail('--captions must be an .srt or .vtt file');
    const cues = parseCues(readFileSync(captionsIn, 'utf8'));
    if (cues.length === 0) fail(`--captions has no cues: ${args.captions}`);
    captionTarget = `content/captions/${slug}.${args['captions-lang']}${cext}`;
  }
  const lang = args['captions-lang'];
  const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang;

  const entry: FileSource = {
    id: mediaId,
    type: 'file',
    title,
    source: librarySource,
    ...(captionTarget ? { captions: [{ lang, label: `${langName} (captions)`, kind: 'captions' as const, src: captionTarget, default: true }] } : {}),
    licence,
    attribution,
    ...(args['source-url'] ? { sourceUrl: args['source-url'] } : {}),
    provenance,
    notes: `Imported with content-add on ${new Date().toISOString().slice(0, 10)} from ${path.basename(input)}.`,
  };
  mediaSourcesSchema.parse([...sources, entry]); // fails fast on e.g. a malformed --source-url

  const today = new Date().toISOString().slice(0, 10);
  const video: Video = {
    id: `video:${slug}`,
    slug,
    title,
    kind,
    ...(args.programme ? { programme: args.programme } : {}),
    summary: 'TODO: summary (one line)',
    description: 'TODO: description (one or more paragraphs)',
    categories: [],
    places: [],
    periods: [],
    themes: [],
    moods: [],
    setting: null,
    published: today,
    access,
    availability: { status: 'unavailable', note: 'TODO: draft from content-add. Complete the TODO fields, then set status to "available".' },
    footage: [],
    provenance,
    media: mediaId,
    art: args.art,
    credits: { licence, attribution, ...(args['source-url'] ? { sourceUrl: args['source-url'] } : {}) },
  };
  // The skeleton must already pass the content schema so content:check only reports the TODOs.
  const shape = VideoSchema.safeParse(video);
  if (!shape.success) {
    fail(`video skeleton does not match the content schema: ${shape.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }

  console.log(`Source: ${toRootRelative(input) || input} — ${info.width}×${info.height}, ${info.fps.toFixed(2)} fps, ${formatDuration(info.duration)}, ${info.hasAudio ? 'with' : 'no'} audio, ${formatBytes(statSync(input).size)}`);
  const plan = [
    `copy ${path.basename(input)} → ${librarySource}`,
    ...(captionTarget ? [`copy ${path.basename(args.captions!)} → ${captionTarget}`] : []),
    `append ${mediaId} to content/media-sources.json`,
    `write ${toRootRelative(videoFile)}`,
    `run node scripts/build-media.ts --only ${mediaId}`,
  ];

  if (args['dry-run']) {
    console.log('\nDry run — nothing written. Would:');
    for (const step of plan) console.log(`  • ${step}`);
    console.log('\ncontent/media-sources.json entry:');
    console.log(JSON.stringify(entry, null, 2));
    console.log(`\n${toRootRelative(videoFile)}:`);
    console.log(JSON.stringify(video, null, 2));
    return;
  }

  /* ── act ── */
  await mkdir(fromRoot('sources', 'library'), { recursive: true });
  await copyFile(input, fromRoot(librarySource));
  if (captionTarget) {
    await mkdir(fromRoot('content', 'captions'), { recursive: true });
    await copyFile(path.resolve(args.captions!), fromRoot(captionTarget));
  }
  await saveMediaSources([...sources, entry]);
  await writeJson(videoFile, video);
  for (const step of plan.slice(0, -1)) console.log(`✓ ${step}`);

  console.log(`\nBuilding ${mediaId}…`);
  try {
    await run(process.execPath, ['--disable-warning=ExperimentalWarning', fromRoot('scripts', 'build-media.ts'), '--only', mediaId], {
      inherit: true,
    });
  } catch {
    // build-media has already printed the reason.
    console.error(`\nThe media build failed; the content entries were kept. Fix the problem, then run:\n  npm run media:build -- --only ${mediaId}`);
    process.exitCode = 1;
    return;
  }

  const todo = [
    `Complete the TODO fields in ${toRootRelative(videoFile)}: summary, description, categories, places, periods, themes, moods, setting, footage${args.programme ? ', order' : ', programme'}.`,
    ...(licence === TODO_LICENCE || attribution === TODO_ATTRIBUTION
      ? [`Record the exact licence and attribution in content/media-sources.json and in the video's credits.`]
      : []),
    ...(args.art === 'art:placeholder' ? ['Add an art asset to content/art.json and point "art" at it (currently art:placeholder).'] : []),
    'Set availability.status to "available" (or "coming-soon" with publicFrom) when ready.',
    'Run npm run content:check, then review the video in the app.',
  ];
  console.log('\nNext steps:');
  todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}

main().catch((e) => {
  console.error(e instanceof UsageError ? `content-add: ${e.message}` : e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
