/**
 * Original ambient score for reels, synthesised entirely with ffmpeg lavfi sources — no
 * samples, no third-party music. Deterministic: the same seed, root, mood and timeline always
 * produce the same audio.
 *
 * Layers
 *   pad     one sustained 7th chord per reel segment (sine + triangle partials, slightly
 *           detuned left/right, slow per-voice shimmer, a swell across the segment) over a
 *           sine sub-bass. Segments are joined with the same crossfade as the picture, so the
 *           chord changes exactly where the loops do. A slow tremolo breathes over the top.
 *   ticks   soft metallic ticks (an inharmonic bell-like partial stack with a fast decay) on a
 *           regular pulse that starts after the opening swell, accenting every fourth tick.
 *   breath  band-passed pink noise rising and falling slowly.
 * The mix gets a short echo, a gentle low-pass and a 1 s fade-in / 1.5 s fade-out. Loudness is
 * normalised later (two-pass loudnorm to -16 LUFS) when the score is muxed with the picture.
 */
import type { ReelSource } from './media-sources.ts';
import type { ReelTimeline } from './reel.ts';
import { CROSSFADE } from './reel.ts';

export type ScoreSpec = ReelSource['score'];

export const SCORE_SAMPLE_RATE = 48_000;
export const FADE_IN = 1;
export const FADE_OUT = 1.5;
/** When the tick pulse starts (after the opening swell). */
export const TICKS_START = 1;

/** Semitones above A for each supported root. */
const ROOT_SEMITONES: Record<ScoreSpec['root'], number> = { A: 0, C: 3, D: 5, E: 7, F: 8, G: 10 };
const SCALES: Record<ScoreSpec['mood'], number[]> = {
  dark: [0, 2, 3, 5, 7, 8, 10], // natural minor
  bright: [0, 2, 4, 5, 7, 9, 11], // major
};
/** Scale degrees (0-based) that may follow the tonic: VI III VII iv in minor, IV vi V ii in major. */
const COLOUR_DEGREES: Record<ScoreSpec['mood'], number[]> = { dark: [5, 2, 6, 3], bright: [3, 5, 4, 1] };

/** Small, fast, well-distributed PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semitone offset of a scale degree, continuing into higher octaves. */
function degreeSemitones(scale: number[], degree: number): number {
  return scale[degree % 7] + 12 * Math.floor(degree / 7);
}

/** Chord degrees for `count` segments: tonic first, colour chords in between, tonic last. */
export function chordProgression(spec: ScoreSpec, count: number): number[] {
  const rand = prng(spec.seed);
  const colours = COLOUR_DEGREES[spec.mood];
  const out: number[] = [0];
  for (let i = 1; i < count; i++) {
    if (i === count - 1 && count > 2) {
      out.push(0);
      continue;
    }
    let pick = colours[Math.floor(rand() * colours.length)];
    if (pick === out[i - 1]) pick = colours[(colours.indexOf(pick) + 1) % colours.length];
    out.push(pick);
  }
  return out;
}

const n = (x: number) => x.toFixed(4);

/** One stereo aevalsrc expression pair ("left|right") for a chord held over `length` seconds. */
function padExpression(spec: ScoreSpec, degree: number, length: number, rand: () => number): string {
  const scale = SCALES[spec.mood];
  const base = 55 * 2 ** (ROOT_SEMITONES[spec.root] / 12); // A1 … G2
  // Sub-bass on the chord root, folded into the lowest octave.
  const bass = base * 2 ** ((degreeSemitones(scale, degree) % 12) / 12);
  // Chord tones: root, 3rd, 5th, 7th (+ 9th when bright), voiced from the third octave.
  const steps = spec.mood === 'bright' ? [0, 2, 4, 6, 8] : [0, 2, 4, 6];
  const voices = steps.map((s) => {
    const semis = degreeSemitones(scale, degree + s) % 24;
    return {
      f: base * 4 * 2 ** (semis / 12),
      amp: 0.085,
      rate: 0.05 + rand() * 0.15, // shimmer rate, Hz
      phase: rand() * Math.PI * 2,
    };
  });
  const channel = (detune: number) => {
    const tones = voices.map(({ f, amp, rate, phase }) => {
      const w = `2*PI*${n(f * (1 + detune))}*t`;
      // 0.6366 = 2/PI scales asin(sin(x)) into a unit triangle wave.
      return `${amp}*(0.75+0.25*sin(2*PI*${n(rate)}*t+${n(phase)}))*(0.65*sin(${w})+0.35*0.6366*asin(sin(${w})))`;
    });
    const swell = `(0.8+0.2*sin(PI*t/${n(length)}))`;
    return `(0.16*sin(2*PI*${n(bass)}*t)+${tones.join('+')})*${swell}`;
  };
  return `${channel(-0.0012)}|${channel(0.0012)}`;
}

/** Stereo tick pulse expression. */
function tickExpression(spec: ScoreSpec, rand: () => number): string {
  const scale = SCALES[spec.mood];
  const base = 55 * 2 ** (ROOT_SEMITONES[spec.root] / 12);
  const period = [1, 1.5, 2][Math.floor(rand() * 3)];
  const f = base * 16 * 2 ** (scale[4] / 12); // the fifth, four octaves up (≈1.3–2.4 kHz)
  // m = time since the last tick, always ≥ 0 (ticks fall on TICKS_START + k·period).
  const shift = (period - (TICKS_START % period)) % period;
  const m = `mod(t+${n(shift)},${n(period)})`;
  const env = `gte(t,${TICKS_START - 0.001})*(1-exp(-900*${m}))*exp(-38*${m})`;
  const accent = `(1+0.5*lt(mod(t+${n(shift)},${n(period * 4)}),${n(period)}))`;
  // Inharmonic partials (1 : 2.76 : 5.40, as in a struck bar) read as "metallic".
  const tone = `(sin(2*PI*${n(f)}*t)+0.45*sin(2*PI*${n(f * 2.76)}*t)+0.2*sin(2*PI*${n(f * 5.4)}*t))`;
  const pan = `sin(2*PI*t/9)`;
  return `0.08*${accent}*${env}*${tone}*(0.65+0.35*${pan})|0.08*${accent}*${env}*${tone}*(0.65-0.35*${pan})`;
}

/**
 * The complete -filter_complex graph (sources only, no inputs) whose output pad [score] is
 * the finished, un-normalised stereo score matching `timeline` sample for sample.
 */
export function scoreFilterGraph(spec: ScoreSpec, timeline: ReelTimeline): string {
  const rand = prng(spec.seed ^ 0x9e3779b9);
  const D = timeline.duration;
  const sr = SCORE_SAMPLE_RATE;
  const chords = chordProgression(spec, timeline.segments.length);
  const parts: string[] = [];

  timeline.segments.forEach((seg, i) => {
    parts.push(`aevalsrc='${padExpression(spec, chords[i], seg.duration, rand)}':s=${sr}:d=${n(seg.duration)}[p${i}]`);
  });
  let pad = 'p0';
  for (let i = 1; i < timeline.segments.length; i++) {
    parts.push(`[${pad}][p${i}]acrossfade=d=${CROSSFADE}:c1=qsin:c2=qsin[x${i}]`);
    pad = `x${i}`;
  }
  const dark = spec.mood === 'dark';
  parts.push(`[${pad}]tremolo=f=${dark ? 0.14 : 0.2}:d=0.3[pad]`);
  parts.push(`aevalsrc='${tickExpression(spec, rand)}':s=${sr}:d=${n(D)}[ticks]`);
  parts.push(
    `anoisesrc=d=${n(D)}:c=pink:r=${sr}:a=0.5:s=${spec.seed},highpass=f=300,lowpass=f=1500,` +
      `tremolo=f=0.11:d=0.85,volume=0.3,pan=stereo|c0=c0|c1=c0[breath]`,
  );
  parts.push(
    `[pad][ticks][breath]amix=inputs=3:duration=first:normalize=0,` +
      `aecho=0.8:0.6:280|470:0.25|0.15,lowpass=f=${dark ? 3800 : 5600},` +
      `atrim=end=${n(D)},afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${n(D - FADE_OUT)}:d=${FADE_OUT},` +
      `aformat=sample_fmts=flt:sample_rates=${sr}:channel_layouts=stereo[score]`,
  );
  return parts.join(';');
}
