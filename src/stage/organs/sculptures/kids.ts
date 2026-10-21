/**
 * KIDS — the Bubble Garden. A chunky, friendly spiral of bone banded in soft pastel candy
 * colours rises from a cloud of round pebbles, surrounded by soap bubbles in a pastel prism that
 * bob gently, and a few twinkling star-sparks. Everything is round; nothing is sharp or fast.
 * Energy makes the bubbles bob and drift a little livelier.
 */
import * as THREE from 'three';
import { domed, taper, tube } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import type { OrganPalette } from '../palette.ts';
import { curve, hash1, v3 } from '../parts.ts';

export function kids(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const accents = pal.accents ?? [hue];

  /* Friendly spiral (conical helix, candy bands) */
  const pts: [number, number, number][] = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = s * 2.6 * Math.PI * 2;
    const r = 0.5 * (1 - s) ** 0.85 + 0.04;
    pts.push([Math.cos(a) * r, -0.56 + 1.16 * s ** 0.92, Math.sin(a) * r]);
  }
  const spiralMat = kit.bone({
    hue,
    rim: 0.9,
    porous: 0.15,
    tint: /* glsl */ `
      vec3 pastel = 0.8 + 0.2 * cos(6.28318 * (vUv.x * 2.4 + vec3(0.0, 0.33, 0.67)));
      base = mix(base, pastel, 0.6);
      hue = pastel;`,
  });
  root.add(kit.mesh(tube(curve(pts), { segments: lite ? 110 : 240, radial: lite ? 8 : 14, radius: domed(taper(0.1, 0.05), 0.03) }), spiralMat, 'spiral'));
  const star = kit.halo({ hue: '#fff3c4', size: 0.42, intensity: 1.1, twinkle: 0.4 }, 'spiral-star');
  star.position.set(pts[n][0], pts[n][1] + 0.07, pts[n][2]);
  root.add(star);

  /* Cloud of round pebbles at the base */
  const pebbles = [
    [0, -0.7, 0, 0.2],
    [0.24, -0.74, 0.08, 0.15],
    [-0.25, -0.73, 0.04, 0.16],
    [0.1, -0.76, -0.2, 0.14],
    [-0.12, -0.77, 0.22, 0.13],
  ];
  const cloud = kit.instanced(new THREE.SphereGeometry(1, lite ? 14 : 22, lite ? 10 : 16), kit.bone({ hue, rim: 1.1, porous: 0.1 }), pebbles.length, 'cloud');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  pebbles.forEach(([x, y, z, r], i) => cloud.setMatrixAt(i, m.compose(v3(x, y, z), q, v3(r, r * 0.82, r))));
  root.add(cloud);

  /* Soap bubbles in a pastel prism */
  const count = lite ? 9 : 16;
  const bubbles = kit.instanced(
    new THREE.SphereGeometry(1, lite ? 16 : 28, lite ? 12 : 20),
    kit.glass({ hue: '#ffffff', deep: '#3a2a56', opacity: 0.8, irid: 1.0, core: 0.08, rimPow: 2.6 }),
    count,
    'bubbles',
  );
  const seeds = Array.from({ length: count }, (_, i) => ({
    a: i * 2.399 + 0.3,
    r: 0.42 + 0.4 * hash1(i + 3),
    y: -0.5 + 1.25 * hash1(i + 17),
    s: 0.05 + 0.11 * hash1(i + 31) ** 1.4,
    ph: hash1(i + 47) * Math.PI * 2,
  }));
  const color = new THREE.Color();
  seeds.forEach((_, i) => bubbles.setColorAt(i, color.set(accents[i % accents.length])));
  if (bubbles.instanceColor) bubbles.instanceColor.needsUpdate = true;
  root.add(bubbles);

  /* Star sparks */
  const sparkCount = lite ? 4 : 7;
  const sparks = kit.halos({ hue: '#ffffff', size: 1, intensity: 1.0, twinkle: 0.9, falloff: 7 }, sparkCount, 'sparks');
  for (let i = 0; i < sparkCount; i++) {
    const a = i * 1.9 + 0.8;
    const r = 0.55 + 0.35 * hash1(i + 71);
    sparks.setMatrixAt(i, m.compose(v3(Math.cos(a) * r, -0.3 + 1.1 * hash1(i + 83), Math.sin(a) * r), q, v3(0.12, 0.12, 0.12)));
    sparks.setColorAt(i, color.set(accents[(i + 2) % accents.length]));
  }
  if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
  root.add(sparks);

  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  return {
    object: root,
    view: { yaw: 0.2, pitch: 0.16 },
    animate(t, e) {
      const lively = 1 + 1.2 * e;
      seeds.forEach((b, i) => {
        const a = b.a + t * 0.06 * lively;
        P.set(Math.cos(a) * b.r, b.y + Math.sin(t * (0.55 + 0.12 * (i % 3)) * lively + b.ph) * 0.05 * lively, Math.sin(a) * b.r);
        const wobble = 1 + 0.03 * Math.sin(t * 1.3 + b.ph);
        S.set(b.s * wobble, b.s / wobble, b.s);
        bubbles.setMatrixAt(i, m.compose(P, q, S));
      });
      bubbles.instanceMatrix.needsUpdate = true;
      root.rotation.y = t * 0.05;
    },
  };
}
