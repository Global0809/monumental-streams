/**
 * The neural web: a radial SVG graph around one entity. Edges are curved axons with
 * travelling ichor pulses (static under reduced motion, paused off-screen). Nodes are styled
 * by kind; stories appear as small poster cells. Hover or focus a node (or hover an axon) to
 * read why it is connected; click / Enter travels to its own connections (history push).
 *
 * Keyboard: the web is one tab stop (roving focus). Arrow keys walk the ring, Home/End jump,
 * Enter or Space opens. The "Why these are connected" list on the page is the full text
 * alternative.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { graphFor } from '../../../shared/relations.ts';
import type { ID, Video } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Segmented } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { ReasonChips } from '../../ui/Pod.tsx';
import { KIND_LABEL, KIND_PLURAL, synapseHref } from './entity.ts';
import { KIND_ORDER, edgesOf, layoutGraph, type LaidNode } from './layout.ts';

type Focus = { type: 'node'; id: ID } | { type: 'edge'; key: string } | null;

/** Where an entity "lives" besides its connections page, if anywhere. */
export function pageAction(cat: ReturnType<typeof useCatalogue>, id: ID): { label: string; to: string } | null {
  const k = kindOf(id);
  const to = cat.href(id);
  if (to === synapseHref(cat, id)) return null;
  switch (k) {
    case 'video': {
      const v = cat.get(id) as Video | undefined;
      return { label: v && cat.isPlayable(v) ? 'Watch' : 'Story details', to };
    }
    case 'programme':
      return { label: 'Programme page', to };
    case 'place':
    case 'route':
      return { label: 'Open in World', to };
    case 'period':
      return { label: 'Open in Time Machine', to };
    default:
      return { label: 'Open', to };
  }
}

export function NeuralGraph({ centreId, centreArt, depth, onDepth, reduced, lead, details }: { centreId: ID; centreArt?: ID; depth: 1 | 2; onDepth: (d: 1 | 2) => void; reduced: boolean; lead: ReactNode; details?: ReactNode }) {
  const cat = useCatalogue();
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const [roving, setRoving] = useState(0);
  const nodeEls = useRef(new Map<ID, SVGGElement>());

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth / 8) * 8));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setHover(null);
    setPinned(null);
    setRoving(0);
  }, [centreId, depth]);

  const graph = useMemo(() => graphFor(cat, centreId, { depth, limit: depth === 2 ? 8 : 12 }), [cat, centreId, depth]);
  const layout = useMemo(() => (width ? layoutGraph(graph, width) : null), [graph, width]);
  const ring = useMemo(() => (layout ? layout.order.filter((id) => id !== centreId) : []), [layout, centreId]);

  const current = hover ?? pinned;
  const activate = (f: Focus) => {
    setHover(f);
    if (f) setPinned(f);
  };

  // Which nodes / edges are lit by the current focus.
  const lit = useMemo(() => {
    if (!layout || !current) return null;
    const nodes = new Set<ID>();
    const edges = new Set<string>();
    if (current.type === 'node') {
      nodes.add(current.id);
      for (const e of layout.edges) {
        if (e.from === current.id || e.to === current.id) {
          edges.add(e.key);
          nodes.add(e.from);
          nodes.add(e.to);
        }
      }
    } else {
      const e = layout.edges.find((x) => x.key === current.key);
      if (e) {
        edges.add(e.key);
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
    return { nodes, edges };
  }, [layout, current]);

  // A small reading beside the pointer / focused node (the card below holds the full detail).
  const tip = useMemo(() => {
    if (!layout || !hover) return null;
    let x = 0;
    let y = 0;
    let off = 0;
    let kind = '';
    let title = '';
    let reasons: string[] = [];
    if (hover.type === 'node') {
      const n = layout.byId.get(hover.id);
      if (!n) return null;
      const first = edgesOf(layout, n.id)[0];
      x = n.x;
      y = n.y;
      off = n.r;
      kind = KIND_LABEL[n.kind] + (n.depth === 2 && n.parent ? ` · via ${cat.label(n.parent)}` : '');
      title = n.label;
      reasons = (first?.reasons ?? []).slice(0, 2).map((r) => r.label);
    } else {
      const e = layout.edges.find((z) => z.key === hover.key);
      const a = e && layout.byId.get(e.from);
      const b = e && layout.byId.get(e.to);
      if (!e || !a || !b) return null;
      x = (a.x + b.x) / 2;
      y = (a.y + b.y) / 2;
      kind = 'Axon';
      title = `${a.label} ⟷ ${b.label}`;
      reasons = e.reasons.slice(0, 3).map((r) => r.label);
    }
    return {
      left: (x / layout.width) * 100,
      top: (y / layout.height) * 100,
      off,
      below: y < layout.height * 0.38,
      align: x < layout.width * 0.28 ? 'start' : x > layout.width * 0.72 ? 'end' : 'middle',
      kind,
      title,
      reasons,
    };
  }, [layout, hover, cat]);

  const go = (id: ID) => {
    sound.play('transition');
    navigate(synapseHref(cat, id));
  };

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, i: number, id: ID) => {
    let next = i;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % ring.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + ring.length) % ring.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ring.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        go(id);
        return;
      default:
        return;
    }
    e.preventDefault();
    setRoving(next);
    sound.play('tick');
    nodeEls.current.get(ring[next])?.focus();
  };

  const centre = layout?.byId.get(centreId);
  const presentKinds = KIND_ORDER.filter((k) => graph.nodes.some((n) => n.depth > 0 && n.kind === k));
  const direct = graph.nodes.filter((n) => n.depth === 1).length;
  const ariaFor = (n: LaidNode) => {
    if (!layout) return n.label;
    const first = edgesOf(layout, n.id)[0];
    const via = n.depth === 2 && n.parent ? ` Two steps out, via ${cat.label(n.parent)}.` : '';
    const why = first ? ` ${first.reasons.slice(0, 3).map((r) => r.label).join('; ')}.` : '';
    return `${n.label} — ${KIND_LABEL[n.kind]}.${via}${why}`;
  };

  return (
    <div className="syn-stage">
      <div className="syn-lead">{lead}</div>

      <div className="syn-graph-col" id="syn-web">
        <div className="syn-toolbar">
          <h2 className="syn-web-title">
            <span className="kicker">
              <b>The web</b>
            </span>
            <span className="serif">{direct ? `${direct} direct connection${direct === 1 ? '' : 's'}` : 'No connections yet'}</span>
          </h2>
          <Segmented
            label="Reach"
            hideLabel
            value={String(depth) as '1' | '2'}
            onChange={(v) => onDepth(v === '2' ? 2 : 1)}
            options={[
              { value: '1', label: 'Direct' },
              { value: '2', label: 'Two steps out' },
            ]}
          />
        </div>
        {presentKinds.length ? (
          <ul className="syn-legend" aria-label="Node kinds">
            {presentKinds.map((k) => (
              <li key={k}>
                <span className="syn-dot" data-kind={k} aria-hidden="true" />
                {KIND_PLURAL[k]} <span className="syn-legend-n">{graph.nodes.filter((n) => n.depth > 0 && n.kind === k).length}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div ref={boxRef} className="syn-graph" data-visible={visible || undefined} data-lit={lit ? true : undefined}>
          {!direct ? (
            <EmptyState icon="synapse" title="This node has no connections yet">
              <p>As stories, people and places are added, links appear here automatically.</p>
            </EmptyState>
          ) : layout && centre ? (
            <svg className="syn-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="group" aria-label={`Connection web around ${centre.label}`} aria-describedby="syn-web-hint" data-compact={layout.compact || undefined}>
              <defs>
                <clipPath id="syn-clip" clipPathUnits="objectBoundingBox">
                  <circle cx="0.5" cy="0.5" r="0.5" />
                </clipPath>
                <radialGradient id="syn-aura" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" style={{ stopColor: 'var(--iris)', stopOpacity: 0.22 }} />
                  <stop offset="100%" style={{ stopColor: 'var(--iris)', stopOpacity: 0 }} />
                </radialGradient>
              </defs>

              {/* Orbit guides */}
              <g className="syn-orbits" aria-hidden="true">
                {[...new Set(layout.nodes.filter((n) => n.depth > 0).map((n) => n.depth))].map((d) => {
                  const ns = layout.nodes.filter((n) => n.depth === d);
                  const rx = Math.max(...ns.map((n) => Math.abs(n.x - centre.x)));
                  const ry = Math.max(...ns.map((n) => Math.abs(n.y - centre.y)));
                  return <ellipse key={d} cx={centre.x} cy={centre.y} rx={rx} ry={ry} />;
                })}
              </g>

              {/* Axons */}
              <g className="syn-edges">
                {layout.edges.map((e, i) => {
                  const on = lit?.edges.has(e.key);
                  const dur = 2.4 + (i % 5) * 0.45 + Math.min(e.length, 600) / 600;
                  return (
                    <g key={e.key} className="syn-axon" data-cross={e.cross || undefined} data-on={on || undefined} data-dim={(lit && !on) || undefined}>
                      <path className="syn-edge" d={e.d} style={{ strokeWidth: 0.8 + (Math.min(e.weight, 20) / 20) * 2.4 }} />
                      {reduced ? null : <path className="syn-pulse" d={e.d} pathLength={100} style={{ animationDuration: `${dur.toFixed(2)}s`, animationDelay: `-${((i * 0.77) % dur).toFixed(2)}s` }} />}
                      <path className="syn-edge-hit" d={e.d} onPointerEnter={() => activate({ type: 'edge', key: e.key })} onPointerLeave={() => setHover(null)} />
                    </g>
                  );
                })}
              </g>

              {/* Centre */}
              <g className="syn-centre" data-kind={centre.kind} transform={`translate(${centre.x} ${centre.y})`} aria-hidden="true">
                <circle className="syn-centre-aura" r={centre.r * 2.2} fill="url(#syn-aura)" />
                <circle className="syn-centre-halo" r={centre.r + 9} />
                <circle className="syn-centre-core" r={centre.r} />
                {centreArt && cat.artFor(centreArt) ? (
                  <image href={cat.artFor(centreArt)!.posterSmall} x={-centre.r} y={-centre.r} width={centre.r * 2} height={centre.r * 2} clipPath="url(#syn-clip)" preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <circle className="syn-centre-nucleus" r={centre.r * 0.34} />
                )}
                <circle className="syn-centre-ring" r={centre.r} />
              </g>

              {/* Nodes */}
              <g className="syn-nodes">
                {ring.map((id, i) => {
                  const n = layout.byId.get(id)!;
                  const art = n.kind === 'video' ? cat.artFor((cat.get(id) as Video | undefined)?.art) : null;
                  const on = lit?.nodes.has(id);
                  return (
                    <g
                      key={id}
                      ref={(el) => {
                        if (el) nodeEls.current.set(id, el);
                        else nodeEls.current.delete(id);
                      }}
                      className="syn-node"
                      data-kind={n.kind}
                      data-depth={n.depth}
                      data-on={(current?.type === 'node' && current.id === id) || undefined}
                      data-dim={(lit && !on) || undefined}
                      transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
                      role="link"
                      tabIndex={i === roving ? 0 : -1}
                      aria-label={ariaFor(n)}
                      data-cursor="open"
                      data-cursor-label="Travel"
                      onClick={() => go(id)}
                      onKeyDown={(e) => onNodeKey(e, i, id)}
                      onFocus={() => {
                        setRoving(i);
                        activate({ type: 'node', id });
                      }}
                      onBlur={() => setHover(null)}
                      onPointerEnter={() => activate({ type: 'node', id })}
                      onPointerLeave={() => setHover(null)}
                    >
                      <circle className="syn-node-hit" r={Math.max(n.r + 6, 22)} />
                      <circle className="syn-node-glow" r={n.r + 5} />
                      {art ? (
                        <image href={n.depth === 1 ? art.posterSmall : art.lqip} x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} clipPath="url(#syn-clip)" preserveAspectRatio="xMidYMid slice" />
                      ) : (
                        <>
                          <circle className="syn-node-core" r={n.r} />
                          <circle className="syn-node-nucleus" r={Math.max(1.6, n.r * 0.32)} />
                        </>
                      )}
                      <circle className="syn-node-ring" r={n.r} />
                    </g>
                  );
                })}
              </g>

              {/* Labels on top, never interactive */}
              <g className="syn-labels" aria-hidden="true">
                <text className="syn-label syn-label-centre" x={centre.caption.x} y={centre.caption.y} textAnchor="middle">
                  {centre.caption.lines.map((l, k) => (
                    <tspan key={k} x={centre.caption.x} dy={k ? (layout.compact ? 13 : 16) : 0}>
                      {l}
                    </tspan>
                  ))}
                </text>
                {ring.map((id) => {
                  const n = layout.byId.get(id)!;
                  const on = current?.type === 'node' && current.id === id;
                  if (!n.caption.shown && !on) return null;
                  return (
                    <text key={id} className="syn-label" data-on={on || undefined} data-dim={(lit && !lit.nodes.has(id)) || undefined} data-depth={n.depth} x={n.caption.x} y={n.caption.y} textAnchor={n.caption.anchor}>
                      {n.caption.lines.map((l, k) => (
                        <tspan key={k} x={n.caption.x} dy={k ? (layout.compact ? 12 : 14) : 0}>
                          {l}
                        </tspan>
                      ))}
                    </text>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className="syn-svg-skeleton" aria-hidden="true" />
          )}
          {tip ? (
            <div className="syn-tip" style={{ left: `${tip.left}%`, top: `${tip.top}%`, ['--off' as string]: `${tip.off}px` }} data-below={tip.below || undefined} data-align={tip.align} aria-hidden="true">
              <span className="syn-tip-kind">{tip.kind}</span>
              <strong className="syn-tip-title">{tip.title}</strong>
              {tip.reasons.length ? (
                <ul>
                  {tip.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <p id="syn-web-hint" className="syn-hint">
          <span className="syn-hint-fine">Hover or focus a node to see why it is connected · click or press Enter to travel there · arrow keys walk the web</span>
          <span className="syn-hint-touch">Tap a node to travel to its synapse · every link is explained in words below</span>
        </p>
      </div>

      <aside className="syn-card panel panel-pad" aria-label="Connection details">
        {layout ? <Card focus={current} layout={layout} centreId={centreId} /> : null}
      </aside>

      {details ? <div className="syn-details-wrap">{details}</div> : null}
    </div>
  );
}

function Card({ focus, layout, centreId }: { focus: Focus; layout: ReturnType<typeof layoutGraph>; centreId: ID }) {
  const cat = useCatalogue();
  if (focus?.type === 'edge') {
    const e = layout.edges.find((x) => x.key === focus.key);
    if (e) {
      return (
        <div className="syn-card-body">
          <p className="kicker">
            <b>Axon</b> · {e.reasons.length} reason{e.reasons.length === 1 ? '' : 's'}
          </p>
          <h3 className="syn-card-title serif">
            {cat.label(e.from)} <span className="syn-card-join">⟷</span> {cat.label(e.to)}
          </h3>
          <ReasonChips reasons={e.reasons} max={6} />
        </div>
      );
    }
  }
  if (focus?.type === 'node') {
    const n = layout.byId.get(focus.id);
    if (n) {
      const ties = edgesOf(layout, n.id).slice(0, 3);
      const page = pageAction(cat, n.id);
      return (
        <div className="syn-card-body">
          <p className="kicker">
            <span className="syn-dot" data-kind={n.kind} aria-hidden="true" /> <b>{KIND_LABEL[n.kind]}</b>
            {n.depth === 2 && n.parent ? ` · via ${cat.label(n.parent)}` : ''}
          </p>
          <h3 className="syn-card-title serif">{n.label}</h3>
          <ul className="syn-card-ties">
            {ties.map((t) => {
              const other = t.from === n.id ? t.to : t.from;
              return (
                <li key={t.key}>
                  <p className="syn-card-pair">
                    {other === centreId ? 'Why it is here' : `Also tied to ${cat.label(other)}`}
                  </p>
                  <ReasonChips reasons={t.reasons} max={4} />
                </li>
              );
            })}
          </ul>
          <div className="syn-card-actions">
            <Link to={synapseHref(cat, n.id)} className="btn btn-chrome btn-md" onClick={() => sound.play('transition')}>
              <Icon name="synapse" size={18} />
              <span>Open its connections</span>
            </Link>
            {page ? (
              <Link to={page.to} className="btn btn-quiet btn-md">
                <span>{page.label}</span>
                <Icon name="arrow" size={18} />
              </Link>
            ) : null}
          </div>
        </div>
      );
    }
  }
  const direct = layout.nodes.filter((x) => x.depth === 1).sort((a, b) => b.weight - a.weight);
  return (
    <div className="syn-card-body">
      <p className="kicker">
        <b>Reading the web</b>
      </p>
      <h3 className="syn-card-title serif">{direct.length ? `Strongest: ${direct[0].label}` : 'A quiet node'}</h3>
      <p className="muted">
        {direct.length
          ? `Thicker axons carry more shared reasons. ${direct.length > 1 ? `Next strongest: ${direct.slice(1, 3).map((x) => x.label).join(' and ')}.` : ''} Point at any node or axon — or tab into the web — to read why it is linked.`
          : 'Nothing in the archive links here yet.'}
      </p>
    </div>
  );
}
