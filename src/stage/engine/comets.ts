/**
 * Save flights: a glowing gold copy of a seed travels on an arc into My World (the personal
 * core when it is in view, otherwise the My World navigation item projected into the scene),
 * trailing a short comet tail, and bursts on arrival. A small pool; at most four in flight.
 */
import * as THREE from 'three';
import type { Palette } from './palette.ts';
import type { SharedUniforms } from './shared.ts';

const TAIL = 14;
const POOL = 4;

const VS = /* glsl */ `
attribute float aK;
uniform float uPixelRatio; uniform float uSize;
varying float vK;
void main() {
  vK = aK;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPixelRatio * uSize * (1.0 - aK * 0.85) * clamp(14.0 / -mv.z, 0.4, 3.0);
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying float vK;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 14.0) * (1.0 - vK) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a * 1.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Flight {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  pos: Float32Array;
  from: THREE.Vector3;
  ctrl: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  burst: number;
  active: boolean;
  onArrive?: () => void;
  history: THREE.Vector3[];
}

export class Comets {
  readonly group = new THREE.Group();
  private readonly flights: Flight[] = [];

  constructor(palette: Palette, shared: SharedUniforms) {
    for (let i = 0; i < POOL; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(TAIL * 3);
      const k = new Float32Array(TAIL);
      for (let j = 0; j < TAIL; j++) k[j] = j / (TAIL - 1);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aK', new THREE.BufferAttribute(k, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        uniforms: { uColor: { value: palette.gold.clone().lerp(palette.pearl, 0.25) }, uAlpha: { value: 1 }, uSize: { value: 64 }, uPixelRatio: shared.uPixelRatio },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 50;
      points.visible = false;
      this.group.add(points);
      this.flights.push({ points, geo, mat, pos, from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: () => new THREE.Vector3(), t: 0, dur: 1, burst: 0, active: false, history: [] });
    }
  }

  /** Launch from a world point to a (possibly moving) world target. */
  launch(from: THREE.Vector3, to: () => THREE.Vector3, opts: { up: THREE.Vector3; onArrive?: () => void }) {
    const f = this.flights.find((x) => !x.active) ?? this.flights[0];
    f.from.copy(from);
    const end = to();
    const dist = from.distanceTo(end);
    f.ctrl.copy(from).add(end).multiplyScalar(0.5).addScaledVector(opts.up, dist * 0.35);
    f.to = to;
    f.t = 0;
    f.dur = 0.95;
    f.burst = 0;
    f.active = true;
    f.onArrive = opts.onArrive;
    f.history = Array.from({ length: TAIL }, () => from.clone());
    f.points.visible = true;
    f.mat.uniforms.uAlpha.value = 1;
    f.mat.uniforms.uSize.value = 64;
  }

  update(dt: number): boolean {
    let busy = false;
    for (const f of this.flights) {
      if (!f.active) continue;
      busy = true;
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / f.dur);
        const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
        const end = f.to();
        const u = 1 - e;
        const head = new THREE.Vector3().addScaledVector(f.from, u * u).addScaledVector(f.ctrl, 2 * u * e).addScaledVector(end, e * e);
        f.history.unshift(head);
        f.history.length = TAIL;
        if (f.t >= 1) {
          f.onArrive?.();
          f.onArrive = undefined;
        }
      } else {
        // burst and fade at the destination
        f.burst = Math.min(1, f.burst + dt / 0.45);
        const end = f.to();
        f.history.unshift(end.clone());
        f.history.length = TAIL;
        f.mat.uniforms.uSize.value = 64 + f.burst * 140;
        f.mat.uniforms.uAlpha.value = 1 - f.burst;
        if (f.burst >= 1) {
          f.active = false;
          f.points.visible = false;
        }
      }
      for (let j = 0; j < TAIL; j++) {
        const p = f.history[j] ?? f.history[f.history.length - 1];
        f.pos[j * 3] = p.x;
        f.pos[j * 3 + 1] = p.y;
        f.pos[j * 3 + 2] = p.z;
      }
      (f.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    return busy;
  }

  dispose() {
    for (const f of this.flights) {
      f.geo.dispose();
      f.mat.dispose();
    }
    this.group.removeFromParent();
  }
}
