/** Player time maths and labels. Pure. */
import { timecode } from '../../../lib/format.ts';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const SEEK_STEP = 5; // arrows
export const JUMP_STEP = 10; // J / L, double-tap
export const VOLUME_STEP = 0.05;

export const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

/** Usable duration: the element's when finite and positive, else the measured runtime. */
export function usableDuration(elementDuration: number, measured: number | null | undefined): number {
  if (Number.isFinite(elementDuration) && elementDuration > 0) return elementDuration;
  return measured && Number.isFinite(measured) && measured > 0 ? measured : 0;
}

/** aria-valuetext for the scrubber: "1:02 of 13:33". */
export function seekValueText(pos: number, dur: number): string {
  return dur > 0 ? `${timecode(clamp(pos, 0, dur))} of ${timecode(dur)}` : timecode(Math.max(0, pos));
}

/** "1×", "0.5×", "1.25×". */
export function rateLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/** The nearest supported speed to an arbitrary rate (persisted prefs may hold anything). */
export function nearestSpeed(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  let best: number = SPEEDS[0];
  for (const s of SPEEDS) if (Math.abs(s - rate) < Math.abs(best - rate)) best = s;
  return best;
}

/** Next speed step up (+1) or down (-1), clamped to the ends of SPEEDS. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const cur = nearestSpeed(rate);
  const i = SPEEDS.indexOf(cur as (typeof SPEEDS)[number]);
  return SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)];
}

/** Digit 0–9 → that tenth of the programme. */
export function percentTime(digit: number, dur: number): number {
  return dur > 0 ? (clamp(digit, 0, 9) / 10) * dur : 0;
}

/**
 * ?t= deep-link parsing: "90", "90.5", "1:30", "1:02:03", "1m30s", "2h", "45s".
 * Returns seconds, or null when absent/malformed/negative.
 */
export function parseStartParam(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(s)) {
    const parts = s.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return null;
}

/** Buffered ranges → percentage segments for the tendon. */
export function bufferedSegments(ranges: { start: number; end: number }[], dur: number): { left: number; width: number }[] {
  if (!(dur > 0)) return [];
  return ranges
    .map((r) => {
      const a = clamp(r.start / dur, 0, 1) * 100;
      const b = clamp(r.end / dur, 0, 1) * 100;
      return { left: Math.round(a * 1000) / 1000, width: Math.round(Math.max(0, b - a) * 1000) / 1000 };
    })
    .filter((s) => s.width > 0.05);
}

/** Spoken seek feedback: "Forward 10 seconds" / "Back 5 seconds". */
export function seekPhrase(by: number): string {
  const n = Math.abs(Math.round(by));
  return `${by >= 0 ? 'Forward' : 'Back'} ${n} second${n === 1 ? '' : 's'}`;
}

/** Pointer distance (px) within which the scrubber is pulled onto a chapter boundary. */
export const MAGNET_PX = 10;

/**
 * Scrubber magnetism: a time within `radiusPx` (on a bar `widthPx` wide) of a chapter
 * boundary snaps onto it. Returns the (possibly snapped) time and the boundary it snapped to.
 */
export function magnetTime(t: number, dur: number, widthPx: number, joints: number[], radiusPx = MAGNET_PX): { t: number; joint: number | null } {
  if (!(dur > 0) || !(widthPx > 0) || !joints.length) return { t, joint: null };
  const secPerPx = dur / widthPx;
  let best: number | null = null;
  for (const j of joints) {
    const d = Math.abs(t - j) / secPerPx;
    if (d <= radiusPx && (best === null || Math.abs(t - j) < Math.abs(t - best))) best = j;
  }
  return best === null ? { t, joint: null } : { t: best, joint: best };
}

/**
 * Chapter stepping for [ and ]: the start of the next chapter, or of the current one —
 * or, when within `grace` seconds of its start, the previous one (like a CD player).
 * Returns null when there is nowhere to go.
 */
export function chapterStep(starts: number[], now: number, dir: 1 | -1, grace = 2): number | null {
  const s = [...starts].sort((a, b) => a - b);
  if (!s.length) return null;
  if (dir > 0) {
    const next = s.find((x) => x > now + 0.25);
    return next ?? null;
  }
  let i = -1;
  for (let k = 0; k < s.length; k++) if (s[k] <= now + 0.25) i = k;
  if (i < 0) return null;
  if (now - s[i] > grace) return s[i];
  if (i > 0) return s[i - 1];
  return now - s[0] > 0.25 ? s[0] : null;
}
