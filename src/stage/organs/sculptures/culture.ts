/**
 * CULTURE — the Growth. A branching coral / neuron of tapering bone rising from a vertebral
 * socket, verdigris patina toward its tips, glass polyps glowing at every tip, synapse filaments
 * linking distant branches, and light travelling up the branches like signals. Energy brightens
 * the signals and the polyps.
 */
import * as THREE from 'three';
import { merge, tube, withAttribute, vertebra } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import { setUniform } from '../kit.ts';
import { rng } from '../motion.ts';
import type { OrganPalette } from '../palette.ts';
import { curve, v3 } from '../parts.ts';

export interface Branch {
  points: THREE.Vector3[];
  r0: number;
  r1: number;
  depth: number;
}

/** Deterministic branching growth (seeded), returning branches and tip positions. */
export function growth(maxDepth: number, seed = 11): { branches: Branch[]; tips: THREE.Vector3[] } {
  const rand = rng(seed);
  const branches: Branch[] = [];
  const tips: THREE.Vector3[] = [];
  const up = v3(0, 1, 0);
  const perp = (d: THREE.Vector3) => {
    const a = Math.abs(d.y) < 0.9 ? up : v3(1, 0, 0);
    return new THREE.Vector3().crossVectors(d, a).normalize();
  };
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const side = perp(dir).applyAxisAngle(dir, rand() * Math.PI * 2);
    const mid = start.clone().addScaledVector(dir, len * 0.5).addScaledVector(side, len * 0.12 * (rand() - 0.5));
    const end = start.clone().addScaledVector(dir, len);
    branches.push({ points: [start, mid, end], r0: r, r1: r * 0.7, depth });
    if (depth >= maxDepth) {
      tips.push(end);
      return;
    }
    const kids = depth === 0 ? 3 : rand() < 0.3 ? 3 : 2;
    const phase = rand() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const axis = perp(dir).applyAxisAngle(dir, phase + (k / kids) * Math.PI * 2);
      const nd = dir.clone().applyAxisAngle(axis, 0.42 + rand() * 0.38);
      nd.addScaledVector(up, 0.18).normalize();
      grow(end, nd, len * (0.72 + rand() * 0.1), r * 0.68, depth + 1);
    }
  };
  grow(v3(0, -0.88, 0), v3(0, 1, 0), 0.42, 0.075, 0);
  return { branches, tips };
}

export function culture(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const tree = new THREE.Group();
  root.add(tree);
  const lite = kit.lite;
  const hue = pal.hue;
  const maxDepth = lite ? 4 : 5;
  const { branches, tips } = growth(maxDepth);

  const geos = branches.map((b) => {
    const g = tube(curve(b.points.map((p) => p.toArray())), {
      segments: lite ? 5 : 8,
      radial: lite ? 4 : 6,
      radius: (s) => b.r0 + (b.r1 - b.r0) * s,
    });
    return withAttribute(g, 'aDepth', (_i, uv) => (b.depth + uv.x) / (maxDepth + 1));
  });
  const boneMat = kit.bone({
    hue,
    rim: 1.0,
    vpars: 'attribute float aDepth;',
    displace: 'vA = aDepth;',
    tint: /* glsl */ `
      base = mix(base, hue * 0.75 + vec3(0.06), smoothstep(0.55, 1.0, vA) * 0.45);
      float sig = pow(0.5 + 0.5 * sin((vA * 3.2 - uTime * 0.45) * 6.28318), 14.0);
      base += hue * sig * (0.35 + 0.9 * uEnergy) * smoothstep(0.05, 0.3, vA);`,
  });
  tree.add(kit.mesh(merge(geos), boneMat, 'branches'));

  /* Socket at the root */
  const socket = kit.mesh(vertebra(lite ? 'simple' : 'full'), kit.bone({ hue, rim: 0.9 }), 'socket');
  socket.scale.setScalar(0.2);
  socket.position.set(0, -0.9, 0);
  tree.add(socket);

  /* Polyps + glows at the tips */
  const polyps = kit.instanced(new THREE.IcosahedronGeometry(1, 1), kit.glass({ hue, deep: pal.deep, opacity: 1, core: 0.9, irid: 0.4 }), tips.length, 'polyps');
  const sparks = kit.halos({ hue, size: 1, intensity: 0.5, twinkle: 0.6, falloff: 6 }, tips.length, 'polyp-glow');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  tips.forEach((p, i) => {
    const s = 0.026 + 0.018 * ((i * 7) % 5) / 4;
    polyps.setMatrixAt(i, m.compose(p, q, v3(s, s, s)));
    sparks.setMatrixAt(i, m.compose(p, q, v3(s * 6, s * 6, s * 6)));
  });
  tree.add(polyps, sparks);

  /* Synapses: arcs between distant tips */
  const links: THREE.BufferGeometry[] = [];
  const rand = rng(29);
  const wanted = lite ? 5 : 10;
  for (let tries = 0; links.length < wanted && tries < 400; tries++) {
    const a = tips[Math.floor(rand() * tips.length)];
    const b = tips[Math.floor(rand() * tips.length)];
    const d = a.distanceTo(b);
    if (d < 0.3 || d > 0.75) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.add(v3(mid.x, 0.4, mid.z).normalize().multiplyScalar(d * 0.35));
    links.push(withAttribute(tube(curve([a.toArray(), mid.toArray(), b.toArray()]), { segments: 24, radial: 3, radius: 0.0032 }), 'aSeed', links.length));
  }
  const synapseMat = kit.filament({ hue, intensity: 1.2, freq: 1.5, speed: 0.55, pulse: 1, vpars: 'attribute float aSeed;', displace: 'vA = aSeed * 0.173;' });
  if (links.length) tree.add(kit.mesh(merge(links), synapseMat, 'synapses'));

  return {
    object: root,
    view: { yaw: 0.2, pitch: 0.12 },
    animate(t, e) {
      tree.rotation.y = t * 0.06;
      tree.rotation.z = Math.sin(t * 0.3) * 0.025;
      setUniform(synapseMat, 'uIntensity', 0.9 + 0.9 * e);
    },
  };
}
