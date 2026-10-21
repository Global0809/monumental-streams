/**
 * The flat map — the 2D alternative to the living globe (and its fallback where the stage
 * cannot run). The same places and routes, seen through the same lens, drawn over Natural Earth
 * land in equirectangular space (viewBox 0 0 360 180). Zoom with the buttons, the wheel, a pinch
 * or +/−; pan by dragging or with the arrow keys. Every node is a real link, so the map is fully
 * keyboard navigable, and pointing at one lights the same place everywhere else (setHotPlace).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router';
import { sound } from '../../systems/sound/engine.ts';
import { loadLand, type LandPaths } from './data.ts';
import { eqX, eqY, mapArc, placeLabels, textWidth, type StageNode, type StageRoute } from './model.ts';
import { setHotPlace, ZoomControls } from './parts.tsx';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 0.35;
const MAX_W = 380;
const LOCAL_W = 9; // neighbourhood-level nodes appear below this width (degrees)

const GRID = (() => {
  let d = '';
  for (let x = 0; x <= 360; x += 30) d += `M${x} 0V180`;
  for (let y = 0; y <= 180; y += 30) d += `M0 ${y}H360`;
  return d;
})();

function boxFor(f: { cx: number; cy: number; w: number }, aspect: number): Box {
  let w = Math.min(MAX_W, Math.max(MIN_W, f.w));
  let h = w / aspect;
  if (h > 200) {
    h = 200;
    w = Math.min(MAX_W, h * aspect);
  }
  return { x: f.cx - w / 2, y: f.cy - h / 2, w, h };
}

function clampBox(b: Box): Box {
  const cx = Math.max(-20, Math.min(380, b.x + b.w / 2));
  const cy = Math.max(-10, Math.min(190, b.y + b.h / 2));
  return { ...b, x: cx - b.w / 2, y: cy - b.h / 2 };
}

export interface MapViewProps {
  nodes: StageNode[];
  routes: StageRoute[];
  focus: { cx: number; cy: number; w: number };
  focusKey: string;
  reduced: boolean;
  hrefFor: (slug: string) => string;
}

export default function MapView({ nodes, routes, focus, focusKey, reduced, hrefFor }: MapViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [land, setLand] = useState<LandPaths | null>(null);
  const [px, setPx] = useState({ w: 900, h: 560 });
  const [vb, setVb] = useState<Box>(() => boxFor(focus, 900 / 560));
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const anim = useRef(0);
  const [hot, setHot] = useState<string | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    let alive = true;
    loadLand()
      .then((l) => alive && setLand(l))
      .catch(() => alive && setLand(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      setPx((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stop = () => {
    cancelAnimationFrame(anim.current);
    anim.current = 0;
  };
  useEffect(() => stop, []);

  const animateTo = useCallback((target: Box) => {
    stop();
    if (reducedRef.current) {
      setVb(target);
      return;
    }
    const from = vbRef.current;
    const t0 = performance.now();
    const dur = 620;
    // Interpolate the centre linearly and the width geometrically — zooms feel even.
    const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const w = from.w * Math.pow(target.w / from.w, e);
      const h = from.h * Math.pow(target.h / from.h, e);
      const cx = fc.x + (tc.x - fc.x) * e;
      const cy = fc.y + (tc.y - fc.y) * e;
      setVb({ x: cx - w / 2, y: cy - h / 2, w, h });
      anim.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  // Fly to the selection whenever it changes.
  useEffect(() => {
    animateTo(boxFor(focus, px.w / px.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Keep the aspect in step with the element on resize.
  useEffect(() => {
    setVb((v) => {
      const h = v.w / (px.w / px.h);
      return { x: v.x, y: v.y + (v.h - h) / 2, w: v.w, h };
    });
  }, [px]);

  const zoomAt = useCallback((factor: number, ux?: number, uy?: number) => {
    stop();
    setVb((v) => {
      const w = Math.max(MIN_W, Math.min(MAX_W, v.w * factor));
      const k = w / v.w;
      const ax = ux ?? v.x + v.w / 2;
      const ay = uy ?? v.y + v.h / 2;
      return clampBox({ x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k, w, h: v.h * k });
    });
  }, []);

  // Wheel zoom about the pointer (non-passive so the page does not scroll underneath).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const v = vbRef.current;
      const ux = v.x + ((e.clientX - r.left) / r.width) * v.w;
      const uy = v.y + ((e.clientY - r.top) / r.height) * v.h;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(Math.max(-60, Math.min(60, dy)) * 0.0024), ux, uy);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Drag to pan, pinch to zoom. A drag never turns into a click on a node.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vb: Box; moved: boolean; pinch?: { d: number; vb: Box } } | null>(null);
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stop();
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, vb: vbRef.current, moved: false };
    else if (ptrs.current.size === 2 && drag.current) {
      const [a, b] = [...ptrs.current.values()];
      drag.current.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: vbRef.current };
      drag.current.moved = true;
    }
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    if (d.pinch && ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const k = d.pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const v = d.pinch.vb;
      const w = Math.max(MIN_W, Math.min(MAX_W, v.w * k));
      const s = w / v.w;
      setVb(clampBox({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - v.h * s) / 2, w, h: v.h * s }));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* optional */
      }
    }
    const upp = d.vb.w / r.width;
    setVb(clampBox({ ...d.vb, x: d.vb.x - dx * upp, y: d.vb.y - dy * upp }));
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      const moved = drag.current?.moved;
      drag.current = null;
      if (moved) {
        // Swallow the click that follows a drag so links do not fire.
        const swallow = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // links keep their own keys
    const v = vbRef.current;
    const step = v.w * 0.12;
    const pan = (dx: number, dy: number) => {
      stop();
      setVb(clampBox({ ...v, x: v.x + dx, y: v.y + dy }));
    };
    switch (e.key) {
      case 'ArrowLeft':
        pan(-step, 0);
        break;
      case 'ArrowRight':
        pan(step, 0);
        break;
      case 'ArrowUp':
        pan(0, -step);
        break;
      case 'ArrowDown':
        pan(0, step);
        break;
      case '+':
      case '=':
        zoomAt(0.7);
        break;
      case '-':
      case '_':
        zoomAt(1.4);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const upp = vb.w / Math.max(1, px.w);
  const showLocal = vb.w <= LOCAL_W;
  const visible = useMemo(
    () => nodes.filter((n) => n.level === 'city' || showLocal || n.state >= 2),
    [nodes, showLocal],
  );

  // Labels: selected, persistent and focused/hovered first; when zoomed in, everything that fits.
  const labels = useMemo(() => {
    const inView = visible.filter((n) => {
      const x = eqX(n.lon);
      const y = eqY(n.lat);
      return x >= vb.x - vb.w * 0.05 && x <= vb.x + vb.w * 1.05 && y >= vb.y - vb.h * 0.05 && y <= vb.y + vb.h * 1.05;
    });
    const rank = (n: StageNode) => (n.state === 3 ? 0 : n.id === hot ? 1 : n.label ? 2 : 3);
    const ordered = [...inView].sort((a, b) => rank(a) - rank(b) || b.size - a.size);
    const chosen = ordered.filter((n) => rank(n) < 3 || vb.w <= 40);
    const items = chosen.map((n) => ({
      id: n.id,
      x: (eqX(n.lon) - vb.x) / upp,
      y: (eqY(n.lat) - vb.y) / upp,
      r: n.size / 2 + 2,
      w: textWidth(n.name, 12) + 6,
      h: 18,
      optional: rank(n) >= 2,
    }));
    return placeLabels(items, { w: px.w, h: px.h });
  }, [visible, vb, upp, px, hot]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const f = (v: number) => Number(v.toFixed(4));

  return (
    <div
      ref={wrapRef}
      className="atlas-map"
      tabIndex={0}
      role="group"
      aria-label="Flat map. Arrow keys pan, plus and minus zoom; Tab moves between places."
      onKeyDown={onKeyDown}
    >
      <svg
        ref={svgRef}
        className="atlas-map-svg"
        viewBox={`${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-cursor="drag"
        data-cursor-label="Pan"
        data-motion={reduced ? 'still' : 'live'}
      >
        <rect x={-400} y={-200} width={1160} height={580} className="atlas-map-sea" />
        <path d={GRID} className="atlas-map-grid" vectorEffect="non-scaling-stroke" />
        {land ? <path d={land.d} className="atlas-map-land" vectorEffect="non-scaling-stroke" /> : null}
        <g aria-hidden="true">
          {routes.map((r) => (
            <g key={r.id} className={`atlas-map-route atlas-k-${r.kind}`} data-state={r.state}>
              <path d={mapArc(r.from, r.to)} className="atlas-map-route-line" vectorEffect="non-scaling-stroke" />
              {r.state >= 1 ? <path d={mapArc(r.from, r.to)} className="atlas-map-route-pulse" pathLength={100} vectorEffect="non-scaling-stroke" /> : null}
            </g>
          ))}
        </g>
        <g>
          {visible.map((n) => {
            const x = eqX(n.lon);
            const y = eqY(n.lat);
            const r = (n.size / 2) * upp;
            return (
              <Link
                key={n.id}
                to={hrefFor(n.slug)}
                className="atlas-mnode"
                data-state={n.state}
                data-expanding={n.expanding || undefined}
                data-gateway={n.gateway || undefined}
                aria-label={`${n.name}${n.meta ? `, ${n.meta}` : ''}`}
                aria-current={n.state === 3 ? 'page' : undefined}
                data-cursor="open"
                data-cursor-label={n.name}
                onPointerEnter={() => (setHot(n.id), setHotPlace(n.id))}
                onPointerLeave={() => (setHot((h) => (h === n.id ? null : h)), setHotPlace(null))}
                onFocus={() => (setHot(n.id), setHotPlace(n.id))}
                onBlur={() => (setHot((h) => (h === n.id ? null : h)), setHotPlace(null))}
                onClick={() => sound.play('select')}
              >
                <circle cx={x} cy={y} r={r + 9 * upp} className="atlas-mnode-hit" />
                {!n.expanding ? <circle cx={x} cy={y} r={r * 2.1} className="atlas-mnode-halo" /> : null}
                {n.gateway ? <circle cx={x} cy={y} r={r * 1.7} className="atlas-mnode-beacon" vectorEffect="non-scaling-stroke" /> : null}
                <circle cx={x} cy={y} r={r} className="atlas-mnode-core" vectorEffect="non-scaling-stroke" />
                {n.state === 3 ? <circle cx={x} cy={y} r={r + 6 * upp} className="atlas-mnode-ring" vectorEffect="non-scaling-stroke" /> : null}
              </Link>
            );
          })}
        </g>
        <g aria-hidden="true" className="atlas-map-labels">
          {labels.map((l) => {
            const n = byId.get(l.id);
            if (!n) return null;
            const nx = eqX(n.lon);
            const ny = eqY(n.lat);
            const tx = vb.x + (l.x + 3) * upp;
            const ty = vb.y + (l.y + 13) * upp;
            return (
              <g key={l.id} data-state={n.state} data-expanding={n.expanding || undefined}>
                {l.leader ? (
                  <line
                    x1={nx}
                    y1={ny}
                    x2={vb.x + Math.max(l.x, Math.min(l.x + textWidth(n.name, 12) + 6, (nx - vb.x) / upp)) * upp}
                    y2={vb.y + Math.max(l.y, Math.min(l.y + 18, (ny - vb.y) / upp)) * upp}
                    className="atlas-map-leader"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                <text x={tx} y={ty} fontSize={12 * upp} strokeWidth={3.2 * upp} className="atlas-map-label">
                  {n.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {!land ? <p className="atlas-map-note">Drawing the coastline…</p> : null}
      <p className="atlas-map-credit">Land from Natural Earth, public domain</p>
      <ZoomControls onIn={() => zoomAt(0.65)} onOut={() => zoomAt(1.5)} onReset={() => animateTo(boxFor(focus, px.w / px.h))} resetLabel={focusKey === 'world' ? 'Back to the whole world' : 'Recentre on the selection'} />
    </div>
  );
}
