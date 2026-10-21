/**
 * SEEDS — one biomechanical glass capsule per catalogue story, all drawn in two instanced
 * calls (the capsules, back-to-front, and their additive halos) whatever the catalogue size.
 *
 * Each capsule is a flattened glass lens that always faces the viewer, carrying its poster
 * inside (one layer of the PosterArray) as an emissive plane seen through the membrane:
 *   · Fresnel rim in champagne gold; iris lavender (and an opening aperture) when hovered or
 *     selected;
 *   · planned (unplayable) titles are hollow: a dashed outline with the art barely there;
 *   · premium titles carry a small gold seal.
 * Seeds keep their identity across forms: setForm() retargets every seed from where it is now,
 * with a staggered, arcing migration; presence and scale ease continuously.
 */
import * as THREE from 'three';
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { ID } from '../../../shared/types.ts';
import { easeInOutCubic, hash01, highlightFactor, migrationDelay, MIGRATION_SECONDS, slotPosition, type FormLayout, type SeedInfo, type SeedSlot } from '../layouts.ts';
import { approach } from './damp.ts';
import type { Palette } from './palette.ts';
import { PosterArray } from './posters.ts';
import type { SharedUniforms } from './shared.ts';

const CAPSULE_W = 1.7; // world width at scale 1 (poster aspect 1.7:1)
const CAPSULE_H = 1.0;

const SEED_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aData;   // scale, presence, hover, layer
attribute vec4 aFlags;  // planned, premium, selected, rand
uniform float uTime; uniform float uMotion;
varying vec3 vN; varying vec2 vL; varying vec4 vData; varying vec4 vFlags; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float roll = sin(uTime * 0.45 + aFlags.w * 6.2831) * 0.06 * uMotion;
  float c = cos(roll); float s = sin(roll);
  vec3 p = position; p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec3 n = normal; n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  mv.xyz += p * aData.x;
  vN = n; vL = position.xy; vData = aData; vFlags = aFlags; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SEED_FS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uPosters;
uniform vec3 uGold; uniform vec3 uIris; uniform vec3 uGlass;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
varying vec3 vN; varying vec2 vL; varying vec4 vData; varying vec4 vFlags; varying float vDepth;
void main() {
  float presence = vData.y;
  if (presence < 0.004) discard;
  float lit = max(vData.z, vFlags.z);
  float planned = vFlags.x;
  vec3 n = normalize(vN);
  float facing = clamp(n.z, 0.0, 1.0);
  float fres = pow(1.0 - facing, 2.3);
  // the poster, refracted slightly at the membrane's edge; the iris opens it wider when lit
  vec2 uv = vec2(vL.x / ${CAPSULE_W.toFixed(2)} + 0.5, vL.y / ${CAPSULE_H.toFixed(2)} + 0.5);
  uv -= n.xy * 0.035;
  uv = (uv - 0.5) * (0.93 - 0.05 * lit) + 0.5;
  vec3 poster = vData.w >= 0.0 ? texture(uPosters, vec3(uv.x, 1.0 - uv.y, vData.w)).rgb : uGlass;
  float inner = smoothstep(0.16, 0.58, facing);
  float r = length(vec2(vL.x / ${(CAPSULE_W / 2).toFixed(3)}, vL.y / ${(CAPSULE_H / 2).toFixed(3)}));
  float aperture = smoothstep(0.035, 0.0, abs(r - mix(1.08, 0.84, lit))) * lit;
  vec3 col = poster * (0.74 + 0.38 * lit) * inner * (1.0 - planned * 0.9);
  col += uGlass * (1.0 - inner) * 0.55;
  vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 56.0);
  vec3 rim = mix(uGold, uIris, lit);
  float dash = planned > 0.5 ? step(0.45, fract(atan(vL.y, vL.x) * 3.8197 + uTime * 0.03)) : 1.0;
  col += rim * fres * (1.1 + 1.4 * lit) * dash;
  col += uIris * aperture * 1.3;
  col += vec3(1.0, 0.97, 0.92) * spec * 0.5;
  vec2 sp = vL - vec2(0.6, 0.25);
  float sd = length(sp);
  float seal = vFlags.y * (1.0 - smoothstep(0.062, 0.078, sd));
  float sealRing = vFlags.y * smoothstep(0.012, 0.0, abs(sd - 0.098));
  col = mix(col, uGold * 1.2, seal);
  col += uGold * sealRing;
  float alpha = inner * (1.0 - planned * 0.84) * 0.96 + fres * dash * 0.95 + seal + sealRing * 0.8 + aperture;
  alpha = clamp(alpha, 0.0, 1.0) * presence;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, fog * 0.92);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const HALO_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aHalo; // size, intensity, irisMix, pulse
varying vec2 vUv; varying vec4 vHalo; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aHalo.x;
  mv.z += 0.05;
  vUv = position.xy; vHalo = aHalo; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const HALO_FS = /* glsl */ `
uniform vec3 uGold; uniform vec3 uIris; uniform float uFogDensity;
varying vec2 vUv; varying vec4 vHalo; varying float vDepth;
void main() {
  if (vHalo.y < 0.002 && vHalo.w < 0.002) discard;
  vec2 q = vUv * 2.0; q.x *= 0.78;
  float d = length(q);
  float glow = exp(-d * d * 6.0) * vHalo.y;
  float p = vHalo.w;
  float ring = p * smoothstep(0.07, 0.0, abs(d - (0.42 + (1.0 - p) * 0.5)));
  vec3 col = mix(uGold, uIris, vHalo.z) * (glow + ring * 1.4);
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col *= (1.0 - fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface SeedState {
  id: ID;
  index: number;
  layer: number;
  planned: boolean;
  premium: boolean;
  rand: number;
  slot: SeedSlot;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  lift: THREE.Vector3;
  start: number;
  dur: number;
  scale: number;
  presence: number;
  hover: number;
  select: number;
  pulse: number;
  role: SeedSlot['role'];
  // screen cache (CSS px)
  sx: number;
  sy: number;
  hw: number;
  hh: number;
  depth: number;
  onScreen: boolean;
}

export interface SeedPick {
  id: ID;
  depth: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const occA = new THREE.Vector3();
const occB = new THREE.Vector3();

/** Does the segment eye → p pass through the sphere before reaching p? */
export function occludedBySphere(eye: THREE.Vector3, p: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
  const d = occA.copy(p).sub(eye);
  const len = d.length();
  if (len < 1e-6) return false;
  d.divideScalar(len);
  const oc = occB.copy(eye).sub(c);
  const b = oc.dot(d);
  const disc = b * b - (oc.lengthSq() - r * r);
  if (disc <= 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < len - 1e-3;
}

export class SeedField {
  readonly group = new THREE.Group();
  private readonly states: SeedState[] = [];
  private readonly byId = new Map<ID, SeedState>();
  private readonly order: number[] = [];
  private readonly mesh: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly haloGeo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly posters: PosterArray;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aData: THREE.InstancedBufferAttribute;
  private readonly aFlags: THREE.InstancedBufferAttribute;
  private readonly hPos: THREE.InstancedBufferAttribute;
  private readonly hHalo: THREE.InstancedBufferAttribute;
  private form: FormLayout | null = null;
  private hovered: ID | null = null;
  private highlight: Set<ID> | null = null;
  private priorityAt = -1;

  constructor(infos: SeedInfo[], cat: Catalogue, opts: { quality: 'webgl' | 'lite'; palette: Palette; shared: SharedUniforms; maxLayers: number; onChange: () => void }) {
    const n = Math.max(1, infos.length);
    const lite = opts.quality === 'lite';
    const layers = Math.min(n, opts.maxLayers);
    this.posters = new PosterArray(layers, {
      width: lite ? 170 : 272,
      height: lite ? 100 : 160,
      base: new THREE.Color('#1a1426'),
      onChange: opts.onChange,
    });

    const base = new THREE.CapsuleGeometry(CAPSULE_H / 2, CAPSULE_W - CAPSULE_H, lite ? 5 : 8, lite ? 14 : 22, 1);
    base.rotateZ(Math.PI / 2);
    base.scale(1, 1, 0.45);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('normal', base.getAttribute('normal'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aFlags = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aData', this.aData);
    this.geo.setAttribute('aFlags', this.aFlags);
    this.geo.instanceCount = infos.length;

    const p = opts.palette;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SEED_VS,
      fragmentShader: SEED_FS,
      uniforms: {
        uPosters: { value: this.posters.texture },
        uGold: { value: p.gold.clone() },
        uIris: { value: p.iris.clone() },
        uGlass: { value: new THREE.Color('#2a2140') },
        uTime: opts.shared.uTime,
        uMotion: opts.shared.uMotion,
        uFogColor: opts.shared.uFogColor,
        uFogDensity: opts.shared.uFogDensity,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;

    const quad = new THREE.PlaneGeometry(1, 1);
    this.haloGeo = new THREE.InstancedBufferGeometry();
    this.haloGeo.index = quad.index;
    this.haloGeo.setAttribute('position', quad.getAttribute('position'));
    this.hPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.hHalo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.haloGeo.setAttribute('aPos', this.hPos);
    this.haloGeo.setAttribute('aHalo', this.hHalo);
    this.haloGeo.instanceCount = infos.length;
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VS,
      fragmentShader: HALO_FS,
      uniforms: { uGold: { value: p.gold.clone() }, uIris: { value: p.iris.clone() }, uFogDensity: opts.shared.uFogDensity },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(this.haloGeo, this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 9;
    this.group.add(this.halo, this.mesh);
    base.dispose(); // attributes now belong to the instanced geometry
    quad.dispose();

    infos.forEach((info, i) => {
      const v = cat.get(info.id) as { art?: ID } | undefined;
      const art = cat.artFor(v?.art);
      const layer = i < layers ? i : -1;
      if (layer >= 0) this.posters.setSource(layer, art?.lqip, art?.posterSmall);
      const st: SeedState = {
        id: info.id,
        index: i,
        layer,
        planned: info.planned,
        premium: info.premium,
        rand: hash01(info.id, 3),
        slot: { id: info.id, role: 'ambient', center: [0, 0, -30], offset: [0, 0, 0], spin: 0, scale: 0.5, presence: 0 },
        pos: new THREE.Vector3((hash01(info.id, 1) - 0.5) * 8, (hash01(info.id, 2) - 0.5) * 5, -24 - hash01(info.id, 4) * 10),
        from: new THREE.Vector3(),
        lift: new THREE.Vector3(),
        start: -1e9,
        dur: MIGRATION_SECONDS,
        scale: 0.2,
        presence: 0,
        hover: 0,
        select: 0,
        pulse: 0,
        role: 'ambient',
        sx: 0,
        sy: 0,
        hw: 0,
        hh: 0,
        depth: 0,
        onScreen: false,
      };
      this.states.push(st);
      this.byId.set(st.id, st);
      this.order.push(i);
    });
  }

  get count() {
    return this.states.length;
  }

  markPrimed() {
    this.posters.markPrimed();
  }

  /** Retarget every seed to a new form. */
  setForm(form: FormLayout, clock: number, instant: boolean) {
    this.form = form;
    const n = this.states.length;
    const bySlot = new Map(form.seeds.map((s) => [s.id, s]));
    for (const st of this.states) {
      const slot = bySlot.get(st.id);
      if (!slot) continue;
      st.slot = slot;
      st.role = slot.role;
      if (instant) {
        st.start = -1e9;
        continue;
      }
      st.from.copy(st.pos);
      st.start = clock + migrationDelay(st.index, n, st.id);
      st.dur = MIGRATION_SECONDS * (0.9 + st.rand * 0.25);
      st.lift.set((hash01(st.id, 41) - 0.5) * 2, 0.6 + hash01(st.id, 43) * 0.6, (hash01(st.id, 47) - 0.5) * 1.4);
    }
    if (instant) for (const st of this.states) this.snap(st, 0);
    this.priorityAt = -1;
  }

  private snap(st: SeedState, ambientT: number) {
    if (!this.form) return;
    const p = slotPosition(st.slot, this.form, ambientT);
    st.pos.set(p[0], p[1], p[2]);
    const hf = highlightFactor(st.id, this.highlight);
    st.scale = st.slot.scale * hf.scale;
    st.presence = st.slot.presence * hf.presence;
  }

  setHovered(id: ID | null) {
    this.hovered = id;
  }

  setHighlight(ids: ID[] | null) {
    this.highlight = ids ? new Set(ids) : null;
  }

  pulse(id: ID) {
    const st = this.byId.get(id);
    if (st) st.pulse = 1;
  }

  /**
   * Advance every seed and rewrite the instance buffers (back-to-front).
   * Returns true while any seed is still migrating or easing.
   */
  update(dt: number, clock: number, ambientT: number, camera: THREE.PerspectiveCamera, view: { w: number; h: number }, motion: number): boolean {
    const form = this.form;
    if (!form) return false;
    let busy = false;
    const camPos = camera.position;
    const fwd = camera.getWorldDirection(tmp2).clone();
    const ppuK = view.h / 2 / Math.tan((camera.fov * Math.PI) / 360);
    for (const st of this.states) {
      const target = slotPosition(st.slot, form, ambientT);
      let tx = target[0];
      let ty = target[1] + Math.sin(ambientT * 0.8 + st.rand * 6.283) * 0.07 * st.slot.scale * motion;
      let tz = target[2];
      const k = (clock - st.start) / st.dur;
      if (k < 1) {
        busy = true;
        if (k <= 0) {
          tx = st.from.x;
          ty = st.from.y;
          tz = st.from.z;
        } else {
          const e = easeInOutCubic(k);
          // quadratic bezier through a lifted midpoint: seeds arc between forms
          const dx = tx - st.from.x;
          const dy = ty - st.from.y;
          const dz = tz - st.from.z;
          const dist = Math.hypot(dx, dy, dz);
          const cx = (st.from.x + tx) / 2 + st.lift.x * dist * 0.18;
          const cy = (st.from.y + ty) / 2 + st.lift.y * dist * 0.22;
          const cz = (st.from.z + tz) / 2 + st.lift.z * dist * 0.18;
          const u = 1 - e;
          tx = u * u * st.from.x + 2 * u * e * cx + e * e * tx;
          ty = u * u * st.from.y + 2 * u * e * cy + e * e * ty;
          tz = u * u * st.from.z + 2 * u * e * cz + e * e * tz;
        }
      }
      st.pos.set(tx, ty, tz);
      const hf = highlightFactor(st.id, this.highlight);
      const tScale = st.slot.scale * hf.scale * (st.id === this.hovered ? 1.1 : 1);
      const tPres = Math.min(1, st.slot.presence * hf.presence + (st.id === this.hovered ? 0.35 : 0));
      const rate = dt > 0.2 ? 50 : 3.4;
      st.scale = approach(st.scale, tScale, rate, dt);
      st.presence = approach(st.presence, tPres, rate, dt);
      st.hover = approach(st.hover, st.id === this.hovered ? 1 : 0, 9, dt);
      st.select = approach(st.select, st.slot.selected ? 1 : 0, 4, dt);
      if (st.pulse > 0) {
        st.pulse = Math.max(0, st.pulse - dt / 0.9);
        busy = true;
      }
      if (Math.abs(st.scale - tScale) > 1e-3 || Math.abs(st.presence - tPres) > 1e-3 || Math.abs(st.hover - (st.id === this.hovered ? 1 : 0)) > 2e-3) busy = true;

      // screen cache
      tmp.copy(st.pos).sub(camPos);
      const depth = tmp.dot(fwd);
      st.depth = depth;
      if (depth > 0.2) {
        tmp.copy(st.pos).project(camera);
        st.sx = ((tmp.x + 1) / 2) * view.w;
        st.sy = ((1 - tmp.y) / 2) * view.h;
        const ppu = ppuK / depth;
        st.hw = (CAPSULE_W / 2) * st.scale * ppu;
        st.hh = (CAPSULE_H / 2) * st.scale * ppu;
        st.onScreen = tmp.z < 1 && st.sx + st.hw > 0 && st.sx - st.hw < view.w && st.sy + st.hh > 0 && st.sy - st.hh < view.h;
      } else st.onScreen = false;
    }

    // back-to-front for the glass
    this.order.sort((a, b) => this.states[b].depth - this.states[a].depth);
    const P = this.aPos.array as Float32Array;
    const D = this.aData.array as Float32Array;
    const F = this.aFlags.array as Float32Array;
    const HP = this.hPos.array as Float32Array;
    const HH = this.hHalo.array as Float32Array;
    for (let j = 0; j < this.order.length; j++) {
      const st = this.states[this.order[j]];
      P[j * 3] = st.pos.x;
      P[j * 3 + 1] = st.pos.y;
      P[j * 3 + 2] = st.pos.z;
      D[j * 4] = st.scale;
      D[j * 4 + 1] = st.presence;
      D[j * 4 + 2] = st.hover;
      D[j * 4 + 3] = st.layer >= 0 ? st.layer : -1;
      F[j * 4] = st.planned ? 1 : 0;
      F[j * 4 + 1] = st.premium ? 1 : 0;
      F[j * 4 + 2] = st.select;
      F[j * 4 + 3] = st.rand;
      HP[j * 3] = st.pos.x;
      HP[j * 3 + 1] = st.pos.y;
      HP[j * 3 + 2] = st.pos.z;
      const featured = st.role === 'featured' || st.role === 'focus' ? 0.22 : 0;
      HH[j * 4] = st.scale * 2.7 * (1 + st.pulse * 0.6);
      HH[j * 4 + 1] = st.presence * (0.07 + featured + st.hover * 0.5 + st.select * 0.3);
      HH[j * 4 + 2] = Math.max(st.hover, st.select);
      HH[j * 4 + 3] = st.pulse;
    }
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.aFlags.needsUpdate = true;
    this.hPos.needsUpdate = true;
    this.hHalo.needsUpdate = true;

    // progressive posters: most prominent first, re-ranked twice a second
    if (clock - this.priorityAt > 0.5) {
      this.priorityAt = clock;
      for (const st of this.states) {
        if (st.layer < 0) continue;
        const want = st.onScreen ? st.presence * Math.max(st.hw, 1) * (1 + st.hover * 4) : 0;
        this.posters.setPriority(st.layer, want > 0.5 ? want : 0);
      }
      this.posters.pump();
    }
    return busy;
  }

  /**
   * The front-most seed whose capsule contains the point (CSS px). An optional occluding sphere
   * (the globe) hides seeds behind it from the pointer, as it does from the eye.
   */
  pick(x: number, y: number, camera?: THREE.Camera, occluder?: { center: THREE.Vector3; radius: number }): SeedPick | null {
    let best: SeedState | null = null;
    for (const st of this.states) {
      if (!st.onScreen || st.presence < 0.2) continue;
      if (camera && occluder && occludedBySphere(camera.position, st.pos, occluder.center, occluder.radius)) continue;
      const dx = (x - st.sx) / Math.max(4, st.hw * 1.05);
      const dy = (y - st.sy) / Math.max(4, st.hh * 1.1);
      if (dx * dx + dy * dy > 1) continue;
      if (!best || st.depth < best.depth) best = st;
    }
    return best ? { id: best.id, depth: best.depth } : null;
  }

  positionOf(id: ID): THREE.Vector3 | null {
    return this.byId.get(id)?.pos ?? null;
  }

  screenOf(id: ID): { x: number; y: number; visible: boolean } | null {
    const st = this.byId.get(id);
    if (!st) return null;
    return { x: st.sx, y: st.sy, visible: st.onScreen && st.presence > 0.15 };
  }

  presenceOf(id: ID): number {
    return this.byId.get(id)?.presence ?? 0;
  }

  dispose() {
    this.posters.dispose();
    this.geo.dispose();
    this.haloGeo.dispose();
    this.mat.dispose();
    this.haloMat.dispose();
    this.group.removeFromParent();
  }
}
