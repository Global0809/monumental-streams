/**
 * Category heroes. One frame (section art as a living room of light, the switcher, the page's
 * one h1, its tagline and live counts, the one gold action) and eight visuals — one per
 * presentation family — that all follow the same rule: ONE MARK PER REAL TITLE.
 *
 *   cinema          a widescreen screen showing the top film; a filmstrip of every film
 *   soundstage      an equaliser: each title is a cluster of bars, its width its running time
 *   arena           a stadium track; each title is a runner on a lane
 *   arcade          a light board; each title is one lit cell
 *   broadsheet      a masthead and "the wire" — dated, sourced headlines
 *   runway          a runway in perspective; each title is a light strip along it
 *   atlas-of-ideas  a constellation of the places the titles live in, joined by real routes
 *   playroom        a toy box; each title is one soft shape
 *
 * An empty category draws the empty structure — never a placeholder title. Every visual feels
 * the pointer and the scroll through the membrane field (field.ts) and stands still under
 * reduced motion or on low-graphics devices.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Section } from '../../../shared/sections.ts';
import type { Video } from '../../../shared/types.ts';
import { FOOTAGE_LABEL, PROVENANCE_LABEL, runtimeLabel, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { AccessBadge, Art, useAccessState } from '../../ui/Pod.tsx';
import { useLoop } from '../programme/useLoop.ts';
import { constellation, hash01, sourceOf } from './engine.ts';
import { REST, liteDevice, useField, type FieldState } from './field.ts';
import { LoopButton, SaveAction, StatLine, Switcher, setHot } from './parts.tsx';

const MAX_MARKS = 48;

/* ───────────── Field context: visuals register painters on the hero ───────────── */

type Paint = (f: FieldState) => void;
interface FieldApi {
  add: (fn: Paint) => () => void;
  /** Re-run every painter with the latest field (after a visual re-measures itself). */
  repaint: () => void;
  host: RefObject<HTMLElement | null>;
}
const FieldCtx = createContext<FieldApi | null>(null);

function usePaint(fn: Paint) {
  const api = useContext(FieldCtx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => api?.add((f) => ref.current(f)), [api]);
  return api;
}

/* ───────────── Frame ───────────── */

export interface HeroProps {
  section: Section;
  all: Video[];
  stats: { n: number | string; label: string; tone?: 'frost' | 'gold' | 'iris' }[];
  pageRef: RefObject<HTMLElement | null>;
}

export function HeroFrame({
  section,
  kicker,
  stats,
  viz,
  vizLabel,
  before,
  children,
  className = '',
}: {
  section: Section;
  kicker: string;
  /** Rendered above the eyebrow (the News masthead). */
  before?: ReactNode;
  stats: HeroProps['stats'];
  viz?: ReactNode;
  /** Visible caption explaining what the visual encodes. */
  vizLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const cat = useCatalogue();
  const host = useRef<HTMLElement>(null);
  const painters = useRef(new Set<Paint>());
  const last = useRef<FieldState>(REST);
  const add = useCallback((fn: Paint) => {
    painters.current.add(fn);
    fn(last.current);
    return () => {
      painters.current.delete(fn);
    };
  }, []);
  const repaint = useCallback(() => {
    for (const fn of painters.current) fn(last.current);
  }, []);
  const api = useMemo(() => ({ add, repaint, host }), [add, repaint]);
  useField(host, (f) => {
    last.current = f;
    for (const fn of painters.current) fn(f);
  });

  const art = cat.artFor(section.art);
  const vid = useRef<HTMLVideoElement>(null);
  const [lite] = useState(liteDevice);
  const hasLoop = !!(art?.preview || art?.previewSmall) && !lite;
  const loop = useLoop(vid, hasLoop ? { large: art?.preview, small: art?.previewSmall } : null, { autoplay: true });

  return (
    <FieldCtx.Provider value={api}>
      <header ref={host} className={`cat-hero ${className} ${lite ? 'is-lite' : ''}`} id="cat-top" data-playing={loop.playing || undefined}>
        <div className="cat-room" aria-hidden="true">
          <Art art={section.art} alt="" sizes="large" eager />
          {hasLoop ? <video ref={vid} className="cat-room-video" muted loop playsInline preload="none" tabIndex={-1} /> : null}
          <span className="cat-room-light" />
        </div>
        <div className="wrap cat-hero-inner">
          <Switcher current={section} />
          <div className="cat-hero-main">
            <div className="cat-hero-copy">
              {before}
              <p className="kicker cat-kicker">{kicker}</p>
              <h1 id="cat-title" className="cat-title">
                {section.label}
              </h1>
              <p className="cat-tagline">{section.tagline}</p>
              <StatLine items={stats} />
              {children}
            </div>
            {viz ? (
              <figure className="cat-viz">
                {viz}
                {vizLabel ? <figcaption className="cat-viz-cap">{vizLabel}</figcaption> : null}
              </figure>
            ) : null}
          </div>
        </div>
        {hasLoop ? <LoopButton playing={loop.playing} onToggle={loop.toggle} label={`${section.label} background motion`} /> : null}
      </header>
    </FieldCtx.Provider>
  );
}

/** The one gold action: watch the leading title (or open it, when it is locked or not yet out). */
export function PrimaryWatch({ video }: { video: Video }) {
  const cat = useCatalogue();
  const access = useAccessState(video);
  const playable = cat.isPlayable(video);
  return (
    <div className="cat-hero-actions">
      <ButtonLink to={cat.href(video.id)} variant="primary" size="lg" icon={playable && !access.locked ? 'play' : 'arrow'} data-cursor={playable ? 'play' : 'open'}>
        {playable && !access.locked ? 'Watch' : 'Open'} {video.title}
      </ButtonLink>
      <SaveAction video={video} />
    </div>
  );
}

/* ═════════════ cinema — the screen ═════════════ */

export function CinemaScreen({ films, pageRef }: { films: Video[]; pageRef: RefObject<HTMLElement | null> }) {
  const cat = useCatalogue();
  const playableFirst = useMemo(() => films.filter((v) => cat.isPlayable(v) && cat.artFor(v.art)), [cat, films]);
  const [pick, setPick] = useState<string | null>(null);
  const top = films.find((v) => v.id === pick) ?? playableFirst[0] ?? films[0];
  const strip = films.slice(0, 12);
  const screen = useRef<HTMLDivElement>(null);
  usePaint((f) => {
    const el = screen.current;
    if (!el) return;
    el.style.setProperty('--tilt', `${(f.s * 7).toFixed(2)}deg`);
    el.style.setProperty('--px', `${(f.x * 100).toFixed(1)}%`);
    el.style.setProperty('--py', `${(f.y * 100).toFixed(1)}%`);
    el.style.setProperty('--pa', f.a.toFixed(3));
  });
  if (!top) return null;
  const runtime = cat.runtime(top);
  const place = top.places[0] ? cat.label(top.places[0]) : null;

  return (
    <div className="cine">
      <div className="cine-screen" ref={screen} key={top.id}>
        <div className="cine-pic">
          <Link to={cat.href(top.id)} className="cine-image" tabIndex={-1} aria-hidden="true" data-cursor="play" data-cursor-label="Watch" onClick={() => sound.play('transition')}>
            <Art art={top.art} alt="" sizes="large" eager />
          </Link>
          <span className="cine-beam" aria-hidden="true" />
          {/* the aperture opens on every new film */}
          <span className="cine-bar cine-bar-top" aria-hidden="true" />
          <span className="cine-bar cine-bar-bottom" aria-hidden="true" />
        </div>
        <div className="cine-card">
          <p className="kicker">Top of the bill</p>
          <h2 className="cine-title">{top.title}</h2>
          <p className="cine-meta">
            <AccessBadge video={top} />
            <span>{top.made ? `Made ${top.made}` : settingLabel(top)}</span>
            {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
            {top.footage[0] ? <span>{FOOTAGE_LABEL[top.footage[0]]}</span> : null}
            {place ? <span>{place}</span> : null}
          </p>
          <p className="cine-summary">{top.summary}</p>
          <PrimaryWatch video={top} />
        </div>
      </div>
      {strip.length > 1 ? (
        <div className="cine-strip" role="group" aria-label="Choose the film on the screen">
          {strip.map((v) => {
            const on = v.id === top.id;
            return (
              <button
                key={v.id}
                type="button"
                className="cine-frame"
                aria-pressed={on}
                data-vid={v.id}
                onClick={() => {
                  sound.play('select');
                  setPick(v.id);
                }}
                onPointerEnter={() => setHot(pageRef.current, v.id)}
                onPointerLeave={() => setHot(pageRef.current, null)}
              >
                <Art art={v.art} alt="" />
                <span className="cine-frame-title">
                  <span className="sr-only">Show </span>
                  {v.title}
                  <span className="sr-only"> on the screen</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ═════════════ soundstage — the spectrum ═════════════ */

export function Spectrum({ videos, pageRef }: { videos: Video[]; pageRef: RefObject<HTMLElement | null> }) {
  const cat = useCatalogue();
  const box = useRef<HTMLDivElement>(null);
  const centres = useRef<{ el: HTMLElement; x: number; b: number; n: number }[]>([]);
  const clusters = useMemo(
    () =>
      videos.slice(0, 24).map((v) => {
        const rt = cat.runtime(v);
        // longer titles get more bars: 6 for a loop, up to 14 for a long film
        const n = rt ? 6 + Math.round(Math.min(1, Math.log10(Math.max(10, rt)) / 3.6) * 8) : 6;
        const bars = Array.from({ length: n }, (_, j) => {
          const env = Math.sin((Math.PI * (j + 0.5)) / n);
          return 0.16 + 0.84 * env * (0.4 + 0.6 * hash01(v.id, j + 1));
        });
        return { v, bars, planned: !cat.isPlayable(v), runtime: rt };
      }),
    [cat, videos],
  );

  const api = usePaint((f) => {
    for (const c of centres.current) {
      const d = c.x - f.x;
      const lift = f.a * Math.exp(-(d * d) / 0.0045);
      const breath = 0.62 + 0.38 * (1 - f.s);
      const jitter = f.v * (0.35 + 0.65 * Math.abs(Math.sin(c.n * 12.9898 + f.v * 20)));
      const k = Math.min(1.3, c.b * breath * (1 + 0.85 * lift) + jitter * 0.35);
      c.el.style.setProperty('--k', k.toFixed(3));
    }
  });

  useLayoutEffect(() => {
    const el = box.current;
    const host = api?.host.current;
    if (!el || !host) return;
    const measure = () => {
      const hr = host.getBoundingClientRect();
      centres.current = [...el.querySelectorAll<HTMLElement>('.spec-bar')].map((b, n) => {
        const r = b.getBoundingClientRect();
        return { el: b, x: hr.width ? (r.left + r.width / 2 - hr.left) / hr.width : 0.5, b: Number(b.dataset.b), n };
      });
      api?.repaint();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [api, clusters]);

  return (
    <div className="spec" ref={box} aria-hidden="true">
      {clusters.length ? (
        clusters.map((c) => (
          <Link
            key={c.v.id}
            to={cat.href(c.v.id)}
            tabIndex={-1}
            className={`spec-cluster ${c.planned ? 'is-planned' : ''}`}
            data-vid={c.v.id}
            style={{ flexGrow: c.bars.length }}
            onPointerEnter={() => setHot(pageRef.current, c.v.id)}
            onPointerLeave={() => setHot(pageRef.current, null)}
            onClick={() => sound.play('transition')}
          >
            <span className="spec-bars">
              {c.bars.map((b, j) => (
                <span key={j} className="spec-bar" data-b={b.toFixed(3)} style={{ '--k': b, '--j': j } as CSSProperties} />
              ))}
            </span>
            <span className="spec-label">
              {c.v.title}
              {c.runtime ? ` · ${runtimeLabel(c.runtime)}` : c.planned ? ' · planned' : ''}
            </span>
          </Link>
        ))
      ) : (
        <span className="spec-flat" />
      )}
    </div>
  );
}

/* ═════════════ atlas-of-ideas — the constellation ═════════════ */

export function Constellation({ videos }: { videos: Video[] }) {
  const cat = useCatalogue();
  const { nodes, edges } = useMemo(() => constellation(cat, videos, 12), [cat, videos]);
  const nodeEls = useRef<(HTMLAnchorElement | null)[]>([]);
  const pathEls = useRef<(SVGPathElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const maxN = Math.max(1, ...nodes.map((n) => n.count));
  const curve = (ax: number, ay: number, bx: number, by: number) => {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const bend = 0.18;
    return `M${ax * 1000} ${ay * 600} Q${(mx - dy * bend) * 1000} ${(my + dx * bend) * 600} ${bx * 1000} ${by * 600}`;
  };
  const api = usePaint((f) => {
    const host = api?.host.current;
    const el = box.current;
    if (!host || !el) return;
    const hr = host.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    if (!br.width) return;
    // pointer in the box's own 0–1 space
    const px = (f.x * hr.width + hr.left - br.left) / br.width;
    const py = (f.y * hr.height + hr.top - br.top) / br.height;
    const pos = nodes.map((n) => {
      const dx = px - n.x;
      const dy = py - n.y;
      const pull = 0.09 * f.a * Math.exp(-(dx * dx + dy * dy) / 0.05);
      const drift = f.s * 0.05 * (hash01(n.place.id) - 0.5);
      return { x: n.x + dx * pull + drift, y: n.y + dy * pull - f.s * 0.04 };
    });
    pos.forEach((p, i) => {
      const a = nodeEls.current[i];
      if (a) a.style.translate = `${((p.x - nodes[i].x) * br.width).toFixed(1)}px ${((p.y - nodes[i].y) * br.height).toFixed(1)}px`;
    });
    edges.forEach((e, i) => {
      const path = pathEls.current[i];
      if (path) path.setAttribute('d', curve(pos[e.a].x, pos[e.a].y, pos[e.b].x, pos[e.b].y));
    });
  });

  if (!nodes.length) return <div className="star star-empty" aria-hidden="true" />;
  return (
    <div className="star" ref={box} aria-hidden="true">
      <svg className="star-veins" viewBox="0 0 1000 600" preserveAspectRatio="none">
        {edges.map((e, i) => (
          <path
            key={`${e.a}-${e.b}`}
            ref={(el) => {
              pathEls.current[i] = el;
            }}
            className={`star-edge is-${e.kind}`}
            d={curve(nodes[e.a].x, nodes[e.a].y, nodes[e.b].x, nodes[e.b].y)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {nodes.map((n, i) => (
        <Link
          key={n.place.id}
          ref={(el) => {
            nodeEls.current[i] = el;
          }}
          to={cat.href(n.place.id)}
          tabIndex={-1}
          className={`star-node ${i < 6 ? 'is-named' : ''} ${n.x > 0.68 ? 'is-east' : ''}`}
          style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, '--r': 0.45 + 0.55 * Math.sqrt(n.count / maxN) } as CSSProperties}
          onClick={() => sound.play('transition')}
          data-cursor-label="World"
        >
          <span className="star-core" />
          <span className="star-name">
            {n.place.name}
            <small>{n.count}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ═════════════ arena — the track ═════════════ */

export function Stadium({ videos }: { videos: Video[] }) {
  const runners = videos.slice(0, MAX_MARKS);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const lanes = [
    { rx: 300, ry: 150 },
    { rx: 262, ry: 124 },
    { rx: 224, ry: 98 },
  ];
  const place = (i: number, phase: number) => {
    const lane = lanes[i % 3];
    const t = (i / Math.max(1, runners.length)) * Math.PI * 2 + phase * (1 + (i % 3) * 0.18);
    return { cx: 340 + lane.rx * Math.cos(t), cy: 190 + lane.ry * Math.sin(t) };
  };
  usePaint((f) => {
    const phase = (f.x - 0.5) * 0.9 * f.a + f.s * 2.2;
    runners.forEach((_, i) => {
      const c = dots.current[i];
      if (!c) return;
      const p = place(i, phase);
      c.setAttribute('cx', p.cx.toFixed(1));
      c.setAttribute('cy', p.cy.toFixed(1));
    });
  });
  return (
    <svg className="arena" viewBox="0 0 680 380" aria-hidden="true">
      <defs>
        <radialGradient id="arena-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#9fdcff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#9fdcff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="340" cy="190" rx="330" ry="172" className="arena-bowl" />
      {lanes.map((l, i) => (
        <ellipse key={i} cx="340" cy="190" rx={l.rx} ry={l.ry} className="arena-lane" />
      ))}
      <rect x="196" y="126" width="288" height="128" rx="64" className="arena-pitch" />
      <line x1="340" y1="126" x2="340" y2="254" className="arena-line" />
      <circle cx="340" cy="190" r="34" className="arena-line" fill="url(#arena-glow)" />
      <text x="340" y="203" textAnchor="middle" className="arena-score">
        {String(runners.length).padStart(2, '0')}
      </text>
      {runners.map((v, i) => {
        const p = place(i, 0);
        return <circle key={v.id} ref={(el) => void (dots.current[i] = el)} data-vid={v.id} cx={p.cx} cy={p.cy} r="7" className="arena-runner" />;
      })}
    </svg>
  );
}

/* ═════════════ arcade — the light board ═════════════ */

export function LightBoard({ videos }: { videos: Video[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lit = useMemo(() => videos.slice(0, MAX_MARKS).map((v, i) => ({ id: v.id, h: hash01(v.id, 7), tone: i % 2 })), [videos]);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const lastField = useRef<FieldState>(REST);

  const draw = useCallback(
    (f: FieldState, host: HTMLElement | null) => {
      const c = canvas.current;
      if (!c || !host) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const { w, h, dpr } = size.current;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cell = w < 600 ? 20 : 26;
      const gap = 6;
      const cols = Math.floor((w + gap) / (cell + gap));
      const rows = Math.floor((h + gap) / (cell + gap));
      const total = cols * rows;
      const ox = (w - (cols * (cell + gap) - gap)) / 2;
      const oy = (h - (rows * (cell + gap) - gap)) / 2;
      // pointer in canvas pixels (the canvas fills the hero)
      const px = f.x * w;
      const py = f.y * h;
      const litAt = new Map<number, number>();
      lit.forEach((l, i) => {
        let k = Math.floor(l.h * total);
        while (litAt.has(k)) k = (k + 7) % total;
        litAt.set(k, i);
      });
      for (let r = 0; r < rows; r++)
        for (let q = 0; q < cols; q++) {
          const x = ox + q * (cell + gap);
          const y = oy + r * (cell + gap);
          const d2 = (x + cell / 2 - px) ** 2 + (y + cell / 2 - py) ** 2;
          const glow = f.a * Math.exp(-d2 / (2 * 130 * 130));
          const k = r * cols + q;
          const title = litAt.get(k);
          if (title !== undefined) {
            const tone = lit[title].tone ? '159 220 255' : '255 159 200';
            ctx.shadowColor = `rgb(${tone} / 0.9)`;
            ctx.shadowBlur = 18;
            ctx.fillStyle = `rgb(${tone} / ${0.75 + 0.25 * glow})`;
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgb(205 197 228 / ${0.045 + 0.32 * glow + f.v * 0.05})`;
          }
          ctx.beginPath();
          ctx.roundRect(x, y, cell, cell, 6);
          ctx.fill();
        }
      ctx.shadowBlur = 0;
    },
    [lit],
  );

  const api = usePaint((f) => {
    lastField.current = f;
    draw(f, api?.host.current ?? null);
  });

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height, dpr };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      draw(lastField.current, api?.host.current ?? null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [api, draw]);

  return <canvas ref={canvas} className="board" aria-hidden="true" />;
}

/* ═════════════ runway — lights in perspective ═════════════ */

export function Runway({ videos }: { videos: Video[] }) {
  const looks = videos.slice(0, 24);
  const strips = useRef<(SVGRectElement | null)[]>([]);
  const edges = useRef<(SVGPathElement | null)[]>([]);
  const lamps = useRef<(SVGCircleElement | null)[]>([]);
  const LAMPS = 9;
  const geo = (f: FieldState) => {
    const vx = 500 + (f.x - 0.5) * 160 * f.a;
    const vy = 150 - f.s * 60;
    const at = (side: -1 | 1, t: number) => {
      // t: 0 at the front edge, 1 at the vanishing point
      const bx = 500 + side * 340;
      return { x: bx + (vx - bx) * t, y: 600 + (vy - 600) * t };
    };
    return { vx, vy, at };
  };
  usePaint((f) => {
    const g = geo(f);
    const L = g.at(-1, 0.86);
    const R = g.at(1, 0.86);
    edges.current[0]?.setAttribute('d', `M160 600 L${L.x.toFixed(1)} ${L.y.toFixed(1)}`);
    edges.current[1]?.setAttribute('d', `M840 600 L${R.x.toFixed(1)} ${R.y.toFixed(1)}`);
    for (let i = 0; i < LAMPS; i++) {
      const t = (i + 0.5) / LAMPS * 0.84;
      const side = i % 2 ? 1 : -1;
      const p = g.at(side, t);
      const c = lamps.current[i];
      if (c) {
        c.setAttribute('cx', p.x.toFixed(1));
        c.setAttribute('cy', p.y.toFixed(1));
        c.setAttribute('r', (5 * (1 - t) + 1).toFixed(2));
      }
    }
    looks.forEach((_, i) => {
      const r = strips.current[i];
      if (!r) return;
      const t = ((i + 1) / (looks.length + 1)) * 0.78;
      const side = i % 2 ? 0.34 : -0.34;
      const L2 = g.at(-1, t);
      const R2 = g.at(1, t);
      const x = L2.x + (R2.x - L2.x) * (0.5 + side * 0.5);
      const scale = 1 - t;
      const h = 260 * scale + 14;
      const w = 26 * scale + 3;
      const near = f.a * Math.exp(-(((x / 1000 - f.x) ** 2) / 0.01));
      r.setAttribute('x', (x - w / 2).toFixed(1));
      r.setAttribute('y', (L2.y - h).toFixed(1));
      r.setAttribute('width', w.toFixed(1));
      r.setAttribute('height', h.toFixed(1));
      r.setAttribute('rx', (w / 2).toFixed(1));
      r.style.opacity = (0.55 + 0.45 * near).toFixed(3);
    });
  });
  const g0 = geo(REST);
  return (
    <svg className="runway" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="runway-strip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6df" />
          <stop offset="0.5" stopColor="#ff9fc8" />
          <stop offset="1" stopColor="#ff9fc8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="runway-floor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f2d6a2" stopOpacity="0.16" />
          <stop offset="1" stopColor="#f2d6a2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="runway-floor" d={`M160 600 L${g0.at(-1, 0.86).x} ${g0.at(-1, 0.86).y} L${g0.at(1, 0.86).x} ${g0.at(1, 0.86).y} L840 600 Z`} fill="url(#runway-floor)" />
      <path ref={(el) => void (edges.current[0] = el)} className="runway-edge" d="M160 600 L0 0" />
      <path ref={(el) => void (edges.current[1] = el)} className="runway-edge" d="M840 600 L0 0" />
      {Array.from({ length: LAMPS }, (_, i) => (
        <circle key={i} ref={(el) => void (lamps.current[i] = el)} className="runway-lamp" r="2" />
      ))}
      {looks.map((v, i) => (
        <rect key={v.id} ref={(el) => void (strips.current[i] = el)} data-vid={v.id} className="runway-strip" fill="url(#runway-strip)" />
      ))}
    </svg>
  );
}

/* ═════════════ playroom — the toy box ═════════════ */

const SHAPES = ['ball', 'block', 'pill', 'tri', 'star'] as const;

export function ToyBox({ videos }: { videos: Video[] }) {
  const toys = useMemo(() => {
    const list = videos.slice(0, 12);
    // an empty toy box still shows its outline toys — clearly hollow, never a title
    const n = list.length || 4;
    return Array.from({ length: n }, (_, i) => {
      const id = list[i]?.id ?? `empty-${i}`;
      const col = i % 4;
      const row = Math.floor(i / 4);
      return {
        id,
        vid: list[i]?.id,
        shape: SHAPES[Math.floor(hash01(id, 3) * SHAPES.length)],
        x: 0.14 + col * 0.24 + (hash01(id, 1) - 0.5) * 0.1,
        y: 0.24 + row * 0.3 + (hash01(id, 2) - 0.5) * 0.14,
        s: 0.75 + hash01(id, 4) * 0.5,
        hue: i % 4,
      };
    });
  }, [videos]);
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const api = usePaint((f) => {
    const host = api?.host.current;
    const el = box.current;
    if (!host || !el) return;
    const hr = host.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    if (!br.width) return;
    const px = (f.x * hr.width + hr.left - br.left) / br.width;
    const py = (f.y * hr.height + hr.top - br.top) / br.height;
    toys.forEach((t, i) => {
      const e = els.current[i];
      if (!e) return;
      const dx = t.x - px;
      const dy = t.y - py;
      const d = Math.max(0.05, Math.hypot(dx, dy));
      const push = (f.a * 0.06) / (d * 6 + 0.4);
      const bob = f.s * 40 * (hash01(t.id, 9) - 0.3);
      e.style.translate = `${((dx / d) * push * br.width).toFixed(1)}px ${((dy / d) * push * br.height - bob).toFixed(1)}px`;
      e.style.rotate = `${((dx / d) * push * 120).toFixed(1)}deg`;
    });
  });
  return (
    <div className={`toys ${videos.length ? '' : 'is-empty'}`} ref={box} aria-hidden="true">
      {toys.map((t, i) => (
        <span
          key={t.id}
          ref={(el) => void (els.current[i] = el)}
          data-vid={t.vid}
          className={`toy toy-${t.shape} toy-h${t.hue} ${t.vid ? '' : 'is-hollow'}`}
          style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, '--s': t.s } as CSSProperties}
        />
      ))}
    </div>
  );
}

/* ═════════════ broadsheet — the wire ═════════════ */

export function Wire({ videos }: { videos: Video[] }) {
  const cat = useCatalogue();
  const items = videos.slice(0, 6);
  if (!items.length)
    return (
      <div className="wire is-empty">
        <p className="wire-head">The wire</p>
        <p className="wire-none">No reports filed. Nothing appears here until a dated, sourced report is published.</p>
      </div>
    );
  return (
    <div className="wire">
      <p className="wire-head">The wire</p>
      <ol className="wire-list">
        {items.map((v) => (
          <li key={v.id} data-vid={v.id}>
            <span className="wire-date">{v.made ?? settingLabel(v)}</span>
            <Link to={cat.href(v.id)} className="wire-title" onClick={() => sound.play('transition')}>
              {v.title}
            </Link>
            <span className="wire-src">{sourceOf(v, PROVENANCE_LABEL[v.provenance])}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Masthead({ count }: { count: number }) {
  const [today] = useState(() => new Date());
  return (
    <div className="mast" aria-hidden="true">
      <span className="mast-rule" />
      <span className="mast-line">
        <span>{today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span>Monumental Streams</span>
        <span>{count ? `${count} ${count === 1 ? 'report' : 'reports'} on file` : 'No reports on file'}</span>
      </span>
      <span className="mast-rule is-double" />
    </div>
  );
}
