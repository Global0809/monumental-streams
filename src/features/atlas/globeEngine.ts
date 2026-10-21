/**
 * The vascular globe — a Three.js engine with no React inside.
 *
 * Violet-night sphere with a soft lavender atmosphere + pearl/lilac land dot field + faint
 * graticule; places as nodes (active = iris discs with pearl cores that pulse, expanding = hollow
 * frost rings, gateway = pearl beacon); routes as lifted great-circle tubes coloured by kind
 * (migration iris, influence frost, exchange gold, programme pearl) with light flowing from → to. Renders on demand: the loop runs
 * only while something moves (fly-to, inertia, idle rotation, pulses for a while after the last
 * wake) and stops when settled, hidden or offscreen. Everything is disposed on dispose().
 *
 * Loaded only through a dynamic import from GlobeView, so three.js never enters the main bundle.
 */
import * as THREE from 'three';
import { angularDistance, arcPoints, toVec, type CameraTarget } from './model.ts';

export type RouteKind = 'migration' | 'influence' | 'exchange' | 'programme';

export interface EngineNode {
  id: string;
  lat: number;
  lon: number;
  size: number; // core diameter, CSS px
  expanding: boolean;
  gateway: boolean;
  /** 0 normal · 1 dimmed · 2 highlighted (in scope / route end) · 3 selected */
  state: 0 | 1 | 2 | 3;
  /** Persistent label (selected, gateway, route ends) — null shows a label on hover only. */
  label: boolean;
  name: string;
  meta: string;
}

export interface EngineRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  kind: RouteKind;
  /** 0 dimmed · 1 normal · 2 touches the selection · 3 selected */
  state: 0 | 1 | 2 | 3;
}

export interface EngineFocus {
  lat: number;
  lon: number;
  /** cos of the angular radius of the land glow around the selection */
  cos: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  dots: number[];
  dotSpacing: number;
  tier: 'high' | 'mid' | 'low';
  reduced: boolean;
  start: CameraTarget;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** After a keyboard move (explicit=false) or an Enter with nothing centred (explicit=true). */
  onCentre: (id: string | null, explicit: boolean) => void;
  onLost: () => void;
}

export interface GlobeEngine {
  setNodes(nodes: EngineNode[]): void;
  setRoutes(routes: EngineRoute[]): void;
  setFocusPoint(f: EngineFocus | null): void;
  flyTo(target: CameraTarget, instant?: boolean): void;
  setAutoRotate(on: boolean): void;
  setReduced(reduced: boolean): void;
  zoomBy(factor: number): void;
  camera(): CameraTarget;
  dispose(): void;
}

const MIN_DIST = 1.26;
const MAX_DIST = 5.6;
const IDLE_MS = 4500; // idle rotation starts after this long without input
const SETTLE_MS = 40000; // the loop stops this long after the last wake
const FOV = 32;

type RGB = [number, number, number];

function hexRGB(h: string): RGB {
  const n = parseInt(h.replace('#', '').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function token(name: string, fallback: string): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return hexRGB(/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
}

const v3 = (c: RGB) => new THREE.Vector3(c[0], c[1], c[2]);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ───────────── Shaders ───────────── */

const SPHERE_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SPHERE_FS = /* glsl */ `
uniform vec3 uBase; uniform vec3 uRim;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = 1.0 - max(dot(vN, vV), 0.0);
  gl_FragColor = vec4(uBase + uRim * pow(f, 2.6) * 0.7, 1.0);
}`;

const ATMOS_FS = /* glsl */ `
uniform vec3 uColor;
varying vec3 vN; varying vec3 vV;
void main() {
  float i = smoothstep(0.0, 0.55, -dot(vN, vV));
  gl_FragColor = vec4(uColor, i * 0.34);
}`;

const LINE_VS = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LINE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
void main() { gl_FragColor = vec4(uColor, uAlpha); }`;

const DOTS_VS = /* glsl */ `
attribute float aSeed;
uniform float uSize; uniform float uTime; uniform float uMotion; uniform vec3 uFocus; uniform float uFocusCos; uniform float uFocusOn;
varying float vA; varying float vF;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  float facing = dot(n, normalize(cameraPosition - wp.xyz));
  vA = smoothstep(-0.05, 0.5, facing) * (0.8 + 0.2 * sin(uTime * 0.8 + aSeed * 6.2831) * uMotion + 0.2 * (1.0 - uMotion));
  vF = uFocusOn * smoothstep(uFocusCos, mix(uFocusCos, 1.0, 0.7), dot(n, uFocus));
  gl_PointSize = uSize * (0.55 + 0.45 * max(facing, 0.0)) * (1.0 + vF * 0.35);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const DOTS_FS = /* glsl */ `
uniform vec3 uColor; uniform vec3 uHot;
varying float vA; varying float vF;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.2, 0.5, d)) * vA * (0.85 + vF * 0.15);
  gl_FragColor = vec4(mix(uColor, uHot, vF), a);
}`;

const NODES_VS = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aKind; attribute float aState; attribute float aPhase;
uniform float uPx; uniform float uZoom;
varying vec3 vColor; varying float vKind; varying float vState; varying float vPhase; varying float vA;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  vA = smoothstep(0.06, 0.28, dot(n, normalize(cameraPosition - wp.xyz)));
  float boost = aState > 2.5 ? 1.5 : (aState > 1.5 ? 1.15 : (aState > 0.5 ? 0.85 : 1.0));
  gl_PointSize = aSize * 3.0 * boost * uPx * uZoom;
  vColor = aColor; vKind = aKind; vState = aState; vPhase = aPhase;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const NODES_FS = /* glsl */ `
uniform float uTime; uniform float uMotion; uniform vec3 uBone;
varying vec3 vColor; varying float vKind; varying float vState; varying float vPhase; varying float vA;
float band(float r, float at, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(r - at)); }
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0; // core radius ≈ 0.31
  if (r > 1.0) discard;
  float a = 0.0;
  vec3 col = vColor;
  if (vKind > 0.5 && vKind < 1.5) {
    a = band(r, 0.27, 0.075) * 0.95 + (1.0 - smoothstep(0.0, 0.27, r)) * 0.1; // hollow ring
  } else {
    float core = 1.0 - smoothstep(0.23, 0.31, r);
    float glow = exp(-r * r * 9.0) * 0.5;
    float t = fract(uTime * (vKind > 1.5 ? 0.42 : 0.26) + vPhase);
    float pulse = band(r, 0.31 + t * 0.64, 0.07) * (1.0 - t) * 0.75 * uMotion;
    a = max(core, glow) + pulse;
    col = mix(col, uBone, (1.0 - smoothstep(0.0, 0.15, r)) * 0.85); // pearl core
    if (vKind > 1.5) a += band(r, 0.5, 0.05) * 0.55;
  }
  float ring = vState > 2.5 ? band(r, 0.84, 0.06) : 0.0;
  float dim = (vState > 0.5 && vState < 1.5) ? 0.38 : 1.0;
  float total = (a + ring) * vA * dim;
  if (total < 0.01) discard;
  vec3 c = (col * a + uBone * ring) / max(a + ring, 0.001);
  gl_FragColor = vec4(c, min(total, 1.0));
}`;

const ROUTE_VS = /* glsl */ `
attribute vec3 aCenter;
uniform float uWidth;
varying float vU;
void main() {
  vU = uv.x;
  vec3 p = aCenter + (position - aCenter) * uWidth; // tubes thin out as the camera closes in
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const ROUTE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uMotion; uniform float uState;
varying float vU;
void main() {
  float base = uState > 2.5 ? 0.62 : (uState > 1.5 ? 0.36 : (uState > 0.5 ? 0.2 : 0.06));
  float x = fract(vU * 3.0 - uTime * 0.22);
  float pulse = pow(x, 9.0) * uMotion * (uState > 2.5 ? 1.0 : (uState > 0.5 ? 0.65 : 0.12));
  float ends = smoothstep(0.0, 0.03, vU) * smoothstep(1.0, 0.97, vU);
  float a = (base + pulse) * ends;
  gl_FragColor = vec4(uColor * (0.75 + pulse), a);
}`;

const BEACON_VS = /* glsl */ `
uniform float uWidth;
varying float vH;
void main() {
  vH = (position.y - 1.0) / 0.28;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x * uWidth, position.y, position.z * uWidth, 1.0);
}`;

const BEACON_FS = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uMotion;
varying float vH;
void main() {
  float a = pow(1.0 - clamp(vH, 0.0, 1.0), 1.6) * (0.7 + 0.3 * sin(uTime * 2.1) * uMotion);
  gl_FragColor = vec4(uColor, a * 0.85);
}`;

/* ───────────── Engine ───────────── */

export function createGlobe(o: EngineOptions): GlobeEngine {
  const { canvas, labels } = o;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: o.tier === 'high', alpha: true, powerPreference: 'default' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write token colours as-is
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, o.tier === 'high' ? 2 : 1.5);
  renderer.setPixelRatio(dpr);

  // Chrome Bloom: a pearl/lilac dot field on violet night; iris nodes with pearl cores; routes by kind.
  const C = {
    night: token('--night-2', '#100c1a'),
    iris: token('--iris', '#b3a3ff'),
    irisDeep: token('--iris-deep', '#3a2a86'),
    frost: token('--frost', '#9fdcff'),
    gold: token('--gold', '#f2d6a2'),
    pearl: token('--pearl', '#f3effc'),
    lilac: token('--lilac', '#cdc5e4'),
  };
  const ROUTE_COLOUR: Record<RouteKind, RGB> = { migration: C.iris, influence: C.frost, exchange: C.gold, programme: C.pearl };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  const shared = { uTime: { value: 0 }, uMotion: { value: o.reduced ? 0 : 1 }, uWidth: { value: 1 } };
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // Body
  const seg = o.tier === 'high' ? [96, 64] : [64, 44];
  const sphere = new THREE.Mesh(
    track(new THREE.SphereGeometry(1, seg[0], seg[1])),
    track(new THREE.ShaderMaterial({ vertexShader: SPHERE_VS, fragmentShader: SPHERE_FS, uniforms: { uBase: { value: v3(mix(C.night, C.irisDeep, 0.2)) }, uRim: { value: v3(mix(C.irisDeep, C.iris, 0.5)) } } })),
  );
  scene.add(sphere);
  const atmos = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.14, 64, 40)),
    track(
      new THREE.ShaderMaterial({
        vertexShader: SPHERE_VS,
        fragmentShader: ATMOS_FS,
        uniforms: { uColor: { value: v3(mix(C.iris, C.pearl, 0.3)) } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  scene.add(atmos);

  // Graticule (every 30°)
  {
    const pts: number[] = [];
    const push = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -80; lat < 80; lat += 2) push(toVec(lat, lon, 1.0015), toVec(lat + 2, lon, 1.0015));
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 2) push(toVec(lat, lon, 1.0015), toVec(lat, lon + 2, 1.0015));
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = track(new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms: { uColor: { value: v3(C.pearl) }, uAlpha: { value: 0.05 } }, transparent: true, depthWrite: false }));
    scene.add(new THREE.LineSegments(g, m));
  }

  // Land dot field (density by tier)
  const dotUniforms = {
    uSize: { value: 3 },
    uTime: shared.uTime,
    uMotion: shared.uMotion,
    uFocus: { value: new THREE.Vector3(0, 0, 1) },
    uFocusCos: { value: 0.99 },
    uFocusOn: { value: 0 },
    uColor: { value: v3(mix(C.lilac, C.pearl, 0.4)) },
    uHot: { value: v3(mix(C.iris, C.pearl, 0.25)) },
  };
  {
    const pos: number[] = [];
    const seed: number[] = [];
    const keep = o.tier === 'high' ? 1 : 0.66;
    for (let i = 0, k = 0; i < o.dots.length; i += 2, k++) {
      if (keep < 1 && (k * 0.618034) % 1 > keep) continue;
      pos.push(...toVec(o.dots[i], o.dots[i + 1], 1.003));
      seed.push((k * 0.754877) % 1);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const m = track(new THREE.ShaderMaterial({ vertexShader: DOTS_VS, fragmentShader: DOTS_FS, uniforms: dotUniforms, transparent: true, depthWrite: false }));
    scene.add(new THREE.Points(g, m));
  }

  // Nodes
  const nodeUniforms = { uPx: { value: dpr }, uZoom: { value: 1 }, uTime: shared.uTime, uMotion: shared.uMotion, uBone: { value: v3(C.pearl) } };
  const nodeMat = track(
    new THREE.ShaderMaterial({ vertexShader: NODES_VS, fragmentShader: NODES_FS, uniforms: nodeUniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
  );
  let nodeGeo = new THREE.BufferGeometry();
  const nodePoints = new THREE.Points(nodeGeo, nodeMat);
  nodePoints.renderOrder = 10;
  scene.add(nodePoints);
  let nodes: EngineNode[] = [];
  let nodeVec: THREE.Vector3[] = [];
  let proj = new Float32Array(0); // x, y, facing per node

  // Routes
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  const disposeRoutes = () => {
    for (const child of [...routeGroup.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      routeGroup.remove(mesh);
    }
  };

  // Gateway beacon
  let beacon: THREE.Mesh | null = null;
  const beaconGeo = track(new THREE.CylinderGeometry(0.0022, 0.0048, 0.28, 10, 1, true).translate(0, 1.14, 0));
  const beaconMat = track(
    new THREE.ShaderMaterial({
      vertexShader: BEACON_VS,
      fragmentShader: BEACON_FS,
      uniforms: { uColor: { value: v3(C.pearl) }, uTime: shared.uTime, uMotion: shared.uMotion, uWidth: shared.uWidth },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );

  /* ── camera state ── */
  const cam: CameraTarget = { ...o.start };
  let tween: { from: CameraTarget; to: CameraTarget; t0: number; dur: number; bump: number; done?: () => void } | null = null;
  const vel = { lon: 0, lat: 0 };
  let autoRotate = false;
  let reduced = o.reduced;
  let size = { w: 1, h: 1 };

  const clampCam = () => {
    cam.lat = Math.max(-72, Math.min(78, cam.lat));
    cam.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, cam.dist));
    if (cam.lon > 180) cam.lon -= 360;
    if (cam.lon < -180) cam.lon += 360;
  };
  const vfov = () => camera.fov * (Math.PI / 180);
  const applyCamera = () => {
    const aspect = size.w / size.h;
    // Portrait screens keep the horizontal field, so the whole globe still fits.
    camera.fov = aspect >= 1 ? FOV : (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const p = toVec(cam.lat, cam.lon, cam.dist);
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(0, 0, 0);
  };
  /** Screen px per world unit at the surface point facing the camera. */
  const surfacePx = () => size.h / 2 / ((cam.dist - 1) * Math.tan(vfov() / 2));

  /* ── loop ── */
  let raf = 0;
  let lastFrame = 0;
  let lastWake = performance.now();
  let lastInteract = performance.now();
  let visible = !document.hidden;
  let onscreen = true;
  let disposed = false;
  let hovered: string | null = null;

  const schedule = () => {
    if (!raf && visible && onscreen && !disposed) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    lastWake = performance.now();
    schedule();
  };
  const interact = () => {
    lastInteract = performance.now();
    wake();
  };
  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame(now: number) {
    raf = 0;
    const dt = lastFrame ? Math.min(50, now - lastFrame) : 16;
    lastFrame = now;
    if (!reduced) shared.uTime.value += dt / 1000;
    let moving = false;
    if (tween) {
      const t = Math.min(1, (now - tween.t0) / tween.dur);
      const e = ease(t);
      cam.lat = tween.from.lat + (tween.to.lat - tween.from.lat) * e;
      cam.lon = tween.from.lon + (tween.to.lon - tween.from.lon) * e;
      cam.dist = tween.from.dist + (tween.to.dist - tween.from.dist) * e + tween.bump * Math.sin(Math.PI * e);
      moving = true;
      if (t >= 1) {
        const done = tween.done;
        tween = null;
        done?.();
      }
    } else if (!dragging && (Math.abs(vel.lon) > 0.004 || Math.abs(vel.lat) > 0.004)) {
      cam.lon += vel.lon * (dt / 16);
      cam.lat += vel.lat * (dt / 16);
      const k = Math.pow(0.9, dt / 16);
      vel.lon *= k;
      vel.lat *= k;
      moving = true;
    } else if (autoRotate && !reduced && !dragging && now - lastInteract > IDLE_MS && now - lastWake < SETTLE_MS) {
      cam.lon += dt * 0.0017;
      moving = true;
    }
    clampCam();
    applyCamera();
    // Dots keep a constant share of their lattice spacing as you zoom (clamped to stay crisp).
    dotUniforms.uSize.value = Math.max(1.4, Math.min(6, o.dotSpacing * (Math.PI / 180) * surfacePx() * 0.38)) * dpr;
    shared.uWidth.value = Math.max(0.22, Math.min(1.1, (cam.dist - 1) / 3));
    nodeUniforms.uZoom.value = Math.max(0.9, Math.min(1.35, 1 + (4.3 - cam.dist) * 0.1));
    renderer.render(scene, camera);
    project();
    layoutLabels();
    const animating = moving || (!reduced && now - lastWake < SETTLE_MS);
    if (animating) schedule();
    else lastFrame = 0;
  }

  /* ── projection, picking, labels ── */
  const tmp = new THREE.Vector3();
  function project() {
    const cp = camera.position;
    for (let i = 0; i < nodeVec.length; i++) {
      const n = nodeVec[i];
      tmp.copy(n).project(camera);
      proj[i * 3] = ((tmp.x + 1) / 2) * size.w;
      proj[i * 3 + 1] = ((1 - tmp.y) / 2) * size.h;
      const dx = cp.x - n.x;
      const dy = cp.y - n.y;
      const dz = cp.z - n.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      proj[i * 3 + 2] = (n.x * dx + n.y * dy + n.z * dz) / (n.length() * l);
    }
  }

  function pick(x: number, y: number, radius: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (proj[i * 3 + 2] < 0.2) continue;
      const d = Math.hypot(proj[i * 3] - x, proj[i * 3 + 1] - y);
      const reach = Math.max(radius, nodes[i].size * 0.75 + 6);
      if (d < reach && d < bestD) {
        bestD = d;
        best = nodes[i].id;
      }
    }
    return best;
  }

  function nearestCentre(): string | null {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const max = Math.min(size.w, size.h) * 0.24;
    let best: string | null = null;
    let bestD = max;
    for (let i = 0; i < nodes.length; i++) {
      if (proj[i * 3 + 2] < 0.3) continue;
      const d = Math.hypot(proj[i * 3] - cx, proj[i * 3 + 1] - cy) - (nodes[i].state >= 2 ? 6 : 0);
      if (d < bestD) {
        bestD = d;
        best = nodes[i].id;
      }
    }
    return best;
  }

  const labelEls = new Map<string, { el: HTMLElement; w: number; h: number }>();
  function labelFor(n: EngineNode) {
    let entry = labelEls.get(n.id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'atlas-glabel';
      el.dataset.tone = n.expanding ? 'plasma' : n.state === 3 ? 'bone' : 'ichor';
      const name = document.createElement('span');
      name.className = 'atlas-glabel-name';
      name.textContent = n.name;
      el.append(name);
      if (n.meta) {
        const meta = document.createElement('span');
        meta.className = 'atlas-glabel-meta';
        meta.textContent = n.meta;
        el.append(meta);
      }
      labels.append(el);
      entry = { el, w: el.offsetWidth || 90, h: el.offsetHeight || 30 };
      labelEls.set(n.id, entry);
    }
    return entry;
  }

  function layoutLabels() {
    const order: number[] = [];
    nodes.forEach((n, i) => {
      if (n.state === 3) order.unshift(i);
    });
    nodes.forEach((n, i) => {
      if (n.state !== 3 && n.label) order.push(i);
    });
    const h = nodes.findIndex((n) => n.id === hovered);
    if (h >= 0 && !order.includes(h)) order.push(h);
    const shown = new Set<string>();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const i of order) {
      const n = nodes[i];
      if (proj[i * 3 + 2] < 0.18) continue;
      const entry = labelFor(n);
      const x = proj[i * 3] + n.size * 0.8 + 8;
      const y = proj[i * 3 + 1] - entry.h / 2;
      const box = { x, y, w: entry.w, h: entry.h };
      const hit = boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y);
      if (hit && n.id !== hovered && n.state !== 3) continue;
      boxes.push(box);
      shown.add(n.id);
      entry.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      entry.el.dataset.show = 'true';
      entry.el.dataset.hover = String(n.id === hovered && !n.label && n.state !== 3);
    }
    for (const [id, entry] of labelEls) if (!shown.has(id)) entry.el.dataset.show = 'false';
  }

  /* ── input ── */
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let down: { x: number; y: number; t: number; moved: number } | null = null;
  let lastMove = { x: 0, y: 0, t: 0 };
  let pinch: { d: number; dist: number } | null = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    tween = null;
    vel.lon = vel.lat = 0;
    interact();
    if (pointers.size === 1) {
      dragging = true;
      down = { x: p.x, y: p.y, t: performance.now(), moved: 0 };
      lastMove = { x: p.x, y: p.y, t: performance.now() };
      canvas.dataset.dragging = 'true';
    } else if (pointers.size === 2) {
      dragging = false;
      down = null;
      pinch = { d: spread(), dist: cam.dist };
    }
  };

  const onMove = (e: PointerEvent) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinch) {
        cam.dist = 1 + (pinch.dist - 1) * (pinch.d / Math.max(10, spread()));
        clampCam();
        interact();
        return;
      }
      if (dragging) {
        const now = performance.now();
        const dx = p.x - lastMove.x;
        const dy = p.y - lastMove.y;
        const degPx = ((1 / surfacePx()) * 180) / Math.PI;
        cam.lon -= dx * degPx;
        cam.lat += dy * degPx;
        const dtm = Math.max(8, now - lastMove.t);
        vel.lon = vel.lon * 0.35 + ((-dx * degPx) / dtm) * 16 * 0.65;
        vel.lat = vel.lat * 0.35 + ((dy * degPx) / dtm) * 16 * 0.65;
        lastMove = { x: p.x, y: p.y, t: now };
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
        interact();
      }
      return;
    }
    if (e.pointerType === 'touch') return;
    const id = pick(p.x, p.y, 14);
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? 'pointer' : '';
      o.onHover(id);
      wake();
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const p = local(e);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      delete canvas.dataset.dragging;
      if (performance.now() - lastMove.t > 90) vel.lon = vel.lat = 0;
      if (down && e.type === 'pointerup' && down.moved < 7 && performance.now() - down.t < 800) {
        vel.lon = vel.lat = 0;
        const id = pick(p.x, p.y, e.pointerType === 'touch' ? 26 : 14);
        if (id) o.onSelect(id);
      }
      down = null;
      wake();
    }
  };

  const onLeave = () => {
    if (hovered) {
      hovered = null;
      canvas.style.cursor = '';
      o.onHover(null);
      wake();
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    tween = null;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    cam.dist = 1 + (cam.dist - 1) * Math.exp(Math.max(-60, Math.min(60, dy)) * 0.0022);
    clampCam();
    interact();
  };

  const quickTo = (to: CameraTarget, done?: () => void) => {
    if (reduced) {
      Object.assign(cam, to);
      clampCam();
      tween = null;
      interact();
      // render synchronously so projection is current for the callback
      cancel();
      frame(performance.now());
      done?.();
      return;
    }
    tween = { from: { ...cam }, to: { ...to, lat: Math.max(-72, Math.min(78, to.lat)), dist: Math.max(MIN_DIST, Math.min(MAX_DIST, to.dist)) }, t0: performance.now(), dur: 340, bump: 0, done };
    interact();
  };

  const onKey = (e: KeyboardEvent) => {
    const step = 5 + 14 * Math.min(1, (cam.dist - 1) / 2.5);
    const announce = () => o.onCentre(nearestCentre(), false);
    switch (e.key) {
      case 'ArrowLeft':
        quickTo({ ...cam, lon: cam.lon - step }, announce);
        break;
      case 'ArrowRight':
        quickTo({ ...cam, lon: cam.lon + step }, announce);
        break;
      case 'ArrowUp':
        quickTo({ ...cam, lat: cam.lat + step * 0.7 }, announce);
        break;
      case 'ArrowDown':
        quickTo({ ...cam, lat: cam.lat - step * 0.7 }, announce);
        break;
      case '+':
      case '=':
        quickTo({ ...cam, dist: 1 + (cam.dist - 1) * 0.75 }, announce);
        break;
      case '-':
      case '_':
        quickTo({ ...cam, dist: 1 + (cam.dist - 1) * 1.33 }, announce);
        break;
      case 'Enter':
      case ' ': {
        const id = nearestCentre();
        if (id) o.onSelect(id);
        else o.onCentre(null, true);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  const onLost = (e: Event) => {
    e.preventDefault();
    cancel();
    o.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const onVisibility = () => {
    visible = !document.hidden;
    if (visible) wake();
    else cancel();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const io = new IntersectionObserver((entries) => {
    onscreen = entries.some((en) => en.isIntersecting);
    if (onscreen) wake();
    else cancel();
  });
  io.observe(canvas);

  const resize = () => {
    const host = canvas.parentElement ?? canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    wake();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? canvas);
  resize();

  /* ── public API ── */
  const api: GlobeEngine = {
    setNodes(next) {
      nodes = next;
      nodeGeo.dispose();
      nodeGeo = new THREE.BufferGeometry();
      const pos: number[] = [];
      const sizeA: number[] = [];
      const col: number[] = [];
      const kind: number[] = [];
      const state: number[] = [];
      const phase: number[] = [];
      nodeVec = [];
      next.forEach((n, i) => {
        const p = toVec(n.lat, n.lon, 1.012);
        pos.push(...p);
        nodeVec.push(new THREE.Vector3(p[0], p[1], p[2]));
        sizeA.push(n.size);
        col.push(...(n.expanding ? C.frost : C.iris));
        kind.push(n.expanding ? 1 : n.gateway ? 2 : 0);
        state.push(n.state);
        phase.push((i * 0.381966) % 1);
      });
      nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      nodeGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizeA, 1));
      nodeGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
      nodeGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
      nodeGeo.setAttribute('aState', new THREE.Float32BufferAttribute(state, 1));
      nodeGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
      nodePoints.geometry = nodeGeo;
      proj = new Float32Array(next.length * 3);
      // Labels carry state-dependent tone; rebuild them.
      for (const { el } of labelEls.values()) el.remove();
      labelEls.clear();
      if (hovered && !next.some((n) => n.id === hovered)) hovered = null;
      // Beacon over the gateway
      const g = next.find((n) => n.gateway);
      if (beacon) {
        scene.remove(beacon);
        beacon = null;
      }
      if (g) {
        beacon = new THREE.Mesh(beaconGeo, beaconMat);
        const up = new THREE.Vector3(...toVec(g.lat, g.lon));
        beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        beacon.renderOrder = 5;
        scene.add(beacon);
      }
      wake();
    },
    setRoutes(next) {
      disposeRoutes();
      for (const r of next) {
        const pts = arcPoints(r.from, r.to, 72).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const radius = [0.0022, 0.003, 0.0038, 0.0062][r.state];
        const curve = new THREE.CatmullRomCurve3(pts);
        const SEGS = 96;
        const RADIAL = 6;
        const geo = new THREE.TubeGeometry(curve, SEGS, radius, RADIAL, false);
        // Each ring's centre, so the shader can scale the tube's width with zoom.
        const centres = new Float32Array((SEGS + 1) * (RADIAL + 1) * 3);
        const c = new THREE.Vector3();
        for (let i = 0; i <= SEGS; i++) {
          curve.getPointAt(i / SEGS, c);
          for (let j = 0; j <= RADIAL; j++) centres.set([c.x, c.y, c.z], (i * (RADIAL + 1) + j) * 3);
        }
        geo.setAttribute('aCenter', new THREE.BufferAttribute(centres, 3));
        const mat = new THREE.ShaderMaterial({
          vertexShader: ROUTE_VS,
          fragmentShader: ROUTE_FS,
          uniforms: { uColor: { value: v3(ROUTE_COLOUR[r.kind]) }, uTime: shared.uTime, uMotion: shared.uMotion, uWidth: shared.uWidth, uState: { value: r.state } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = r.state === 3 ? 4 : 3;
        routeGroup.add(mesh);
      }
      wake();
    },
    setFocusPoint(f) {
      if (f) {
        dotUniforms.uFocus.value.set(...toVec(f.lat, f.lon));
        dotUniforms.uFocusCos.value = f.cos;
        dotUniforms.uFocusOn.value = 1;
      } else dotUniforms.uFocusOn.value = 0;
      wake();
    },
    flyTo(target, instant) {
      const delta = ((((target.lon - cam.lon) % 360) + 540) % 360) - 180;
      const to = { lat: target.lat, lon: cam.lon + delta, dist: target.dist };
      vel.lon = vel.lat = 0;
      if (instant || reduced) {
        Object.assign(cam, to);
        clampCam();
        tween = null;
        wake();
        return;
      }
      const ang = angularDistance(cam, to);
      tween = {
        from: { ...cam },
        to: { ...to, lat: Math.max(-72, Math.min(78, to.lat)) },
        t0: performance.now(),
        dur: Math.max(700, Math.min(2200, 650 + ang * 11 + Math.abs(to.dist - cam.dist) * 260)),
        bump: Math.min(1.1, (ang / 180) * 1.8),
      };
      wake();
    },
    setAutoRotate(on) {
      autoRotate = on;
      if (on) lastInteract = performance.now();
      wake();
    },
    setReduced(r) {
      reduced = r;
      shared.uMotion.value = r ? 0 : 1;
      if (r && tween) {
        Object.assign(cam, tween.to);
        tween = null;
      }
      wake();
    },
    zoomBy(f) {
      quickTo({ ...cam, dist: 1 + (cam.dist - 1) * f });
    },
    camera: () => ({ lat: cam.lat, lon: cam.lon, dist: cam.dist }),
    dispose() {
      disposed = true;
      cancel();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisibility);
      io.disconnect();
      ro.disconnect();
      disposeRoutes();
      nodeGeo.dispose();
      for (const d of disposables) d.dispose();
      for (const { el } of labelEls.values()) el.remove();
      labelEls.clear();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return api;
}
