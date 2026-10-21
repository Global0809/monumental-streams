/**
 * THE YEAR STRAND — one year inside the decade the dial chose.
 *
 * A row of year nodes on a chrome filament: each node grows a frost filament as tall as the
 * number of stories that year holds, and a bead of gold light rests under the chosen node.
 * "Whole decade" is the first stop. It is a radio group (one tab stop, arrow keys move, Enter
 * commits at once, otherwise the choice settles after a moment so stepping does not flood the
 * history). With a mouse or pen the bead can be dragged along the strand and released on a
 * year; on touch, taps choose and the strand scrolls natively where it does not fit.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { plural } from '../../lib/format.ts';
import { sound } from '../../systems/sound/engine.ts';

const SETTLE_MS = 420;
const DRAG_THRESHOLD = 6;

interface Props {
  years: number[];
  counts: Map<number, number>;
  /** Stories across the whole decade under the current lens and filter. */
  total: number;
  decadeLabel: string;
  value: number | null;
  reduced: boolean;
  onCommit: (year: number | null) => void;
  describedBy?: string;
}

export function YearStrand({ years, counts, total, decadeLabel, value, reduced, onCommit, describedBy }: Props) {
  const options: (number | null)[] = [null, ...years];
  const indexOf = useCallback((y: number | null) => Math.max(0, options.indexOf(y)), [options.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [local, setLocal] = useState(() => indexOf(value));
  const [dragX, setDragX] = useState<number | null>(null);
  const [bead, setBead] = useState<{ x: number; w: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const localRef = useRef(local);
  const timer = useRef<number | undefined>(undefined);
  const press = useRef<{ id: number; x: number; drag: boolean } | null>(null);
  const suppressClick = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const max = Math.max(1, ...years.map((y) => counts.get(y) ?? 0));

  // Follow the committed value (URL changes, Back/Forward, a new decade).
  useEffect(() => {
    window.clearTimeout(timer.current);
    const i = indexOf(value);
    localRef.current = i;
    setLocal(i);
  }, [value, indexOf]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cell = (i: number) => trackRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null;

  // Rest the bead under the chosen node; keep it there through resizes.
  useLayoutEffect(() => {
    const place = () => {
      const el = cell(local);
      if (el) setBead({ x: el.offsetLeft, w: el.offsetWidth });
    };
    place();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(place);
    ro.observe(track);
    return () => ro.disconnect();
  }, [local, years.length]);

  // Where the strand scrolls (phones), bring the chosen node into view without moving the page.
  useEffect(() => {
    const sc = scrollerRef.current;
    const el = cell(local);
    if (!sc || !el || sc.scrollWidth <= sc.clientWidth) return;
    const left = el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2;
    sc.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
  }, [local, reduced]);

  const change = useCallback(
    (i: number, mode: 'settle' | 'now' | 'hold') => {
      const next = Math.min(options.length - 1, Math.max(0, i));
      if (next !== localRef.current) {
        localRef.current = next;
        setLocal(next);
        sound.play('tick');
      }
      window.clearTimeout(timer.current);
      if (mode === 'now') commitRef.current(options[next]);
      else if (mode === 'settle') timer.current = window.setTimeout(() => commitRef.current(options[localRef.current]), SETTLE_MS);
    },
    [options.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = localRef.current;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next += 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next -= 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
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
    requestAnimationFrame(() => cell(localRef.current)?.focus({ preventScroll: true }));
  };

  /** Nearest node to a client x. */
  const indexAt = (clientX: number) => {
    let best = localRef.current;
    let dist = Infinity;
    for (let i = 0; i < options.length; i++) {
      const r = cell(i)?.getBoundingClientRect();
      if (!r) continue;
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    return best;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch') return; // touch: taps choose, swipes scroll
    press.current = { id: e.pointerId, x: e.clientX, drag: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.drag) {
      if (Math.abs(e.clientX - pr.x) < DRAG_THRESHOLD) return;
      pr.drag = true;
      window.clearTimeout(timer.current);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* best effort */
      }
    }
    const tr = trackRef.current?.getBoundingClientRect();
    if (tr) setDragX(e.clientX - tr.left);
    change(indexAt(e.clientX), 'hold');
  };
  const endPress = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    if (!pr.drag) return; // a plain click: the node's own click handler commits
    setDragX(null);
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (cancelled) change(indexOf(value), 'hold');
    else change(localRef.current, 'now');
  };

  const beadStyle = bead
    ? dragX != null
      ? { width: `${bead.w}px`, transform: `translateX(${Math.max(0, dragX - bead.w / 2)}px)` }
      : { width: `${bead.w}px`, transform: `translateX(${bead.x}px)` }
    : { opacity: 0 };

  return (
    <div ref={scrollerRef} className="tm-strand-scroll">
      <div
        ref={trackRef}
        className="tm-strand-track"
        role="radiogroup"
        aria-label="Year"
        aria-describedby={describedBy}
        data-dragging={dragX != null || undefined}
        data-cursor="drag"
        data-cursor-label="Scrub"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPress(e, false)}
        onPointerCancel={(e) => endPress(e, true)}
      >
        <span className="tm-strand-filament" aria-hidden="true" />
        <span className="tm-strand-bead" aria-hidden="true" style={beadStyle} />
        {options.map((y, i) => {
          const n = y == null ? total : (counts.get(y) ?? 0);
          const on = i === local;
          const label = y == null ? `Whole decade, ${decadeLabel}, ${plural(n, 'story', 'stories')}` : `${y}, ${plural(n, 'story', 'stories')}`;
          return (
            <button
              key={y ?? 'all'}
              type="button"
              role="radio"
              data-i={i}
              className={y == null ? 'tm-yr tm-yr-all' : 'tm-yr'}
              aria-checked={on}
              aria-label={label}
              tabIndex={on ? 0 : -1}
              data-empty={n === 0 || undefined}
              onClick={() => {
                if (suppressClick.current) return;
                change(i, 'now');
              }}
            >
              {y == null ? (
                <>
                  <span className="tm-yr-label">Whole decade</span>
                  <span className="tm-yr-n">{n}</span>
                </>
              ) : (
                <>
                  <span className="tm-yr-stem" aria-hidden="true">
                    <span style={{ height: `${n ? 22 + (n / max) * 78 : 0}%` }} />
                  </span>
                  <span className="tm-yr-label">
                    <span className="tm-yr-c">{String(y).slice(0, 2)}</span>
                    {String(y).slice(2)}
                  </span>
                  <span className="tm-yr-n">{n || '·'}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
