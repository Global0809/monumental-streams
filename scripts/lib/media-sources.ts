/**
 * content/media-sources.json — the authored list of playable media assets and how to build
 * them. Two kinds:
 *   reel  composed from the studio motion loops with an original generated score
 *   file  a finished video file (archive film, open movie, future Monumental programme)
 * Validated with zod so a typo fails the build before any encoding starts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { fromRoot, writeJson } from './files.ts';

export const MEDIA_SOURCES_FILE = 'content/media-sources.json';

const mediaId = z.string().regex(/^media:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected "media:" followed by a lowercase slug');
const loopStem = z.string().regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a studio loop stem such as "01-living-atlas"');

const captionRef = z
  .object({
    lang: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'expected a BCP-47 language tag'),
    label: z.string().min(1),
    kind: z.enum(['captions', 'subtitles', 'descriptions']),
    /** Project-relative .vtt or .srt file. */
    src: z.string().regex(/\.(vtt|srt)$/i, 'expected a .vtt or .srt file'),
    default: z.boolean().optional(),
  })
  .strict();

const reelSource = z
  .object({
    id: mediaId,
    type: z.literal('reel'),
    title: z.string().min(1),
    loops: z.array(loopStem).min(1),
    /** Times each loop plays back to back (seamless, no transition between repeats). */
    repeat: z.number().int().min(1).max(8).optional(),
    captions: z.array(captionRef),
    chapters: z.boolean(),
    score: z
      .object({
        seed: z.number().int().nonnegative(),
        root: z.enum(['A', 'C', 'D', 'E', 'F', 'G']),
        mood: z.enum(['dark', 'bright']),
      })
      .strict(),
    provenance: z.literal('studio-concept'),
    notes: z.string(),
  })
  .strict();

const fileSource = z
  .object({
    id: mediaId,
    type: z.literal('file'),
    title: z.string().min(1),
    /** Project-relative path to the source video, normally under sources/. */
    source: z.string().min(1),
    trim: z
      .object({ start: z.number().min(0), end: z.number().positive() })
      .strict()
      .refine((t) => t.end > t.start, 'trim.end must be after trim.start')
      .optional(),
    captions: z.array(captionRef).optional(),
    licence: z.string().min(1),
    attribution: z.string().min(1),
    sourceUrl: z.string().url().optional(),
    provenance: z.enum(['public-domain', 'creative-commons']),
    notes: z.string(),
  })
  .strict();

export const mediaSourcesSchema = z
  .array(z.discriminatedUnion('type', [reelSource, fileSource]))
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((src, i) => {
      if (seen.has(src.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate id ${src.id}` });
      seen.add(src.id);
      // Caption files are published as <slug>.<lang>.vtt (+ ".descriptions" for described tracks),
      // so a language may carry at most one captions/subtitles track and one descriptions track.
      const keys = (src.captions ?? []).map((c) => `${c.lang}/${c.kind === 'descriptions' ? 'd' : 'c'}`);
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: 'custom', path: [i, 'captions'], message: 'one captions/subtitles track and one descriptions track per language at most' });
      }
    });
  });

export type ReelSource = z.infer<typeof reelSource>;
export type FileSource = z.infer<typeof fileSource>;
export type MediaSource = ReelSource | FileSource;
export type CaptionRef = z.infer<typeof captionRef>;

/** "media:reel-living-atlas" → "reel-living-atlas" (the directory / file stem for outputs). */
export const slugOf = (id: string) => id.replace(/^media:/, '');

/** Public file name for a caption track of an asset. */
export const captionFileName = (slug: string, c: CaptionRef) =>
  `${slug}.${c.lang}${c.kind === 'descriptions' ? '.descriptions' : ''}.vtt`;

export function loadMediaSources(): MediaSource[] {
  const file = fromRoot(MEDIA_SOURCES_FILE);
  if (!existsSync(file)) return [];
  const parsed = mediaSourcesSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  [${i.path.join('.')}] ${i.message}`).join('\n');
    throw new Error(`${MEDIA_SOURCES_FILE} is invalid:\n${issues}`);
  }
  return parsed.data;
}

export async function saveMediaSources(list: MediaSource[]): Promise<void> {
  mediaSourcesSchema.parse(list);
  await writeJson(fromRoot(MEDIA_SOURCES_FILE), list);
}
