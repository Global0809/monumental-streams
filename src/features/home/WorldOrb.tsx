/**
 * The World preview's orb: a small canvas globe (orthographic projection, no WebGL) with the
 * Natural Earth land field as a dot membrane, the catalogue's routes as raised great-circle
 * arcs carrying slow pulses of light, and a pin for every destination with stories.
 *
 *  · It sways gently around the Atlantic, where today's stories live, and eases to centre a
 *    destination the viewer points at in the list.
 *  · Under a mouse, the land membrane brightens around the pointer and pins answer hover;
 *    a click opens the destination. On touch, a first tap selects, a second tap opens.
 *  · Dragging turns the globe (with inertia unless motion is reduced).
 *  · Reduced motion: no sway, no pulses, no inertia — it redraws only when something changes.
 *    Low-graphics devices get half the dots, no pulses and a 1× canvas.
 *
 * The canvas is decorative for assistive technology: the destination list beside it is the
 * accessible equivalent and drives the same selection.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { deviceTier } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';

export interface OrbHub {
  id: string;
  coords: [number, number];
  weight: number;
  gateway: boolean;
}

export interface OrbArc {
  from: [number, number];
  to: [number, number];
  /** Hub ids at either end, so a selected hub can light its own connections. */
  ends: string[];
}

interface Props {
  hubs: OrbHub[];
  arcs: OrbArc[];
  /** The selected hub: drawn in gold. */
  selected: string | null;
  /** Turn the globe to face this hub (set from the list, not from hovering the globe). */
  centreOn: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Floating label positioned over the selected hub every frame. */
  tip: RefObject<HTMLElement | null>;
  label: string;
}

const D2R = Math.PI / 180;
const HOME = { lon: -48, lat: 26 }; // the Atlantic: the Caribbean, New York and London in one view
const SWAY_DEG = 24;
const SWAY_MS = 64_000;
/** Globe radius as a share of the canvas: leaves room for the halo inside the canvas edge. */
const RADIUS = 0.4;

let dotsPromise: Promise<Float32Array | null> | null = null;
/** Land dots as unit vectors [x, y, z, …], fetched once per session. */
function loadDots(): Promise<Float32Array | null> {
  if (!dotsPromise) {
    dotsPromise = fetch('/data/globe-dots.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ points: number[] }>) : null))
      .then((d) => {
        if (!d?.points?.length) return null;
        const n = d.points.length / 2;
        const out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const lat = d.points[i * 2] * D2R;
          const lon = d.points[i * 2 + 1] * D2R;
          out[i * 3] = Math.cos(lat) * Math.cos(lon);
          out[i * 3 + 1] = Math.cos(lat) * Math.sin(lon);
          out[i * 3 + 2] = Math.sin(lat);
        }
        return out;
      })
      .catch(() => {
        dotsPromise = null; // allow a retry on the next mount
        return null;
      });
  }
  return dotsPromise;
}

const unit = ([lat, lon]: [number, number]): [number, number, number] => [
  Math.cos(lat * D2R) * Math.cos(lon * D2R),
  Math.cos(lat * D2R) * Math.sin(lon * D2R),
  Math.sin(lat * D2R),
];

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

function rgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export default function WorldOrb({ hubs, arcs, selected, centreOn, onHover, onSelect, onOpen, tip, label }: Props) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // everything the frame loop reads lives in one mutable bag so props never restart it
  const live = useRef({ hubs, arcs, selected, onHover, onSelect, onOpen, reduced });
  live.current = { hubs, arcs, selected, onHover, onSelect, onOpen, reduced };
  const engine = useRef<{ centre: (id: string | null) => void; wake: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = wrapRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tier = deviceTier();
    const css = getComputedStyle(document.documentElement);
    const C = {
      iris: rgb(css.getPropertyValue('--iris'), [179, 163, 255]),
      gold: rgb(css.getPropertyValue('--gold'), [242, 214, 162]),
      pearl: rgb(css.getPropertyValue('--pearl'), [243, 239, 252]),
      lilac: rgb(css.getPropertyValue('--lilac'), [205, 197, 228]),
      frost: rgb(css.getPropertyValue('--frost'), [159, 220, 255]),
    };

    let dots: Float32Array | null = null;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = false;
    let last = performance.now();
    let swayPhase = 0;
    let swayBase = { ...HOME };
    let idleSince = 0;
    const view = { lon: HOME.lon, lat: HOME.lat };
    const vel = { lon: 0, lat: 0 };
    let target: { lon: number; lat: number } | null = null;
    const pointer = { x: -1, y: -1, inside: false, down: false, dragged: false, sx: 0, sy: 0, type: 'mouse', id: -1 };
    let hoverId: string | null = null;
    let screen: { id: string; x: number; y: number; r: number; on: boolean }[] = [];

    const animated = () => !live.current.reduced && tier !== 'low';

    // per-frame view basis
    let cl = 1;
    let sl = 0;
    let cp = 1;
    let sp = 0;
    const basis = () => {
      cl = Math.cos(view.lon * D2R);
      sl = Math.sin(view.lon * D2R);
      cp = Math.cos(view.lat * D2R);
      sp = Math.sin(view.lat * D2R);
    };
    /** Earth unit vector → view [X right, Y up, Z toward the viewer]. */
    const project = (x: number, y: number, z: number, out: Float64Array) => {
      const v1x = x * cl + y * sl;
      const v1y = -x * sl + y * cl;
      out[0] = v1y;
      out[1] = cp * z - sp * v1x;
      out[2] = sp * z + cp * v1x;
    };
    const P = new Float64Array(3);

    const pointerGeo = (R: number, cx: number, cy: number): [number, number, number] | null => {
      if (!pointer.inside || pointer.type !== 'mouse') return null;
      const X = (pointer.x - cx) / R;
      const Y = (cy - pointer.y) / R;
      const rr = X * X + Y * Y;
      if (rr > 1) return null;
      const Z = Math.sqrt(1 - rr);
      const v1x = cp * Z - sp * Y;
      const v1z = sp * Z + cp * Y;
      const v1y = X;
      return [v1x * cl - v1y * sl, v1x * sl + v1y * cl, v1z];
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1 : 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      kick();
    };

    // bucketed dot buffers (one path per bucket keeps fillStyle changes to a handful)
    const BUCKETS = 6;
    let buf: Float32Array[] = [];
    let len: number[] = [];
    const ensureBuffers = (n: number) => {
      if (buf.length && buf[0].length >= n * 2) return;
      buf = Array.from({ length: BUCKETS }, () => new Float32Array(n * 2));
      len = new Array(BUCKETS).fill(0);
    };

    const draw = (now: number) => {
      const R = Math.min(w, h) * RADIUS;
      const cx = w / 2;
      const cy = h / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      basis();

      // atmosphere: a lavender halo that breathes very slightly
      const breath = animated() ? 0.025 * Math.sin(now / 2400) : 0;
      const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * (1.22 + breath));
      halo.addColorStop(0, rgba(C.iris, 0.32));
      halo.addColorStop(0.35, rgba(C.iris, 0.1));
      halo.addColorStop(1, rgba(C.iris, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // the body: deep violet with a light from the upper left
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.05, cx, cy, R);
      body.addColorStop(0, '#3a2d63');
      body.addColorStop(0.45, '#1c1532');
      body.addColorStop(1, '#0c0916');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // land membrane
      const geo = pointerGeo(R, cx, cy);
      const litCos = Math.cos(17 * D2R);
      if (dots) {
        const step = tier === 'low' ? 2 : 1;
        const n = dots.length / 3;
        ensureBuffers(n);
        len.fill(0);
        for (let i = 0; i < n; i += step) {
          const x = dots[i * 3];
          const y = dots[i * 3 + 1];
          const z = dots[i * 3 + 2];
          project(x, y, z, P);
          const Z = P[2];
          if (Z <= 0.02) continue;
          let b = Z < 0.3 ? 0 : Z < 0.6 ? 1 : 2;
          if (geo) {
            const d = x * geo[0] + y * geo[1] + z * geo[2];
            if (d > litCos) b = (d - litCos) / (1 - litCos) > 0.45 ? 5 : 4;
          }
          const k = len[b];
          buf[b][k] = cx + R * P[0];
          buf[b][k + 1] = cy - R * P[1];
          len[b] = k + 2;
        }
        const style: [string, number][] = [
          [rgba(C.lilac, 0.22), 1.1],
          [rgba(C.lilac, 0.42), 1.3],
          [rgba(C.pearl, 0.62), 1.5],
          ['', 0],
          [rgba(C.iris, 0.85), 1.8],
          [rgba(C.pearl, 0.95), 2.2],
        ];
        for (let b = 0; b < BUCKETS; b++) {
          if (!len[b]) continue;
          const [fill, s] = style[b];
          ctx.fillStyle = fill;
          ctx.beginPath();
          const arr = buf[b];
          const half = s / 2;
          for (let k = 0; k < len[b]; k += 2) ctx.rect(arr[k] - half, arr[k + 1] - half, s, s);
          ctx.fill();
        }
      }

      // limb: a thin chrome rim
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, rgba(C.pearl, 0.55));
      rim.addColorStop(0.5, rgba(C.iris, 0.12));
      rim.addColorStop(1, rgba(C.iris, 0.4));
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // connections: raised great circles, pulses of light travelling along them
      const sel = live.current.selected;
      const pulses = animated();
      const list = live.current.arcs;
      for (let a = 0; a < list.length; a++) {
        const arc = list[a];
        const A = unit(arc.from);
        const B = unit(arc.to);
        const dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
        const om = Math.acos(dot);
        if (om < 1e-4) continue;
        const so = Math.sin(om);
        const lift = 0.05 + 0.24 * (om / Math.PI);
        const hot = !!sel && arc.ends.includes(sel);
        const N = 40;
        const pts: (null | [number, number])[] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const s1 = Math.sin((1 - t) * om) / so;
          const s2 = Math.sin(t * om) / so;
          const e = 1 + lift * Math.sin(Math.PI * t);
          project((A[0] * s1 + B[0] * s2) * e, (A[1] * s1 + B[1] * s2) * e, (A[2] * s1 + B[2] * s2) * e, P);
          const on = P[2] > 0 || P[0] * P[0] + P[1] * P[1] > 1;
          pts.push(on ? [cx + R * P[0], cy - R * P[1]] : null);
        }
        ctx.strokeStyle = hot ? rgba(C.gold, 0.85) : rgba(C.iris, 0.42);
        ctx.lineWidth = hot ? 1.7 : 1.1;
        ctx.beginPath();
        let pen = false;
        for (const p of pts) {
          if (!p) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
          pen = true;
        }
        ctx.stroke();
        if (pulses) {
          const t = (now / 5200 + a * 0.37) % 1;
          const p = pts[Math.round(t * N)];
          if (p) {
            const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7);
            g.addColorStop(0, rgba(hot ? C.gold : C.pearl, 0.95));
            g.addColorStop(1, rgba(hot ? C.gold : C.iris, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // destinations
      screen = [];
      const tipEl = tip.current;
      let tipPlaced = false;
      for (const hub of live.current.hubs) {
        const [x, y, z] = unit(hub.coords);
        project(x, y, z, P);
        const on = P[2] > 0.08;
        const sx = cx + R * P[0];
        const sy = cy - R * P[1];
        const r = 3.4 + Math.sqrt(hub.weight) * 1.7;
        screen.push({ id: hub.id, x: sx, y: sy, r, on });
        if (!on) continue;
        const isSel = hub.id === sel;
        const isHover = hub.id === hoverId;
        const tone = isSel ? C.gold : C.iris;
        const fade = Math.min(1, (P[2] - 0.08) / 0.25);
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4.2);
        glow.addColorStop(0, rgba(tone, 0.5 * fade));
        glow.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(isSel ? C.gold : C.pearl, (isSel || isHover ? 0.95 : 0.5) * fade);
        ctx.lineWidth = isSel ? 1.6 : 1;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        if (hub.gateway) {
          // the gateway carries a slow orbit
          ctx.setLineDash([2, 4]);
          ctx.lineDashOffset = pulses ? -now / 120 : 0;
          ctx.strokeStyle = rgba(C.gold, 0.6 * fade);
          ctx.beginPath();
          ctx.arc(sx, sy, r + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (isSel && pulses) {
          const k = (now % 2200) / 2200;
          ctx.strokeStyle = rgba(C.gold, (1 - k) * 0.7 * fade);
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4 + k * 16, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = rgba(isSel ? C.gold : C.pearl, fade);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (isSel && tipEl) {
          tipEl.style.transform = `translate(${sx.toFixed(1)}px, ${(sy - r - 12).toFixed(1)}px)`;
          tipEl.dataset.on = '';
          tipPlaced = true;
        }
      }
      if (tipEl && !tipPlaced) delete tipEl.dataset.on;
    };

    const step = (now: number) => {
      raf = 0;
      const dt = Math.min(64, now - last);
      last = now;
      let moving = false;
      if (!pointer.dragged || !pointer.down) {
        if (target) {
          if (live.current.reduced) {
            view.lon = target.lon;
            view.lat = target.lat;
          } else {
            const k = 1 - Math.pow(0.0025, dt / 1000);
            view.lon = wrap(view.lon + wrap(target.lon - view.lon) * k);
            view.lat += (target.lat - view.lat) * k;
          }
          if (Math.abs(wrap(target.lon - view.lon)) < 0.05 && Math.abs(target.lat - view.lat) < 0.05) {
            view.lon = target.lon;
            view.lat = target.lat;
          } else moving = true;
          swayBase = { ...view };
          swayPhase = 0;
        } else if (!live.current.reduced && (Math.abs(vel.lon) > 0.01 || Math.abs(vel.lat) > 0.01)) {
          view.lon = wrap(view.lon + vel.lon);
          view.lat = Math.max(-50, Math.min(60, view.lat + vel.lat));
          vel.lon *= 0.93;
          vel.lat *= 0.93;
          swayBase = { ...view };
          swayPhase = 0;
          moving = true;
        } else if (animated() && now - idleSince > 2400) {
          swayPhase += (dt / SWAY_MS) * Math.PI * 2;
          view.lon = wrap(swayBase.lon + SWAY_DEG * Math.sin(swayPhase));
          // drift back toward the Atlantic's latitude
          swayBase.lat += (HOME.lat - swayBase.lat) * 0.002;
          view.lat = swayBase.lat;
        }
      }
      draw(now);
      if (visible && !document.hidden && (animated() || moving)) raf = requestAnimationFrame(step);
    };

    function kick() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    }

    const hit = (x: number, y: number) => {
      let best: string | null = null;
      let bestD = Infinity;
      for (const s of screen) {
        if (!s.on) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < Math.max(16, s.r + 8) && d < bestD) {
          best = s.id;
          bestD = d;
        }
      }
      return best;
    };
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const setHover = (id: string | null) => {
      if (id === hoverId) return;
      hoverId = id;
      canvas.style.cursor = id ? 'pointer' : pointer.down ? 'grabbing' : 'grab';
      live.current.onHover(id);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = local(e);
      Object.assign(pointer, { down: true, dragged: false, sx: p.x, sy: p.y, x: p.x, y: p.y, type: e.pointerType, id: e.pointerId });
      vel.lon = 0;
      vel.lat = 0;
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      pointer.type = e.pointerType;
      if (pointer.down && e.pointerId === pointer.id) {
        if (!pointer.dragged && Math.hypot(p.x - pointer.sx, p.y - pointer.sy) > 5) {
          pointer.dragged = true;
          target = null;
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
            /* capture is best-effort */
          }
          canvas.style.cursor = 'grabbing';
        }
        if (pointer.dragged) {
          const k = 57.3 / (Math.min(w, h) * RADIUS);
          view.lon = wrap(view.lon - dx * k);
          view.lat = Math.max(-50, Math.min(60, view.lat + dy * k));
          vel.lon = -dx * k;
          vel.lat = dy * k;
          idleSince = performance.now();
          swayBase = { ...view };
          swayPhase = 0;
        }
      } else if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        setHover(hit(p.x, p.y));
      }
      kick();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointer.down || e.pointerId !== pointer.id) return;
      const p = local(e);
      const wasDrag = pointer.dragged;
      pointer.down = false;
      pointer.dragged = false;
      idleSince = performance.now();
      canvas.style.cursor = hoverId ? 'pointer' : 'grab';
      if (wasDrag) {
        kick();
        return;
      }
      const id = hit(p.x, p.y);
      if (!id) return;
      if (e.pointerType === 'touch' && live.current.selected !== id) live.current.onSelect(id);
      else live.current.onOpen(id);
    };
    const onCancel = () => {
      pointer.down = false;
      pointer.dragged = false;
    };
    const onLeave = () => {
      pointer.inside = false;
      if (!pointer.down) setHover(null);
      kick();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.style.cursor = 'grab';

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting;
        if (visible) kick();
      },
      { rootMargin: '120px' },
    );
    io.observe(host);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVis);

    let alive = true;
    loadDots().then((d) => {
      if (!alive) return;
      dots = d;
      kick();
    });

    engine.current = {
      centre(id) {
        const hub = id ? live.current.hubs.find((x) => x.id === id) : null;
        if (!hub) {
          target = null;
          idleSince = performance.now();
          kick();
          return;
        }
        target = { lon: hub.coords[1], lat: Math.max(-20, Math.min(45, hub.coords[0])) };
        vel.lon = 0;
        vel.lat = 0;
        idleSince = performance.now();
        kick();
      },
      wake: kick,
    };
    resize();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      engine.current = null;
    };
  }, [tip]);

  useEffect(() => {
    engine.current?.centre(centreOn);
  }, [centreOn]);

  // a selection or motion change needs a fresh frame even when the loop is idle
  useEffect(() => {
    engine.current?.wake();
  }, [selected, reduced, hubs, arcs]);

  return (
    <div ref={wrapRef} className="home-orb-canvas">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
