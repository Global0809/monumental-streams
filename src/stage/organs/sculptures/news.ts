/**
 * NEWS — the Press. A grooved printing drum on a vertebral axle with toothed bone gears, pearl
 * paper ribbons (abstract columns of type, never real text) feeding up off the drum and
 * fluttering, and an antenna mast whose bulb sends out broadcast rings. Energy turns the press
 * faster, lifts the ribbons and quickens the broadcast.
 */
import * as THREE from 'three';
import { domed, merge, plain, ribbon, taper, tube, withAttribute } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import { setUniform } from '../kit.ts';
import { emission, lerp } from '../motion.ts';
import type { OrganPalette } from '../palette.ts';
import { column, curve, v3 } from '../parts.ts';

export function news(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const bone = kit.bone({ hue, rim: 0.9 });
  const DY = -0.32; // drum axis height

  /* Drum (axis along x) with print grooves and rims */
  const press = new THREE.Group();
  press.position.y = DY;
  root.add(press);
  const prof: THREE.Vector2[] = [new THREE.Vector2(0.08, -0.46), new THREE.Vector2(0.3, -0.46), new THREE.Vector2(0.31, -0.42)];
  const grooves = lite ? 8 : 16;
  for (let i = 0; i < grooves; i++) {
    const y = -0.38 + (i / (grooves - 1)) * 0.76;
    prof.push(new THREE.Vector2(0.272, y - 0.012), new THREE.Vector2(0.262, y), new THREE.Vector2(0.272, y + 0.012));
  }
  prof.push(new THREE.Vector2(0.31, 0.42), new THREE.Vector2(0.3, 0.46), new THREE.Vector2(0.08, 0.46));
  const drumGeo = plain(new THREE.LatheGeometry(prof, lite ? 20 : 44));
  drumGeo.rotateZ(Math.PI / 2);
  const drum = new THREE.Group();
  press.add(drum);
  drum.add(kit.mesh(drumGeo, kit.bone({ hue, rim: 0.9, porous: 0.5, side: THREE.DoubleSide }), 'drum'));

  /* Gears at both ends */
  const teeth = lite ? 12 : 20;
  const teethMesh = kit.instanced(new THREE.BoxGeometry(0.035, 0.07, 0.05), bone, teeth * 2, 'gear-teeth');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let side = 0; side < 2; side++) {
    const x = side ? 0.49 : -0.49;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      q.setFromAxisAngle(v3(1, 0, 0), a);
      teethMesh.setMatrixAt(side * teeth + i, m.compose(v3(x, Math.cos(a) * 0.345, Math.sin(a) * 0.345), q, v3(1, 1, 1)));
    }
    const ring = new THREE.TorusGeometry(0.31, 0.03, 6, lite ? 24 : 40);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, 0, 0);
    drum.add(kit.mesh(ring, bone, 'gear-ring'));
  }
  drum.add(teethMesh);

  /* Vertebral axle */
  for (const sx of [-1, 1]) {
    const axle = curve([[0.5 * sx, 0, 0], [0.68 * sx, 0, 0], [0.86 * sx, 0, 0]]);
    press.add(column(kit, axle, 4, bone, { size: (s) => 0.11 - 0.03 * s, detail: 'simple' }));
  }

  /* Paper ribbons feeding off the drum */
  const ribbonCount: number = lite ? 2 : 4;
  const ribbons: THREE.BufferGeometry[] = [];
  for (let i = 0; i < ribbonCount; i++) {
    const x = ribbonCount === 1 ? 0 : -0.27 + (i / (ribbonCount - 1)) * 0.54;
    const dx = (i - (ribbonCount - 1) / 2) * 0.07;
    const path = curve([
      [x, DY + 0.27, -0.06],
      [x, DY + 0.38, -0.28],
      [x + dx, DY + 0.68, -0.38],
      [x + dx * 2, DY + 1.02, -0.22],
      [x + dx * 3, DY + 1.2, 0.08 + 0.05 * i],
      [x + dx * 3.6, DY + 1.18, 0.32 + 0.04 * i],
    ]);
    ribbons.push(withAttribute(ribbon(path, { segments: lite ? 30 : 60, width: 0.15, up: v3(0, 0.3, 1).normalize() }), 'aSeed', i));
  }
  const paper = kit.glass({
    hue,
    deep: pal.deep,
    opacity: 0.55,
    irid: 0.3,
    core: 0,
    vpars: 'attribute float aSeed;',
    displace: /* glsl */ `
      float lift = uv.x;
      p += n * sin(uv.x * 9.0 - uTime * (1.4 + 2.2 * uEnergy) + aSeed * 1.7) * (0.02 + 0.045 * uEnergy) * lift;
      vA = aSeed;`,
    extra: /* glsl */ `
      float along = vUv.x * 54.0;
      float line = smoothstep(0.25, 0.4, fract(along)) * smoothstep(0.9, 0.75, fract(along));
      float cw = fract(vUv.y * 2.0);
      float colMask = step(0.1, cw) * step(cw, 0.9);
      float head = step(0.8, fract(vUv.x * 3.0 + vA * 0.37));
      float ink = line * colMask * mix(0.35 + 0.65 * oNoise(vec3(vUv.x * 120.0, vUv.y * 12.0, vA)), 1.0, head);
      col = col * 0.42 + hue * ink * 0.5;
      a = clamp(a * 0.55 + 0.1 + ink * 0.45, 0.0, 1.0);`,
  });
  root.add(kit.mesh(merge(ribbons), paper, 'ribbons'));

  /* Antenna mast with dipoles and a glass bulb */
  const MX = -0.66;
  const mast = curve([[MX, DY + 0.06, 0.02], [MX - 0.01, DY + 0.5, 0], [MX + 0.01, DY + 0.86, 0], [MX, DY + 1.14, 0]]);
  root.add(kit.mesh(tube(mast, { segments: lite ? 20 : 40, radial: 7, radius: domed(taper(0.032, 0.012), 0.04) }), bone, 'mast'));
  root.add(column(kit, mast, 6, bone, { size: (s) => 0.09 - 0.04 * s, detail: 'simple' }));
  const dipoles: THREE.BufferGeometry[] = [];
  [0.5, 0.74, 0.94].forEach((h, i) => {
    const w = 0.2 - i * 0.05;
    const y = DY + h;
    const d = v3(1, 0, -0.9).normalize().multiplyScalar(w);
    dipoles.push(tube(new THREE.LineCurve3(v3(MX, y, 0).sub(d), v3(MX, y, 0).add(d)), { segments: 8, radial: 5, radius: domed(0.009, 0.08) }));
  });
  root.add(kit.mesh(merge(dipoles), bone, 'dipoles'));
  const top = v3(MX, DY + 1.18, 0);
  const bulb = kit.mesh(new THREE.SphereGeometry(0.055, 16, 12), kit.glass({ hue, deep: pal.deep, opacity: 1, core: 1.4 }), 'bulb');
  bulb.position.copy(top);
  root.add(bulb);
  const beacon = kit.halo({ hue, size: 0.5, intensity: 1.1, falloff: 5 }, 'bulb-glow');
  beacon.position.copy(top);
  root.add(beacon);

  /* Broadcast rings */
  const ringCount = lite ? 2 : 3;
  const ringGeo = tube(curve(Array.from({ length: 40 }, (_, i) => [Math.cos((i / 40) * Math.PI * 2), 0, Math.sin((i / 40) * Math.PI * 2)] as [number, number, number]), true), {
    segments: lite ? 48 : 96,
    radial: 4,
    radius: 0.022,
    closed: true,
  });
  const rings = Array.from({ length: ringCount }, (_, i) => {
    const r = kit.mesh(ringGeo, kit.filament({ hue: '#dfe6ff', intensity: 1.6, freq: 6, speed: 0.2, fade: 0 }), `broadcast-${i}`);
    r.position.copy(top);
    r.rotation.x = 0.28;
    root.add(r);
    return r;
  });

  return {
    object: root,
    view: { yaw: 0.42, pitch: 0.14 },
    animate(t, e) {
      drum.rotation.x = -t * lerp(0.35, 1.6, e);
      const period = lerp(3.4, 1.8, e);
      rings.forEach((r, i) => {
        const p = emission(t, period, i, ringCount);
        r.scale.setScalar(0.08 + 0.5 * p);
        setUniform(r.material as THREE.Material, 'uIntensity', 2.0 * (1 - p) ** 1.4 * (0.7 + 0.5 * e));
      });
      root.rotation.y = Math.sin(t * 0.15) * 0.2;
    },
  };
}
