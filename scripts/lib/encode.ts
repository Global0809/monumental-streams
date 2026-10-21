/**
 * Encoding ladder and the ffmpeg steps shared by every asset type: probing a source,
 * encoding H.264/AAC renditions in one decode pass, packaging HLS and drawing the
 * thumbnail sprite.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg, ffprobe, parseRational } from './proc.ts';

export interface Rung {
  height: number;
  crf: number;
  /** Peak video rate cap in kbit/s (VBV buffer = 2 × this). */
  maxrateK: number;
  profile: 'high' | 'main';
}

/**
 * Capped-CRF ladder. Heights above the source are skipped (never upscale). Main profile on
 * the small rungs keeps older phones and TVs happy; High elsewhere for efficiency.
 */
export const LADDER: readonly Rung[] = [
  { height: 1080, crf: 21, maxrateK: 4500, profile: 'high' },
  { height: 720, crf: 22, maxrateK: 2500, profile: 'high' },
  { height: 480, crf: 23, maxrateK: 1200, profile: 'main' },
  { height: 360, crf: 24, maxrateK: 700, profile: 'main' },
];

export const AUDIO_BITRATE_K = 128;
export const KEYFRAME_SECONDS = 2;
export const SEGMENT_SECONDS = 4;
/** The progressive MP4 fallback is the highest rendition at or below this height. */
export const FALLBACK_MAX_HEIGHT = 720;
export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 90;

export interface SourceInfo {
  /** Display size: sample aspect ratio and rotation applied. */
  width: number;
  height: number;
  /** Frame rate as an ffmpeg rational ("30/1", "24000/1001") and as a number. */
  fpsRational: string;
  fps: number;
  duration: number;
  hasAudio: boolean;
  interlaced: boolean;
}

export async function probeSource(file: string): Promise<SourceInfo> {
  const probe = await ffprobe(file);
  const video = probe.streams.find((s) => s.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error(`${file} has no video stream`);
  const sar = parseRational(video.sample_aspect_ratio?.replace(':', '/')) || 1;
  let width = Math.round(video.width * sar);
  let height = video.height;
  const rotation = Math.abs(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  // Keep the native rate; replace missing or absurd values (VFR screen captures) with 30.
  let fpsRational = video.avg_frame_rate ?? '0/0';
  let fps = parseRational(fpsRational);
  if (!(fps >= 10 && fps <= 60)) {
    fpsRational = '30/1';
    fps = 30;
  }
  const duration = Number(video.duration ?? probe.format.duration ?? 0);
  if (!(duration > 0)) throw new Error(`${file}: could not determine duration`);
  return {
    width,
    height,
    fpsRational,
    fps,
    duration,
    hasAudio: probe.streams.some((s) => s.codec_type === 'audio'),
    interlaced: ['tt', 'bb', 'tb', 'bt'].includes(video.field_order ?? ''),
  };
}

/** Ladder rungs for a source; a source smaller than every rung is encoded at its own height. */
export function pickLadder(sourceHeight: number): Rung[] {
  const rungs = LADDER.filter((r) => r.height <= sourceHeight);
  if (rungs.length > 0) return rungs;
  const smallest = LADDER[LADDER.length - 1];
  return [{ ...smallest, height: sourceHeight - (sourceHeight % 2) }];
}

/** Even output width preserving the display aspect ratio. */
export const widthFor = (src: SourceInfo, height: number) => Math.round((src.width * height) / src.height / 2) * 2;

/** H.264 level limits (ITU-T H.264 Table A-1): macroblocks/s, macroblocks/frame, max bit rate (kbit/s, Main). */
const H264_LEVELS = [
  { level: '3.0', mbps: 40_500, fs: 1_620, br: 10_000 },
  { level: '3.1', mbps: 108_000, fs: 3_600, br: 14_000 },
  { level: '3.2', mbps: 216_000, fs: 5_120, br: 20_000 },
  { level: '4.0', mbps: 245_760, fs: 8_192, br: 20_000 },
  { level: '4.1', mbps: 245_760, fs: 8_192, br: 50_000 },
  { level: '4.2', mbps: 522_240, fs: 8_704, br: 50_000 },
  { level: '5.0', mbps: 589_824, fs: 22_080, br: 135_000 },
  { level: '5.1', mbps: 983_040, fs: 36_864, br: 240_000 },
];

/**
 * Lowest H.264 level that fits a rendition. Setting it explicitly (rather than letting x264
 * infer one from the preset's reference-frame count) keeps 1080p30 at 4.0 / 720p30 at 3.1, the
 * levels every hardware decoder supports; x264 then caps reference frames to the level's DPB.
 */
export function h264Level(width: number, height: number, fps: number, maxrateK: number, profile: Rung['profile']): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const brFactor = profile === 'high' ? 1.25 : 1;
  const fit = H264_LEVELS.find((l) => mbs <= l.fs && mbs * fps <= l.mbps && maxrateK <= l.br * brFactor);
  return (fit ?? H264_LEVELS[H264_LEVELS.length - 1]).level;
}

export interface Trim {
  start: number;
  end: number;
}

/**
 * Encodes every rung from a single decode of the source. Keyframes are forced every
 * KEYFRAME_SECONDS (GOP = 2 × fps, no scene-cut keyframes) so HLS segments of
 * SEGMENT_SECONDS cut cleanly and align across renditions. Returns height → MP4 path.
 */
export async function encodeRenditions(opts: {
  input: string;
  src: SourceInfo;
  rungs: Rung[];
  outDir: string;
  trim?: Trim;
}): Promise<Map<number, string>> {
  const { input, src, rungs, outDir, trim } = opts;
  await mkdir(outDir, { recursive: true });
  const gop = Math.round(KEYFRAME_SECONDS * src.fps);
  const pre = [src.interlaced ? 'bwdif' : null, `fps=${src.fpsRational}`, `split=${rungs.length}${rungs.map((_, i) => `[s${i}]`).join('')}`];
  const graph = [
    `[0:v:0]${pre.filter(Boolean).join(',')}`,
    ...rungs.map((r, i) => `[s${i}]scale=${widthFor(src, r.height)}:${r.height}:flags=lanczos,setsar=1,format=yuv420p[v${i}]`),
  ].join(';');

  const args = [...(trim ? ['-ss', String(trim.start), '-t', String(trim.end - trim.start)] : []), '-i', input, '-filter_complex', graph];
  const outputs = new Map<number, string>();
  rungs.forEach((r, i) => {
    const file = path.join(outDir, `${r.height}.mp4`);
    outputs.set(r.height, file);
    const level = h264Level(widthFor(src, r.height), r.height, src.fps, r.maxrateK, r.profile);
    args.push(
      '-map', `[v${i}]`,
      ...(src.hasAudio ? ['-map', '0:a:0'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-profile:v', r.profile, '-level:v', level,
      '-crf', String(r.crf), '-maxrate', `${r.maxrateK}k`, '-bufsize', `${r.maxrateK * 2}k`,
      '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
      '-force_key_frames', `expr:gte(t,n_forced*${KEYFRAME_SECONDS})`,
      '-pix_fmt', 'yuv420p',
      ...(src.hasAudio ? ['-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_K}k`, '-ac', '2', '-ar', '48000'] : []),
      '-movflags', '+faststart',
      file,
    );
  });
  await ffmpeg(args);
  return outputs;
}

/** Splits an encoded rendition into an HLS VOD playlist (index.m3u8) with MPEG-TS segments. */
export async function packageHls(mp4: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  // MPEG-TS segments (no EXT-X-MAP init segment) keep the token-rewriting proxy simple: only
  // segment URI lines need a token. Absolute paths (not a child cwd, which Windows limits to
  // MAX_PATH); ffmpeg still writes segment URIs relative to the playlist.
  await ffmpeg([
    '-i', mp4, '-map', '0', '-c', 'copy',
    '-f', 'hls', '-hls_time', String(SEGMENT_SECONDS), '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments', '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(dir, 'seg-%03d.ts'), path.join(dir, 'index.m3u8'),
  ]);
}

export interface SpriteLayout {
  interval: number; // seconds between tiles
  count: number;
  columns: number;
  rows: number;
}

/** One tile every max(2, duration/100) seconds (whole seconds), grid as square as possible. */
export function spriteLayout(duration: number, fps: number): SpriteLayout {
  const interval = Math.max(2, Math.ceil(duration / 100));
  // Tiles sit on frames at k·interval that exist before the last frame.
  const count = Math.floor((duration - 0.5 / fps) / interval) + 1;
  const columns = Math.ceil(Math.sqrt(count));
  return { interval, count, columns, rows: Math.ceil(count / columns) };
}

/** Draws the thumbnail sprite (WebP) for a video using `layout`. */
export async function thumbnailSprite(input: string, fps: number, layout: SpriteLayout, outFile: string): Promise<void> {
  await mkdir(path.dirname(outFile), { recursive: true });
  // Select exactly one frame per interval (half-frame tolerance absorbs float timestamps),
  // letterbox non-16:9 sources into the fixed tile and tile them row by row.
  const half = (0.5 / fps).toFixed(6);
  const frame = (1 / fps).toFixed(6);
  const vf = [
    `select='lt(mod(t+${half},${layout.interval}),${frame})'`,
    `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${THUMB_WIDTH}:${THUMB_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `tile=${layout.columns}x${layout.rows}`,
  ].join(',');
  await ffmpeg(['-i', input, '-vf', vf, '-fps_mode', 'passthrough', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', outFile]);
}
