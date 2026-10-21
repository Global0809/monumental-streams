/** A soft additive billboard halo (cores, crowns, beacons). Not raycastable. */
import * as THREE from 'three';
import type { SharedUniforms } from './shared.ts';

const VS = /* glsl */ `
uniform float uSize;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  vUv = position.xy * 2.0; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity; uniform float uFalloff; uniform float uFogDensity; uniform float uRing;
varying vec2 vUv; varying float vDepth;
void main() {
  float d = length(vUv);
  float g = exp(-d * d * uFalloff) * uIntensity;
  g += uRing * smoothstep(0.05, 0.0, abs(d - 0.62)) * 0.6;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * g * (1.0 - fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function glowSprite(color: THREE.Color, size: number, shared: SharedUniforms, falloff = 5) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      uColor: { value: color.clone() },
      uSize: { value: size },
      uIntensity: { value: 1 },
      uFalloff: { value: falloff },
      uRing: { value: 0 },
      uFogDensity: shared.uFogDensity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.raycast = () => undefined;
  return { mesh, mat, geo };
}
