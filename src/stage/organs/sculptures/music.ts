/**
 * MUSIC — the Resonator. A vertebral spine with a harp-like bone arm, a fan of luminous sinew
 * strings between them, a tendon coiled around the spine, and three glass drum-membranes held in
 * bone hoops that ripple in standing waves. Energy sets the strings vibrating and the membranes
 * resonating.
 */
import * as THREE from 'three';
import { domed, merge, taper, tube, withAttribute } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import type { OrganPalette } from '../palette.ts';
import { column, curve, facing, v3 } from '../parts.ts';

export function music(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const bone = kit.bone({ hue, rim: 1.0 });

  /* Spine */
  const spinePath = curve([
    [0, -0.92, 0],
    [0.03, -0.45, 0.02],
    [-0.02, 0, 0],
    [0.02, 0.45, -0.02],
    [0, 0.8, 0],
  ]);
  root.add(column(kit, spinePath, 14, bone, { size: (s) => 0.13 - 0.035 * s }));

  /* Harp arm: from the top of the spine, out to the right and back down to its base */
  const arm = curve([
    [0.02, 0.84, 0],
    [0.34, 0.97, 0.02],
    [0.7, 0.84, 0.03],
    [0.93, 0.42, 0.02],
    [0.9, -0.12, 0],
    [0.68, -0.6, -0.02],
    [0.32, -0.88, -0.02],
    [0.05, -0.95, 0],
  ]);
  root.add(kit.mesh(tube(arm, { segments: lite ? 60 : 140, radial: lite ? 6 : 9, radius: domed(taper(0.052, 0.03), 0.03) }), bone, 'harp-arm'));
  if (!lite) {
    root.add(column(kit, new THREE.CatmullRomCurve3(arm.getSpacedPoints(40).slice(5, 36)), 9, bone, { size: () => 0.085, detail: 'simple' }));
  }

  /* Strings: a fan from the spine to the arm, vibrating with energy */
  const strings = lite ? 6 : 9;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < strings; i++) {
    const k = i / (strings - 1);
    const a = spinePath.getPointAt(0.12 + 0.76 * k).add(v3(0.035, 0, 0));
    const b = arm.getPointAt(0.84 - 0.7 * k);
    parts.push(withAttribute(tube(new THREE.LineCurve3(a, b), { segments: lite ? 16 : 32, radial: 4, radius: 0.0055 }), 'aSeed', i));
  }
  const stringMat = kit.filament({
    hue,
    intensity: 1.5,
    freq: 1.2,
    speed: 0.5,
    pulse: 0.9,
    fade: 0.4,
    vpars: 'attribute float aSeed;',
    displace: /* glsl */ `
      float env = sin(3.14159 * uv.x);
      p.z += env * (0.003 + 0.028 * uEnergy) * sin(uTime * (7.0 + aSeed * 2.3) + aSeed * 1.9);
      vA = aSeed * 0.21;`,
  });
  root.add(kit.mesh(merge(parts), stringMat, 'strings'));

  /* Coiled sinew around the spine: a bone tendon and a luminous twin */
  const helix = (r: number, turns: number, phase: number) => {
    const pts: [number, number, number][] = [];
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const a = s * turns * Math.PI * 2 + phase;
      const p = spinePath.getPointAt(0.06 + 0.86 * s);
      pts.push([p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r]);
    }
    return curve(pts);
  };
  if (!lite) root.add(kit.mesh(tube(helix(0.1, 6, 0), { segments: 300, radial: 5, radius: domed(0.011, 0.02) }), bone, 'sinew'));
  root.add(
    kit.mesh(
      tube(helix(0.115, 6, Math.PI), { segments: lite ? 160 : 300, radial: 4, radius: 0.005 }),
      kit.filament({ hue, intensity: 1.1, freq: 4, speed: 0.25 }),
      'sinew-light',
    ),
  );

  /* Resonating membranes in bone hoops */
  const drums = lite
    ? [
        { c: v3(-0.48, 0.38, 0.12), r: 0.27 },
        { c: v3(-0.5, -0.32, 0.16), r: 0.3 },
      ]
    : [
        { c: v3(-0.46, 0.44, 0.1), r: 0.25 },
        { c: v3(-0.58, -0.06, 0.18), r: 0.31 },
        { c: v3(-0.4, -0.56, 0.08), r: 0.21 },
      ];
  const face = v3(-0.55, 0.08, 0.83).normalize();
  const membrane = kit.instanced(
    new THREE.RingGeometry(0.0001, 1, lite ? 28 : 48, lite ? 6 : 12),
    kit.glass({
      hue,
      deep: pal.deep,
      opacity: 0.85,
      core: 0.5,
      irid: 0.5,
      displace: /* glsl */ `
        float r = length(p.xy);
        float w = uTime * (2.2 + 3.5 * uEnergy) + iid * 2.1;
        float k = 17.0;
        float amp = 0.035 + 0.11 * uEnergy;
        float env = 1.0 - r * r;
        float z = sin(r * k - w) * env * amp;
        float dz = (k * cos(r * k - w) * env - 2.0 * r * sin(r * k - w)) * amp;
        p.z += z;
        vec2 dir = r > 0.0001 ? p.xy / r : vec2(0.0);
        n = normalize(vec3(-dz * dir, 1.0));
        vA = r;`,
      extra: /* glsl */ `
        float ring = pow(0.5 + 0.5 * cos(vA * 17.0 - uTime * (2.2 + 3.5 * uEnergy) - vI * 2.1), 6.0);
        col += hue * ring * (0.12 + 0.35 * uEnergy);
        a += ring * 0.1;`,
    }),
    drums.length,
    'membranes',
  );
  const hoops = kit.instanced(new THREE.TorusGeometry(1, 0.045, lite ? 6 : 10, lite ? 32 : 56), bone, drums.length, 'hoops');
  const glows = kit.halos({ hue, size: 1, intensity: 0.75, falloff: 6 }, drums.length, 'membrane-glow');
  const struts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  drums.forEach((d, i) => {
    facing(d.c, face, d.r, m);
    membrane.setMatrixAt(i, m);
    hoops.setMatrixAt(i, m);
    glows.setMatrixAt(i, m.compose(d.c.clone().addScaledVector(face, -0.02), new THREE.Quaternion(), v3(d.r * 1.6, d.r * 1.6, 1)));
    const to = spinePath.getPointAt(0.5 + d.c.y * 0.5).add(v3(0, 0, -0.02));
    const from = d.c.clone().addScaledVector(face, -0.05);
    struts.push(tube(curve([from.toArray(), from.clone().lerp(to, 0.5).add(v3(0, 0.06, -0.05)).toArray(), to.toArray()]), { segments: 16, radial: 6, radius: domed(taper(0.022, 0.016), 0.08) }));
  });
  root.add(membrane, hoops, glows);
  root.add(kit.mesh(merge(struts), bone, 'struts'));

  return {
    object: root,
    view: { yaw: 0.28, pitch: 0.12 },
    animate(t) {
      root.rotation.y = Math.sin(t * 0.19) * 0.28;
      root.rotation.z = Math.sin(t * 0.23 + 2) * 0.025;
    },
  };
}
