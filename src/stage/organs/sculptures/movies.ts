/**
 * MOVIES — the Aperture. An iris diaphragm of bone blades set in a vertebral collar, an amber
 * lens membrane glowing through the opening, a ribbed lens barrel behind, and a tilted reel of
 * filmstrip vertebrae (frames with sprocket holes and lit amber cells) orbiting the eye.
 * Energy opens the iris, speeds the reel and brightens the projected light.
 */
import * as THREE from 'three';
import { domed, merge, plain, taper, tube } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import { setUniform } from '../kit.ts';
import { apertureAngle, lerp } from '../motion.ts';
import type { OrganPalette } from '../palette.ts';
import { basis, circle, column, v3 } from '../parts.ts';

const RH = 0.6; // blade housing radius
const SPAN = 1.25; // angular span of one blade (radians)

/** Lune-shaped blade between the housing arc and an inner arc that dips toward the centre. */
function bladeShape(steps: number): THREE.Shape {
  const p0 = new THREE.Vector2(RH, 0);
  const p1 = new THREE.Vector2(RH * Math.cos(SPAN), RH * Math.sin(SPAN));
  const m = new THREE.Vector2(0.12 * Math.cos(SPAN / 2), 0.12 * Math.sin(SPAN / 2));
  // circle through p1, m, p0
  const ax = p1.x, ay = p1.y, bx = m.x, by = m.y, cx = p0.x, cy = p0.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = (x: number, y: number) => Math.atan2(y - uy, x - ux);
  const a1 = ang(ax, ay);
  const a0 = ang(cx, cy);
  const am = ang(bx, by);
  const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const ccw = norm(am - a1) < norm(a0 - a1); // does the ccw sweep a1 → a0 pass through m?
  const sweep = ccw ? norm(a0 - a1) : -norm(a1 - a0);

  const shape = new THREE.Shape();
  shape.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * SPAN;
    shape.lineTo(RH * Math.cos(a), RH * Math.sin(a));
  }
  for (let i = 1; i < steps * 2; i++) {
    const a = a1 + (i / (steps * 2)) * sweep;
    shape.lineTo(ux + r * Math.cos(a), uy + r * Math.sin(a));
  }
  shape.closePath();
  return shape;
}

/** One film frame: a plate with a picture window and four sprocket holes along each edge. */
function frameShape(withSprockets: boolean): THREE.Shape {
  const W = 1, H = 0.76;
  const s = new THREE.Shape();
  s.moveTo(-W / 2, -H / 2);
  s.lineTo(W / 2, -H / 2);
  s.lineTo(W / 2, H / 2);
  s.lineTo(-W / 2, H / 2);
  s.closePath();
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    const h = new THREE.Path();
    h.moveTo(x0, y0);
    h.lineTo(x0, y1);
    h.lineTo(x1, y1);
    h.lineTo(x1, y0);
    h.closePath();
    return h;
  };
  s.holes.push(rect(-0.4, -0.22, 0.4, 0.22));
  if (withSprockets) {
    for (const y of [-0.31, 0.31]) for (const x of [-0.33, -0.11, 0.11, 0.33]) s.holes.push(rect(x - 0.045, y - 0.03, x + 0.045, y + 0.03));
  }
  return s;
}

export function movies(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;

  /* Collar: a ring of vertebrae around the iris */
  const collarBone = kit.bone({ hue, rim: 1.1 });
  const collar = column(kit, circle(0.63, 64), 34, collarBone, { size: () => 0.125, detail: 'simple', closed: true });
  root.add(collar);

  /* Iris blades: shingled lunes rotating about pivots on the housing */
  const uAperture = { value: 0.3 };
  const bladeMat = kit.bone({
    hue,
    rim: 1.3,
    porous: 0.35,
    side: THREE.DoubleSide,
    uniforms: { uAperture },
    pars: 'uniform float uAperture;',
    displace: /* glsl */ `
      float phi = atan(p.y, p.x);
      p.z += 0.004 + 0.034 * clamp(phi / ${SPAN.toFixed(3)}, 0.0, 1.0);
      vec2 q = p.xy - vec2(${RH.toFixed(3)}, 0.0);
      float c = cos(uAperture), s = sin(uAperture);
      q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
      p.xy = q + vec2(${RH.toFixed(3)}, 0.0);
      n.xy = vec2(c * n.x + s * n.y, -s * n.x + c * n.y);
      vA = length(p.xy);`,
    tint: /* glsl */ `
      if (vA > 0.615) discard;
      base *= 0.82 + 0.18 * smoothstep(0.2, 0.6, vA);`,
  });
  const blades = lite ? 7 : 9;
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape(lite ? 8 : 14), { depth: 0.012, bevelEnabled: false, curveSegments: 4 });
  const iris = kit.instanced(bladeGeo, bladeMat, blades, 'iris');
  const m = new THREE.Matrix4();
  for (let k = 0; k < blades; k++) iris.setMatrixAt(k, m.makeRotationZ((k / blades) * Math.PI * 2));
  iris.position.z = 0.012;
  root.add(iris);

  /* Lens membrane + projected light behind the opening */
  const lensGeo = new THREE.SphereGeometry(0.55, lite ? 24 : 40, lite ? 14 : 24);
  const lens = kit.mesh(lensGeo, kit.glass({ hue, deep: pal.deep, opacity: 0.7, core: 0.7, irid: 0.25 }), 'lens');
  lens.scale.set(1, 1, 0.32);
  lens.position.z = -0.05;
  root.add(lens);
  const pupil = kit.halo({ hue, size: 1.0, intensity: 0.6, falloff: 5 }, 'pupil');
  pupil.position.z = -0.02;
  root.add(pupil);

  /* Lens barrel with focus-ring grip ridges */
  const prof: THREE.Vector2[] = [];
  const ridges = lite ? 6 : 12;
  prof.push(new THREE.Vector2(0.5, -0.02));
  for (let i = 0; i <= ridges; i++) {
    const y = -0.06 - (i / ridges) * 0.36;
    prof.push(new THREE.Vector2(0.6, y), new THREE.Vector2(0.575, y - 0.015));
  }
  prof.push(new THREE.Vector2(0.42, -0.46), new THREE.Vector2(0.36, -0.42));
  const barrelGeo = plain(new THREE.LatheGeometry(prof, lite ? 24 : 48));
  barrelGeo.rotateX(Math.PI / 2); // lathe axis y → z, opening toward +z
  const barrel = kit.mesh(barrelGeo, kit.bone({ hue, rim: 0.8, side: THREE.DoubleSide }), 'barrel');
  root.add(barrel);

  /* Projected rays fanning forward from the lens */
  const rayParts: THREE.BufferGeometry[] = [];
  const rays = lite ? 0 : 8;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.2;
    const dir = v3(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 1).normalize();
    const c = new THREE.LineCurve3(v3(0, 0, 0.02), dir.multiplyScalar(0.95));
    rayParts.push(tube(c, { segments: 12, radial: 4, radius: taper(0.007, 0.0015) }));
  }
  if (rays) root.add(kit.mesh(merge(rayParts), kit.filament({ hue, intensity: 0.55, freq: 1.5, speed: 0.6, pulse: 1 }), 'rays'));

  /* Reel: filmstrip vertebrae orbiting on a tilted plane */
  const reel = new THREE.Group();
  reel.rotation.set(-0.5, 0.32, 0.12);
  const spin = new THREE.Group();
  reel.add(spin);
  root.add(reel);
  const frames = lite ? 22 : 34;
  const R = 0.95;
  const frameGeo = new THREE.ExtrudeGeometry(frameShape(!lite), { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  frameGeo.translate(0, 0, -0.025);
  const film = kit.instanced(frameGeo, kit.bone({ hue, rim: 1.0, porous: 0.4 }), frames, 'film');
  const cells = kit.instanced(
    new THREE.PlaneGeometry(0.8, 0.44),
    kit.glass({
      hue,
      deep: pal.deep,
      opacity: 1,
      core: 0.9,
      irid: 0.1,
      extra: /* glsl */ `
        float img = oNoise(vec3(vUv * vec2(3.0, 2.0), vI * 1.7)) * 0.7 + oNoise(vec3(vUv * 9.0, vI)) * 0.3;
        col = mix(col, hue * (0.35 + 1.1 * img), 0.7);
        a = max(a, 0.55 + 0.35 * img);`,
    }),
    frames,
    'film-cells',
  );
  const step = (Math.PI * 2) / frames;
  for (let i = 0; i < frames; i++) {
    const a = i * step;
    const P = v3(Math.cos(a) * R, Math.sin(a) * R, 0);
    const X = v3(-Math.sin(a), Math.cos(a), 0);
    basis(P, X, v3(0, 0, 1), v3(0.165, 0.165, 1), m);
    film.setMatrixAt(i, m);
    cells.setMatrixAt(i, m);
  }
  spin.add(film, cells);
  const thread = kit.mesh(
    tube(circle(R, 96), { segments: lite ? 96 : 192, radial: 4, radius: 0.004, closed: true }),
    kit.filament({ hue, intensity: 0.9, freq: 9, speed: 0.12, fade: 0 }),
    'film-thread',
  );
  spin.add(thread);

  /* A faint outer filament ring around the collar */
  const halo = kit.mesh(
    tube(circle(0.72, 96), { segments: lite ? 64 : 128, radial: 4, radius: domed(0.005, 0.0001), closed: true }),
    kit.filament({ hue, intensity: 0.7, freq: 5, speed: -0.08, fade: 0 }),
    'collar-filament',
  );
  root.add(halo);

  return {
    object: root,
    view: { yaw: -0.3, pitch: 0.14 },
    animate(t, e) {
      uAperture.value = apertureAngle(0.22 + 0.62 * e + 0.04 * Math.sin(t * 0.7));
      spin.rotation.z = -t * lerp(0.05, 0.3, e);
      root.rotation.y = Math.sin(t * 0.17) * 0.22;
      root.rotation.x = Math.sin(t * 0.13 + 1) * 0.06;
      setUniform(pupil.material as THREE.Material, 'uIntensity', 0.45 + 0.6 * e);
    },
  };
}
