/**
 * Category ORGANS — nine original procedural biomechanical sculptures, one per category (plus
 * Live), all from one family: bone-white vertebral parts, glass membranes with Fresnel rims and
 * thin luminous filaments, each in its category's signature hue (docs/ART-DIRECTION.md).
 *
 *   createOrgan(section, { quality }) → { object, radius, update(t, energy), dispose() }
 *
 * - object: a THREE.Group centred on its origin and fitted to a unit sphere (radius = 1); scale
 *   it to taste. object.userData = { section, view: { yaw, pitch }, triangles }.
 * - update(timeSeconds, energy): energy 0..1 rises while the organ is hovered / selected /
 *   active; it is eased internally (and snaps when the clock is frozen, e.g. reduced motion, so
 *   a still frame always shows the requested state). Every pose is a pure function of
 *   (time, eased energy): calling update with a constant time renders a still sculpture.
 * - Materials are self-lit (no scene lights needed), honour scene fog and the renderer's tone
 *   mapping / output colour space, and need no textures or network.
 * - quality 'lite' halves segment counts and drops secondary parts.
 * - dispose() releases every geometry and material and detaches the object.
 *
 * Sections without an organ (home, world, time-machine, my-world) get a quiet neutral form.
 */
import * as THREE from 'three';
import type { SectionId } from '../../../shared/sections.ts';
import { triangleCount } from './geometry.ts';
import { createKit, type Kit, type OrganQuality, type Sculpture } from './kit.ts';
import { approachEnergy } from './motion.ts';
import { ORGAN_PALETTE, type OrganPalette } from './palette.ts';
import { culture } from './sculptures/culture.ts';
import { fashion } from './sculptures/fashion.ts';
import { gaming } from './sculptures/gaming.ts';
import { kids } from './sculptures/kids.ts';
import { live } from './sculptures/live.ts';
import { movies } from './sculptures/movies.ts';
import { music } from './sculptures/music.ts';
import { neutral } from './sculptures/neutral.ts';
import { news } from './sculptures/news.ts';
import { sports } from './sculptures/sports.ts';

export type { OrganQuality } from './kit.ts';
export { ORGAN_PALETTE, ORGAN_SECTIONS, FAMILY, isOrganSection, organArtId, type OrganPalette, type OrganSection } from './palette.ts';

export interface Organ {
  object: THREE.Object3D;
  /** Bounding radius in the object's local units (always 1: organs are fitted to a unit sphere). */
  radius: number;
  /** timeSeconds: monotonic clock; energy 0..1 rises when hovered / selected / active. */
  update(timeSeconds: number, energy: number): void;
  dispose(): void;
}

type Builder = (kit: Kit, pal: OrganPalette) => Sculpture;

const BUILDERS: Partial<Record<SectionId, Builder>> = { live, movies, music, sports, gaming, news, fashion, culture, kids };

const DEFAULT_VIEW = { yaw: 0.3, pitch: 0.15 };

/**
 * Centre and radius of everything visible under `root` (halos excluded), measured in root space.
 * Instanced meshes count every instance.
 */
export function measure(root: THREE.Object3D): { center: THREE.Vector3; radius: number } {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pts: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const im = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const mat = mesh.material as THREE.Material;
    if (mat?.name === 'organ-glow') return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 1500));
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    const base = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      if (inst) {
        inst.getMatrixAt(k, im);
        world.multiplyMatrices(base, im);
      } else world.copy(base);
      for (let i = 0; i < pos.count; i += stride) {
        v.fromBufferAttribute(pos, i).applyMatrix4(world);
        box.expandByPoint(v);
        pts.push(v.clone());
      }
    }
  });
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  let r2 = 0;
  for (const p of pts) r2 = Math.max(r2, p.distanceToSquared(center));
  return { center, radius: Math.sqrt(r2) || 1 };
}

export function createOrgan(section: SectionId, opts: { quality: OrganQuality }): Organ {
  const kit = createKit(opts.quality === 'lite' ? 'lite' : 'webgl');
  const pal = ORGAN_PALETTE[section] ?? ORGAN_PALETTE.home;
  const build = BUILDERS[section] ?? neutral;
  const sculpture = build(kit, pal);

  const root = new THREE.Group();
  root.name = `organ:${section}`;
  const fit = new THREE.Group();
  fit.name = 'organ-fit';
  fit.add(sculpture.object);
  root.add(fit);

  // Fit to a unit sphere using the calm and the fully energised pose.
  sculpture.animate(0, 0);
  const calm = measure(fit);
  sculpture.animate(0, 1);
  const lively = measure(fit);
  const center = calm.center.clone().lerp(lively.center, 0.5);
  const radius = Math.max(calm.radius + calm.center.distanceTo(center), lively.radius + lively.center.distanceTo(center)) * 1.02;
  fit.scale.setScalar(1 / radius);
  fit.position.copy(center).multiplyScalar(-1 / radius);

  root.userData = { section, view: sculpture.view ?? DEFAULT_VIEW, triangles: triangleCount(root) };

  let energy = 0;
  let last = Number.NaN;
  let disposed = false;
  const update = (timeSeconds: number, target: number) => {
    if (disposed) return;
    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    energy = approachEnergy(energy, target, Number.isNaN(last) ? 0 : t - last);
    last = t;
    kit.shared.uTime.value = t;
    kit.shared.uEnergy.value = energy;
    sculpture.animate(t, energy);
  };
  update(0, 0);

  return {
    object: root,
    radius: 1,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose();
          if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
        }
      });
      kit.dispose();
      root.clear();
    },
  };
}
