/**
 * The organ family's shared materials. Every organ is built from the same four self-lit
 * surfaces, so all nine read as one species and look identical in the stage and in the render
 * harness, whatever lights the host scene has:
 *
 *   bone      bone-white vertebral parts: wrapped key light, warm subsurface at the terminator,
 *             a porous grain, and a Fresnel rim in the organ's signature hue
 *   glass     glass membranes: Fresnel rims, a thin-film sheen and an optional inner core light
 *   filament  thin luminous tubes (additive) with pulses travelling along their length
 *   glow      billboard halos (additive) for cores, tips and sparkles
 *
 * Lighting is in view space (a fixed studio key from the upper left), so a sculpture is always
 * modelled the same way from any camera. All materials honour scene fog (linear or exp2) and the
 * renderer's tone mapping / output colour space. Every geometry and material made through a kit
 * is tracked and released by kit.dispose().
 */
import * as THREE from 'three';

export type OrganQuality = 'webgl' | 'lite';

export interface SharedUniforms {
  uTime: { value: number };
  uEnergy: { value: number };
}

/* ───────────── GLSL ───────────── */

const VARYINGS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP; varying vec2 vUv; varying float vI; varying float vA; varying vec3 vTint;
`;

const NOISE = /* glsl */ `
float oHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float oNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(oHash(i), oHash(i + vec3(1, 0, 0)), f.x), mix(oHash(i + vec3(0, 1, 0)), oHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(oHash(i + vec3(0, 0, 1)), oHash(i + vec3(1, 0, 1)), f.x), mix(oHash(i + vec3(0, 1, 1)), oHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

function vertexShader(pars = '', displace = '') {
  return /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime; uniform float uEnergy;
${VARYINGS}
${NOISE}
${pars}
void main() {
  vec3 p = position; vec3 n = normal; vUv = uv; vA = 0.0; vTint = vec3(1.0);
  float iid = 0.0;
  #ifdef USE_INSTANCING
    iid = float(gl_InstanceID);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  ${displace}
  vP = p; vI = iid;
  vec4 lp = vec4(p, 1.0);
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  vL = lp.xyz;
  vec4 mvPosition = modelViewMatrix * lp;
  vN = normalize(normalMatrix * n);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
}

const FRAG_HEAD = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform float uEnergy;
${VARYINGS}
${NOISE}
const vec3 KEY = vec3(-0.4355, 0.7259, 0.5323);
float fogAmount() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      return smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    return 0.0;
  #endif
}
`;

const FRAG_TAIL = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

const FOG_OPAQUE = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogAmount());
#endif
`;
const FOG_GLASS = /* glsl */ `
#ifdef USE_FOG
  float fogF = fogAmount();
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
  gl_FragColor.a *= 1.0 - 0.85 * fogF;
#endif
`;
const FOG_ADDITIVE = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - fogAmount();
#endif
`;

const BONE_FS = (pars: string, tint: string) => /* glsl */ `
${FRAG_HEAD}
uniform vec3 uBone; uniform vec3 uShade; uniform vec3 uHue; uniform float uRim; uniform float uPorous;
${pars}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float ndl = dot(N, KEY);
  float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
  wrap = wrap * wrap * (3.0 - 2.0 * wrap);
  float g = oNoise(vL * 7.0) * 0.6 + oNoise(vL * 21.0) * 0.4;
  vec3 base = uBone * (1.0 - uPorous * 0.22 + uPorous * 0.22 * g) * vTint;
  vec3 hue = uHue;
  ${tint}
  vec3 col = mix(uShade, base, wrap);
  col += vec3(0.95, 0.46, 0.34) * 0.10 * (1.0 - abs(ndl)) * wrap;
  vec3 H = normalize(KEY + V);
  col += vec3(1.0, 0.95, 0.88) * pow(max(dot(N, H), 0.0), 42.0) * 0.24;
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += hue * fr * uRim * (0.65 + 0.9 * uEnergy);
  col += hue * 0.07 * clamp(0.5 - 0.5 * N.y, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
  ${FOG_OPAQUE}
  ${FRAG_TAIL}
}`;

const GLASS_FS = (pars: string, extra: string) => /* glsl */ `
${FRAG_HEAD}
uniform vec3 uHue; uniform vec3 uDeep; uniform float uOpacity; uniform float uIrid; uniform float uCore; uniform float uRimPow;
${pars}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  float d = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - d, uRimPow);
  vec3 hue = uHue * vTint;
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fr * 1.3 + vL.y * 0.7 + uTime * 0.02));
  vec3 col = mix(uDeep * 0.4, hue, fr) * (0.22 + 1.25 * fr);
  col += film * fr * uIrid * 0.4;
  float core = pow(d, 5.0) * uCore;
  col += hue * core;
  vec3 H = normalize(KEY + V);
  float sp = pow(max(dot(N, H), 0.0), 90.0);
  col += vec3(1.0) * sp * 0.9;
  float a = (0.035 + 0.9 * fr) * uOpacity + sp * 0.6 + core * 0.45;
  ${extra}
  col *= 0.85 + 0.55 * uEnergy;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  ${FOG_GLASS}
  ${FRAG_TAIL}
}`;

const FILAMENT_FS = (pars: string, extra: string) => /* glsl */ `
${FRAG_HEAD}
uniform vec3 uHue; uniform float uIntensity; uniform float uFreq; uniform float uSpeed; uniform float uPulse; uniform float uFade;
${pars}
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  float core = pow(abs(dot(N, V)), 1.3);
  float s = vUv.x;
  float w = 0.5 + 0.5 * sin((s * uFreq - uTime * uSpeed + vI * 0.37 + vA * 3.1) * 6.28318);
  float pulse = pow(w, 10.0);
  float ends = mix(1.0, smoothstep(0.0, 0.07, s) * smoothstep(1.0, 0.93, s), uFade);
  float i = uIntensity * (0.25 + 0.75 * core) * (0.55 + uPulse * pulse * (0.6 + 1.4 * uEnergy)) * ends * (0.75 + 0.5 * uEnergy);
  vec3 hue = uHue * vTint;
  ${extra}
  vec3 col = hue * i + vec3(1.0) * pulse * uPulse * 0.18 * i;
  gl_FragColor = vec4(col, 1.0);
  ${FOG_ADDITIVE}
  ${FRAG_TAIL}
}`;

const GLOW_VS = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uSize;
varying vec2 vUv; varying float vI; varying vec3 vTint;
void main() {
  vUv = uv; vI = 0.0; vTint = vec3(1.0);
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  float s = uSize * length(modelMatrix[0].xyz);
  #ifdef USE_INSTANCING
    c = instanceMatrix * c;
    s *= length(instanceMatrix[0].xyz);
    vI = float(gl_InstanceID);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 mvPosition = modelViewMatrix * c;
  mvPosition.xy += position.xy * s;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GLOW_FS = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform float uEnergy;
uniform vec3 uHue; uniform float uIntensity; uniform float uTwinkle; uniform float uFalloff;
varying vec2 vUv; varying float vI; varying vec3 vTint;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * uFalloff) * (1.0 - smoothstep(0.7, 1.0, r));
  float core = exp(-r * r * 60.0);
  float tw = 1.0 + uTwinkle * 0.5 * sin(uTime * 2.3 + vI * 1.7);
  vec3 col = (uHue * vTint * a + vec3(1.0) * core * 0.5) * uIntensity * tw * (0.7 + 0.6 * uEnergy);
  gl_FragColor = vec4(col, 1.0);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ───────────── Kit ───────────── */

export interface BoneOptions {
  hue: string;
  rim?: number; // Fresnel rim strength (default 0.9)
  porous?: number; // grain 0..1 (default 0.6)
  bone?: string; // base colour override
  pars?: string; // extra GLSL uniform declarations (vertex + fragment)
  vpars?: string; // vertex-only declarations (attributes)
  displace?: string; // vertex hook: may modify p, n, vA (local, pre-instance)
  tint?: string; // fragment hook: may modify base, hue
  side?: THREE.Side;
  uniforms?: Record<string, THREE.IUniform>; // extra uniforms the hooks use
}

export interface GlassOptions {
  hue: string;
  deep?: string;
  opacity?: number; // overall membrane presence (default 0.8)
  irid?: number; // thin-film sheen 0..1 (default 0.35)
  core?: number; // inner light when seen face-on (default 0)
  rimPow?: number; // Fresnel exponent (default 2.2)
  pars?: string;
  vpars?: string;
  displace?: string;
  extra?: string; // fragment hook: may modify col, a
  additive?: boolean;
  uniforms?: Record<string, THREE.IUniform>;
}

export interface FilamentOptions {
  hue: string;
  intensity?: number; // default 1.2
  freq?: number; // pulses per length (default 2)
  speed?: number; // pulse travel speed (default 0.35)
  pulse?: number; // pulse visibility 0..1 (default 0.8)
  fade?: number; // fade the tube's ends 0..1 (default 1)
  pars?: string;
  vpars?: string;
  displace?: string;
  extra?: string;
  uniforms?: Record<string, THREE.IUniform>;
}

export interface GlowOptions {
  hue: string;
  size: number; // world diameter
  intensity?: number; // default 1
  twinkle?: number; // default 0
  falloff?: number; // gaussian falloff (default 5)
}

export interface Kit {
  quality: OrganQuality;
  lite: boolean;
  shared: SharedUniforms;
  geo<T extends THREE.BufferGeometry>(g: T): T;
  bone(o: BoneOptions): THREE.ShaderMaterial;
  glass(o: GlassOptions): THREE.ShaderMaterial;
  filament(o: FilamentOptions): THREE.ShaderMaterial;
  glow(o: GlowOptions): THREE.ShaderMaterial;
  mesh(g: THREE.BufferGeometry, m: THREE.Material, name?: string): THREE.Mesh;
  instanced(g: THREE.BufferGeometry, m: THREE.Material, count: number, name?: string): THREE.InstancedMesh;
  /** A single billboard halo (not raycastable). */
  halo(o: GlowOptions, name?: string): THREE.Mesh;
  /** Instanced billboard halos (not raycastable); size per instance comes from the instance scale. */
  halos(o: GlowOptions, count: number, name?: string): THREE.InstancedMesh;
  dispose(): void;
}

const noRaycast = () => {};

export function createKit(quality: OrganQuality): Kit {
  const shared: SharedUniforms = { uTime: { value: 0 }, uEnergy: { value: 0 } };
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  let quad: THREE.PlaneGeometry | null = null;

  const uniforms = (extra: Record<string, THREE.IUniform>) => ({
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: shared.uTime,
    uEnergy: shared.uEnergy,
    ...extra,
  });
  const color = (hex: string) => ({ value: new THREE.Color(hex) });
  const track = <M extends THREE.Material>(m: M) => (mats.add(m), m);

  const kit: Kit = {
    quality,
    lite: quality === 'lite',
    shared,
    geo(g) {
      geos.add(g);
      return g;
    },
    bone(o) {
      return track(
        new THREE.ShaderMaterial({
          name: 'organ-bone',
          uniforms: uniforms({
            uBone: color(o.bone ?? '#e4d9c7'),
            uShade: color('#231b31'),
            uHue: color(o.hue),
            uRim: { value: o.rim ?? 0.9 },
            uPorous: { value: o.porous ?? 0.6 },
            ...o.uniforms,
          }),
          vertexShader: vertexShader(`${o.pars ?? ''}\n${o.vpars ?? ''}`, o.displace),
          fragmentShader: BONE_FS(o.pars ?? '', o.tint ?? ''),
          side: o.side ?? THREE.FrontSide,
          fog: true,
        }),
      );
    },
    glass(o) {
      return track(
        new THREE.ShaderMaterial({
          name: 'organ-glass',
          uniforms: uniforms({
            uHue: color(o.hue),
            uDeep: color(o.deep ?? '#17121f'),
            uOpacity: { value: o.opacity ?? 0.8 },
            uIrid: { value: o.irid ?? 0.35 },
            uCore: { value: o.core ?? 0 },
            uRimPow: { value: o.rimPow ?? 2.2 },
            ...o.uniforms,
          }),
          vertexShader: vertexShader(`${o.pars ?? ''}\n${o.vpars ?? ''}`, o.displace),
          fragmentShader: GLASS_FS(o.pars ?? '', o.extra ?? ''),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          fog: true,
        }),
      );
    },
    filament(o) {
      return track(
        new THREE.ShaderMaterial({
          name: 'organ-filament',
          uniforms: uniforms({
            uHue: color(o.hue),
            uIntensity: { value: o.intensity ?? 1.2 },
            uFreq: { value: o.freq ?? 2 },
            uSpeed: { value: o.speed ?? 0.35 },
            uPulse: { value: o.pulse ?? 0.8 },
            uFade: { value: o.fade ?? 1 },
            ...o.uniforms,
          }),
          vertexShader: vertexShader(`${o.pars ?? ''}\n${o.vpars ?? ''}`, o.displace),
          fragmentShader: FILAMENT_FS(o.pars ?? '', o.extra ?? ''),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: true,
        }),
      );
    },
    glow(o) {
      return track(
        new THREE.ShaderMaterial({
          name: 'organ-glow',
          uniforms: uniforms({
            uHue: color(o.hue),
            uSize: { value: o.size },
            uIntensity: { value: o.intensity ?? 1 },
            uTwinkle: { value: o.twinkle ?? 0 },
            uFalloff: { value: o.falloff ?? 5 },
          }),
          vertexShader: GLOW_VS,
          fragmentShader: GLOW_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: true,
        }),
      );
    },
    mesh(g, m, name) {
      geos.add(g);
      mats.add(m);
      const mesh = new THREE.Mesh(g, m);
      if (name) mesh.name = name;
      return mesh;
    },
    instanced(g, m, count, name) {
      geos.add(g);
      mats.add(m);
      const mesh = new THREE.InstancedMesh(g, m, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances move every frame; the organ is small and always framed whole
      if (name) mesh.name = name;
      return mesh;
    },
    halo(o, name) {
      quad ??= kit.geo(new THREE.PlaneGeometry(1, 1));
      const m = new THREE.Mesh(quad, kit.glow(o));
      m.frustumCulled = false;
      m.raycast = noRaycast;
      m.renderOrder = 2;
      if (name) m.name = name;
      return m;
    },
    halos(o, count, name) {
      quad ??= kit.geo(new THREE.PlaneGeometry(1, 1));
      const m = new THREE.InstancedMesh(quad, kit.glow({ ...o }), count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.raycast = noRaycast;
      m.renderOrder = 2;
      if (name) m.name = name;
      return m;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      geos.clear();
      mats.clear();
      quad = null;
    },
  };
  return kit;
}

/** Sets a uniform on a material made by the kit (no-op when absent). */
export function setUniform(m: THREE.Material, name: string, value: number) {
  const u = (m as THREE.ShaderMaterial).uniforms?.[name];
  if (u) u.value = value;
}

/** What each sculpture builder returns (index.ts fits it to a unit sphere and drives it). */
export interface Sculpture {
  object: THREE.Object3D;
  /** Pose as a pure function of time (s) and smoothed energy (0..1). */
  animate(t: number, energy: number): void;
  /** Preferred presentation angle (radians) for the render harness and the category chamber. */
  view?: { yaw: number; pitch: number };
}
