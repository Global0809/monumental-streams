/**
 * THE TIME CONTROL — the precise DOM twin of the helix in the living world.
 *
 * Two scrubbers and a lens, nothing painted on top of the world:
 *   Decade — one stop per vertebra of the helix (1900s → 2020s); its mark grows with the
 *            stories the decade holds under the current lens and category.
 *   Year   — "All" (the whole decade) then each year that has happened; a frost filament rises
 *            where a year holds stories.
 *   Lens   — Set in / Made in / Published re-sorts the seeds on the helix.
 *
 * Each scrubber is a real role="slider" with an aria-valuetext that reads the place in time
 * ("1940s — 2 stories, 6 movements", "1942 — 1 story"). Pointer: press anywhere on the scale and
 * drag; the world travels with the preview and the choice commits on release (a tap commits at
 * once). Keyboard: arrows step, Page Up / Page Down jump, Home / End go to the ends; the choice
 * settles after a short pause so stepping does not flood the history, Enter commits at once and
 * Escape returns to the committed value.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { sound } from '../../systems/sound/engine.ts';
import { Segmented } from '../../ui/controls.tsx';
import { LENSES, LENS_LABEL, type Lens } from './chrono.ts';

const SETTLE_MS = 420;
/** Sideways travel (px) before a finger on the scale counts as scrubbing rather than scrolling. */
const DRAG_PX = 8;

export interface Stop {
  key: string;
  /** Visible label on wide scales. */
  long: string;
  /** Visible label where the scale is narrow. */
  short: string;
  /** 0..1 — how much the stop holds (drives the mark). */
  weight: number;
  /** Stop holds nothing under the current lens / category. */
  empty?: boolean;
  /** Always labelled, even where the scale is narrow. */
  major?: boolean;
}

interface ScrubberProps {
  label: string;
  stops: Stop[];
  value: number;
  valueText: (i: number) => string;
  onPreview: (i: number | null) => void;
  onCommit: (i: number) => void;
  variant: 'decade' | 'year';
  reduced: boolean;
  describedBy?: string;
  /** Commit even when the chosen stop is the current one (the value is only a nearest guess). */
  commitSame?: boolean;
}

/** A role="slider" over discrete stops, operable by pointer, touch and keyboard. */
export function Scrubber({ label, stops, value, valueText, onPreview, onCommit, variant, reduced, describedBy, commitSame }: ScrubberProps) {
  const n = stops.length;
  const [local, setLocal] = useState(value);
  const localRef = useRef(value);
  const timer = useRef<number | undefined>(undefined);
  const press = useRef<{ id: number; x: number; y: number; scrubbing: boolean } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;

  /** Cancel a pending keyboard settle. */
  const settle = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  // follow the committed value (URL changes, Back / Forward, a new decade)
  useEffect(() => {
    settle();
    localRef.current = value;
    setLocal(value);
  }, [value, n]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const move = useCallback(
    (i: number) => {
      const next = Math.min(n - 1, Math.max(0, i));
      if (next === localRef.current) return next;
      localRef.current = next;
      setLocal(next);
      sound.play('tick');
      previewRef.current(next === value ? null : next);
      return next;
    },
    [n, value],
  );
  const commit = useCallback(
    (i: number) => {
      settle();
      previewRef.current(null);
      if (i !== value || commitSame) commitRef.current(i);
    },
    [value, commitSame],
  );
  const revert = () => {
    settle();
    localRef.current = value;
    setLocal(value);
    previewRef.current(null);
  };

  const indexAt = (clientX: number) => {
    const r = el.current?.getBoundingClientRect();
    if (!r || !r.width) return localRef.current;
    return Math.floor(((clientX - r.left) / r.width) * n);
  };

  // A mouse scrubs from the first press. A finger only scrubs once it moves sideways (a vertical
  // swipe across the scale stays a page scroll and never stirs the world); a tap chooses on release.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const mouse = e.pointerType === 'mouse';
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scrubbing: mouse };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    settle();
    if (mouse) move(indexAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.scrubbing) {
      const dx = Math.abs(e.clientX - p.x);
      if (dx < DRAG_PX || dx < Math.abs(e.clientY - p.y)) return;
      p.scrubbing = true;
    }
    move(indexAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    commit(p.scrubbing ? localRef.current : move(indexAt(e.clientX)));
  };
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (press.current?.id !== e.pointerId) return;
    press.current = null;
    revert(); // the browser took the gesture (a vertical scroll): nothing was chosen
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const jump = variant === 'decade' ? 3 : 5;
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
        next += jump;
        break;
      case 'PageDown':
        next -= jump;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'Enter':
        e.preventDefault();
        commit(localRef.current);
        return;
      case 'Escape':
        if (localRef.current === value) return;
        e.preventDefault();
        revert();
        return;
      default:
        return;
    }
    e.preventDefault();
    move(next);
    settle();
    timer.current = window.setTimeout(() => commit(localRef.current), SETTLE_MS);
  };

  const at = (i: number) => `${((i + 0.5) / n) * 100}%`;
  return (
    <div
      ref={el}
      className="tm-scale"
      data-variant={variant}
      data-moving={local !== value || undefined}
      data-reduced={reduced || undefined}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={local}
      aria-valuetext={valueText(local)}
      aria-describedby={describedBy}
      aria-orientation="horizontal"
      data-cursor="drag"
      data-cursor-label="Scrub"
      style={{
        ['--n' as string]: n,
        ['--at' as string]: at(local),
        ['--from' as string]: at(value),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onBlur={() => {
        // leaving mid-step keeps the place the viewer reached
        if (timer.current !== undefined) commit(localRef.current);
      }}
    >
      <span className="tm-scale-axis" aria-hidden="true" />
      <ol className="tm-stops" aria-hidden="true">
        {stops.map((s, i) => (
          <li
            key={s.key}
            className="tm-stop"
            data-stop={s.key}
            data-on={i === local || undefined}
            data-committed={i === value || undefined}
            data-empty={s.empty || undefined}
            data-major={s.major || undefined}
            style={{ ['--w' as string]: s.weight.toFixed(3) }}
          >
            <span className="tm-stop-mark" />
            <span className="tm-stop-label">
              <span className="tm-l">{s.long}</span>
              <span className="tm-s">{s.short}</span>
            </span>
          </li>
        ))}
      </ol>
      <span className="tm-scale-thumb" aria-hidden="true" />
    </div>
  );
}

/** The whole control: decade, year (when a decade is chosen) and lens. */
export function TimeControl({
  decade,
  year,
  lens,
  reduced,
  onLens,
  caption,
}: {
  decade: {
    stops: Stop[];
    value: number;
    valueText: (i: number) => string;
    onPreview: (i: number | null) => void;
    onCommit: (i: number) => void;
    commitSame?: boolean;
  };
  year?: {
    stops: Stop[];
    value: number;
    valueText: (i: number) => string;
    onPreview: (i: number | null) => void;
    onCommit: (i: number) => void;
  };
  lens?: Lens;
  reduced: boolean;
  onLens?: (l: Lens) => void;
  caption?: ReactNode;
}) {
  return (
    <div className="tm-control" role="group" aria-label="Time controls">
      <div className="tm-control-row">
        <span className="tm-control-name" aria-hidden="true">
          Decade
        </span>
        <Scrubber label="Decade" variant="decade" reduced={reduced} describedBy="tm-scrub-hint" {...decade} />
      </div>
      <div className="tm-control-sub">
        {year ? (
          <div className="tm-control-row">
            <span className="tm-control-name" aria-hidden="true">
              Year
            </span>
            <Scrubber label="Year" variant="year" reduced={reduced} describedBy="tm-scrub-hint" {...year} />
          </div>
        ) : null}
        {lens && onLens ? (
          <div className="tm-control-row tm-control-lens">
            <span className="tm-control-name" aria-hidden="true">
              Lens
            </span>
            <div className="tm-control-lens-body">
              <Segmented
                label="Lens"
                hideLabel
                value={lens}
                onChange={onLens}
                options={LENSES.map((l) => ({
                  value: l,
                  label: LENS_LABEL[l],
                }))}
              />
              {caption ? <p className="tm-control-caption">{caption}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      <p id="tm-scrub-hint" className="sr-only">
        Use the arrow keys to move through time, Page Up and Page Down to jump, Home and End for the ends. The world travels with you.
      </p>
    </div>
  );
}
