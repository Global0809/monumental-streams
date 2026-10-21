/**
 * Shared anatomy for the Monumental spine (Home) and the time helix: a procedural vertebra
 * (spool-shaped centrum, neural ring around the light canal, transverse and spinous processes)
 * and a self-lit bone material — bone-white with subsurface warmth on the shadow side, an iris
 * Fresnel rim, and the inner light of the canal glowing on the surfaces that face it.
 * The canal sits at the origin so a column of vertebrae threads a single line of light.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Palette } from './palette.ts';
import type { SharedUniforms } from './shared.ts';

/** A tapering, round-tipped bony process along +Y from the origin. */
function processGeometry(length: number, base: number, lite: boolean): THREE.BufferGeometry {
  const pts = [
    [0.0, 0.0],
    [base, 0.0],
    [base * 0.92, length * 0.22],
    [base * 0.62, length * 0.55],
    [base * 0.42, length * 0.82],
    [base * 0.3, length * 0.95],
    [0.0, length],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, lite ? 7 : 12);
}

export function vertebraGeometry(lite: boolean): THREE.BufferGeometry {
  const seg = lite ? 18 : 30;
  const profile = [
    [0.0, -0.26],
    [0.5, -0.29],
    [0.66, -0.24],
    [0.6, -0.08],
    [0.58, 0.0],
    [0.6, 0.08],
    [0.66, 0.24],
    [0.5, 0.29],
    [0.0, 0.26],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const centrum = new THREE.LatheGeometry(profile, seg);
  centrum.translate(0, 0, 0.98);
  const ring = new THREE.TorusGeometry(0.36, 0.085, lite ? 6 : 10, lite ? 16 : 28);
  ring.rotateX(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [centrum, ring];
  for (const side of [-1, 1]) {
    const proc = processGeometry(0.95, 0.14, lite);
    proc.rotateZ((side * -Math.PI) / 2);
    proc.rotateY(side * 0.38);
    proc.translate(side * 0.34, 0.02, 0.08);
    parts.push(proc);
    const pedicle = new THREE.CylinderGeometry(0.075, 0.09, 0.62, lite ? 6 : 8);
    pedicle.rotateX(Math.PI / 2);
    pedicle.translate(side * 0.3, 0, 0.52);
    parts.push(pedicle);
  }
  const spinous = processGeometry(0.78, 0.13, lite);
  spinous.rotateX(-Math.PI / 2 - 0.42);
  spinous.translate(0, 0.06, -0.3);
  parts.push(spinous);
  for (const g of parts) g.deleteAttribute('uv');
  const merged = mergeGeometries(parts, false) ?? centrum;
  for (const g of parts) if (g !== merged) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

const BONE_VS = /* glsl */ `
attribute float aGlow;
varying vec3 vN; varying vec3 vW; varying float vGlow; varying vec3 vLocal; varying float vDepth;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vW = wp.xyz;
  vGlow = aGlow;
  vLocal = position;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const BONE_FS = /* glsl */ `
uniform vec3 uBone; uniform vec3 uWarm; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uCore; uniform vec3 uGlowColor;
uniform vec3 uAxisPoint; uniform vec3 uAxisDir; uniform float uLevel; uniform float uTime; uniform float uMotion;
uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vGlow; varying vec3 vLocal; varying float vDepth;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  vec3 key = normalize(vec3(-0.5, 0.75, 0.45));
  float ndl = dot(n, key);
  float wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
  // shadow side sinks to violet with a warm subsurface band at the terminator
  vec3 col = mix(uShade, uBone, wrap * wrap);
  col += uWarm * exp(-pow((ndl + 0.05) * 3.2, 2.0)) * 0.2;
  // porous grain
  col *= 0.9 + 0.1 * h3(floor(vLocal * 38.0));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uRim * fres * 0.55;
  // the canal's light: surfaces facing the axis glow
  vec3 d = vW - uAxisPoint;
  vec3 radial = d - uAxisDir * dot(d, uAxisDir);
  float rd = length(radial);
  float faces = clamp(dot(n, -radial / max(rd, 1e-3)), 0.0, 1.0);
  float pulse = 0.75 + 0.25 * sin(dot(d, uAxisDir) * 0.9 - uTime * 1.6 * uMotion);
  col += uCore * faces * exp(-rd * 1.6) * 1.4 * pulse;
  col += uGlowColor * vGlow * (0.35 + fres * 1.2);
  col *= 0.92;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog * 0.95 + (1.0 - uLevel), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function boneMaterial(palette: Palette, shared: SharedUniforms, opts: { core: THREE.Color; glow: THREE.Color; axisDir: THREE.Vector3 }) {
  return new THREE.ShaderMaterial({
    vertexShader: BONE_VS,
    fragmentShader: BONE_FS,
    uniforms: {
      uBone: { value: palette.bone.clone().multiplyScalar(0.74) },
      uWarm: { value: palette.warm.clone() },
      uShade: { value: new THREE.Color('#231b31') },
      uRim: { value: palette.iris.clone() },
      uCore: { value: opts.core.clone() },
      uGlowColor: { value: opts.glow.clone() },
      uAxisPoint: { value: new THREE.Vector3() },
      uAxisDir: { value: opts.axisDir.clone().normalize() },
      uLevel: { value: 1 },
      uTime: shared.uTime,
      uMotion: shared.uMotion,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
  });
}

const BEAM_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FS = /* glsl */ `
uniform vec3 uColor; uniform float uLevel; uniform float uTime; uniform float uMotion; uniform float uLength; uniform float uFogDensity; uniform float uSoft;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vDepth;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), v));
  float core = mix(pow(facing, 2.0), pow(facing, 6.0), uSoft);
  float y = vUv.y * uLength;
  float travel = pow(0.5 + 0.5 * sin(y * 0.7 - uTime * 2.2 * uMotion), 10.0);
  float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  float a = core * ends * (0.55 + 0.9 * travel) * uLevel;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * a * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** An additive line of light (a tube seen as a soft glowing filament) with pulses travelling up it. */
export function lightBeam(color: THREE.Color, length: number, radius: number, shared: SharedUniforms, soft = 0) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS,
    fragmentShader: BEAM_FS,
    uniforms: {
      uColor: { value: color.clone() },
      uLevel: { value: 1 },
      uLength: { value: length },
      uSoft: { value: soft },
      uTime: shared.uTime,
      uMotion: shared.uMotion,
      uFogDensity: shared.uFogDensity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return { mesh, mat, geo };
}
