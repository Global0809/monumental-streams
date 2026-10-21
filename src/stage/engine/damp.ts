/**
 * Damping primitives (pure, no three.js): a critically damped spring that keeps its velocity
 * when the target changes mid-flight, so every camera move is interruptible without a jolt.
 */

export interface Damped {
  value: number;
  velocity: number;
}

export const damped = (value: number): Damped => ({ value, velocity: 0 });

/**
 * One step of a critically damped spring toward `target` (Unity-style SmoothDamp).
 * smoothTime ≈ time to reach the target / 3; 0.4s gives a ~1.2s move.
 */
export function smoothDamp(d: Damped, target: number, smoothTime: number, dt: number): void {
  if (dt <= 0) return;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = d.value - target;
  const temp = (d.velocity + omega * change) * dt;
  d.velocity = (d.velocity - omega * temp) * exp;
  d.value = target + (change + temp) * exp;
}

export function snap(d: Damped, target: number) {
  d.value = target;
  d.velocity = 0;
}

/** Shortest signed angular difference a → b in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Damp an angle along the shortest way round. */
export function smoothDampAngle(d: Damped, target: number, smoothTime: number, dt: number): void {
  smoothDamp(d, d.value + angleDelta(d.value, target), smoothTime, dt);
}

export const settled = (d: Damped, target: number, eps = 1e-3) => Math.abs(d.value - target) < eps && Math.abs(d.velocity) < eps * 4;

/** Exponential approach (frame-rate independent): rate = 1/s. */
export const approach = (cur: number, target: number, rate: number, dt: number) => target + (cur - target) * Math.exp(-rate * dt);

/** Spherical coordinates of an offset vector: radius, azimuth (atan2(x, z)) and elevation. */
export function toSpherical(x: number, y: number, z: number): { r: number; theta: number; phi: number } {
  const r = Math.hypot(x, y, z) || 1e-6;
  return { r, theta: Math.atan2(x, z), phi: Math.asin(Math.max(-1, Math.min(1, y / r))) };
}

export function fromSpherical(r: number, theta: number, phi: number): [number, number, number] {
  const c = Math.cos(phi);
  return [r * c * Math.sin(theta), r * Math.sin(phi), r * c * Math.cos(theta)];
}

/** Median of a list (frame-time sampling). */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Should the stage downgrade? Called with frame deltas (ms) measured while rendering flat out.
 * Needs a full sample, then downgrades when the median frame misses ~30fps.
 */
export function shouldDowngrade(samples: number[], minSamples = 36, budgetMs = 34): boolean {
  return samples.length >= minSamples && median(samples) > budgetMs;
}
