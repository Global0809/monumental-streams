/**
 * The TIME HELIX: one vertebra per decade (1900s → 2020s) along a diagonal spine of frost light,
 * with a helical strand on which seeds sit by year (one turn per decade) and a bead per year.
 * The focused decade's vertebra glows frost; vertebrae are pickable (decadeActivate).
 */
import * as THREE from 'three';
import { HELIX_AXIS, HELIX_B2, HELIX_DECADES, HELIX_FIRST, HELIX_LAST, helixAxisPoint, helixPoint } from '../layouts.ts';
import { boneMaterial, lightBeam, vertebraGeometry } from './bone.ts';
import type { FrameCtx, Hit, Piece } from './furniture.ts';
import type { Palette } from './palette.ts';
import { Presence, type SharedUniforms } from './shared.ts';

const STRAND_VS = /* glsl */ `
attribute float aYear;
uniform float uFocusFrom; uniform float uFocusTo; uniform float uLevel;
varying float vA; varying float vDepth; varying float vF;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vF = (aYear >= uFocusFrom && aYear <= uFocusTo) ? 1.0 : 0.0;
  vA = uLevel;
  gl_Position = projectionMatrix * mv;
}`;

const STRAND_FS = /* glsl */ `
uniform vec3 uColor; uniform float uFogDensity;
varying float vA; varying float vDepth; varying float vF;
void main() {
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * vA * (0.28 + 0.6 * vF) * (1.0 - fog), 1.0);
  #include <colorspace_fragment>
}`;

const BEAD_VS = /* glsl */ `
attribute float aYear;
uniform float uPixelRatio; uniform float uFocusFrom; uniform float uFocusTo; uniform float uLevel;
varying float vA; varying float vDepth; varying float vDecade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  float f = (aYear >= uFocusFrom && aYear <= uFocusTo) ? 1.0 : 0.0;
  vDecade = mod(aYear, 10.0) < 0.5 ? 1.0 : 0.0;
  gl_PointSize = uPixelRatio * (vDecade > 0.5 ? 7.0 : 3.6) * (1.0 + f * 0.6) * clamp(28.0 / vDepth, 0.5, 2.0);
  vA = uLevel * (0.45 + 0.55 * f);
  gl_Position = projectionMatrix * mv;
}`;

const BEAD_FS = /* glsl */ `
uniform vec3 uColor; uniform float uFogDensity;
varying float vA; varying float vDepth; varying float vDecade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.25, d) * vA;
  if (a < 0.004) discard;
  float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  gl_FragColor = vec4(uColor * a * (1.0 - fog), 1.0);
  #include <colorspace_fragment>
}`;

export class Helix implements Piece {
  readonly group = new THREE.Group();
  readonly presence = new Presence();
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly bones: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedBufferAttribute;
  private readonly glowLevels: number[];
  private readonly beam: ReturnType<typeof lightBeam>;
  private readonly strand: THREE.Line;
  private readonly beads: THREE.Points;
  private readonly strandMat: THREE.ShaderMaterial;
  private readonly beadMat: THREE.ShaderMaterial;
  private readonly centres: THREE.Vector3[] = [];
  private focusDecade: number | null = null;
  private hovered: number | null = null;

  constructor(palette: Palette, shared: SharedUniforms, lite: boolean) {
    const n = HELIX_DECADES.length;
    this.geo = vertebraGeometry(lite);
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.geo.setAttribute('aGlow', this.glow);
    this.glowLevels = new Array(n).fill(0);
    const axis = new THREE.Vector3(...HELIX_AXIS);
    this.mat = boneMaterial(palette, shared, { core: palette.frost, glow: palette.frost, axisDir: axis });
    this.bones = new THREE.InstancedMesh(this.geo, this.mat, n);
    const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const down = new THREE.Vector3(...HELIX_B2).negate();
    const side = new THREE.Vector3().crossVectors(axis, down);
    const lateral = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, axis, down));
    const m = new THREE.Matrix4();
    HELIX_DECADES.forEach((d, i) => {
      const c = new THREE.Vector3(...helixAxisPoint(d + 5));
      this.centres.push(c);
      // lateral profile: centrum below the line of light, spinous process above, a slight sway
      const sway = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i * 1.3) * 0.12);
      const q = lateral.clone().multiply(sway);
      const s = 0.95;
      m.compose(c, q, new THREE.Vector3(s, s, s));
      this.bones.setMatrixAt(i, m);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    this.bones.computeBoundingSphere();

    const span = (HELIX_LAST + 1 - HELIX_FIRST) * 0.42 + 6;
    this.beam = lightBeam(palette.frost, span, 0.07, shared, 0);
    this.beam.mesh.quaternion.copy(align);
    this.beam.mesh.position.set(...helixAxisPoint((HELIX_FIRST + HELIX_LAST + 1) / 2));

    // strand + year beads
    const pts: number[] = [];
    const yrs: number[] = [];
    for (let y = HELIX_FIRST; y <= HELIX_LAST + 1; y += lite ? 0.25 : 0.125) {
      pts.push(...helixPoint(y));
      yrs.push(y);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sg.setAttribute('aYear', new THREE.Float32BufferAttribute(yrs, 1));
    const focusUniforms = { uFocusFrom: { value: -1 }, uFocusTo: { value: -1 }, uLevel: { value: 1 } };
    this.strandMat = new THREE.ShaderMaterial({
      vertexShader: STRAND_VS,
      fragmentShader: STRAND_FS,
      uniforms: { ...focusUniforms, uColor: { value: palette.frost.clone() }, uFogDensity: shared.uFogDensity },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.strand = new THREE.Line(sg, this.strandMat);
    const bp: number[] = [];
    const by: number[] = [];
    for (let y = HELIX_FIRST; y <= HELIX_LAST; y++) {
      bp.push(...helixPoint(y + 0.5));
      by.push(y);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('aYear', new THREE.Float32BufferAttribute(by, 1));
    this.beadMat = new THREE.ShaderMaterial({
      vertexShader: BEAD_VS,
      fragmentShader: BEAD_FS,
      uniforms: {
        uFocusFrom: focusUniforms.uFocusFrom,
        uFocusTo: focusUniforms.uFocusTo,
        uLevel: { value: 1 },
        uColor: { value: palette.frost.clone() },
        uPixelRatio: shared.uPixelRatio,
        uFogDensity: shared.uFogDensity,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.beads = new THREE.Points(bg, this.beadMat);
    this.group.add(this.bones, this.beam.mesh, this.strand, this.beads);
  }

  setFocus(decade: number | null, year: number | null) {
    this.focusDecade = decade;
    const from = year ?? decade ?? -1;
    const to = year ?? (decade != null ? decade + 9 : -1);
    this.strandMat.uniforms.uFocusFrom.value = from;
    this.strandMat.uniforms.uFocusTo.value = to;
  }

  setHovered(decade: number | null) {
    this.hovered = decade;
  }

  update(dt: number, _ctx: FrameCtx): boolean {
    let busy = this.presence.step(dt);
    const l = this.presence.level;
    this.group.visible = l > 0.004;
    this.mat.uniforms.uLevel.value = l;
    this.beam.mat.uniforms.uLevel.value = l * 0.9;
    this.strandMat.uniforms.uLevel.value = l;
    this.beadMat.uniforms.uLevel.value = l;
    const arr = this.glow.array as Float32Array;
    HELIX_DECADES.forEach((d, i) => {
      const target = d === this.focusDecade ? 1 : d === this.hovered ? 0.6 : 0;
      const v = target + (this.glowLevels[i] - target) * Math.exp(-6 * dt);
      if (Math.abs(v - target) > 0.002) busy = true;
      this.glowLevels[i] = Math.abs(v - target) < 0.002 ? target : v;
      arr[i] = this.glowLevels[i];
    });
    this.glow.needsUpdate = true;
    return busy;
  }

  pick(x: number, y: number, ctx: FrameCtx): Hit | null {
    if (this.presence.level < 0.5) return null;
    const cam = ctx.camera;
    const v = new THREE.Vector3();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const ppuK = ctx.view.h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    let best: Hit | null = null;
    this.centres.forEach((c, i) => {
      const depth = v.copy(c).sub(cam.position).dot(fwd);
      if (depth < 0.5) return;
      v.copy(c).project(cam);
      const sx = ((v.x + 1) / 2) * ctx.view.w;
      const sy = ((1 - v.y) / 2) * ctx.view.h;
      const r = 1.2 * (ppuK / depth);
      if ((x - sx) ** 2 + (y - sy) ** 2 > r * r) return;
      if (!best || depth < best.depth) best = { kind: 'decade', id: String(HELIX_DECADES[i]), depth };
    });
    return best;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.bones.dispose();
    this.beam.geo.dispose();
    this.beam.mat.dispose();
    this.strand.geometry.dispose();
    this.strandMat.dispose();
    this.beads.geometry.dispose();
    this.beadMat.dispose();
    this.group.removeFromParent();
  }
}
