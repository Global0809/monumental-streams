/**
 * Pointer input for the stage without ever blocking the DOM. The canvas has pointer-events:
 * none; we listen on window and only consider events whose target is the page background or
 * open space inside the main area — never interactive or content elements. Hover is picked at
 * most once per frame; a click/tap activates what is under it; a drag that starts on open
 * space orbits the world (pointer capture, no text selection). Wheel is never touched.
 */
import type { Hit } from './furniture.ts';

/** Elements the stage must never react through. */
export const STAGE_BLOCK = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'video',
  'audio',
  'iframe',
  'canvas',
  'img',
  'picture',
  'svg',
  'dialog',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'dt',
  'dd',
  'figcaption',
  'blockquote',
  'pre',
  'code',
  'table',
  '[role=button]',
  '[role=slider]',
  '[role=link]',
  '[role=tab]',
  '[role=menu]',
  '[role=menuitem]',
  '[role=listbox]',
  '[role=option]',
  '[role=switch]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=dialog]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-stage-block]',
].join(', ');

/** Alpha of a CSS colour string ("rgb(…)", "rgba(…)", "rgb(r g b / a)", "transparent"). */
export function cssAlpha(color: string): number {
  if (!color || color === 'transparent') return 0;
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return 1;
  const a = parts[3];
  return a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
}

/** A surface the viewer reads as content: a solid or frosted panel (not the open world). */
function isSurface(el: Element): boolean {
  let cs: CSSStyleDeclaration;
  try {
    cs = getComputedStyle(el);
  } catch {
    return false;
  }
  const backdrop = cs.backdropFilter || (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none';
  if (backdrop !== 'none' && backdrop !== '') return true;
  return cssAlpha(cs.backgroundColor) > 0.35;
}

/** True when an event target is open space the stage may answer (background or main area). */
export function isStageTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as Element).closest !== 'function') return false;
  const el = t as Element;
  const doc = el.ownerDocument;
  if (el === doc.documentElement || el === doc.body) return true;
  if (el.closest(STAGE_BLOCK)) return false;
  if (el.classList.contains('body-plan')) return true;
  const main = el.closest('#main, main');
  if (!main) return false;
  // glass or solid panels inside the main area are content, not open space
  for (let n: Element | null = el; n && n !== main; n = n.parentElement) if (isSurface(n)) return false;
  return true;
}

export interface PointerHooks {
  enabled(): boolean;
  pick(x: number, y: number): Hit | null;
  hover(hit: Hit | null): void;
  activate(hit: Hit): void;
  canDrag(): boolean;
  dragStart(): void;
  drag(dx: number, dy: number, dt: number): void;
  dragEnd(): void;
}

const DRAG_PX = 6;

export function attachPointer(hooks: PointerHooks): () => void {
  let px = 0;
  let py = 0;
  let pending = 0;
  let overStage = false;
  let down: { id: number; x: number; y: number; lx: number; ly: number; t: number; target: Element } | null = null;
  let dragging = false;
  let suppressClick = 0;
  let lastTarget: EventTarget | null = null;
  let lastTargetOk = false;
  const root = document.documentElement;

  const flushHover = () => {
    pending = 0;
    if (!overStage || dragging || !hooks.enabled()) {
      hooks.hover(null);
      return;
    }
    hooks.hover(hooks.pick(px, py));
  };

  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    py = e.clientY;
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.lx;
      const dy = e.clientY - down.ly;
      if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX && hooks.canDrag()) {
        dragging = true;
        hooks.hover(null);
        hooks.dragStart();
        root.dataset.stageDrag = '';
        try {
          down.target.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety */
        }
        window.getSelection()?.removeAllRanges();
      }
      if (dragging) {
        const now = performance.now();
        hooks.drag(dx, dy, Math.max(1e-3, (now - down.t) / 1000));
        down.t = now;
        down.lx = e.clientX;
        down.ly = e.clientY;
        e.preventDefault();
        return;
      }
    }
    if (e.pointerType === 'touch') return; // no hover on touch
    if (e.target !== lastTarget) {
      // classify each element once while the pointer stays on it
      lastTarget = e.target;
      lastTargetOk = isStageTarget(e.target);
    }
    overStage = lastTargetOk;
    if (!pending) pending = requestAnimationFrame(flushHover);
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0 || !hooks.enabled() || !isStageTarget(e.target)) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), target: e.target as Element };
  };

  const end = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    if (dragging) {
      dragging = false;
      hooks.dragEnd();
      delete root.dataset.stageDrag;
      suppressClick = performance.now();
      try {
        down.target.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    down = null;
  };

  const onClick = (e: MouseEvent) => {
    if (performance.now() - suppressClick < 250) return;
    if (e.button !== 0 || !hooks.enabled() || !isStageTarget(e.target)) return;
    if (window.getSelection()?.toString()) return; // the viewer was selecting text
    const hit = hooks.pick(e.clientX, e.clientY);
    if (hit) hooks.activate(hit);
  };

  const onLeave = (e: PointerEvent) => {
    if (!e.relatedTarget) {
      overStage = false;
      hooks.hover(null);
    }
  };

  const onSelectStart = (e: Event) => {
    if (dragging) e.preventDefault();
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('click', onClick);
  document.addEventListener('pointerout', onLeave);
  document.addEventListener('selectstart', onSelectStart);
  return () => {
    if (pending) cancelAnimationFrame(pending);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('click', onClick);
    document.removeEventListener('pointerout', onLeave);
    document.removeEventListener('selectstart', onSelectStart);
    delete root.dataset.stageDrag;
  };
}
