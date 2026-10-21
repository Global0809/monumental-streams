/**
 * Reel composition: studio loops joined with crossfades + the generated ambient score,
 * written as a high-quality 1080p mezzanine (H.264 CRF 13, AAC 160k) that the shared
 * rendition stage then encodes exactly like any other source file.
 */
import path from 'node:path';
import type { ReelSource } from './media-sources.ts';
import { ffmpeg } from './proc.ts';
import { probeSource } from './encode.ts';
import type { ReelTimeline } from './reel.ts';
import { CROSSFADE, reelTimeline } from './reel.ts';
import { scoreFilterGraph } from './score.ts';

/** Loudness target for reel scores (integrated LUFS / true peak dBTP / loudness range LU). */
export const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

export interface ComposedReel {
  file: string;
  timeline: ReelTimeline;
  /** Integrated loudness (LUFS) and true peak (dBTP) of the muxed score, measured after encoding. */
  loudness: { integrated: number; truePeak: number };
}

/** Runs loudnorm in measurement mode over a file's audio and returns its JSON report. */
async function measureLoudness(file: string): Promise<LoudnormMeasurement> {
  const { stderr } = await ffmpeg(
    ['-i', file, '-vn', '-af', `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`, '-f', 'null', '-'],
    { loglevel: 'info' },
  );
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  if (!json) throw new Error(`loudnorm produced no measurement for ${file}`);
  return JSON.parse(json) as LoudnormMeasurement;
}

export async function composeReel(src: ReelSource, loopFiles: Map<string, string>, workDir: string): Promise<ComposedReel> {
  const repeat = src.repeat ?? 1;
  const loops = await Promise.all(
    src.loops.map(async (stem) => {
      const file = loopFiles.get(stem);
      if (!file) throw new Error(`${src.id}: no studio loop source for "${stem}" in sources/previews`);
      return { stem, file, info: await probeSource(file) };
    }),
  );
  const timeline = reelTimeline(loops.map((l) => ({ stem: l.stem, duration: l.info.duration })), repeat);
  const D = timeline.duration.toFixed(3);
  // Every loop is conformed to the first loop's size and rate so xfade can join them.
  const { width, height, fpsRational } = loops[0].info;

  // 1. Score: synthesise, then measure for a linear (non-pumping) two-pass loudness match.
  const scoreWav = path.join(workDir, 'score.wav');
  await ffmpeg(['-filter_complex', scoreFilterGraph(src.score, timeline), '-map', '[score]', '-c:a', 'pcm_f32le', scoreWav]);
  const m = await measureLoudness(scoreWav);
  const loudnorm =
    `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=none`;

  // 2. Picture: conform each loop, chain xfades at the timeline offsets, mux with the score.
  const inputs: string[] = [];
  const graph: string[] = [];
  loops.forEach((loop, i) => {
    if (repeat > 1) inputs.push('-stream_loop', String(repeat - 1));
    inputs.push('-i', loop.file);
    graph.push(`[${i}:v]fps=${fpsRational},scale=${width}:${height}:flags=lanczos,setsar=1,format=yuv420p[v${i}]`);
  });
  let video = 'v0';
  for (let i = 1; i < loops.length; i++) {
    const offset = timeline.segments[i].start.toFixed(6);
    graph.push(`[${video}][v${i}]xfade=transition=fade:duration=${CROSSFADE}:offset=${offset}[x${i}]`);
    video = `x${i}`;
  }
  graph.push(`[${loops.length}:a]${loudnorm},aresample=48000[a]`);

  const file = path.join(workDir, 'composed.mp4');
  await ffmpeg([
    ...inputs, '-i', scoreWav,
    '-filter_complex', graph.join(';'),
    '-map', `[${video}]`, '-map', '[a]', '-t', D,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '13', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', file,
  ]);

  const result = await measureLoudness(file);
  return { file, timeline, loudness: { integrated: Number(result.input_i), truePeak: Number(result.input_tp) } };
}
