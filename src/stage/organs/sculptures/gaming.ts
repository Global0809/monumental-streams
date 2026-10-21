/**
 * GAMING — the Bloom Lattice. A hollow sphere of voxels (bone blocks with luminous edges, frost
 * glass blocks, a few lit cells) around a glowing core, threaded by lattice filaments. It
 * breathes in waves; energy makes the lattice bloom open like a flower, voxels swirling outward.
 */
import * as THREE from 'three';
import { merge, taper, tube } from '../geometry.ts';
import type { Kit, Sculpture } from '../kit.ts';
import type { OrganPalette } from '../palette.ts';
import { hash1, v3 } from '../parts.ts';

const G = 0.15; // grid spacing
const OUTER = 3.25;

export interface Voxel {
  base: THREE.Vector3;
  r: number; // 0..1 normalised distance from the centre
  kind: 'bone' | 'glass' | 'lit';
  axis: THREE.Vector3;
}

/** The lattice layout: a hollow shell plus a small core, deterministic. */
export function voxelLayout(lite: boolean): Voxel[] {
  const out: Voxel[] = [];
  const n = 3;
  const inner = lite ? 2.55 : 2.3;
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (let k = -n; k <= n; k++) {
        const d = Math.hypot(i, j, k);
        const shell = d <= OUTER && d >= inner;
        const core = d <= 1.0;
        if (!shell && !core) continue;
        const h = hash1(i * 49 + j * 7 + k + 400);
        const kind: Voxel['kind'] = core ? (d === 0 ? 'lit' : 'glass') : h < 0.09 ? 'lit' : h < 0.34 ? 'glass' : 'bone';
        out.push({
          base: v3(i * G, j * G, k * G),
          r: d / OUTER,
          kind,
          axis: v3(hash1(h * 91) - 0.5, hash1(h * 53) - 0.5, hash1(h * 17) - 0.5).normalize(),
        });
      }
  return out;
}

export function gaming(kit: Kit, pal: OrganPalette): Sculpture {
  const root = new THREE.Group();
  const lattice = new THREE.Group();
  lattice.rotation.x = 0.42;
  root.add(lattice);
  const hue = pal.hue;
  const voxels = voxelLayout(kit.lite);
  const box = new THREE.BoxGeometry(1, 1, 1);

  const edges = /* glsl */ `
    vec3 q = abs(vP) * 2.0;
    float mx = max(q.x, max(q.y, q.z));
    float mn = min(q.x, min(q.y, q.z));
    float mid = q.x + q.y + q.z - mx - mn;
    float edge = smoothstep(0.78, 0.96, mid);`;
  const boneMat = kit.bone({ hue, rim: 0.8, porous: 0.3, tint: `${edges} base = mix(base, hue * 1.6, edge * 0.85);` });
  const glassMat = kit.glass({
    hue,
    deep: pal.deep,
    opacity: 0.9,
    core: 0.12,
    irid: 0.3,
    extra: `${edges} col += hue * edge * 0.6; a = max(a, edge * 0.7); float scan = 0.5 + 0.5 * sin(vL.y * 140.0 - uTime * 3.0); col *= 0.85 + 0.25 * scan;`,
  });
  const litMat = kit.glass({ hue: '#e8fbff', deep: hue, opacity: 1, core: 1.0, irid: 0.1, extra: `${edges} col += hue * edge * 0.6; a = max(a, 0.6);` });

  const groups = { bone: [] as Voxel[], glass: [] as Voxel[], lit: [] as Voxel[] };
  for (const v of voxels) groups[v.kind].push(v);
  const meshes = (['bone', 'glass', 'lit'] as const).map((k) => {
    const mat = k === 'bone' ? boneMat : k === 'glass' ? glassMat : litMat;
    const geo = k === 'bone' ? box : box.clone();
    const mesh = kit.instanced(geo, mat, groups[k].length, `voxels-${k}`);
    lattice.add(mesh);
    return { mesh, list: groups[k] };
  });
  const sparks = kit.halos({ hue, size: 1, intensity: 0.45, twinkle: 0.8, falloff: 6 }, groups.lit.length, 'voxel-sparks');
  lattice.add(sparks);

  /* Lattice filaments: axes and diagonals from the core */
  const dirs: THREE.Vector3[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    const nz = Math.abs(x) + Math.abs(y) + Math.abs(z);
    if (nz === 1 || nz === 3) dirs.push(v3(x, y, z).normalize());
  }
  const rays = merge(dirs.map((d) => tube(new THREE.LineCurve3(d.clone().multiplyScalar(0.06), d.clone().multiplyScalar(0.62)), { segments: 10, radial: 4, radius: taper(0.006, 0.002) })));
  const rayMesh = kit.mesh(rays, kit.filament({ hue, intensity: 1.1, freq: 2, speed: 0.6, pulse: 1 }), 'lattice-filaments');
  lattice.add(rayMesh);
  const core = kit.halo({ hue, size: 0.7, intensity: 0.55, falloff: 5 }, 'core-glow');
  lattice.add(core);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Y = v3(0, 1, 0);

  return {
    object: root,
    view: { yaw: 0.5, pitch: 0.22 },
    animate(t, e) {
      for (const { mesh, list } of meshes) {
        list.forEach((v, i) => {
          const wave = Math.sin(t * 0.9 - v.r * 4.5);
          const bloom = v.r < 0.4 ? 0.04 * wave : 0.08 + 0.45 * e + 0.05 * wave;
          P.copy(v.base).multiplyScalar(1 + bloom * (0.35 + 0.65 * v.r));
          P.applyAxisAngle(Y, bloom * 0.7 * v.r);
          q.setFromAxisAngle(v.axis, bloom * 1.4);
          S.setScalar(G * (0.8 - 0.12 * bloom * v.r));
          mesh.setMatrixAt(i, m.compose(P, q, S));
          if (v.kind === 'lit') sparks.setMatrixAt(i, m.compose(P, q.identity(), S.setScalar(0.22 + 0.1 * e)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      sparks.instanceMatrix.needsUpdate = true;
      rayMesh.scale.setScalar(1 + 0.6 * e + 0.03 * Math.sin(t * 0.9));
      lattice.rotation.y = t * 0.12;
      lattice.rotation.z = Math.sin(t * 0.21) * 0.08;
    },
  };
}
