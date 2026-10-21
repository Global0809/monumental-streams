/**
 * Drag-to-scroll for horizontal rows (desktop mouse only — touch keeps native scrolling).
 *
 *   press ─ move past the slop horizontally ─▶ drag (pointer captured, snap paused)
 *   release ─▶ momentum glide (exponential decay) ─▶ settle on the nearest item ─▶ snap resumes
 *
 * A press that never passes the slop is an ordinary click. A press that became a drag never
 * clicks the card under the pointer when released. Vertical intent (moving up/down first)
 * hands the gesture back to the page. Reduced motion: no glide, the row settles at once.
 * The maths is pure and exported for tests; the hook only wires DOM events.
 */
import { useEffect, type RefObject } from 'react';
import { finePointer } from '../systems/device.ts';
import { isReducedMotion } from '../systems/motion.ts';

/** Pixels the pointer may wander before a press becomes a drag. */
export const DRAG_SLOP = 6;
/** Velocity retained per 60 Hz frame while gliding. */
export const GLIDE_DECAY = 0.94;
/** Fastest glide we allow, in px per ms. */
export const MAX_VELOCITY = 3.2;
/** Below this speed (px per ms) a glide stops. */
export const STOP_VELOCITY = 0.02;

export interface Sample {
  t: number; // ms
  x: number; // px
}

/** True once the pointer has clearly moved sideways (more horizontal than vertical, past the slop). */
export function exceedsSlop(dx: number, dy: number, slop = DRAG_SLOP): boolean {
  return Math.abs(dx) > slop && Math.abs(dx) >= Math.abs(dy);
}

/** True when the pointer has clearly moved vertically first: the gesture belongs to the page. */
export function verticalIntent(dx: number, dy: number, slop = DRAG_SLOP): boolean {
  return Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx);
}

/**
 * Release velocity in px per ms from the most recent samples (within `windowMs` of the last
 * one). Positive means the pointer was moving right. Clamped to ±MAX_VELOCITY.
 */
export function releaseVelocity(samples: Sample[], windowMs = 90): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (!(dt > 0)) return 0;
  const v = (last.x - first.x) / dt;
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}

/** One step of a glide: distance covered in `dt` ms and the decayed velocity after it. */
export function glideStep(v: number, dt: number, decay = GLIDE_DECAY): { v: number; dx: number } {
  const k = Math.pow(decay, dt / (1000 / 60));
  return { v: v * k, dx: v * dt };
}

/** How far a glide starting at `v0` (px per ms) travels before it stops (60 Hz frames). */
export function glideDistance(v0: number, decay = GLIDE_DECAY): number {
  const frame = 1000 / 60;
  let v = v0;
  let d = 0;
  for (let i = 0; i < 600 && Math.abs(v) >= STOP_VELOCITY; i++) {
    const s = glideStep(v, frame, decay);
    d += s.dx;
    v = s.v;
  }
  return d;
}

/** How far (px) a settle may pull the row back against the direction it was flung. */
export const PULLBACK = 24;

/**
 * The resting scroll position. `starts` are the scroll offsets at which each item is aligned.
 * At rest (direction 0) the nearest item wins; after a fling the row keeps going to the next
 * item in the direction of travel instead of being dragged back (at most PULLBACK px).
 * The end of the row is always a valid resting place. Clamped to [0, max].
 */
export function settleTarget(pos: number, starts: number[], max: number, direction = 0): number {
  const clamp = (n: number) => Math.max(0, Math.min(max, n));
  if (!starts.length) return clamp(pos);
  if (pos >= max - 2) return max;
  const sorted = [...starts].sort((a, b) => a - b);
  let best: number;
  if (direction > 0) best = sorted.find((s) => s >= pos - PULLBACK) ?? max;
  else if (direction < 0) best = [...sorted].reverse().find((s) => s <= pos + PULLBACK) ?? 0;
  else {
    best = sorted[0];
    for (const s of sorted) if (Math.abs(s - pos) < Math.abs(best - pos)) best = s;
    if (Math.abs(max - pos) < Math.abs(best - pos)) best = max;
  }
  return clamp(best);
}

/* ───────────── Hook ───────────── */

const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-drag]';

export function useDragScroll(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !finePointer()) return;
    let armed = false;
    let dragging = false;
    let id = -1;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let samples: Sample[] = [];
    let raf = 0;
    let settleTimer = 0;
    let suppressUntil = 0;

    const clearState = () => {
      el.removeAttribute('data-dragging');
      el.removeAttribute('data-gliding');
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(settleTimer);
    };
    const settle = (direction: number) => {
      const max = el.scrollWidth - el.clientWidth;
      const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
      const box = el.getBoundingClientRect();
      const starts = Array.from(el.children).map((c) => el.scrollLeft + (c.getBoundingClientRect().left - box.left) - pad);
      const target = settleTarget(el.scrollLeft, starts, max, direction);
      if (Math.abs(target - el.scrollLeft) < 1) return clearState();
      el.scrollTo({ left: target, behavior: isReducedMotion() ? 'auto' : 'smooth' });
      settleTimer = window.setTimeout(clearState, isReducedMotion() ? 0 : 420);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if ((e.target as Element | null)?.closest(NO_DRAG)) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      stop();
      clearState();
      armed = true;
      dragging = false;
      id = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScroll = el.scrollLeft;
      samples = [{ t: e.timeStamp, x: e.clientX }];
    };
    const onMove = (e: PointerEvent) => {
      if (!armed || e.pointerId !== id) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (verticalIntent(dx, dy)) {
          armed = false;
          return;
        }
        if (!exceedsSlop(dx, dy)) return;
        dragging = true;
        try {
          el.setPointerCapture(id);
        } catch {
          /* pointer already gone */
        }
        el.setAttribute('data-dragging', '');
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      el.scrollLeft = startScroll - dx;
      samples.push({ t: e.timeStamp, x: e.clientX });
      if (samples.length > 10) samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (!armed || e.pointerId !== id) return;
      armed = false;
      if (!dragging) return;
      dragging = false;
      suppressUntil = e.timeStamp + 300;
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      el.removeAttribute('data-dragging');
      // the row scrolls opposite to the pointer
      let v = -releaseVelocity(samples);
      if (isReducedMotion() || Math.abs(v) < 0.08) return settle(0);
      el.setAttribute('data-gliding', '');
      const direction = Math.sign(v);
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        const s = glideStep(v, dt);
        v = s.v;
        const before = el.scrollLeft;
        el.scrollLeft = before + s.dx;
        if (Math.abs(v) < 0.25 || Math.abs(el.scrollLeft - before) < 0.1) {
          raf = 0;
          settle(direction);
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      armed = false;
      dragging = false;
      clearState();
    };
    // A drag must never also open the card it started on.
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp <= suppressUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressUntil = 0;
      }
    };
    // Native link/image drag ghosts would steal the gesture.
    const onDragStart = (e: DragEvent) => {
      if (armed) e.preventDefault();
    };
    // The viewer takes over: a wheel or key stops the glide where it is.
    const interrupt = () => {
      if (!raf && !el.hasAttribute('data-gliding')) return;
      stop();
      clearState();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('wheel', interrupt, { passive: true });
    el.addEventListener('keydown', interrupt);
    return () => {
      stop();
      clearState();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('wheel', interrupt);
      el.removeEventListener('keydown', interrupt);
    };
  }, [ref, enabled]);
}
