/**
 * Light FILAMENTS between seeds (focus: the story and its related seeds). Each filament is a
 * camera-facing ribbon along a gently bowed curve, rebuilt on the CPU each frame from the seeds'
 * live positions (a handful of filaments × 28 points — negligible), drawn additively in one
 * call with light travelling from the focus outward.
 */
import * as THREE from 'three';
import type { ID } from '../../../shared/types.ts';
import type { Palette } from './palette.ts';
import type { SharedUniforms } from './shared.ts';

const SEG = 28;
const MAX = 24;

const VS = /* glsl */ `
attribute vec2 aUv; attribute float aAlpha;
varying vec2 vUv; varying float vA; varying float vDepth;
void main() { vUv = aUv; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;

const FS = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uMotion; uniform float uFogDensity;
varying vec2 vUv; varying float vA; varying float vDepth;
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float core = pow(across, 2.5);
  float travel = pow(fract(vUv.x * 1.4 - uTime * 0.35 * uMotion), 6.0);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  vec3 col = mix(uA, uB, vUv.x) * core * (0.45 + 1.4 * travel) * ends * vA;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(col * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Filaments {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private pairs: { from: ID; to: ID; level: number }[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly view = new THREE.Vector3();

  constructor(palette: Palette, shared: SharedUniforms) {
    const verts = MAX * (SEG + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.alpha = new Float32Array(verts);
    const uv = new Float32Array(verts * 2);
    const index: number[] = [];
    for (let f = 0; f < MAX; f++) {
      const base = f * (SEG + 1) * 2;
      for (let i = 0; i <= SEG; i++) {
        uv[(base + i * 2) * 2] = i / SEG;
        uv[(base + i * 2) * 2 + 1] = 0;
        uv[(base + i * 2 + 1) * 2] = i / SEG;
        uv[(base + i * 2 + 1) * 2 + 1] = 1;
        if (i < SEG) {
          const k = base + i * 2;
          index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(index);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uA: { value: palette.iris.clone() }, uB: { value: palette.gold.clone() }, uTime: shared.uTime, uMotion: shared.uMotion, uFogDensity: shared.uFogDensity },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }

  set(pairs: { from: ID; to: ID }[]) {
    const old = new Map(this.pairs.map((p) => [`${p.from}>${p.to}`, p.level]));
    this.pairs = pairs.slice(0, MAX).map((p) => ({ ...p, level: old.get(`${p.from}>${p.to}`) ?? 0 }));
  }

  /** Rebuild ribbons; returns true while any filament is still fading in. */
  update(dt: number, camera: THREE.Camera, positionOf: (id: ID) => THREE.Vector3 | null, presenceOf: (id: ID) => number): boolean {
    let busy = false;
    let n = 0;
    for (const pr of this.pairs) {
      const pa = positionOf(pr.from);
      const pb = positionOf(pr.to);
      if (!pa || !pb) continue;
      pr.level = Math.min(1, pr.level + dt / 0.9);
      if (pr.level < 1) busy = true;
      this.a.copy(pa);
      this.b.copy(pb);
      // bow the curve towards the viewer a little
      this.c.copy(this.a).add(this.b).multiplyScalar(0.5);
      this.view.copy(camera.position).sub(this.c).normalize();
      this.c.addScaledVector(this.view, this.a.distanceTo(this.b) * 0.18);
      const alpha = Math.min(presenceOf(pr.from), presenceOf(pr.to)) * pr.level;
      const grow = pr.level; // the filament draws itself outwards
      const base = n * (SEG + 1) * 2;
      for (let i = 0; i <= SEG; i++) {
        const u = (i / SEG) * grow;
        const w = 1 - u;
        this.p.set(0, 0, 0).addScaledVector(this.a, w * w).addScaledVector(this.c, 2 * w * u).addScaledVector(this.b, u * u);
        this.q.copy(this.b).sub(this.c);
        this.t.copy(this.c).sub(this.a).multiplyScalar(2 * w).addScaledVector(this.q, 2 * u).normalize();
        this.view.copy(camera.position).sub(this.p).normalize();
        this.side.crossVectors(this.t, this.view).normalize().multiplyScalar(0.05);
        const k = base + i * 2;
        this.pos[k * 3] = this.p.x - this.side.x;
        this.pos[k * 3 + 1] = this.p.y - this.side.y;
        this.pos[k * 3 + 2] = this.p.z - this.side.z;
        this.pos[(k + 1) * 3] = this.p.x + this.side.x;
        this.pos[(k + 1) * 3 + 1] = this.p.y + this.side.y;
        this.pos[(k + 1) * 3 + 2] = this.p.z + this.side.z;
        this.alpha[k] = alpha;
        this.alpha[k + 1] = alpha;
      }
      n++;
    }
    this.geo.setDrawRange(0, n * SEG * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = n > 0;
    return busy;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
