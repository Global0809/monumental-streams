/**
 * The night GLOBE (World): violet sphere with a lavender Fresnel rim and atmosphere, the land
 * as a pearl dot field (/data/globe-dots.json, Natural Earth 1:110m), destinations as nodes
 * (active iris discs with pearl cores, expanding frost rings, the Miami gateway as a pearl
 * beacon of light), cultural routes as lifted great-circle arcs coloured by kind with light
 * flowing from → to. arrangement.place lights the land around it; arrangement.route lights its
 * arc. Nodes are pickable (placeActivate / hoveredPlace).
 */
import * as THREE from 'three';
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { ID, Route } from '../../../shared/types.ts';
import { loadDots } from '../../features/atlas/data.ts';
import { buildAtlasModel } from '../../features/atlas/model.ts';
import { GLOBE_RADIUS, latLonToVec, type Vec3 } from '../layouts.ts';
import type { FrameCtx, Hit, Piece } from './furniture.ts';
import { ROUTE_HUE, type Palette } from './palette.ts';
import { Presence, type SharedUniforms } from './shared.ts';

const R = GLOBE_RADIUS;

const SPHERE_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vW = wp.xyz;
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SPHERE_FS = /* glsl */ `
uniform vec3 uBase; uniform vec3 uRim; uniform float uLevel; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float f = 1.0 - max(dot(normalize(vN), v), 0.0);
  vec3 col = uBase * (0.75 + 0.5 * pow(1.0 - f, 2.0)) + uRim * pow(f, 3.2) * 0.45;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog + (1.0 - uLevel), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMOS_FS = /* glsl */ `
uniform vec3 uColor; uniform float uLevel;
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float i = pow(smoothstep(0.0, 0.7, -dot(normalize(vN), v)), 1.6);
  gl_FragColor = vec4(uColor * i * 0.2 * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DOTS_VS = /* glsl */ `
attribute float aSeed;
uniform float uSize; uniform float uTime; uniform float uMotion; uniform vec3 uFocus; uniform float uFocusOn; uniform float uPixelRatio; uniform float uLevel;
varying float vA; varying float vF;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  float facing = dot(n, normalize(cameraPosition - wp.xyz));
  vA = smoothstep(-0.05, 0.45, facing) * (0.78 + 0.22 * sin(uTime * 0.8 + aSeed * 6.2831) * uMotion) * uLevel;
  vF = uFocusOn * smoothstep(0.93, 0.995, dot(n, uFocus));
  vec4 mv = viewMatrix * wp;
  gl_PointSize = uSize * uPixelRatio * (0.55 + 0.45 * max(facing, 0.0)) * (1.0 + vF * 0.45) * clamp(16.0 / -mv.z, 0.7, 1.8);
  gl_Position = projectionMatrix * mv;
}`;

const DOTS_FS = /* glsl */ `
uniform vec3 uColor; uniform vec3 uHot;
varying float vA; varying float vF;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.15, 0.5, d)) * vA;
  gl_FragColor = vec4(mix(uColor, uHot, vF), a * (0.8 + vF * 0.4));
  #include <colorspace_fragment>
}`;

const NODES_VS = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aKind; attribute float aPhase; attribute float aState;
uniform float uPixelRatio; uniform float uLevel;
varying vec3 vColor; varying float vKind; varying float vPhase; varying float vA; varying float vState;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  vA = smoothstep(0.05, 0.3, dot(n, normalize(cameraPosition - wp.xyz))) * uLevel;
  vec4 mv = viewMatrix * wp;
  gl_PointSize = aSize * uPixelRatio * (1.0 + aState * 0.45) * clamp(16.0 / -mv.z, 0.75, 1.9);
  vColor = aColor; vKind = aKind; vPhase = aPhase; vState = aState;
  gl_Position = projectionMatrix * mv;
}`;

const NODES_FS = /* glsl */ `
uniform float uTime; uniform float uMotion; uniform vec3 uPearl;
varying vec3 vColor; varying float vKind; varying float vPhase; varying float vA; varying float vState;
float band(float r, float at, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(r - at)); }
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a; vec3 col = vColor;
  if (vKind > 0.5 && vKind < 1.5) {
    a = band(r, 0.3, 0.09) * 0.95; // expanding: hollow frost ring
  } else {
    float core = 1.0 - smoothstep(0.22, 0.3, r);
    float t = fract(uTime * (vKind > 1.5 ? 0.42 : 0.26) + vPhase);
    float pulse = band(r, 0.3 + t * 0.62, 0.08) * (1.0 - t) * 0.75 * uMotion;
    a = max(core, exp(-r * r * 8.0) * 0.45) + pulse;
    col = mix(col, uPearl, (1.0 - smoothstep(0.0, 0.14, r)) * 0.85);
  }
  a += vState * band(r, 0.8, 0.07) * 0.9;
  a *= vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <colorspace_fragment>
}`;

const ROUTE_VS = /* glsl */ `
varying float vU; varying float vDepth;
void main() { vU = uv.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;

const ROUTE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uMotion; uniform float uState; uniform float uLevel;
varying float vU; varying float vDepth;
void main() {
  float base = mix(0.16, 0.85, uState);
  float x = fract(vU * 2.5 - uTime * 0.22);
  float pulse = pow(x, 8.0) * uMotion * mix(0.35, 1.2, uState);
  float ends = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
  gl_FragColor = vec4(uColor * (base + pulse) * ends * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEACON_FS = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uMotion; uniform float uLevel;
varying vec2 vUv;
void main() {
  float h = vUv.y;
  float a = pow(1.0 - h, 1.8) * (0.75 + 0.25 * sin(uTime * 2.1) * uMotion);
  gl_FragColor = vec4(uColor * a * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEACON_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

interface Node {
  id: ID;
  pos: THREE.Vector3;
  normal: THREE.Vector3;
}

interface RouteMesh {
  id: ID;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  state: number;
}

function arc(from: [number, number], to: [number, number], segments = 64): THREE.Vector3[] {
  const a = new THREE.Vector3(...latLonToVec(from[0], from[1]));
  const b = new THREE.Vector3(...latLonToVec(to[0], to[1]));
  const omega = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  const lift = 0.03 + 0.26 * (omega / Math.PI);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = omega < 1e-6 ? a.clone() : a.clone().multiplyScalar(Math.sin((1 - t) * omega) / Math.sin(omega)).add(b.clone().multiplyScalar(Math.sin(t * omega) / Math.sin(omega)));
    out.push(p.normalize().multiplyScalar(R * (1.006 + lift * Math.sin(Math.PI * t))));
  }
  return out;
}

export class Globe implements Piece {
  readonly group = new THREE.Group();
  readonly presence = new Presence();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly sphereMat: THREE.ShaderMaterial;
  private readonly atmosMat: THREE.ShaderMaterial;
  private dotsMat: THREE.ShaderMaterial | null = null;
  private readonly nodesMat: THREE.ShaderMaterial;
  private readonly nodesState: THREE.BufferAttribute;
  private readonly nodes: Node[] = [];
  private readonly routes: RouteMesh[] = [];
  private beaconMat: THREE.ShaderMaterial | null = null;
  private focus: { place?: ID; route?: ID; scope?: Set<ID> | null } = {};
  private hovered: ID | null = null;
  private disposed = false;
  private readonly onChange: () => void;

  constructor(cat: Catalogue, palette: Palette, shared: SharedUniforms, lite: boolean, onChange: () => void) {
    this.onChange = onChange;
    const sphereGeo = new THREE.SphereGeometry(R, lite ? 48 : 72, lite ? 32 : 48);
    this.sphereMat = new THREE.ShaderMaterial({
      vertexShader: SPHERE_VS,
      fragmentShader: SPHERE_FS,
      uniforms: {
        uBase: { value: palette.night2.clone().multiplyScalar(1.25) },
        uRim: { value: palette.iris.clone() },
        uLevel: { value: 1 },
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
      },
    });
    const sphere = new THREE.Mesh(sphereGeo, this.sphereMat);
    sphere.renderOrder = 1;
    const atmosGeo = new THREE.SphereGeometry(R * 1.07, lite ? 40 : 64, lite ? 28 : 40);
    this.atmosMat = new THREE.ShaderMaterial({
      vertexShader: SPHERE_VS,
      fragmentShader: ATMOS_FS,
      uniforms: { uColor: { value: palette.iris.clone().lerp(palette.irisDeep, 0.35) }, uLevel: { value: 1 } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const atmos = new THREE.Mesh(atmosGeo, this.atmosMat);
    this.group.add(atmos, sphere);
    this.disposables.push(sphereGeo, this.sphereMat, atmosGeo, this.atmosMat);

    // destinations (city-level nodes, as on the World page)
    const model = buildAtlasModel(cat);
    const cities = model.nodes.filter((n) => n.level === 'city');
    const pos: number[] = [];
    const size: number[] = [];
    const color: number[] = [];
    const kind: number[] = [];
    const phase: number[] = [];
    let gateway: Node | null = null;
    cities.forEach((n, i) => {
      const nv = new THREE.Vector3(...latLonToVec(n.lat, n.lon));
      const p = nv.clone().multiplyScalar(R * 1.012);
      pos.push(p.x, p.y, p.z);
      const c = n.gateway ? palette.pearl : n.expanding ? palette.frost : palette.iris;
      color.push(c.r, c.g, c.b);
      kind.push(n.gateway ? 2 : n.expanding ? 1 : 0);
      size.push(n.gateway ? 22 : n.expanding ? 13 : 12 + Math.min(8, n.count * 1.5));
      phase.push((i * 0.37) % 1);
      const node = { id: n.id, pos: p, normal: nv };
      this.nodes.push(node);
      if (n.gateway) gateway = node;
    });
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ng.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    ng.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    ng.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    ng.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    this.nodesState = new THREE.Float32BufferAttribute(new Float32Array(cities.length), 1);
    ng.setAttribute('aState', this.nodesState);
    this.nodesMat = new THREE.ShaderMaterial({
      vertexShader: NODES_VS,
      fragmentShader: NODES_FS,
      uniforms: { uTime: shared.uTime, uMotion: shared.uMotion, uPixelRatio: shared.uPixelRatio, uPearl: { value: palette.pearl.clone() }, uLevel: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    const nodePts = new THREE.Points(ng, this.nodesMat);
    nodePts.renderOrder = 4;
    this.group.add(nodePts);
    this.disposables.push(ng, this.nodesMat);

    // routes
    const coords = new Map(cat.places.map((p) => [p.id, p.coords] as const));
    for (const r of cat.routes as Route[]) {
      const a = coords.get(r.from);
      const b = coords.get(r.to);
      if (!a || !b) continue;
      const curve = new THREE.CatmullRomCurve3(arc(a, b, 64));
      const tg = new THREE.TubeGeometry(curve, lite ? 48 : 96, 0.022, lite ? 4 : 6, false);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ROUTE_VS,
        fragmentShader: ROUTE_FS,
        uniforms: { uColor: { value: new THREE.Color(ROUTE_HUE[r.kind] ?? '#b3a3ff') }, uTime: shared.uTime, uMotion: shared.uMotion, uState: { value: 0 }, uLevel: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(tg, mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.routes.push({ id: r.id, mesh, mat, state: 0 });
      this.disposables.push(tg, mat);
    }

    // the Miami beacon
    if (gateway) {
      const g = gateway as Node;
      const bg = new THREE.CylinderGeometry(0.03, 0.12, 1.3, 16, 1, true);
      bg.translate(0, 0.65, 0);
      this.beaconMat = new THREE.ShaderMaterial({
        vertexShader: BEACON_VS,
        fragmentShader: BEACON_FS,
        uniforms: { uColor: { value: palette.pearl.clone().lerp(palette.gold, 0.35) }, uTime: shared.uTime, uMotion: shared.uMotion, uLevel: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const beacon = new THREE.Mesh(bg, this.beaconMat);
      beacon.position.copy(g.normal.clone().multiplyScalar(R * 1.0));
      beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), g.normal);
      beacon.renderOrder = 6;
      this.group.add(beacon);
      this.disposables.push(bg, this.beaconMat);
    }

    // the land, once its data arrives
    loadDots()
      .then((d) => {
        if (this.disposed) return;
        const step = lite ? 2 : 1;
        const pts: number[] = [];
        const seeds: number[] = [];
        for (let i = 0; i < d.points.length; i += 2 * step) {
          const v = latLonToVec(d.points[i], d.points[i + 1], R * 1.003);
          pts.push(v[0], v[1], v[2]);
          seeds.push(((i * 0.618) % 1 + 1) % 1);
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        dg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
        this.dotsMat = new THREE.ShaderMaterial({
          vertexShader: DOTS_VS,
          fragmentShader: DOTS_FS,
          uniforms: {
            uSize: { value: lite ? 3.8 : 3.3 },
            uTime: shared.uTime,
            uMotion: shared.uMotion,
            uPixelRatio: shared.uPixelRatio,
            uFocus: { value: new THREE.Vector3(0, 0, 1) },
            uFocusOn: { value: 0 },
            uLevel: { value: this.presence.level },
            uColor: { value: palette.lilac.clone() },
            uHot: { value: palette.gold.clone() },
          },
          transparent: true,
          depthWrite: false,
        });
        const dots = new THREE.Points(dg, this.dotsMat);
        dots.renderOrder = 2;
        this.group.add(dots);
        this.disposables.push(dg, this.dotsMat);
        this.applyFocus();
        this.onChange();
      })
      .catch(() => undefined); // the globe still reads without its land
  }

  setFocus(f: { place?: ID; route?: ID; scope?: Set<ID> | null }) {
    this.focus = f;
    this.applyFocus();
  }

  setHovered(id: ID | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    this.applyFocus();
  }

  private applyFocus() {
    const arr = this.nodesState.array as Float32Array;
    this.nodes.forEach((n, i) => {
      arr[i] = n.id === this.focus.place ? 1 : n.id === this.hovered ? 0.7 : this.focus.scope?.has(n.id) ? 0.35 : 0;
    });
    this.nodesState.needsUpdate = true;
    for (const r of this.routes) r.mat.uniforms.uState.value = r.id === this.focus.route ? 1 : 0;
    if (this.dotsMat) {
      const n = this.nodes.find((x) => x.id === this.focus.place);
      if (n) {
        (this.dotsMat.uniforms.uFocus.value as THREE.Vector3).copy(n.normal);
        this.dotsMat.uniforms.uFocusOn.value = 1;
      } else this.dotsMat.uniforms.uFocusOn.value = 0;
    }
  }

  update(dt: number, _ctx: FrameCtx): boolean {
    const busy = this.presence.step(dt, 2.4);
    const l = this.presence.level;
    this.group.visible = l > 0.004;
    this.group.scale.setScalar(0.6 + 0.4 * l);
    this.sphereMat.uniforms.uLevel.value = l;
    this.atmosMat.uniforms.uLevel.value = l;
    this.nodesMat.uniforms.uLevel.value = l;
    if (this.dotsMat) this.dotsMat.uniforms.uLevel.value = l;
    if (this.beaconMat) this.beaconMat.uniforms.uLevel.value = l;
    for (const r of this.routes) r.mat.uniforms.uLevel.value = l;
    return busy;
  }

  pick(x: number, y: number, ctx: FrameCtx): Hit | null {
    if (this.presence.level < 0.6) return null;
    const cam = ctx.camera;
    const v = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    let best: Hit | null = null;
    const s = this.group.scale.x;
    for (const n of this.nodes) {
      const wp = v.copy(n.pos).multiplyScalar(s);
      toCam.copy(cam.position).sub(wp).normalize();
      if (toCam.dot(n.normal) < 0.15) continue; // far side
      const depth = wp.clone().sub(cam.position).dot(fwd);
      wp.project(cam);
      const sx = ((wp.x + 1) / 2) * ctx.view.w;
      const sy = ((1 - wp.y) / 2) * ctx.view.h;
      const r = 14;
      if ((x - sx) ** 2 + (y - sy) ** 2 > r * r) continue;
      if (!best || depth < best.depth) best = { kind: 'place', id: n.id, depth };
    }
    return best;
  }

  /** World position of a place node (for flights). */
  nodePosition(id: ID): Vec3 | null {
    const n = this.nodes.find((x) => x.id === id);
    return n ? [n.pos.x, n.pos.y, n.pos.z] : null;
  }

  dispose() {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.group.removeFromParent();
  }
}
