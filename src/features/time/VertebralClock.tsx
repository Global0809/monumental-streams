/**
 * THE VERTEBRAL CLOCK — the Time Machine's instrument.
 *
 * Thirteen decades sit as vertebrae on a 270° arc (time runs clockwise, 1900s at seven
 * o'clock, 2020s at five). A stylus emerges from the hub and points at the selected decade.
 * Turn it by dragging (pointer capture), the wheel, arrow keys, or by tapping a vertebra.
 * It is a single role="slider": one tab stop, aria-valuetext "1940s — 3 stories, 2 movements".
 *
 * Living light: the chosen vertebra opens into ten year beads (lit where the year holds
 * stories, brightest on the chosen year), a glint travels the chrome rim under a fine pointer,
 * a slow orbit circles the hub and a pulse leaves it on every commit. All of it stands still
 * under reduced motion.
 *
 * The clock keeps a local "pending" decade so it responds instantly (tick per detent);
 * the page is told to commit (navigate) on release, on tap, or after a short settle.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ID, Period } from '../../../shared/types.ts';
import { sound } from '../../systems/sound/engine.ts';
import { angleToIndex, dialValueText } from './chrono.ts';

const CX = 200;
const CY = 200;
const START = -135; // clock degrees of the first decade (0 = twelve o'clock, clockwise)
const SPAN = 270;
const HUB_R = 78;
const SETTLE_MS = 420;
const DRAG_THRESHOLD = 6; // px before a press becomes a drag
const WHEEL_STEP = 50;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function normalise(deg: number) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** Keep the stylus on the arc: angles in the seam at the bottom snap to the nearer end. */
function clampAngle(deg: number) {
  // normalise() yields (-180, 180]: the right half of the seam is nearer the last decade, the left half the first.
  const a = normalise(deg);
  if (a > START + SPAN) return START + SPAN;
  if (a < START) return START;
  return a;
}

/**
 * Angle (degrees) of the k-th year bead relative to its vertebra's centre. Beads keep a ten-year
 * rhythm across ~86% of a detent, so a partial decade (the 2020s) simply stops early.
 */
function yearBeadOffset(k: number, step: number) {
  return (k - 4.5) * ((step * 0.86) / 9);
}

export interface ClockHandle {
  focus: () => void;
  element: HTMLDivElement | null;
}

interface Props {
  periods: Period[];
  /** Committed decade index (from the URL). */
  value: number;
  counts: Record<ID, number>;
  movementCounts: Record<ID, number>;
  lensLabel: string;
  reduced: boolean;
  onCommit: (index: number) => void;
  describedBy?: string;
  /** Shown in the hub instead of the decade while the committed decade is shown (e.g. "1942"). */
  hubLabel?: string;
  /** Movements alive in that year, shown with hubLabel (the decade count would overstate a single year). */
  hubMovements?: number;
  /** Year beads for the committed decade: one per year, lit where it holds stories. */
  yearMarks?: { year: number; count: number; selected: boolean }[];
}

export const VertebralClock = forwardRef<ClockHandle, Props>(function VertebralClock({ periods, value, counts, movementCounts, lensLabel, reduced, onCommit, describedBy, hubLabel, hubMovements, yearMarks }, ref) {
  const n = periods.length;
  const step = n > 1 ? SPAN / (n - 1) : 0;
  const angleOf = useCallback((i: number) => START + i * step, [step]);
  const clampIndex = useCallback((i: number) => Math.min(n - 1, Math.max(0, i)), [n]);

  const [local, setLocal] = useState(value);
  const [hand, setHand] = useState(() => angleOf(value));
  const [dragging, setDragging] = useState(false);
  const [pulse, setPulse] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const glintRef = useRef<SVGGElement>(null);
  const firstValue = useRef(true);
  const localRef = useRef(local);
  const handRef = useRef(hand);
  const timer = useRef<number | undefined>(undefined);
  const press = useRef<{ id: number; x: number; y: number; drag: boolean } | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  handRef.current = hand;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => rootRef.current?.focus({ preventScroll: true }),
      get element() {
        return rootRef.current;
      },
    }),
    [],
  );

  // Follow the committed value (URL changes, back/forward); a pulse leaves the hub on each change.
  useEffect(() => {
    window.clearTimeout(timer.current);
    localRef.current = value;
    setLocal(value);
    if (firstValue.current) firstValue.current = false;
    else setPulse((p) => p + 1);
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // With a year chosen, the stylus settles on that year's bead inside the vertebra.
  const marksAll = yearMarks ?? [];
  const chosen = local === value ? marksAll.findIndex((m) => m.selected) : -1;
  const yearOffset = chosen >= 0 ? yearBeadOffset(chosen, step) : 0;

  // Animate the stylus towards the pending decade (instant under reduced motion).
  useEffect(() => {
    if (dragging) return;
    const target = angleOf(local) + yearOffset;
    const from = handRef.current;
    if (reduced || Math.abs(from - target) < 0.05) {
      setHand(target);
      return;
    }
    const t0 = performance.now();
    const dur = 460;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setHand(from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [local, dragging, reduced, angleOf, yearOffset]);

  const change = useCallback(
    (i: number, mode: 'settle' | 'now' | 'hold') => {
      const next = clampIndex(i);
      if (next !== localRef.current) {
        localRef.current = next;
        setLocal(next);
        sound.play('tick');
      }
      window.clearTimeout(timer.current);
      if (mode === 'now') commitRef.current(next);
      else if (mode === 'settle') timer.current = window.setTimeout(() => commitRef.current(localRef.current), SETTLE_MS);
    },
    [clampIndex],
  );
  const changeRef = useRef(change);
  changeRef.current = change;

  // Wheel: non-passive so it can turn the dial; lets the page scroll when it is mid-scroll or at an end stop.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let acc = 0;
    let lastScroll = 0;
    const onScroll = () => {
      lastScroll = performance.now();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom
      const focused = document.activeElement === el;
      if (!focused && performance.now() - lastScroll < 350) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      const dir = d > 0 ? 1 : -1;
      const cur = localRef.current;
      if ((dir > 0 && cur >= n - 1) || (dir < 0 && cur <= 0)) return;
      e.preventDefault();
      acc += e.deltaMode === 1 ? d * 33 : e.deltaMode === 2 ? d * 400 : d;
      if (Math.abs(acc) >= WHEEL_STEP) {
        acc = 0;
        changeRef.current(cur + dir, 'settle');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
    };
  }, [n]);

  const pointAngle = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const dx = pt.x - CX;
    const dy = pt.y - CY;
    return { deg: (Math.atan2(dx, -dy) * 180) / Math.PI, dist: Math.hypot(dx, dy) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    rootRef.current?.focus({ preventScroll: true });
    const p = pointAngle(e.clientX, e.clientY);
    if (!p || p.dist < HUB_R * 0.55) return; // the hub itself: focus only
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  /** The glint follows a hovering mouse or pen around the chrome rim (written straight to the DOM). */
  const moveGlint = (clientX: number, clientY: number) => {
    const g = glintRef.current;
    const p = pointAngle(clientX, clientY);
    if (!g || !p || reduced) return;
    g.setAttribute('transform', `rotate(${p.deg.toFixed(1)} ${CX} ${CY})`);
    g.setAttribute('data-on', '');
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') moveGlint(e.clientX, e.clientY);
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.drag) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < DRAG_THRESHOLD) return;
      pr.drag = true;
      setDragging(true);
      window.clearTimeout(timer.current);
    }
    const p = pointAngle(e.clientX, e.clientY);
    if (!p) return;
    setHand(clampAngle(p.deg));
    change(angleToIndex(p.deg, n, START, step), 'hold');
  };

  const endPress = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    if (pr.drag) {
      setDragging(false);
      if (cancelled) change(value, 'hold');
      else change(localRef.current, 'now');
      return;
    }
    if (cancelled) return; // the browser took the gesture (page scroll)
    const p = pointAngle(e.clientX, e.clientY);
    if (p) change(angleToIndex(p.deg, n, START, step), 'now');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = localRef.current;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next += 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next -= 1;
        break;
      case 'PageUp':
        next += 3;
        break;
      case 'PageDown':
        next -= 3;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'Enter':
        e.preventDefault();
        change(localRef.current, 'now');
        return;
      default:
        return;
    }
    e.preventDefault();
    change(next, 'settle');
  };

  const shown = periods[local];
  const shownCount = shown ? (counts[shown.id] ?? 0) : 0;
  const shownMoves = shown ? (movementCounts[shown.id] ?? 0) : 0;
  const max = Math.max(1, ...periods.map((p) => counts[p.id] ?? 0));
  const end = START + SPAN;
  const settled = local === value;
  const marks = settled ? (yearMarks ?? []) : [];
  const markMax = Math.max(1, ...marks.map((m) => m.count));
  const showHub = settled && hubLabel;
  const hubMoves = showHub && hubMovements != null ? hubMovements : shownMoves;

  return (
    <div
      ref={rootRef}
      className="tm-dial"
      role="slider"
      tabIndex={0}
      aria-label="Decade dial"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={local}
      aria-valuetext={shown ? dialValueText(shown, shownCount, shownMoves) : undefined}
      aria-describedby={describedBy}
      data-dragging={dragging || undefined}
      data-cursor="drag"
      data-cursor-label="Turn"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPress(e, false)}
      onPointerCancel={(e) => endPress(e, true)}
      onPointerLeave={() => glintRef.current?.removeAttribute('data-on')}
      onKeyDown={onKeyDown}
    >
      <svg ref={svgRef} viewBox="-50 -20 500 404" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="tm-hub-fill" cx="50%" cy="32%" r="74%">
            <stop offset="0%" style={{ stopColor: 'var(--plum-3)' }} />
            <stop offset="68%" style={{ stopColor: 'var(--plum)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--night)' }} />
          </radialGradient>
          {/* Polished chrome: bright top, a dark horizon band, lavender light below. */}
          <linearGradient id="tm-chrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--pearl)' }} />
            <stop offset="38%" style={{ stopColor: 'var(--lilac)' }} />
            <stop offset="50%" style={{ stopColor: 'var(--plum-3)' }} />
            <stop offset="62%" style={{ stopColor: 'var(--lilac-dim)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--pearl)' }} />
          </linearGradient>
          <radialGradient id="tm-ball" cx="38%" cy="32%" r="70%">
            <stop offset="0%" style={{ stopColor: 'var(--pearl)' }} />
            <stop offset="45%" style={{ stopColor: 'var(--lilac-dim)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--plum-3)' }} />
          </radialGradient>
          <radialGradient id="tm-aura" cx="50%" cy="50%" r="50%">
            <stop offset="50%" style={{ stopColor: 'var(--iris)', stopOpacity: 0 }} />
            <stop offset="76%" style={{ stopColor: 'var(--iris)', stopOpacity: 0.14 }} />
            <stop offset="100%" style={{ stopColor: 'var(--iris)', stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id="tm-glint-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--pearl)', stopOpacity: 0 }} />
            <stop offset="50%" style={{ stopColor: 'var(--pearl)', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: 'var(--pearl)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        <circle cx={CX} cy={CY} r={200} fill="url(#tm-aura)" className="tm-aura" />

        {/* The ring: a soft glass band between two chrome rims; the outer rim lights up as time passes. */}
        <path className="tm-band" d={arc(146, START - 10, end + 10)} />
        <path className="tm-rim" d={arc(168, START - 10, end + 10)} />
        <path className="tm-rim tm-rim-in" d={arc(124, START - 10, end + 10)} />
        <path className="tm-vein" d={arc(168, START - 10, Math.max(START - 9.99, Math.min(end, hand)))} />
        <path className="tm-focus" d={arc(178, START - 10, end + 10)} />

        {/* Glint: light caught on the chrome rim where the pointer hovers */}
        <g ref={glintRef} className="tm-glint">
          <path d={arc(168, -12, 12)} stroke="url(#tm-glint-grad)" />
        </g>

        {/* Chrome joints between the decades */}
        {periods.slice(0, -1).map((p, i) => {
          const [x, y] = polar(146, angleOf(i) + step / 2);
          return <circle key={`joint-${p.id}`} className="tm-joint" cx={x} cy={y} r={4.6} fill="url(#tm-ball)" />;
        })}

        {/* Decade segments: frost light by how many stories each era holds */}
        {periods.map((p, i) => {
          const c = counts[p.id] ?? 0;
          const cov = c ? 0.3 + 0.7 * (c / max) : 0;
          return (
            <g key={p.id} transform={`rotate(${angleOf(i)} ${CX} ${CY})`}>
              <g className="tm-v" data-empty={c === 0 || undefined} data-selected={i === local || undefined} style={{ ['--cov' as string]: cov }}>
                <rect className="tm-v-halo" x={181} y={41} width={38} height={26} rx={13} />
                <rect className="tm-v-body" x={185} y={45} width={30} height={18} rx={9} />
                <rect className="tm-v-sheen" x={189.5} y={47} width={21} height={3.6} rx={1.8} />
              </g>
            </g>
          );
        })}

        {/* Movement beads: one per movement active in the decade */}
        <g className="tm-beads">
          {periods.flatMap((p, i) =>
            Array.from({ length: Math.min(7, movementCounts[p.id] ?? 0) }, (_, k) => {
              const [x, y] = polar(116 - k * 5.4, angleOf(i));
              return <circle key={`${p.id}-b${k}`} cx={x} cy={y} r={1.8} data-on={i === local || undefined} />;
            }),
          )}
        </g>

        {/* Year beads: the chosen vertebra opens into its years */}
        {marks.length ? (
          <g className="tm-years">
            {marks.map((m, k) => {
              const a = angleOf(local) + yearBeadOffset(k, step);
              const [x, y] = polar(131, a);
              return <circle key={m.year} cx={x} cy={y} r={m.selected ? 2.8 : 1.3 + (m.count / markMax) * 0.9} data-on={m.count > 0 || undefined} data-selected={m.selected || undefined} />;
            })}
          </g>
        ) : null}

        {/* Decade labels, upright */}
        {periods.map((p, i) => {
          const a = angleOf(i);
          const [x, y] = polar(196, a);
          const s = Math.sin((a * Math.PI) / 180);
          const anchor = s > 0.3 ? 'start' : s < -0.3 ? 'end' : 'middle';
          return (
            <text key={`l-${p.id}`} className="tm-v-label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle" data-selected={i === local || undefined} data-empty={(counts[p.id] ?? 0) === 0 || undefined}>
              {p.label}
            </text>
          );
        })}

        {/* The stylus */}
        <g className="tm-hand" transform={`rotate(${hand.toFixed(2)} ${CX} ${CY})`}>
          <path className="tm-hand-blade" d="M197 206 L199 100 L200 84 L201 100 L203 206 Z" />
          <circle className="tm-hand-tip" cx={CX} cy={88} r={4} />
        </g>

        {/* Hub: an orbit of light circles it; a pulse leaves it on each commit */}
        <circle cx={CX} cy={CY} r={HUB_R + 13} className="tm-orbit" />
        {pulse ? <circle key={pulse} cx={CX} cy={CY} r={HUB_R + 4} className="tm-pulse" /> : null}
        <circle cx={CX} cy={CY} r={HUB_R + 3} className="tm-hub-edge" />
        <circle cx={CX} cy={CY} r={HUB_R} fill="url(#tm-hub-fill)" className="tm-hub" />
        <text className="tm-hub-kicker" x={CX} y={CY - 29} textAnchor="middle">
          {lensLabel}
        </text>
        <text className="tm-hub-decade" x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" data-year={showHub ? '' : undefined}>
          {showHub ? hubLabel : (shown?.label ?? '—')}
        </text>
        <text className="tm-hub-meta" x={CX} y={CY + 30} textAnchor="middle">
          {showHub ? `in the ${shown?.label}` : `${shownCount} ${shownCount === 1 ? 'story' : 'stories'}`}
        </text>
        <text className="tm-hub-meta" x={CX} y={CY + 45} textAnchor="middle">
          {hubMoves} {hubMoves === 1 ? 'movement' : 'movements'}
        </text>
      </svg>
    </div>
  );
});
