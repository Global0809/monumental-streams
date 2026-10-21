/**
 * Neutral form (Home, World, Time Machine, My World): a seed core — a glass capsule with an inner
 * light, girdled by a collar of vertebrae, in the section's hue. Quiet by design.
 */
import * as THREE from 'three';
import type { Kit, Sculpture } from '../kit.ts';
import type { OrganPalette } from '../palette.ts';
import { circle, column } from '../parts.ts';

export function neutral(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const hue = pal.hue;
  const capsule = kit.mesh(new THREE.CapsuleGeometry(0.3, 0.55, kit.lite ? 6 : 10, kit.lite ? 16 : 28), kit.glass({ hue, deep: pal.deep, opacity: 0.8, core: 0.7, irid: 0.4 }), 'seed');
  root.add(capsule);
  root.add(kit.halo({ hue, size: 1.1, intensity: 0.8 }, 'seed-glow'));
  const ring = new THREE.Group();
  ring.rotation.x = Math.PI / 2 - 0.25;
  ring.add(column(kit, circle(0.42, 48), 22, kit.bone({ hue, rim: 1.0 }), { size: () => 0.12, detail: 'simple', closed: true }));
  root.add(ring);
  return {
    object: root,
    animate(t, e) {
      ring.rotation.z = t * (0.08 + 0.2 * e);
      capsule.rotation.y = t * 0.1;
    },
  };
}
