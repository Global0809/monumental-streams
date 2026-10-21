/**
 * "Miami, up close" — the gateway's complete treatment, shown in the editorial column whenever
 * the selection is the gateway's county or anything inside it. The globe holds the city; this
 * holds what the globe cannot draw at street scale:
 *   1. a neighbourhood tissue map: every place in the county at its true relative position
 *      (local equirectangular projection), with the City of Miami's membrane distinguished
 *      from the separate municipalities (Miami Beach, Coral Gables, Key Biscayne…);
 *   2. an index of every mapped place, numbered to match the map on small screens;
 *   3. the gateway's routes out into (and in from) the world — following one lights its arc.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ID, Place } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { KIND_LABEL, localAspect, municipalityOf, niceKm, placeLabels, projectLocal, roundedHullPath, textWidth, type AtlasModel } from './model.ts';
import { RouteCard, type HrefFor } from './panels.tsx';

interface Group {
  muni: Place;
  gateway: boolean;
  places: Place[];
}

function useGroups(region: Place): Group[] {
  const cat = useCatalogue();
  return useMemo(() => {
    const inside = cat.placeDescendants(region.id);
    const groups = new Map<ID, Group>();
    for (const p of inside) {
      const m = municipalityOf(cat, p.id, region.id);
      const muni = m ? (cat.get(m) as Place) : p;
      let g = groups.get(muni.id);
      if (!g) {
        g = { muni, gateway: !!muni.gateway, places: [] };
        groups.set(muni.id, g);
      }
      g.places.push(p);
    }
    for (const g of groups.values()) g.places.sort((a, b) => (a.id === g.muni.id ? -1 : b.id === g.muni.id ? 1 : a.name.localeCompare(b.name)));
    return [...groups.values()].sort((a, b) => Number(b.gateway) - Number(a.gateway) || a.muni.name.localeCompare(b.muni.name));
  }, [cat, region.id]);
}

/* ───────────── 1. Tissue map ───────────── */

function TissueMap({ groups, numbers, selectedId, hrefFor, model }: { groups: Group[]; numbers: Map<ID, number>; selectedId: ID | null; hrefFor: HrefFor; model: AtlasModel }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = useMemo(() => groups.flatMap((g) => g.places.map((p) => ({ p, g }))), [groups]);
  const pts = useMemo(() => all.map(({ p }) => ({ id: p.id, lat: p.coords[0], lon: p.coords[1] })), [all]);
  const H = Math.round(Math.min(640, Math.max(300, W * localAspect(pts))));
  const pad = W < 560 ? 34 : 50;
  const byNumber = W < 520;

  const layout = useMemo(() => {
    const { points, pxPerKm } = projectLocal(pts, W, H, pad);
    const pos = new Map(points.map((q) => [q.id, q]));
    const radius = (p: Place) => (p.status === 'expanding' && !(model.counts.get(p.id) ?? 0) ? 5 : Math.min(13, 5.5 + 2.6 * Math.sqrt(model.counts.get(p.id) ?? 0)));
    const ordered = [...all].sort((a, b) => Number(b.p.id === selectedId) - Number(a.p.id === selectedId) || Number(b.p.id === b.g.muni.id) - Number(a.p.id === a.g.muni.id) || (model.counts.get(b.p.id) ?? 0) - (model.counts.get(a.p.id) ?? 0));
    const labels = placeLabels(
      ordered.map(({ p }) => {
        const q = pos.get(p.id)!;
        const text = byNumber ? String(numbers.get(p.id) ?? '') : p.name;
        return { id: p.id, x: q.x, y: q.y, r: radius(p) + 1, w: textWidth(text, byNumber ? 11 : 12) + (byNumber ? 2 : 6), h: byNumber ? 15 : 17 };
      }),
      { w: W, h: H },
      { gap: 4 },
    );
    const km = niceKm(pxPerKm);
    return { pos, radius, labels: new Map(labels.map((l) => [l.id, l])), pxPerKm, km };
  }, [all, pts, W, H, pad, byNumber, numbers, selectedId, model]);

  const cells = groups.map((g) => {
    const p2 = g.places.map((p) => layout.pos.get(p.id)!).map((q) => [q.x, q.y] as [number, number]);
    return { g, d: roundedHullPath(p2, g.places.length > 1 ? 20 : 17) };
  });

  return (
    <div ref={ref} className="atlas-tissue-box">
      <svg className="atlas-tissue-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label="Schematic map of every mapped place in Miami-Dade County">
        <g aria-hidden="true">
          {cells.map(({ g, d }) => (
            <path key={g.muni.id} d={d} className="atlas-cell" data-gateway={g.gateway || undefined} />
          ))}
        </g>
        <g>
          {all.map(({ p, g }) => {
            const q = layout.pos.get(p.id)!;
            const r = layout.radius(p);
            const n = model.counts.get(p.id) ?? 0;
            const expanding = p.status === 'expanding' && !n;
            const isMuni = p.id === g.muni.id;
            return (
              <Link
                key={p.id}
                to={hrefFor(p.slug)}
                className="atlas-tnode"
                data-selected={p.id === selectedId || undefined}
                data-expanding={expanding || undefined}
                data-gateway={p.gateway || undefined}
                data-muni={isMuni || undefined}
                aria-current={p.id === selectedId ? 'page' : undefined}
                // the name leads; the number (a visual key to the index) trails
                aria-label={`${p.name}, ${KIND_LABEL[p.kind]}${isMuni ? '' : ` in ${g.muni.name}`}, ${expanding ? 'expanding' : plural(n, 'story', 'stories')}${byNumber ? `, number ${numbers.get(p.id)} on the key` : ''}`}
                data-cursor-label={p.name}
                onClick={() => sound.play('select')}
              >
                <circle cx={q.x} cy={q.y} r={r + 10} className="atlas-tnode-hit" />
                {p.gateway ? <circle cx={q.x} cy={q.y} r={r + 7} className="atlas-tnode-beacon" /> : null}
                <circle cx={q.x} cy={q.y} r={r} className="atlas-tnode-core" />
                {p.id === selectedId ? <circle cx={q.x} cy={q.y} r={r + 5} className="atlas-tnode-ring" /> : null}
              </Link>
            );
          })}
        </g>
        <g aria-hidden="true">
          {all.map(({ p }) => {
            const l = layout.labels.get(p.id);
            const q = layout.pos.get(p.id)!;
            if (!l) return null;
            const text = byNumber ? String(numbers.get(p.id) ?? '') : p.name;
            const w = textWidth(text, byNumber ? 11 : 12) + (byNumber ? 2 : 6);
            const h = byNumber ? 15 : 17;
            return (
              <g key={p.id} className="atlas-tlabel" data-selected={p.id === selectedId || undefined} data-number={byNumber || undefined}>
                {l.leader ? <line x1={q.x} y1={q.y} x2={Math.max(l.x, Math.min(l.x + w, q.x))} y2={Math.max(l.y, Math.min(l.y + h, q.y))} className="atlas-tleader" /> : null}
                <text x={l.x + (byNumber ? 1 : 3)} y={l.y + h - 4.5}>
                  {text}
                </text>
              </g>
            );
          })}
        </g>
        <g className="atlas-tissue-scale" aria-hidden="true" transform={`translate(${16} ${H - 22})`}>
          <line x1={0} y1={0} x2={layout.km * layout.pxPerKm} y2={0} />
          <line x1={0} y1={-4} x2={0} y2={4} />
          <line x1={layout.km * layout.pxPerKm} y1={-4} x2={layout.km * layout.pxPerKm} y2={4} />
          <text x={0} y={-8}>
            {layout.km} km
          </text>
        </g>
        <g className="atlas-tissue-north" aria-hidden="true" transform={`translate(${W - 22} ${30})`}>
          <path d="M0 -14 L5 2 L0 -2 L-5 2 Z" />
          <text x={0} y={16}>
            N
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ───────────── Section ───────────── */

export default function MiamiUpClose({ region, selectedId, routeId, hrefFor, model }: { region: Place; selectedId: ID | null; routeId: ID | null; hrefFor: HrefFor; model: AtlasModel }) {
  const cat = useCatalogue();
  const groups = useGroups(region);
  const numbers = useMemo(() => {
    const m = new Map<ID, number>();
    let i = 1;
    for (const g of groups) for (const p of g.places) m.set(p.id, i++);
    return m;
  }, [groups]);
  const gatewayGroup = groups.find((g) => g.gateway);
  const separate = groups.filter((g) => !g.gateway).map((g) => g.muni.name);
  const routes = useMemo(() => [...cat.routesForPlace(region.id)].sort((a, b) => a.period.from - b.period.from), [cat, region.id]);
  const gatewayScope = gatewayGroup ? cat.placeScope(gatewayGroup.muni.id) : new Set<ID>();

  return (
    <section id="atlas-miami" className="atlas-miami" aria-labelledby="atlas-miami-h">
      <p className="eyebrow">The gateway · {region.name}</p>
      <h2 id="atlas-miami-h" className="atlas-miami-title">
        Miami, <em>up close</em>
      </h2>
      <p className="atlas-note atlas-miami-lede">{region.summary}</p>

      <figure className="atlas-tissue">
        <TissueMap groups={groups} numbers={numbers} selectedId={selectedId} hrefFor={hrefFor} model={model} />
        <figcaption className="atlas-tissue-cap">A schematic: positions are to scale, the coastline is not drawn.</figcaption>
        <ul className="atlas-tissue-legend" aria-label="Map key">
          {gatewayGroup ? (
            <li>
              <span className="atlas-swatch atlas-swatch-cell-gateway" aria-hidden="true" />
              City of {gatewayGroup.muni.name} and its neighbourhoods
            </li>
          ) : null}
          {separate.length ? (
            <li>
              <span className="atlas-swatch atlas-swatch-cell" aria-hidden="true" />
              Separate municipality — {separate.join(', ')}
            </li>
          ) : null}
          <li>
            <span className="atlas-swatch atlas-swatch-active" aria-hidden="true" />
            Stories here
          </li>
          <li>
            <span className="atlas-swatch atlas-swatch-expanding" aria-hidden="true" />
            Expanding — mapped, no stories yet
          </li>
        </ul>
      </figure>

      <div className="atlas-index">
        <h3 className="atlas-sub">Every place in {region.name}</h3>
        <ul className="atlas-index-groups">
          {groups.map((g) => (
            <li key={g.muni.id} data-gateway={g.gateway || undefined}>
              <p className="atlas-index-muni">{g.gateway ? `City of ${g.muni.name}` : `${g.muni.name} · separate municipality`}</p>
              <ul className="atlas-index-list">
                {g.places.map((p) => {
                  const n = model.counts.get(p.id) ?? 0;
                  return (
                    <li key={p.id}>
                      <Link to={hrefFor(p.slug)} className="atlas-index-link" aria-current={p.id === selectedId ? 'page' : undefined} data-status={p.status}>
                        <span className="atlas-index-num" aria-hidden="true">
                          {numbers.get(p.id)}
                        </span>
                        <span className="atlas-index-name">{p.name}</span>
                        <span className="atlas-index-count">
                          <span className="sr-only">, </span>
                          {p.status === 'expanding' && !n ? 'Expanding' : plural(n, 'story', 'stories')}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <section className="atlas-gw" aria-labelledby="atlas-gw-h">
        <h3 id="atlas-gw-h" className="atlas-sub">
          From the gateway into the world
        </h3>
        {routes.length ? (
          <ul className="atlas-routes">
            {routes.map((r) => {
              const from = gatewayGroup && (gatewayScope.has(r.from) || gatewayScope.has(r.to)) ? gatewayGroup.muni : region;
              return (
                <li key={r.id}>
                  <RouteCard route={r} fromPlace={from} hrefFor={hrefFor} level={4} current={r.id === routeId} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="atlas-note">No routes touch {region.name} yet.</p>
        )}
      </section>
    </section>
  );
}
