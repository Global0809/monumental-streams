/**
 * The night itself: a full-screen gradient (deep violet-black, a soft bloom of light on the
 * world's open side tinted by the current category, a vignette) and a field of slow motes that
 * gives the space depth. Both are cheap: one triangle and one Points draw.
 */
import * as THREE from 'three';
import type { Palette } from './palette.ts';
import type { SharedUniforms } from './shared.ts';

const BG_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

const BG_FS = /* glsl */ `
uniform vec3 uNight; uniform vec3 uDeep; uniform vec3 uTint; uniform vec2 uGlow; uniform float uAspect; uniform float uLevel; uniform float uWarm; uniform vec3 uGold;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv - uGlow; p.x *= uAspect;
  float d = length(p);
  float bloom = exp(-d * d * 3.4) * 0.4 * uLevel;
  float under = exp(-pow(length((vUv - vec2(0.5, -0.15)) * vec2(uAspect * 0.6, 1.0)), 2.0) * 3.0) * 0.25;
  vec3 col = uNight;
  col += uDeep * bloom;
  col += uTint * bloom * 0.35;
  col += uGold * under * uWarm * 0.12;
  vec2 v = vUv - 0.5; v.x *= uAspect * 0.8;
  col *= 1.0 - smoothstep(0.35, 1.1, length(v)) * 0.55;
  col += (hash(vUv * 913.0) - 0.5) * 0.012; // dither against banding
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const DUST_VS = /* glsl */ `
attribute float aSeed;
uniform float uTime; uniform float uPixelRatio; uniform float uLevel; uniform float uMotion;
varying float vA; varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime * uMotion;
  p.x += sin(t * 0.05 + aSeed * 31.0) * 1.4;
  p.y += sin(t * 0.07 + aSeed * 17.0) * 0.9 + t * 0.02 * (aSeed - 0.5);
  p.z += cos(t * 0.04 + aSeed * 11.0) * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  gl_PointSize = clamp((1.2 + aSeed * 2.4) * uPixelRatio * 26.0 / max(depth, 1.0), 0.0, 6.0 * uPixelRatio);
  float twinkle = 0.65 + 0.35 * sin(t * (0.6 + aSeed) + aSeed * 40.0);
  vA = uLevel * twinkle * smoothstep(1.0, 6.0, depth) * (1.0 - smoothstep(60.0, 120.0, depth));
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FS = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
varying float vA; varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float a = smoothstep(0.5, 0.0, d) * vA;
  if (a < 0.003) discard;
  vec3 col = vSeed < 0.6 ? uA : (vSeed < 0.86 ? uB : uC);
  gl_FragColor = vec4(col * a * 0.55, 1.0);
  #include <colorspace_fragment>
}`;

export class Backdrop {
  readonly bg: THREE.Mesh;
  readonly dust: THREE.Points;
  private readonly bgMat: THREE.ShaderMaterial;
  private readonly dustMat: THREE.ShaderMaterial;
  private readonly tint = new THREE.Color(0, 0, 0);
  private readonly tintTarget = new THREE.Color(0, 0, 0);
  private glowX = 0.66;
  private glowTarget = 0.66;
  private readonly full: number;

  constructor(palette: Palette, shared: SharedUniforms, quality: 'webgl' | 'lite') {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VS,
      fragmentShader: BG_FS,
      uniforms: {
        uNight: { value: palette.night.clone() },
        uDeep: { value: palette.irisDeep.clone().multiplyScalar(0.36) },
        uTint: { value: this.tint },
        uGold: { value: palette.gold.clone() },
        uGlow: { value: new THREE.Vector2(0.66, 0.56) },
        uAspect: { value: 1.6 },
        uLevel: { value: 1 },
        uWarm: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.bg = new THREE.Mesh(tri, this.bgMat);
    this.bg.frustumCulled = false;
    this.bg.renderOrder = -1000;

    this.full = quality === 'lite' ? 650 : 1500;
    const pos = new Float32Array(this.full * 3);
    const seed = new Float32Array(this.full);
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < this.full; i++) {
      pos[i * 3] = (rnd() - 0.5) * 150;
      pos[i * 3 + 1] = (rnd() - 0.5) * 80;
      pos[i * 3 + 2] = -95 + rnd() * 120;
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VS,
      fragmentShader: DUST_FS,
      uniforms: {
        uTime: shared.uTime,
        uMotion: shared.uMotion,
        uPixelRatio: shared.uPixelRatio,
        uLevel: { value: 1 },
        uA: { value: palette.lilac.clone() },
        uB: { value: palette.gold.clone() },
        uC: { value: palette.frost.clone() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = -10;
  }

  /** Lighter density after a downgrade. */
  setLite(lite: boolean) {
    this.dust.geometry.setDrawRange(0, lite ? Math.round(this.full * 0.45) : this.full);
  }

  setTint(hex: string | null) {
    if (hex) this.tintTarget.set(hex).multiplyScalar(0.5);
    else this.tintTarget.setRGB(0, 0, 0);
  }

  setGlow(bias: number, level: number, haze: number, warm: number) {
    this.glowTarget = 0.5 + bias * 0.95;
    this.bgMat.uniforms.uLevel.value = level;
    this.bgMat.uniforms.uWarm.value = warm;
    this.dustMat.uniforms.uLevel.value = haze;
  }

  setAspect(a: number) {
    this.bgMat.uniforms.uAspect.value = a;
  }

  /** Jump to the targets (reduced motion / instant cuts). */
  snap() {
    this.tint.copy(this.tintTarget);
    this.glowX = this.glowTarget;
    (this.bgMat.uniforms.uGlow.value as THREE.Vector2).set(this.glowX, 0.56);
  }

  /** Ease tint and glow; returns true while changing. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-2.2 * dt);
    const before = this.tint.r + this.tint.g + this.tint.b + this.glowX;
    this.tint.lerp(this.tintTarget, k);
    this.glowX += (this.glowTarget - this.glowX) * k;
    (this.bgMat.uniforms.uGlow.value as THREE.Vector2).set(this.glowX, 0.56);
    const after = this.tint.r + this.tint.g + this.tint.b + this.glowX;
    return Math.abs(after - before) > 1e-4;
  }

  dispose() {
    this.bg.geometry.dispose();
    this.bgMat.dispose();
    this.dust.geometry.dispose();
    this.dustMat.dispose();
  }
}
