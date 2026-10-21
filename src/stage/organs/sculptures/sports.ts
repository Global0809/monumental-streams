/**
 * SPORTS — the Kinetic Heart. A seamed heart-ball (bone core, coral seam filament, glass
 * membrane) beats above a bowl of arena ribs, while braided tendon arcs swing around it like
 * gyroscope rings, each trailing a coral speed line. Energy quickens the heartbeat and the arcs.
 */
import * as THREE from 'three';
import { domed, merge, taper, tube } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import { setUniform } from '../kit.ts';
import { heartbeat, lerp } from '../motion.ts';
import type { OrganPalette } from '../palette.ts';
import { curve, v3 } from '../parts.ts';

/** The tennis/baseball seam: a closed curve on the unit sphere (a + b = 1). */
export function seamPoint(t: number, a = 0.68, out = new THREE.Vector3()) {
  const b = 1 - a;
  const c = 2 * Math.sqrt(a * b);
  return out.set(a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), c * Math.sin(2 * t));
}

export function sports(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lite = kit.lite;
  const hue = pal.hue;
  const bone = kit.bone({ hue, rim: 1.0 });

  /* Heart-ball */
  const ball = new THREE.Group();
  ball.position.y = 0.2;
  root.add(ball);
  const core = kit.mesh(new THREE.SphereGeometry(0.235, lite ? 24 : 40, lite ? 16 : 28), kit.bone({ hue, rim: 1.2, porous: 0.8 }), 'ball');
  ball.add(core);
  const seamPts: [number, number, number][] = [];
  for (let i = 0; i < 96; i++) seamPts.push(seamPoint((i / 96) * Math.PI * 2, 0.68).multiplyScalar(0.243).toArray());
  const seam = kit.mesh(
    tube(curve(seamPts, true), { segments: lite ? 120 : 220, radial: 5, radius: 0.011, closed: true }),
    kit.filament({ hue, intensity: 1.6, freq: 3, speed: 0.4, fade: 0 }),
    'seam',
  );
  seam.rotation.set(0.4, 0.3, 0.2);
  ball.add(seam);
  const shell = kit.mesh(new THREE.SphereGeometry(0.31, lite ? 24 : 36, lite ? 16 : 24), kit.glass({ hue, deep: pal.deep, opacity: 0.75, core: 0.35, irid: 0.3 }), 'membrane');
  ball.add(shell);
  const pulse = kit.halo({ hue, size: 1.25, intensity: 0.8, falloff: 5 }, 'heart-glow');
  ball.add(pulse);

  /* Braided tendon arcs */
  const arcs = lite ? 3 : 5;
  const arcGroups: { g: THREE.Group; speed: number }[] = [];
  const trailMat = kit.filament({ hue, intensity: 1.4, freq: 1, speed: 0.9, pulse: 1 });
  for (let i = 0; i < arcs; i++) {
    const R = 0.44 + 0.055 * i;
    const span = 3.5 + 0.35 * i;
    const strands = lite ? 1 : 3;
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < strands; k++) {
      const pts: [number, number, number][] = [];
      const n = 64;
      for (let j = 0; j <= n; j++) {
        const s = j / n;
        const a = s * span;
        const tw = s * 7 * Math.PI * 2 + (k / strands) * Math.PI * 2;
        const br = strands === 1 ? 0 : 0.02 * Math.sin(Math.PI * Math.min(1, s * 6, (1 - s) * 6));
        const rr = R + Math.cos(tw) * br;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(tw) * br]);
      }
      parts.push(tube(curve(pts), { segments: lite ? 40 : 90, radial: 5, radius: domed(taper(0.016, 0.007), 0.05) }));
    }
    const g = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.set(0.9 + i * 0.62, i * 1.13, i * 0.41);
    tilt.position.y = 0.2;
    tilt.add(g);
    g.add(kit.mesh(merge(parts), bone, `tendon-${i}`));
    const trailPts: [number, number, number][] = [];
    for (let j = 0; j <= 40; j++) {
      const a = (j / 40) * span * 0.92;
      trailPts.push([Math.cos(a) * (R + 0.035), Math.sin(a) * (R + 0.035), 0]);
    }
    g.add(kit.mesh(tube(curve(trailPts), { segments: 60, radial: 4, radius: taper(0.0015, 0.006) }), trailMat, `trail-${i}`));
    root.add(tilt);
    arcGroups.push({ g, speed: (0.22 + 0.07 * i) * (i % 2 ? -1 : 1) });
  }

  /* Arena: a bowl of ribs with a coral rim */
  const ribs = lite ? 12 : 20;
  const ribParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const prof: [number, number][] = [[0.3, -0.86], [0.46, -0.79], [0.64, -0.66], [0.8, -0.48], [0.86, -0.38]];
    ribParts.push(tube(curve(prof.map(([r, y]) => [c * r, y, s * r])), { segments: lite ? 10 : 20, radial: 5, radius: domed(taper(0.022, 0.012), 0.08) }));
  }
  root.add(kit.mesh(merge(ribParts), bone, 'arena-ribs'));
  const base = new THREE.TorusGeometry(0.3, 0.026, 6, lite ? 32 : 48);
  base.rotateX(Math.PI / 2);
  base.translate(0, -0.86, 0);
  root.add(kit.mesh(base, bone, 'arena-base'));
  const rimGeo = tube(curve(Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * Math.PI * 2) * 0.855, -0.43, Math.sin((i / 48) * Math.PI * 2) * 0.855] as [number, number, number]), true), {
    segments: lite ? 64 : 128,
    radial: 4,
    radius: 0.006,
    closed: true,
  });
  root.add(kit.mesh(rimGeo, kit.filament({ hue, intensity: 1.2, freq: 10, speed: 0.15, fade: 0 }), 'arena-rim'));

  return {
    object: root,
    view: { yaw: 0.35, pitch: 0.26 },
    animate(t, e) {
      const bpm = lerp(52, 104, e);
      const hb = heartbeat(t, bpm);
      ball.scale.setScalar(1 + (0.035 + 0.035 * e) * hb);
      setUniform(pulse.material as THREE.Material, 'uIntensity', 0.6 + (0.5 + 0.5 * e) * hb);
      const speed = lerp(1, 2.6, e);
      for (const a of arcGroups) a.g.rotation.z = t * a.speed * speed;
      ball.rotation.y = t * 0.3;
      root.rotation.y = Math.sin(t * 0.11) * 0.2;
    },
  };
}
