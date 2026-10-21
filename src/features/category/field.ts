/**
 * The membrane field — how a category hero feels the viewer.
 *
 * Pointer position (any pointer type: a mouse hovering, a pen, a finger dragging) and scroll
 * (how far the hero has travelled out of view, and how fast) are eased toward their targets
 * every frame, written to CSS custom properties on the host
 *
 *   --fx --fy   pointer position, 0–1 (rests at the centre)
 *   --fa        pointer presence, 0–1 (eases in and out)
 *   --fs        scroll progress of the hero out of the viewport, 0–1
 *   --fv        scroll speed, 0–1 (decays to rest)
 *
 * and handed to an optional paint() for visuals that move individual marks. The loop only
 * runs while something is settling, so an idle hero costs nothing. Reduced motion and
 * low-tier devices get one static paint and no listeners.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { deviceTier } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';

export interface FieldState {
  x: number;
  y: number;
  /** pointer presence 0–1 */
  a: number;
  /** scroll progress 0–1 */
  s: number;
  /** scroll speed 0–1 */
  v: number;
  /** host size in CSS pixels */
  w: number;
  h: number;
}

export const REST: FieldState = { x: 0.5, y: 0.5, a: 0, s: 0, v: 0, w: 0, h: 0 };

export function liteDevice(): boolean {
  try {
    return deviceTier() === 'low';
  } catch {
    return false;
  }
}

export function useField(ref: RefObject<HTMLElement | null>, paint?: (f: FieldState) => void) {
  const reduced = useReducedMotion();
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cur: FieldState = { ...REST };
    const target = { x: 0.5, y: 0.5, a: 0, s: 0 };
    let frame = 0;
    let lastY = window.scrollY;

    const write = () => {
      const r = el.getBoundingClientRect();
      cur.w = r.width;
      cur.h = r.height;
      el.style.setProperty('--fx', cur.x.toFixed(4));
      el.style.setProperty('--fy', cur.y.toFixed(4));
      el.style.setProperty('--fa', cur.a.toFixed(4));
      el.style.setProperty('--fs', cur.s.toFixed(4));
      el.style.setProperty('--fv', cur.v.toFixed(4));
      paintRef.current?.(cur);
    };

    const still = reduced || liteDevice();
    if (still) {
      write();
      const ro = new ResizeObserver(() => write());
      ro.observe(el);
      return () => ro.disconnect();
    }

    const tick = () => {
      frame = 0;
      const k = 0.14;
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      cur.a += (target.a - cur.a) * 0.1;
      cur.s += (target.s - cur.s) * 0.25;
      cur.v *= 0.9;
      write();
      const settling =
        Math.abs(target.x - cur.x) > 0.001 || Math.abs(target.y - cur.y) > 0.001 || Math.abs(target.a - cur.a) > 0.002 || Math.abs(target.s - cur.s) > 0.001 || cur.v > 0.002;
      if (settling) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      target.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      target.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      target.a = 1;
      wake();
    };
    const onLeave = () => {
      target.a = 0;
      target.x = 0.5;
      target.y = 0.5;
      wake();
    };
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      // far below the hero and already settled: nothing to paint
      if (r.bottom <= 0 && cur.s >= 0.999 && cur.v < 0.002 && !frame) {
        lastY = window.scrollY;
        return;
      }
      target.s = r.height ? Math.min(1, Math.max(0, -r.top / r.height)) : 0;
      const dy = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      // only while the hero is (partly) on screen
      if (r.bottom > 0) cur.v = Math.min(1, cur.v + dy / 600);
      wake();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => wake());
    ro.observe(el);
    onScroll();
    write();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [ref, reduced]);
}
