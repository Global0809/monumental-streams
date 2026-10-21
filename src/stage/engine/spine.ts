/**
 * The MONUMENTAL SPINE (Home): a tall column of bone-white vertebrae, broad at the base and
 * finer towards the crown, threaded by a line of light whose pulses climb it. It turns slowly;
 * a gold crown halo marks its summit.
 */
import * as THREE from 'three';
import { boneMaterial, lightBeam, vertebraGeometry } from './bone.ts';
import type { FrameCtx, Piece } from './furniture.ts';
import { glowSprite } from './glow.ts';
import type { Palette } from './palette.ts';
import { Presence, type SharedUniforms } from './shared.ts';

export class Spine implements Piece {
  readonly group = new THREE.Group();
  readonly presence = new Presence();
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly bones: THREE.InstancedMesh;
  private readonly beams: ReturnType<typeof lightBeam>[];
  private readonly crown: ReturnType<typeof glowSprite>;
  private readonly column = new THREE.Group();

  constructor(palette: Palette, shared: SharedUniforms, lite: boolean) {
    const count = lite ? 15 : 24;
    this.geo = vertebraGeometry(lite);
    this.mat = boneMaterial(palette, shared, { core: palette.gold.clone().lerp(palette.pearl, 0.3), glow: palette.gold, axisDir: new THREE.Vector3(0, 1, 0) });
    this.bones = new THREE.InstancedMesh(this.geo, this.mat, count);
    this.geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let y = -11.2;
    let top = y;
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const s = (1.08 - 0.5 * f) * (lite ? 1.25 : 1);
      e.set(Math.sin(i * 0.9) * 0.06, i * 0.36 + Math.sin(i * 0.5) * 0.1, Math.cos(i * 0.7) * 0.05);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(0, y, 0), q, new THREE.Vector3(s, s, s));
      this.bones.setMatrixAt(i, m);
      top = y;
      y += 0.86 * s * (lite ? 0.85 : 1) + 0.12;
    }
    this.bones.instanceMatrix.needsUpdate = true;
    this.bones.computeBoundingSphere();
    this.column.add(this.bones);

    const len = top + 13.5;
    const core = lightBeam(palette.gold.clone().lerp(palette.pearl, 0.4), len, 0.06, shared, 0);
    core.mesh.position.y = -12 + len / 2;
    const aura = lightBeam(palette.iris.clone().multiplyScalar(0.4), len, 0.5, shared, 1);
    aura.mesh.position.y = core.mesh.position.y;
    (aura.mat.uniforms.uLevel as { value: number }).value = 0.22;
    this.beams = [core, aura];
    this.crown = glowSprite(palette.gold, 5.2, shared, 6);
    this.crown.mesh.position.y = top + 1.4;
    this.crown.mat.uniforms.uRing.value = 0.3;
    this.group.add(this.column, core.mesh, aura.mesh, this.crown.mesh);
  }

  update(dt: number, ctx: FrameCtx): boolean {
    const changed = this.presence.step(dt);
    const l = this.presence.level;
    this.group.visible = l > 0.004;
    this.mat.uniforms.uLevel.value = l;
    this.beams[0].mat.uniforms.uLevel.value = l;
    this.beams[1].mat.uniforms.uLevel.value = l * 0.22;
    this.crown.mat.uniforms.uIntensity.value = l * (0.55 + 0.15 * Math.sin(ctx.t * 1.1));
    this.column.rotation.y = ctx.t * 0.05;
    this.group.scale.setScalar(0.85 + 0.15 * l);
    return changed;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.bones.dispose();
    for (const b of this.beams) {
      b.geo.dispose();
      b.mat.dispose();
    }
    this.crown.geo.dispose();
    this.crown.mat.dispose();
    this.group.removeFromParent();
  }
}
