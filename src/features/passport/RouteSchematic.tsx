/**
 * Route schematic: stops placed by their real coordinates in an equirectangular projection
 * fitted to the journey, numbered and joined in order. Land outlines (public/data/land-paths.json,
 * fetched once, lazily) are drawn when the view is wide enough for them to be meaningful;
 * a faint graticule always is.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import type { ID, Place } from '../../../shared/types.ts';
import { fitProjection, graticuleStep } from './logic.ts';

const W = 400;
const H = 420;
const PAD = 58;

let landRequest: Promise<string | null> | null = null;
function loadLand(): Promise<string | null> {
  landRequest ??= fetch('/data/land-paths.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { d?: unknown } | null) => (j && typeof j.d === 'string' ? j.d : null))
    .catch(() => null);
  return landRequest;
}

function useLand(): string | null {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadLand().then((v) => {
      if (live) setD(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return d;
}


export function RouteSchematic({ places, stamped, title }: { places: Place[]; stamped: Set<ID>; title: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const land = useLand();
  const proj = useMemo(() => fitProjection(places.map((p) => p.coords), W, H, PAD, places.length > 1 ? 0.4 : 4), [places]);
  const span = Math.max(proj.east - proj.west, proj.north - proj.south);
  const step = graticuleStep(span);

  const pts = places.map((p) => ({ p, x: proj.x(p.coords[1]), y: proj.y(p.coords[0]), on: stamped.has(p.id) }));
  const crowded = (i: number) => pts.some((q, j) => j !== i && Math.hypot(q.x - pts[i].x, q.y - pts[i].y) < 44);

  const lons: number[] = [];
  for (let v = Math.ceil(proj.west / step) * step; v <= proj.east; v += step) lons.push(+v.toFixed(4));
  const lats: number[] = [];
  for (let v = Math.ceil(proj.south / step) * step; v <= proj.north; v += step) lats.push(+v.toFixed(4));

  const segments = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(56, len * 0.18);
    const cx = (a.x + b.x) / 2 - (dy / len) * bend;
    const cy = (a.y + b.y) / 2 + (dx / len) * bend;
    return { d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, done: a.on && b.on, key: `${a.p.id}>${b.p.id}` };
  });

  const description = places.length ? places.map((p, i) => `${i + 1}. ${p.name}${stamped.has(p.id) ? ' (stamped)' : ''}`).join(', ') : 'No stops yet.';

  return (
    <svg className="pp-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
      <title id={`${uid}-t`}>{`Route map: ${title}`}</title>
      <desc id={`${uid}-d`}>{description}</desc>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x="10" y="10" width={W - 20} height={H - 20} rx="22" />
        </clipPath>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="45%" r="70%">
          <stop offset="0%" className="pp-map-sea-hi" />
          <stop offset="100%" className="pp-map-sea-lo" />
        </radialGradient>
      </defs>
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="22" fill={`url(#${uid}-glow)`} />
      <g clipPath={`url(#${uid}-clip)`}>
        <g className="pp-map-grid" aria-hidden="true">
          {lons.map((v) => (
            <line key={`lon${v}`} x1={proj.x(v)} x2={proj.x(v)} y1={0} y2={H} />
          ))}
          {lats.map((v) => (
            <line key={`lat${v}`} y1={proj.y(v)} y2={proj.y(v)} x1={0} x2={W} />
          ))}
        </g>
        {land && span >= 3 ? <path className="pp-map-land" d={land} transform={`matrix(${proj.matrix.join(' ')})`} vectorEffect="non-scaling-stroke" /> : null}
        {segments.map((s) => (
          <g key={s.key} className="pp-seg" data-done={s.done || undefined}>
            <path className="pp-seg-glow" d={s.d} />
            <path className="pp-seg-line" d={s.d} />
          </g>
        ))}
        {pts.map((pt, i) => {
          const showLabel = !crowded(i);
          const right = pt.x < W * 0.66;
          return (
            <g key={pt.p.id} className="pp-mark" data-on={pt.on || undefined} transform={`translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`}>
              <circle className="pp-mark-halo" r="17" />
              <circle className="pp-mark-dot" r="11" />
              <text className="pp-mark-n" y="4">
                {i + 1}
              </text>
              {showLabel ? (
                <text className="pp-mark-label" x={right ? 18 : -18} y="4" textAnchor={right ? 'start' : 'end'}>
                  {pt.p.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      <rect className="pp-map-frame" x="10" y="10" width={W - 20} height={H - 20} rx="22" />
      {!places.length ? (
        <text className="pp-map-empty" x={W / 2} y={H / 2} textAnchor="middle">
          Add a stop to draw your route
        </text>
      ) : null}
    </svg>
  );
}
