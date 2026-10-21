/**
 * The PERSONAL CORE (My World): a breathing glass nucleus — iris light inside, a gold Fresnel
 * skin — with two faint orbit rings. Saved seeds circle it; a save lands in it with a flash.
 */
import * as THREE from 'three';
import type { FrameCtx, Piece } from './furniture.ts';
import { glowSprite } from './glow.ts';
import type { Palette } from './palette.ts';
import { Presence, type SharedUniforms } from './shared.ts';

const CORE_VS = /* glsl */ `
uniform float uTime; uniform float uMotion; uniform float uFlash;
varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vD;
void main() {
  vec3 n = normalize(normal);
  float t = uTime * uMotion;
  float d = sin(n.x * 4.0 + t * 0.9) * sin(n.y * 5.0 - t * 0.7) * sin(n.z * 3.0 + t * 0.6);
  vD = d;
  vec3 p = position + n * (d * 0.09 + uFlash * 0.12);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * n); vW = wp.xyz;
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const CORE_FS = /* glsl */ `
uniform vec3 uInner; uniform vec3 uRim; uniform vec3 uDeep; uniform float uLevel; uniform float uFlash; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vN; varying vec3 vW; varying float vDepth; varying float vD;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = max(dot(normalize(vN), v), 0.0);
  float fres = pow(1.0 - facing, 2.2);
  vec3 col = mix(uDeep, uInner * 1.25, pow(facing, 5.0)) * (0.9 + vD * 0.6);
  col += uRim * fres * 1.5;
  col += vec3(1.0, 0.95, 0.85) * uFlash * 0.8;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, fog * 0.9);
  gl_FragColor = vec4(col, uLevel * (0.82 + 0.18 * fres));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Core implements Piece {
  readonly group = new THREE.Group();
  readonly presence = new Presence();
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly halo: ReturnType<typeof glowSprite>;
  private readonly rings: { mesh: THREE.Mesh; geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial }[] = [];
  private flash = 0;

  constructor(palette: Palette, shared: SharedUniforms, lite: boolean) {
    this.geo = new THREE.IcosahedronGeometry(1.3, lite ? 12 : 24);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: CORE_VS,
      fragmentShader: CORE_FS,
      uniforms: {
        uInner: { value: palette.iris.clone().lerp(palette.pearl, 0.15) },
        uRim: { value: palette.gold.clone() },
        uDeep: { value: palette.irisDeep.clone().multiplyScalar(0.35) },
        uLevel: { value: 1 },
        uFlash: { value: 0 },
        uTime: shared.uTime,
        uMotion: shared.uMotion,
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
      },
      transparent: true,
    });
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.renderOrder = 6;
    this.halo = glowSprite(palette.iris.clone().lerp(palette.gold, 0.3), 8, shared, 6);
    this.group.add(this.halo.mesh, mesh);
    for (const [r, tilt] of [
      [3.9, 0.3],
      [5.2, -0.22],
    ] as const) {
      const g = new THREE.TorusGeometry(r, 0.012, 4, lite ? 96 : 160);
      const m = new THREE.MeshBasicMaterial({ color: palette.gold, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.Mesh(g, m);
      ring.rotation.x = Math.PI / 2 + tilt;
      this.group.add(ring);
      this.rings.push({ mesh: ring, geo: g, mat: m });
    }
  }

  /** A save just landed. */
  receive() {
    this.flash = 1;
  }

  update(dt: number, ctx: FrameCtx): boolean {
    let busy = this.presence.step(dt);
    const l = this.presence.level;
    this.group.visible = l > 0.004;
    this.group.scale.setScalar(0.5 + 0.5 * l + this.flash * 0.12);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt / 0.7);
      busy = true;
    }
    this.mat.uniforms.uLevel.value = l;
    this.mat.uniforms.uFlash.value = this.flash;
    this.halo.mat.uniforms.uIntensity.value = l * (0.32 + 0.08 * Math.sin(ctx.t * 1.3) + this.flash * 0.9);
    this.rings.forEach((r, i) => {
      r.mat.opacity = 0.2 * l;
      r.mesh.rotation.z = ctx.t * (i ? -0.04 : 0.05);
    });
    return busy;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.halo.geo.dispose();
    this.halo.mat.dispose();
    for (const r of this.rings) {
      r.geo.dispose();
      r.mat.dispose();
    }
    this.group.removeFromParent();
  }
}
