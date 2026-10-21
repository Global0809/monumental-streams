/**
 * The constellation: the viewer's library as orbits around the story at its centre. The core
 * is that story's own image (and the one control: pick it up where you left off); the rings
 * carry one node per real item and turn slowly while the page is still. Pointing at a counter
 * lights its ring. Everything here is also in the counters and tabs, so the drawing itself is
 * hidden from assistive technology; the core link is the only interactive part.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ID } from '../../../shared/types.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { constellation, ORBIT_SIZE, type OrbitItem, type RingId } from './constellation.ts';

export type Highlight = RingId | 'stamps' | null;

export interface Core {
  art: ID;
  /** Where the core leads, with an accessible name; absent = nothing to open yet. */
  href?: string;
  label?: string;
  caption: string;
  kicker: string;
}

const C = ORBIT_SIZE / 2;

export function Constellation({ items, highlight, core, lite }: { items: Record<RingId, OrbitItem[]>; highlight: Highlight; core: Core; lite: boolean }) {
  const { rings, nodes } = useMemo(() => constellation(items), [items]);
  const empty = nodes.length === 0;

  return (
    <div className={`mw-orbit ${lite ? 'is-lite' : ''} ${empty ? 'is-empty' : ''}`} data-react="tilt light" data-highlight={highlight ?? undefined}>
      <svg className="mw-orbit-svg" viewBox={`0 0 ${ORBIT_SIZE} ${ORBIT_SIZE}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="mw-glow" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#8f7bff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8f7bff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={C - 4} fill="url(#mw-glow)" />
        {rings.map((r) => (
          <g key={r.id} className={`mw-ring mw-ring-${r.id} ${r.count ? '' : 'is-void'}`} data-ring={r.id}>
            <circle cx={C} cy={C} r={r.r} className="mw-ring-line" />
            <g className="mw-ring-spin" style={{ animationDuration: `${90 + r.r / 2}s` }}>
              {nodes
                .filter((n) => n.ring === r.id)
                .map((n) => (
                  <g key={n.id} className={`mw-node ${n.stamp ? 'is-stamp' : ''}`}>
                    {n.progress !== undefined ? (
                      <>
                        <circle cx={n.x} cy={n.y} r={9} className="mw-node-track" />
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={9}
                          className="mw-node-progress"
                          pathLength={100}
                          strokeDasharray={`${Math.max(4, Math.round(n.progress * 100))} 100`}
                          transform={`rotate(-90 ${n.x} ${n.y})`}
                        />
                      </>
                    ) : null}
                    {n.stamp ? <circle cx={n.x} cy={n.y} r={11} className="mw-node-stamp" /> : null}
                    <circle cx={n.x} cy={n.y} r={n.progress !== undefined ? 4.5 : 5.5} className="mw-node-dot" />
                  </g>
                ))}
            </g>
          </g>
        ))}
      </svg>

      <div className="mw-core">
        <Art art={core.art} alt="" sizes="large" eager className="mw-core-art" />
        <span className="mw-core-shade" aria-hidden="true" />
        {core.href ? (
          <Link to={core.href} className="mw-core-link" aria-label={core.label} data-cursor="play" data-cursor-label="Resume" onClick={() => sound.play('transition')}>
            <span className="mw-core-play" aria-hidden="true">
              <Icon name="play" size={22} />
            </span>
          </Link>
        ) : null}
      </div>
      <p className="mw-core-caption" aria-hidden="true">
        <span className="mw-core-kicker">{core.kicker}</span>
        <span className="mw-core-title">{core.caption}</span>
      </p>
    </div>
  );
}
