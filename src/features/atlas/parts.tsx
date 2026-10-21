/**
 * Small pieces shared by the World views and panels — above all the DOM ⇄ world link for
 * places. Seeds (stories) already answer through VideoPod; places answer here:
 *
 *   pointer / focus on a place row ─→ stageStore.hoveredPlace ─→ the globe lights the node
 *   a place under the pointer on the globe ─→ stageStore.hoveredPlace ─→ its rows light
 *                                                                     (data-world-lit)
 *
 * The DOM only ever clears what the DOM set, so a hover coming from the globe is never wiped
 * by a row losing focus, and the place preview can tell the two apart (isDomHot).
 */
import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import type { ID, Place, Route } from '../../../shared/types.ts';
import { stageStore } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { ROUTE_KIND_LABEL } from './model.ts';

export type HrefFor = (slug: string | null, route?: string | null) => string;

/* ───────────── Places ⇄ world ───────────── */

let domHot: ID | null = null;

/** Light (or clear) a place in the world from the DOM. */
export function setHotPlace(id: ID | null) {
  const prev = domHot;
  domHot = id;
  stageStore.set((s) => {
    if (id) return s.hoveredPlace === id ? s : { ...s, hoveredPlace: id };
    return prev && s.hoveredPlace === prev ? { ...s, hoveredPlace: null } : s;
  });
}

/** True when the current hovered place came from the DOM (not from the globe). */
export const isDomHot = (id: ID | null) => !!id && id === domHot;

/** The place under the pointer — on the globe or on a row. */
export function useHoveredPlace(): ID | null {
  return useSyncExternalStore(stageStore.subscribe, () => stageStore.get().hoveredPlace, () => null);
}

/** Whether `id` is lit in the world right now (re-renders only when that flips). */
export function usePlaceLit(id: ID | null | undefined): boolean {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => !!id && stageStore.get().hoveredPlace === id,
    () => false,
  );
}

/** Pointer and focus handlers that light `id` in the world, plus the lit state for styling. */
export function useHot(id: ID | null | undefined) {
  const lit = usePlaceLit(id);
  if (!id) return {};
  return {
    onPointerEnter: () => setHotPlace(id),
    onPointerLeave: () => setHotPlace(null),
    onFocus: () => setHotPlace(id),
    onBlur: () => setHotPlace(null),
    'data-world-lit': lit || undefined,
  };
}

/* ───────────── Zoom (flat map) ───────────── */

export function ZoomControls({ onIn, onOut, onReset, resetLabel = 'Recentre' }: { onIn: () => void; onOut: () => void; onReset: () => void; resetLabel?: string }) {
  const tap = (fn: () => void) => () => {
    sound.play('tick');
    fn();
  };
  return (
    <div className="atlas-zoom" role="group" aria-label="Zoom">
      <button type="button" className="atlas-zbtn" aria-label="Zoom in" title="Zoom in" onClick={tap(onIn)}>
        <span aria-hidden="true">+</span>
      </button>
      <button type="button" className="atlas-zbtn" aria-label="Zoom out" title="Zoom out" onClick={tap(onOut)}>
        <span aria-hidden="true">−</span>
      </button>
      <button type="button" className="atlas-zbtn" aria-label={resetLabel} title={resetLabel} onClick={tap(onReset)}>
        <Icon name="compass" size={18} />
      </button>
    </div>
  );
}

export function RouteSwatch({ kind }: { kind: Route['kind'] }) {
  return <span className={`atlas-swatch atlas-swatch-route atlas-k-${kind}`} aria-hidden="true" />;
}

/** Legend for places and route kinds. A disclosure, so it never depends on hover. */
export function Legend({ lensed }: { lensed?: boolean }) {
  return (
    <details className="atlas-legend">
      <summary className="atlas-legend-sum">Legend</summary>
      <ul className="atlas-legend-list">
        <li>
          <span className="atlas-swatch atlas-swatch-active" aria-hidden="true" />
          {lensed ? 'Stories that match — brighter with more' : 'Stories here — brighter with more'}
        </li>
        <li>
          <span className="atlas-swatch atlas-swatch-expanding" aria-hidden="true" />
          {lensed ? 'Hollow ring — culture here, no matching stories' : 'Hollow ring — mapped, no stories yet'}
        </li>
        <li>
          <span className="atlas-swatch atlas-swatch-gateway" aria-hidden="true" />
          Miami, the gateway
        </li>
        {(Object.keys(ROUTE_KIND_LABEL) as Route['kind'][]).map((k) => (
          <li key={k}>
            <RouteSwatch kind={k} />
            {ROUTE_KIND_LABEL[k]} route
          </li>
        ))}
        <li className="atlas-legend-credit">Land from Natural Earth, public domain</li>
      </ul>
    </details>
  );
}

/* ───────────── Recent-places trail ───────────── */

/** The places visited this session, most recent first — one tap hops back with the lens intact. */
export function Trail({ slugs, current, hrefFor, onClear }: { slugs: string[]; current: string | null; hrefFor: HrefFor; onClear: () => void }) {
  const cat = useCatalogue();
  const items = slugs
    .filter((s) => s !== current)
    .map((s) => cat.bySlug('place', s) as Place | undefined)
    .filter((p): p is Place => !!p)
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <nav className="atlas-trail" aria-label="Recent places">
      <span className="atlas-trail-lead" aria-hidden="true">
        Recent
      </span>
      <ol className="atlas-trail-list">
        {items.map((p) => (
          <li key={p.id}>
            <TrailLink place={p} to={hrefFor(p.slug)} />
          </li>
        ))}
      </ol>
      <button type="button" className="atlas-trail-clear" aria-label="Clear recent places" title="Clear recent places" onClick={onClear}>
        <Icon name="close" size={14} />
      </button>
    </nav>
  );
}

function TrailLink({ place, to }: { place: Place; to: string }) {
  const hot = useHot(place.id);
  return (
    <Link to={to} className="atlas-trail-link" onClick={() => sound.play('transition')} {...hot}>
      {place.name}
    </Link>
  );
}
