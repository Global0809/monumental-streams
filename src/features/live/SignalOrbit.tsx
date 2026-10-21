/**
 * The signal orbit — Live's instrument. A ring of real days ahead ("now" at the top, running
 * clockwise to the horizon) with a node for every dated change on the schedule, each tethered
 * by a vessel to the membrane at the centre. The membrane carries the signal line: flat,
 * because nothing is broadcasting. Under a fine pointer the membrane gives a little where you
 * touch it (it is listening); the line always settles flat again.
 *
 * The SVG is one labelled image; the schedule list beside it is the accessible, operable
 * version. Hovering a node lights its card (and vice versa); clicking a node takes you there.
 * Reduced motion and low-tier devices get a still instrument.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { finePointer, deviceTier } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { dayParts, daysUntil, monthTicks, orbitAngle, untilLabel, type ScheduleEntry } from './model.ts';

const VB = 560;
const C = VB / 2;
const R_RING = 214;
const R_CORE = 118;
const L0 = C - R_CORE + 14;
const L1 = C + R_CORE - 14;

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

/** The signal line: flat, or with a soft bump of height `a` (svg units) centred on `x`. */
export function signalPath(x: number, a: number): string {
  const pts: string[] = [];
  for (let px = L0; px <= L1 + 0.1; px += 6) {
    const pin = Math.sin((Math.PI * (px - L0)) / (L1 - L0)); // ends stay pinned to the membrane
    const y = C - a * pin * Math.exp(-(((px - x) / 40) ** 2));
    pts.push(`${pts.length ? 'L' : 'M'}${px.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function SignalOrbit({
  entries,
  now,
  horizon,
  active,
  onActive,
  onPick,
  label,
  coreLine,
}: {
  entries: ScheduleEntry[];
  now: Date;
  horizon: number;
  active: string | null;
  onActive: (key: string | null) => void;
  onPick: (key: string) => void;
  label: string;
  coreLine: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const reduced = useReducedMotion();
  const [lite] = useState(() => deviceTier() === 'low');
  const ticks = useMemo(() => monthTicks(now, horizon), [now, horizon]);

  // The listening membrane: rAF-eased, only while the pointer is over the instrument.
  useEffect(() => {
    const el = wrap.current;
    const path = line.current;
    if (!el || !path || reduced || lite || !finePointer()) return;
    let raf = 0;
    let x = C;
    let a = 0;
    let tx = C;
    let ta = 0;
    const step = () => {
      x += (tx - x) * 0.2;
      a += (ta - a) * 0.12;
      path.setAttribute('d', signalPath(x, a));
      raf = Math.abs(ta - a) > 0.05 || Math.abs(tx - x) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const sx = ((e.clientX - r.left) / r.width) * VB;
      const sy = ((e.clientY - r.top) / r.height) * VB;
      const dy = sy - C;
      const inside = Math.hypot(sx - C, dy) < R_CORE + 40;
      tx = Math.min(L1, Math.max(L0, sx));
      // the membrane leans toward the touch, more the closer it is to the line
      ta = inside ? Math.sign(-dy || 1) * Math.max(0, 1 - Math.abs(dy) / (R_CORE + 40)) * 34 : 0;
      kick();
    };
    const leave = () => {
      ta = 0;
      kick();
    };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      path.setAttribute('d', signalPath(C, 0));
    };
  }, [reduced, lite]);

  const nodes = entries.map((e) => {
    const days = daysUntil(e.date, now);
    const deg = orbitAngle(days, horizon);
    const [nx, ny] = polar(deg, R_RING);
    const [cx, cy] = polar(deg, R_CORE + 4);
    const [qx, qy] = polar(deg + (deg > 180 ? 14 : -14), (R_RING + R_CORE) / 2);
    return { e, deg, nx, ny, vessel: `M${nx.toFixed(1)} ${ny.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}` };
  });
  // the soonest change carries its label until the viewer points at another
  const shown = nodes.find((n) => n.e.key === active) ?? nodes[0] ?? null;
  // a frost arc measures the real time between now and the next dated change
  const gap = nodes[0] ? nodes[0].deg : 0;
  const [gx, gy] = polar(gap, R_RING);
  const weeks = Array.from({ length: Math.floor(horizon / 7) }, (_, i) => polar(orbitAngle((i + 1) * 7, horizon), R_RING));

  return (
    <div ref={wrap} className={`live-orbit ${lite ? 'is-lite' : ''}`}>
      <svg viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label={label} className="live-orbit-svg">
        <defs>
          <radialGradient id="live-membrane" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#3a2a86" stopOpacity="0.75" />
            <stop offset="58%" stopColor="#1e1829" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0a0811" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="live-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="48%" stopColor="#8a82a1" stopOpacity="0.5" />
            <stop offset="52%" stopColor="#2b2539" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#d9d0f2" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="live-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b3a3ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#b3a3ff" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* the day ring */}
        <circle cx={C} cy={C} r={R_RING} className="live-ring" />
        <circle cx={C} cy={C} r={R_RING + 18} className="live-ring live-ring-faint" />
        {weeks.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.6} className="live-week" />
        ))}
        {gap > 0.5 ? (
          <path d={`M${C} ${C - R_RING} A${R_RING} ${R_RING} 0 ${gap > 180 ? 1 : 0} 1 ${gx.toFixed(1)} ${gy.toFixed(1)}`} className="live-gap" />
        ) : null}
        {ticks.map((t) => {
          const deg = orbitAngle(t.days, horizon);
          const [x1, y1] = polar(deg, R_RING - 7);
          const [x2, y2] = polar(deg, R_RING + 7);
          const [lx, ly] = polar(deg, R_RING + 34);
          return (
            <g key={t.days} className="live-tick">
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
              {/* where the node's label is shown, it wins over a month name in the same place */}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className={shown && Math.abs(shown.deg - deg) < 10 ? 'is-near' : undefined}>
                {t.label}
              </text>
            </g>
          );
        })}

        {/* the listening sweep: it turns while the instrument waits for a signal */}
        <g className="live-sweep">
          <path d={`M${C} ${C - R_RING} A${R_RING} ${R_RING} 0 0 1 ${polar(64, R_RING)[0]} ${polar(64, R_RING)[1]}`} stroke="url(#live-sweep)" />
        </g>

        {/* now */}
        <g className="live-now-mark">
          <line x1={C} y1={C - R_RING - 16} x2={C} y2={C - R_RING + 16} />
          <circle cx={C} cy={C - R_RING} r={5} />
          <text x={C} y={C - R_RING - 30} textAnchor="middle">
            Now
          </text>
        </g>

        {/* vessels feeding each dated change into the membrane */}
        {nodes.map((n) => (
          <path key={`v-${n.e.key}`} d={n.vessel} className={`live-vessel is-${n.e.kind} ${active === n.e.key ? 'is-on' : ''}`} />
        ))}

        {/* the membrane and its signal line */}
        <circle cx={C} cy={C} r={R_CORE} fill="url(#live-membrane)" />
        <circle cx={C} cy={C} r={R_CORE} className="live-core-rim" stroke="url(#live-rim)" />
        <circle cx={C} cy={C} r={R_CORE - 16} className="live-core-inner" />
        <path ref={line} d={signalPath(C, 0)} className="live-signal" />
        <text x={C} y={C + 44} textAnchor="middle" className="live-core-word">
          {coreLine}
        </text>
        <text x={C} y={C - 34} textAnchor="middle" className="live-core-kicker">
          Signal
        </text>

        {/* dated nodes */}
        {nodes.map((n) => (
          <g
            key={n.e.key}
            className={`live-node is-${n.e.kind} ${active === n.e.key ? 'is-on' : ''}`}
            onPointerEnter={() => onActive(n.e.key)}
            onPointerLeave={() => onActive(null)}
            onClick={() => onPick(n.e.key)}
          >
            <circle cx={n.nx} cy={n.ny} r={22} className="live-node-hit" />
            <circle cx={n.nx} cy={n.ny} r={14} className="live-node-halo" />
            <circle cx={n.nx} cy={n.ny} r={7} className="live-node-dot" />
          </g>
        ))}
      </svg>
      {shown ? (
        <p className="live-orbit-tip" aria-hidden="true" style={{ left: `${(shown.nx / VB) * 100}%`, top: `${(shown.ny / VB) * 100}%` }} data-side={shown.deg > 120 && shown.deg < 240 ? 'below' : shown.deg >= 240 ? 'left' : 'right'}>
          <b>{shown.e.title}</b>
          <span>
            {dayParts(shown.e.date).long} · {untilLabel(daysUntil(shown.e.date, now))}
          </span>
        </p>
      ) : null}
    </div>
  );
}
