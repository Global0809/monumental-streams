/**
 * The reactive layer — how the interface answers the viewer.
 *
 *  · Specular light: under a fine pointer, cards, buttons, chips and nav items receive the
 *    pointer position (--px/--py, 0–100%) so a chrome highlight follows it.
 *  · Tilt: image cards ([data-react~="tilt"], .pod-specimen) lean a few degrees toward it.
 *    Anywhere over a card ([data-react-card] or .pod) lights its face ([data-react-face] or
 *    .pod-specimen), because a stretched card link — not the image — is what the pointer meets.
 *  · Magnetism: [data-react~="magnet"] controls drift up to 6px toward the pointer.
 *  · Press physics: every control gets [data-pressing] while it is held — by pointer OR by
 *    Enter/Space — so the squeeze-and-spring-back reads the same from a keyboard.
 *  · Ripple: a press sends a champagne ripple from the exact contact point (keyboard presses
 *    ripple from the centre).
 *  · Reveal: [data-reveal] blocks rise into place the first time they scroll into view.
 *  · Flight: saving something launches a gold orb into the My World navigation item.
 *
 * One delegated listener per event type, rAF-throttled, no per-element listeners. Tilt,
 * magnetism, ripples and flight stand down under reduced motion; light, tilt and magnetism
 * need a fine pointer (touch never depends on hover); low-tier devices ('low' deviceTier)
 * get html.fx-low and skip the light/tilt work entirely.
 */
import { deviceTier, finePointer } from './device.ts';
import { isReducedMotion } from './motion.ts';

const LIGHT = '[data-react], .pod-specimen, .btn, .chip, .side-link, .tile, .cat-card';
const TILT = '[data-react~="tilt"], .pod-specimen';
const MAGNET = '[data-react~="magnet"]';
/** Controls that squeeze when pressed (pointer or keyboard). */
export const PRESSABLE = '.btn, .chip, .icon-btn, .tab, .side-link, .pl-btn, .pod-save, .segmented button, .tabs [role="tab"], [data-react~="press"], [data-react~="ripple"]';
const RIPPLE = '.btn, .chip, .side-link, .tab, .icon-btn, [data-react~="ripple"]';
const MAX_TILT = 6; // degrees
const MAX_PULL = 6; // px

let current: HTMLElement | null = null;
let frame = 0;
let lastEvent: PointerEvent | null = null;
let lowFx = false;

function clear(el: HTMLElement) {
  for (const p of ['--px', '--py', '--rx', '--ry', '--mx-px', '--my-px']) el.style.removeProperty(p);
  el.removeAttribute('data-lit');
}

/**
 * What the pointer is lighting. A card's stretched title link covers the whole card, so the
 * pointer meets the link, not the image: anywhere over a card ([data-react-card], .pod) the
 * light and tilt go to its image (.pod-specimen / [data-react-face]).
 */
function lightTarget(t: Element | null): HTMLElement | null {
  if (!t) return null;
  const card = t.closest<HTMLElement>('[data-react-card], .pod');
  const face = card?.querySelector<HTMLElement>('[data-react-face], .pod-specimen');
  if (face) return face;
  return t.closest<HTMLElement>(LIGHT);
}

function apply() {
  frame = 0;
  const e = lastEvent;
  if (!e) return;
  const target = lightTarget(e.target as Element | null);
  if (target !== current) {
    if (current) clear(current);
    current = target;
  }
  if (!target) return;
  const r = target.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  target.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
  target.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
  // legacy name used by the button light in ui.css
  target.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  target.setAttribute('data-lit', '');
  if (isReducedMotion()) return;
  if (target.matches(TILT)) {
    target.style.setProperty('--rx', `${((0.5 - y) * MAX_TILT).toFixed(2)}deg`);
    target.style.setProperty('--ry', `${((x - 0.5) * MAX_TILT).toFixed(2)}deg`);
  }
  if (target.matches(MAGNET)) {
    target.style.setProperty('--mx-px', `${((x - 0.5) * 2 * MAX_PULL).toFixed(1)}px`);
    target.style.setProperty('--my-px', `${((y - 0.5) * 2 * MAX_PULL).toFixed(1)}px`);
  }
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  lastEvent = e;
  if (!frame) frame = requestAnimationFrame(apply);
}

function onLeave() {
  if (current) clear(current);
  current = null;
}

/* ───────────── Press physics + ripple ───────────── */

let pressed: HTMLElement | null = null;

function release() {
  if (pressed) pressed.removeAttribute('data-pressing');
  pressed = null;
}

function ripple(el: HTMLElement, x: number, y: number) {
  if (isReducedMotion()) return;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = `width:${size}px;height:${size}px;left:${x - r.left - size / 2}px;top:${y - r.top - size / 2}px`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove(), { once: true });
  window.setTimeout(() => dot.remove(), 900);
}

const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';

function onDown(e: PointerEvent) {
  if (e.button > 0) return;
  const target = e.target as Element | null;
  const el = target?.closest<HTMLElement>(PRESSABLE);
  if (el && !isDisabled(el)) {
    release();
    pressed = el;
    el.setAttribute('data-pressing', '');
  }
  const rip = target?.closest<HTMLElement>(RIPPLE);
  if (rip && !isDisabled(rip)) ripple(rip, e.clientX, e.clientY);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
  const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
  if (!el || el !== e.target || isDisabled(el)) return;
  // Enter activates links and buttons; Space only buttons (on a link it scrolls the page).
  if (e.key === ' ' && el.tagName === 'A') return;
  release();
  pressed = el;
  el.setAttribute('data-pressing', '');
  if (el.matches(RIPPLE)) {
    const r = el.getBoundingClientRect();
    ripple(el, r.left + r.width / 2, r.top + r.height / 2);
  }
  // Enter fires the click on keydown and there may be no keyup on this element (it can
  // unmount or move focus), so the squeeze springs back on its own.
  if (e.key === 'Enter') window.setTimeout(() => el === pressed && release(), 140);
}

/* ───────────── Reveal ───────────── */

let revealObserver: IntersectionObserver | null = null;

function watchReveal(root: ParentNode) {
  const els = root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])');
  for (const el of els) {
    if (isReducedMotion() || !revealObserver) el.setAttribute('data-revealed', '');
    else revealObserver.observe(el);
  }
}

/* ───────────── Flight to My World ───────────── */

/** The on-screen My World navigation item (sidebar link, rail or phone tab), if any. */
function myWorldTarget(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('[data-nav="my-world"]:not([hidden])');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

/**
 * Launch a small gold orb (with a short comet tail) from `from` into the My World navigation
 * item; the item answers with a pulse when it lands. Resolves when the orb arrives. Under
 * reduced motion, or with no visible My World item, only the pulse plays.
 */
export function flyToMyWorld(from: Element | null): Promise<void> {
  const target = myWorldTarget() ?? document.querySelector<HTMLElement>('[data-nav="my-world"]');
  const pulse = () => {
    if (!target) return;
    target.classList.remove('is-receiving');
    void target.offsetWidth; // restart the animation
    target.classList.add('is-receiving');
    window.setTimeout(() => target.classList.remove('is-receiving'), 900);
  };
  const visible = target && target.getClientRects().length > 0;
  // in full screen only the full-screen element paints: there is nowhere to fly to
  if (!from || !target || !visible || document.fullscreenElement || isReducedMotion() || typeof Element.prototype.animate !== 'function') {
    pulse();
    return Promise.resolve();
  }
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height / 2;
  const icon = target.querySelector('svg')?.getBoundingClientRect();
  const x1 = icon && icon.width ? icon.left + icon.width / 2 : b.left + Math.min(b.width, 48) / 2;
  const y1 = icon && icon.height ? icon.top + icon.height / 2 : b.top + b.height / 2;
  // arc upward (or sideways for a tab bar below the source) — a thrown object, not a slide
  const lift = Math.min(180, Math.abs(y1 - y0) * 0.35 + 70);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const frames = (scale: number): Keyframe[] => [
    { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.12}px), calc(-50% + ${dy * 0.12 - lift * 0.55}px)) scale(${1.15 * scale})`, opacity: 1, offset: 0.18 },
    { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55 - lift}px)) scale(${scale})`, opacity: 1, offset: 0.55 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${0.35 * scale})`, opacity: 0.25 },
  ];
  const parts = lowFx ? [1] : [1, 0.62, 0.38];
  return new Promise((resolve) => {
    let landed = false;
    parts.forEach((scale, i) => {
      const orb = document.createElement('span');
      orb.className = i === 0 ? 'save-orb' : 'save-orb save-orb-trail';
      orb.setAttribute('aria-hidden', 'true');
      orb.style.left = `${x0}px`;
      orb.style.top = `${y0}px`;
      document.body.appendChild(orb);
      const anim = orb.animate(frames(scale), { duration: 760, delay: i * 55, easing: 'cubic-bezier(0.32, 0.02, 0.2, 1)', fill: 'backwards' });
      const done = () => {
        orb.remove();
        if (i === 0 && !landed) {
          landed = true;
          pulse();
          resolve();
        }
      };
      anim.onfinish = done;
      anim.oncancel = done;
    });
  });
}

/* ───────────── Init ───────────── */

export function initReactive() {
  const root = document.documentElement;
  root.classList.add('reactive');
  lowFx = deviceTier() === 'low';
  root.classList.toggle('fx-low', lowFx);
  if (finePointer() && !lowFx) {
    document.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
  }
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('dragstart', release, { passive: true });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', release, true);
  window.addEventListener('blur', release);

  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            (en.target as HTMLElement).setAttribute('data-revealed', '');
            revealObserver?.unobserve(en.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
  }
  watchReveal(document);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) watchReveal(n as Element);
  }).observe(document.body, { childList: true, subtree: true });
}
