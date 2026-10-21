/** Small pieces shared by the World stage views and panels. */
import { createContext, useContext } from 'react';
import { Link } from 'react-router';
import type { ID, Place, Route } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { ROUTE_KIND_LABEL } from './model.ts';

export type HrefFor = (slug: string | null, route?: string | null) => string;

/* ───────────── Hover link: a row beside the stage lights its node on the globe ───────────── */

export const HotContext = createContext<(id: ID | null) => void>(() => {});

/** Pointer and focus handlers that light `id` on the stage while the row is hovered or focused. */
export function useHot(id: ID | null | undefined) {
  const setHot = useContext(HotContext);
  if (!id) return {};
  return {
    onPointerEnter: () => setHot(id),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(id),
    onBlur: () => setHot(null),
  };
}

/* ───────────── Zoom ───────────── */

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

/** Legend for nodes and route kinds. A disclosure, so it never depends on hover. */
export function Legend({ lensed }: { lensed?: boolean }) {
  return (
    <details className="atlas-legend">
      <summary className="atlas-legend-sum">Legend</summary>
      <ul className="atlas-legend-list">
        <li>
          <span className="atlas-swatch atlas-swatch-active" aria-hidden="true" />
          {lensed ? 'Stories that match — size grows with the count' : 'Stories here — size grows with the count'}
        </li>
        <li>
          <span className="atlas-swatch atlas-swatch-expanding" aria-hidden="true" />
          {lensed ? 'Hollow — culture here, no matching stories' : 'Expanding — mapped, no stories yet'}
        </li>
        <li>
          <span className="atlas-swatch atlas-swatch-gateway" aria-hidden="true" />
          Gateway
        </li>
        {(Object.keys(ROUTE_KIND_LABEL) as Route['kind'][]).map((k) => (
          <li key={k}>
            <RouteSwatch kind={k} />
            {ROUTE_KIND_LABEL[k]} route
          </li>
        ))}
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
    .slice(0, 5);
  if (!items.length) return null;
  return (
    <nav className="atlas-trail" aria-label="Recent places">
      <span className="atlas-trail-lead" aria-hidden="true">
        <Icon name="replay" size={14} />
        Trail
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
      <span className="atlas-trail-node" aria-hidden="true" />
      {place.name}
    </Link>
  );
}
