/**
 * The nucleus cursor. A crisp dot sits exactly on the hotspot (zero lag, never offset); a
 * membrane follows with a little spring, stretches with velocity and changes shape with
 * what it is over:
 *
 *   view  — cards: a wide gold orbit with a satellite and a label pill ("Watch", "Details")
 *   play  — play actions: a gold ring with a play notch on its edge
 *   drag  — rows, the globe, dials, the scrubber: a capsule with ‹ › that grips when pressed
 *   save  — save toggles: a gold rounded square
 *   wrap  — small controls (icon buttons, chips, segments, tabs): the membrane leaves the
 *           pointer and wraps the control itself, drifting a little toward the pointer
 *   open  — other links and buttons: an iris ring
 *   text  — fields: the native I-beam takes over, with a faint iris caret halo
 *
 * It never intercepts events (pointer-events: none), never fills over content, and is only
 * mounted for fine pointers. Keyboard focus is entirely independent. Reduced motion: the
 * membrane tracks exactly with no stretch, orbit or breathing.
 */
import { useEffect, useRef } from 'react';
import { finePointer } from '../device.ts';
import { isReducedMotion } from '../motion.ts';
import { sound } from '../sound/engine.ts';
import './cursor.css';

type Mode = 'idle' | 'open' | 'view' | 'play' | 'drag' | 'save' | 'text' | 'hide' | 'wrap';
const MODES = new Set<Mode>(['idle', 'open', 'view', 'play', 'drag', 'save', 'text', 'hide', 'wrap']);

const INTERACTIVE =
  'a, button, [role="button"], [role="tab"], [role="option"], [role="slider"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"], [role="switch"], label, summary, select, [data-cursor]';
const TEXTUAL =
  'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';
/** Controls the membrane may wrap (when they are small enough). */
const WRAPPABLE = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], .btn, .chip, summary';
const WRAP_MAX_W = 240;
const WRAP_MAX_H = 72;
const WRAP_PAD = 6;
const WRAP_PULL = 0.14;

export function Cursor({ enabled }: { enabled: boolean }) {
  const nucleus = useRef<HTMLDivElement>(null);
  const membrane = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !finePointer()) return;
    const root = document.documentElement;
    root.classList.add('cursor-organic');
    const n = nucleus.current!;
    const m = membrane.current!;
    const l = label.current!;
    let x = -100;
    let y = -100;
    let mx = -100;
    let my = -100;
    let vx = 0;
    let vy = 0;
    let raf = 0;
    let mode: Mode = 'idle';
    let visible = false;
    let lastTarget: Element | null = null;
    let wrapEl: HTMLElement | null = null;
    let labelW = 0;

    const setMode = (next: Mode, text: string, wrap: HTMLElement | null = null) => {
      wrapEl = wrap;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(wrap).borderTopLeftRadius) || 0;
        m.style.setProperty('--w', `${r.width + WRAP_PAD * 2}px`);
        m.style.setProperty('--h', `${r.height + WRAP_PAD * 2}px`);
        m.style.setProperty('--r', `${Math.min(radius, r.height / 2) + WRAP_PAD}px`);
      }
      if (next !== mode) {
        mode = next;
        m.dataset.mode = next;
        n.dataset.mode = next;
      }
      if (l.textContent !== text) {
        l.textContent = text;
        labelW = text ? l.offsetWidth : 0;
      }
      l.dataset.show = text ? 'true' : 'false';
      kick();
    };

    const loop = () => {
      const reduced = isReducedMotion();
      let tx = x;
      let ty = y;
      if (wrapEl) {
        if (!wrapEl.isConnected) {
          setMode('idle', '');
        } else {
          const r = wrapEl.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          tx = cx + (x - cx) * WRAP_PULL;
          ty = cy + (y - cy) * WRAP_PULL;
        }
      }
      const k = reduced ? 1 : wrapEl ? 0.3 : 0.22;
      const dx = tx - mx;
      const dy = ty - my;
      mx += dx * k;
      my += dy * k;
      vx = vx * 0.6 + dx * 0.4;
      vy = vy * 0.6 + dy * 0.4;
      const speed = reduced || wrapEl ? 0 : Math.min(Math.hypot(vx, vy) / 60, 0.45);
      const angle = speed ? Math.atan2(vy, vx) : 0;
      m.style.transform = `translate3d(${mx}px, ${my}px, 0) rotate(${angle}rad) scale(${1 + speed}, ${1 - speed * 0.6})`;
      // the label pill sits below-right of the pointer and flips at the window edges
      const flipX = x + 22 + labelW > window.innerWidth - 8;
      const flipY = y + 52 > window.innerHeight;
      l.style.transform = `translate3d(${flipX ? x - 18 - labelW : x + 22}px, ${flipY ? y - 40 : y + 22}px, 0)`;
      // settles to rest; pointer moves and scrolling wake it again
      raf = Math.abs(dx) + Math.abs(dy) > 0.1 ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      x = e.clientX;
      y = e.clientY;
      n.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (!visible) {
        visible = true;
        mx = x;
        my = y;
        root.dataset.cursor = 'on';
      }
      kick();
    };

    // The element under the pointer can change its own cursor (Play ⇄ Pause, Save ⇄ Saved,
    // becoming disabled) without the pointer moving: watch just that one element.
    let watched: HTMLElement | null = null;
    const watcher = new MutationObserver(() => {
      if (lastTarget) resolve(lastTarget);
    });
    const watch = (el: HTMLElement | null) => {
      if (el === watched) return;
      watcher.disconnect();
      watched = el;
      if (el) watcher.observe(el, { attributes: true, attributeFilter: ['data-cursor', 'data-cursor-label', 'disabled', 'aria-disabled'] });
    };

    const resolve = (t: Element) => {
      if (t.closest('[data-native-cursor]') || t.closest(TEXTUAL)) {
        watch(null);
        return setMode('text', '');
      }
      const el = t.closest(INTERACTIVE) as HTMLElement | null;
      watch(el);
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return setMode('idle', '');
      const declared = el.dataset.cursor as Mode | undefined;
      const text = el.dataset.cursorLabel ?? '';
      if (declared && MODES.has(declared) && declared !== 'idle' && declared !== 'wrap') return setMode(declared, text);
      if (declared === 'wrap' || el.matches(WRAPPABLE)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width <= WRAP_MAX_W && r.height <= WRAP_MAX_H) return setMode('wrap', '', el);
      }
      setMode('open', text);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const t = e.target as Element | null;
      if (!t || t === lastTarget) return;
      lastTarget = t;
      const before = mode;
      const beforeWrap = wrapEl;
      resolve(t);
      if ((mode !== before || wrapEl !== beforeWrap) && mode !== 'idle' && mode !== 'hide' && mode !== 'text') sound.play('hover');
    };

    // Scrolling moves content under a still pointer: re-read what is there.
    let scrollFrame = 0;
    const onScroll = () => {
      if (!visible || scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const t = document.elementFromPoint(x, y);
        if (t && t !== lastTarget) {
          lastTarget = t;
          resolve(t);
        }
        kick();
      });
    };

    const onDown = () => {
      m.classList.add('is-pressed');
      n.classList.add('is-pressed');
    };
    const onUp = () => {
      m.classList.remove('is-pressed');
      n.classList.remove('is-pressed');
    };
    const onLeave = () => {
      visible = false;
      root.dataset.cursor = 'off';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    root.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      watcher.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scrollFrame);
      root.classList.remove('cursor-organic');
      delete root.dataset.cursor;
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('scroll', onScroll, { capture: true });
      root.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="cursor" aria-hidden="true">
      <div ref={membrane} className="cursor-membrane" data-mode="idle">
        <span className="cursor-glyph" />
      </div>
      <div ref={nucleus} className="cursor-nucleus" data-mode="idle" />
      <div ref={label} className="cursor-label" data-show="false" />
    </div>
  );
}
