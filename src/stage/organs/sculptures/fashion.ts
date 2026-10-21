/**
 * FASHION — the Atelier Form. A spine mannequin: a vertebral column on a stand inside a
 * crinoline cage of bone hoops and boning ribs following a dress-form silhouette, a bodice of
 * woven luminous fibres, a clavicle bar, and a rose-gold glass drape falling from the shoulder
 * into a sweeping train. Energy lifts the drape and quickens the weave's light.
 */
import * as THREE from 'three';
import { domed, merge, sheet, taper, tube, withAttribute } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import type { OrganPalette } from '../palette.ts';
import { column, curve, v3 } from '../parts.ts';

/** Dress-form silhouette: radius at height y (neck → bust → waist → hip → crinoline hem). */
const PROFILE: [number, number][] = [
  [0.9, 0.055],
  [0.74, 0.075],
  [0.63, 0.25],
  [0.46, 0.29],
  [0.32, 0.245],
  [0.16, 0.185],
  [-0.02, 0.26],
  [-0.3, 0.41],
  [-0.6, 0.56],
  [-0.88, 0.66],
];
const Z_SQUASH = 0.84;

export function silhouette(y: number): number {
  if (y >= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) {
    const [y1, r1] = PROFILE[i];
    const [y0, r0] = PROFILE[i - 1];
    if (y >= y1) {
      const t = (y0 - y) / (y0 - y1);
      const s = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * s;
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

export function fashion(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const bone = kit.bone({ hue, rim: 1.0 });

  /* Stand + spine column + neck cap */
  root.add(kit.mesh(tube(new THREE.LineCurve3(v3(0, -0.88, 0), v3(0, 0.02, 0)), { segments: 4, radial: 8, radius: 0.016 }), bone, 'stand'));
  const spine = curve([[0, -0.02, -0.02], [0, 0.3, -0.05], [0, 0.6, -0.02], [0, 0.84, 0]]);
  root.add(column(kit, spine, 11, bone, { size: (s) => 0.1 - 0.025 * s }));
  const cap = new THREE.LatheGeometry([new THREE.Vector2(0.0001, 0.86), new THREE.Vector2(0.06, 0.87), new THREE.Vector2(0.075, 0.9), new THREE.Vector2(0.05, 0.94), new THREE.Vector2(0.0001, 0.955)], lite ? 10 : 18);
  root.add(kit.mesh(cap, bone, 'neck-cap'));

  /* Clavicle bar */
  const clav = curve([[-0.31, 0.6, -0.02], [-0.14, 0.66, 0.06], [0, 0.68, 0.08], [0.14, 0.66, 0.06], [0.31, 0.6, -0.02]]);
  root.add(kit.mesh(tube(clav, { segments: 40, radial: 7, radius: domed(0.022, 0.07) }), bone, 'clavicle'));

  /* Crinoline cage: hoops + boning ribs */
  const hoopYs = lite ? [0.44, 0.16, -0.12, -0.44, -0.72] : [0.46, 0.32, 0.16, 0.02, -0.16, -0.34, -0.52, -0.7, -0.86];
  const hoops: THREE.BufferGeometry[] = [];
  for (const y of hoopYs) {
    const r = silhouette(y);
    const t = new THREE.TorusGeometry(r, y < -0.1 ? 0.013 : 0.01, lite ? 4 : 6, lite ? 32 : 64);
    t.rotateX(Math.PI / 2);
    t.scale(1, 1, Z_SQUASH);
    t.translate(0, y, 0);
    hoops.push(t);
  }
  const ribs = lite ? 8 : 14;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let j = 0; j <= 16; j++) {
      const y = 0.58 - (j / 16) * 1.46;
      const r = silhouette(y);
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r * Z_SQUASH]);
    }
    hoops.push(tube(curve(pts), { segments: lite ? 24 : 48, radial: lite ? 3 : 4, radius: domed(0.0055, 0.03) }));
  }
  // TorusGeometry and tube() share position/normal/uv, so they merge.
  root.add(kit.mesh(merge(hoops), bone, 'crinoline'));

  /* Woven bodice: two counter-rotating sets of luminous fibres */
  const strands = lite ? 4 : 8;
  const fibres: THREE.BufferGeometry[] = [];
  for (const dir of [-1, 1]) {
    for (let i = 0; i < strands; i++) {
      const a0 = (i / strands) * Math.PI * 2;
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= 40; j++) {
        const s = j / 40;
        const y = 0.6 - s * 0.66;
        const a = a0 + dir * s * Math.PI * 1.25;
        const r = silhouette(y) * 1.03;
        pts.push([Math.cos(a) * r, y, Math.sin(a) * r * Z_SQUASH]);
      }
      fibres.push(withAttribute(tube(curve(pts), { segments: lite ? 30 : 60, radial: 3, radius: 0.0035 }), 'aSeed', i + (dir > 0 ? strands : 0)));
    }
  }
  root.add(
    kit.mesh(
      merge(fibres),
      kit.filament({ hue, intensity: 1.2, freq: 2, speed: 0.22, pulse: 0.9, vpars: 'attribute float aSeed;', displace: 'vA = aSeed * 0.137;' }),
      'woven-bodice',
    ),
  );

  /* Drape: from the right shoulder across the body into a train */
  const C = curve([
    [0.27, 0.62, 0.1],
    [0.12, 0.42, 0.3],
    [-0.16, 0.12, 0.3],
    [-0.42, -0.24, 0.3],
    [-0.62, -0.58, 0.12],
    [-0.72, -0.86, -0.3],
  ]);
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const out = new THREE.Vector3();
  const across = new THREE.Vector3();
  const drapeGeo = sheet(
    (u, v, target) => {
      C.getPointAt(v, P);
      C.getTangentAt(v, T);
      out.set(P.x, 0, P.z / Z_SQUASH).normalize();
      across.crossVectors(T, out).normalize();
      const w = 0.2 + 0.62 * v ** 1.1;
      const fold = Math.sin(u * Math.PI * (3 + 5 * v) + v * 3) * 0.04 * v ** 0.7;
      target.copy(P).addScaledVector(across, (u - 0.5) * w).addScaledVector(out, fold);
      // keep the cloth just outside the cage
      const rr = Math.hypot(target.x, target.z / Z_SQUASH);
      const min = silhouette(target.y) + 0.035;
      if (rr < min) {
        const k = min / Math.max(rr, 1e-4);
        target.x *= k;
        target.z *= k;
      }
    },
    lite ? 10 : 20,
    lite ? 24 : 56,
  );
  const drape = kit.glass({
    hue,
    deep: pal.deep,
    opacity: 1.05,
    irid: 0.65,
    core: 0.3,
    rimPow: 1.8,
    displace: /* glsl */ `
      p += n * sin(uTime * 0.8 + uv.y * 5.0 + uv.x * 3.0) * (0.01 + 0.025 * uEnergy) * uv.y;`,
    extra: /* glsl */ `
      float weave = 0.5 + 0.5 * sin(vUv.x * 240.0) * sin(vUv.y * 420.0);
      col = (col + hue * 0.22) * (0.8 + 0.32 * weave);
      float hem = smoothstep(0.9, 1.0, vUv.y) + smoothstep(0.06, 0.0, vUv.x) + smoothstep(0.94, 1.0, vUv.x);
      col += hue * hem * 0.6;
      a = clamp(a + 0.3 + hem * 0.3, 0.0, 1.0);`,
  });
  root.add(kit.mesh(drapeGeo, drape, 'drape'));
  const shoulder = kit.halo({ hue, size: 0.35, intensity: 0.8 }, 'shoulder-glow');
  shoulder.position.set(0.27, 0.62, 0.1);
  root.add(shoulder);

  return {
    object: root,
    view: { yaw: 0.3, pitch: 0.1 },
    animate(t) {
      root.rotation.y = Math.sin(t * 0.14) * 0.32 + 0.1;
    },
  };
}
