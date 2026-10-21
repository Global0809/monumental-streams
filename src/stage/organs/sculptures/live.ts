/**
 * LIVE — the Dormant Beacon. A teardrop glass membrane on a vertebral stalk, held in a lantern
 * cage of bone meridians around an unlit bone core, with two still rings at rest around it.
 * Signal red appears only as an outline (the membrane's Fresnel rim and the rings): nothing
 * pulses, rotates or broadcasts, because nothing is live. Energy (hover, focus) only brightens
 * the outline a little, as an acknowledgement.
 */
import * as THREE from 'three';
import { domed, merge, plain, tube } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import { setUniform } from '../kit.ts';
import { lerp } from '../motion.ts';
import type { OrganPalette } from '../palette.ts';
import { circle, column, curve } from '../parts.ts';

/** Teardrop profile: radius at height y for the beacon membrane (base y0 → tip y1). */
export function beaconRadius(s: number): number {
  // s 0 (bottom) → 1 (tip): round belly low, drawn to a soft point at the top
  const belly = Math.sin(Math.PI * Math.min(1, s * 1.35)) * (1 - s) ** 0.35;
  return 0.36 * Math.max(0, belly) + 0.002;
}

export function live(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const bone = kit.bone({ hue, rim: 0.6 });
  const Y0 = -0.32;
  const Y1 = 0.86;

  /* Stalk + foot */
  root.add(column(kit, curve([[0, -0.96, 0], [0.01, -0.66, 0.01], [0, -0.3, 0]]), 7, bone, { size: (s) => 0.13 - 0.04 * s }));
  const foot = new THREE.TorusGeometry(0.17, 0.028, 6, lite ? 24 : 40);
  foot.rotateX(Math.PI / 2);
  foot.translate(0, -0.97, 0);
  root.add(kit.mesh(foot, bone, 'foot'));

  /* Beacon membrane (outline-only glass) */
  const prof: THREE.Vector2[] = [];
  const steps = lite ? 18 : 36;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    prof.push(new THREE.Vector2(beaconRadius(s), Y0 + s * (Y1 - Y0)));
  }
  const membraneMat = kit.glass({ hue, deep: pal.deep, opacity: 0.95, irid: 0, core: 0, rimPow: 2.8 });
  root.add(kit.mesh(plain(new THREE.LatheGeometry(prof, lite ? 28 : 56)), membraneMat, 'beacon-membrane'));

  /* Lantern cage: bone meridians just inside the membrane */
  const meridians = lite ? 4 : 7;
  const ribs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < meridians; k++) {
    const a = (k / meridians) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let i = 1; i < 24; i++) {
      const s = i / 24;
      const r = beaconRadius(s) * 0.9;
      pts.push([Math.cos(a) * r, Y0 + s * (Y1 - Y0), Math.sin(a) * r]);
    }
    ribs.push(tube(curve(pts), { segments: lite ? 20 : 40, radial: 4, radius: domed(0.008, 0.05) }));
  }
  const collar = new THREE.TorusGeometry(0.2, 0.026, 6, lite ? 24 : 40);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, Y0 + 0.07, 0);
  ribs.push(plain(collar));
  root.add(kit.mesh(merge(ribs), bone, 'lantern-cage'));

  /* Unlit core */
  const core = kit.mesh(new THREE.IcosahedronGeometry(0.1, lite ? 2 : 3), kit.bone({ hue, rim: 0.7, porous: 0.8 }), 'core-unlit');
  core.position.y = Y0 + 0.36;
  root.add(core);

  /* Two still rings at rest */
  const outline = kit.filament({ hue, intensity: 0.5, pulse: 0, speed: 0, fade: 0 });
  const rings = new THREE.Group();
  rings.position.y = Y0 + 0.34;
  rings.rotation.set(Math.PI / 2 - 0.32, 0.2, 0);
  for (const r of [0.5, 0.63]) rings.add(kit.mesh(tube(circle(r, 72), { segments: lite ? 72 : 144, radial: 4, radius: 0.0038, closed: true }), outline, 'outline-ring'));
  root.add(rings);

  return {
    object: root,
    view: { yaw: 0.25, pitch: 0.16 },
    animate(_t, e) {
      // Dormant: no motion of its own. Hover only lifts the outline slightly.
      setUniform(outline, 'uIntensity', lerp(0.5, 0.9, e));
      setUniform(membraneMat, 'uOpacity', lerp(0.95, 1.2, e));
    },
  };
}
