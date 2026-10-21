/**
 * Pure timing helpers for the organs. Every pose is a function of (time, smoothed energy), so a
 * frozen clock (reduced motion, the render harness) always yields the same still image.
 */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Eases the organ's energy toward the requested value. Snaps when the clock did not advance
 * (frozen time under reduced motion, first frame) or jumped (hidden tab), so a still render
 * always shows exactly the energy it asked for.
 */
export function approachEnergy(current: number, target: number, dt: number, rate = 5): number {
  const goal = clamp01(target);
  if (!(dt > 0) || dt > 0.5 || !Number.isFinite(current)) return goal;
  return current + (goal - current) * (1 - Math.exp(-dt * rate));
}

/**
 * A two-beat "lub-dub" heart pulse in 0..1. `bpm` sets the rate; the second beat is softer.
 * Used by Sports' heart-ball and as a gentle breathing accent elsewhere.
 */
export function heartbeat(t: number, bpm: number): number {
  const period = 60 / Math.max(1, bpm);
  const p = (((t % period) + period) % period) / period; // 0..1 within the beat
  const beat = (centre: number, width: number) => Math.exp(-(((p - centre) / width) ** 2));
  return Math.min(1, beat(0.08, 0.05) + 0.6 * beat(0.28, 0.06));
}

/** Small deterministic PRNG (mulberry32) — sculptures are identical on every device. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Iris aperture: rotation (radians) of each blade around its pivot for an opening 0..1.
 * Closed blades overlap at the centre; open blades fold back into the housing.
 */
export const apertureAngle = (opening: number) => lerp(0.04, 0.62, clamp01(opening));

/** Progress 0..1 of a periodic emission (e.g. News' broadcast rings), phase-shifted per index. */
export function emission(t: number, period: number, index: number, count: number): number {
  const p = t / period + index / Math.max(1, count);
  return p - Math.floor(p);
}
