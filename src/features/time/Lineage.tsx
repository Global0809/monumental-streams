/**
 * CONNECTIONS THROUGH TIME — roots → the era → echoes → today, drawn as a vascular thread.
 *
 * Four columns of real nodes (links), joined by veins measured from the laid-out nodes. Pointing
 * at or focusing any node lights its whole thread upstream and downstream and lets the rest fall
 * back, so "what came from what" can be followed by eye. Where the columns stack (narrow
 * screens) the veins are not drawn and each node states its relation in words instead.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ID, Programme, Video } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { setHovered, stageStore } from '../../stage/store.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Art, ReasonChips } from '../../ui/Pod.tsx';
import { movementYears, type DecadeContext } from './chrono.ts';
import { lineageEdges, nodeKey, threadOf } from './lineage.ts';

const WIDE = 860; // container px at which the four strands sit side by side

interface Vein {
  key: string;
  d: string;
  from: string;
  to: string;
}

export function Lineage({ phrase, label, ctx }: { phrase: string; label: string; ctx: DecadeContext }) {
  const cat = useCatalogue();
  const box = useRef<HTMLDivElement>(null);
  const [veins, setVeins] = useState<Vein[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hot, setHot] = useState<string | null>(null);
  const edges = useMemo(() => lineageEdges(ctx), [ctx]);
  const lit = useMemo(() => (hot ? threadOf(edges, hot) : null), [edges, hot]);
  // a new place in time replaces the nodes: never leave the graph dimmed around a node that is gone
  useEffect(() => setHot(null), [edges]);

  const inThread = new Set<ID>(edges.flatMap((e) => [e.from, e.to]).filter((k) => k.startsWith('now|')).map((k) => k.slice(4)));
  const core = ctx.movements.filter((m) => inThread.has(m.id));
  const quiet = ctx.movements.filter((m) => !inThread.has(m.id));
  const gen1 = ctx.echoes.filter((e) => e.generation === 1);
  const gen2 = ctx.echoes.filter((e) => e.generation === 2);

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    setSize({ w, h });
    if (w < WIDE) {
      setVeins([]);
      return;
    }
    const base = el.getBoundingClientRect();
    const rect = (k: string) => el.querySelector<HTMLElement>(`[data-node="${CSS.escape(k)}"]`)?.getBoundingClientRect();
    const out: Vein[] = [];
    for (const e of edges) {
      const a = rect(e.from);
      const b = rect(e.to);
      if (!a || !b) continue;
      const y1 = a.top + a.height / 2 - base.top;
      const y2 = b.top + b.height / 2 - base.top;
      if (e.within) {
        const x1 = a.left - base.left;
        const x2 = b.left - base.left;
        const bulge = 26 + Math.min(40, Math.abs(y2 - y1) * 0.15);
        out.push({ key: `${e.from}>${e.to}`, from: e.from, to: e.to, d: `M${x1} ${y1} C${x1 - bulge} ${y1}, ${x2 - bulge} ${y2}, ${x2} ${y2}` });
      } else {
        const x1 = a.right - base.left;
        const x2 = b.left - base.left;
        const dx = Math.max(24, (x2 - x1) / 2);
        out.push({ key: `${e.from}>${e.to}`, from: e.from, to: e.to, d: `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
      }
    }
    setVeins(out);
  }, [edges]);

  useLayoutEffect(() => {
    measure();
    const el = box.current;
    if (!el) return;
    let raf = 0;
    const queue = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    for (const col of el.querySelectorAll('.tm-ln-col')) ro.observe(col);
    let alive = true;
    void document.fonts?.ready.then(() => alive && queue());
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure]);

  /** Hover / focus props that light a node's thread (and, for a story, its seed in the world). */
  const lightProps = (key: string, seed?: ID) => {
    const on = () => {
      setHot(key);
      if (seed) setHovered(seed);
    };
    const off = () => {
      setHot((h) => (h === key ? null : h));
      if (seed && stageStore.get().hovered === seed) setHovered(null);
    };
    return { 'data-node': key, 'data-lit': lit ? (lit.has(key) ? 'on' : 'off') : undefined, onPointerEnter: on, onPointerLeave: off, onFocus: on, onBlur: off };
  };

  const nothing = !ctx.roots.length && !ctx.movements.length && !ctx.echoes.length && !ctx.today.length;

  return (
    <div className="tm-ln" ref={box} data-lit={lit ? '' : undefined}>
      {nothing ? (
        <p className="tm-ln-none muted">No recorded movements reach {phrase} yet, so there is no thread to follow.</p>
      ) : (
        <>
          <svg className="tm-ln-veins" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="tm-vein-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" style={{ stopColor: 'var(--lilac-dim)' }} />
                <stop offset="50%" style={{ stopColor: 'var(--frost)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--gold)' }} />
              </linearGradient>
            </defs>
            {veins.map((v) => (
              <path key={v.key} d={v.d} className="tm-vein-path" data-lit={lit ? (lit.has(v.from) && lit.has(v.to) ? 'on' : 'off') : undefined} />
            ))}
          </svg>

          <div className="tm-ln-col" data-strand="root">
            <h3 className="tm-ln-h">
              <span className="tm-ln-step">01</span> Roots
            </h3>
            {ctx.roots.length ? (
              <ul className="tm-ln-list">
                {ctx.roots.map(({ root, into }) => (
                  <li key={root.id}>
                    <Link to={cat.href(root.id)} className="tm-node" {...lightProps(nodeKey('root', root.id))} onClick={() => sound.play('transition')}>
                      <span className="tm-node-name">{root.name}</span>
                      <span className="tm-node-years">{movementYears(root)}</span>
                      <span className="tm-node-rel">fed {into.map((m) => m.name).join(', ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tm-ln-empty">No recorded influences for the movements of {phrase}.</p>
            )}
          </div>

          <div className="tm-ln-col" data-strand="now">
            <h3 className="tm-ln-h">
              <span className="tm-ln-step">02</span> {label}
            </h3>
            {ctx.movements.length ? (
              <ul className="tm-ln-list">
                {core.map((m) => (
                  <li key={m.id}>
                    <Link to={cat.href(m.id)} className="tm-node tm-node-now" {...lightProps(nodeKey('now', m.id))} onClick={() => sound.play('transition')}>
                      <span className="tm-node-name">{m.name}</span>
                      <span className="tm-node-years">{movementYears(m)}</span>
                    </Link>
                  </li>
                ))}
                {quiet.length ? (
                  <li className="tm-ln-quiet">
                    <span>Also alive:</span>{' '}
                    {quiet.map((m, i) => (
                      <span key={m.id}>
                        {i ? ', ' : ''}
                        <Link to={cat.href(m.id)}>{m.name}</Link>
                      </span>
                    ))}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="tm-ln-empty">No movements recorded.</p>
            )}
          </div>

          <div className="tm-ln-col" data-strand="echo">
            <h3 className="tm-ln-h">
              <span className="tm-ln-step">03</span> Echoes forward
            </h3>
            {ctx.echoes.length ? (
              <ul className="tm-ln-list">
                {[...gen1, ...gen2].map(({ echo, from, generation }) => (
                  <li key={echo.id} data-gen={generation}>
                    <Link to={cat.href(echo.id)} className="tm-node" {...lightProps(nodeKey('echo', echo.id))} onClick={() => sound.play('transition')}>
                      <span className="tm-node-name">{echo.name}</span>
                      <span className="tm-node-years">{movementYears(echo)}</span>
                      <span className="tm-node-rel">drew on {from.map((m) => m.name).join(', ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tm-ln-empty">No later movements list these as an influence yet.</p>
            )}
          </div>

          <div className="tm-ln-col" data-strand="today">
            <h3 className="tm-ln-h">
              <span className="tm-ln-step">04</span> On Monumental today
            </h3>
            {ctx.today.length ? (
              <ul className="tm-ln-list">
                {ctx.today.map((t) => {
                  const e = cat.get(t.id) as Video | Programme | undefined;
                  return (
                    <li key={t.id}>
                      <div className="tm-node tm-node-today" {...lightProps(nodeKey('today', t.id), t.kind === 'video' ? t.id : undefined)}>
                        <Art art={e?.art} alt="" className="tm-node-art" />
                        <div className="tm-node-text">
                          <Link to={cat.href(t.id)} className="tm-node-name" data-cursor={t.kind === 'video' ? 'play' : 'open'} onClick={() => sound.play('transition')}>
                            {cat.label(t.id)}
                          </Link>
                          <span className="tm-node-years">
                            {t.kind === 'video' ? 'Story' : 'Programme'} · through {cat.label(t.through)}
                          </span>
                          <ReasonChips reasons={t.reasons} max={1} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="tm-ln-empty">No stories or programmes connect to this thread yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
