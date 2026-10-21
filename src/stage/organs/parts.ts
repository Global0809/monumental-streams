/**
 * Reusable organ parts: curves, a vertebral column along any curve, oriented placement.
 */
import * as THREE from 'three';
import { alongCurve, setInstances, vertebra } from './geometry.ts';
import type { Kit } from './kit.ts';

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Smooth curve through points (centripetal Catmull-Rom; no cusps). */
export const curve = (pts: [number, number, number][], closed = false) =>
  new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => v3(x, y, z)), closed, 'centripetal');

/** A circle of radius r in the XY plane (closed curve). */
export function circle(r: number, segments = 48, plane: 'xy' | 'xz' = 'xy') {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(plane === 'xy' ? [Math.cos(a) * r, Math.sin(a) * r, 0] : [Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return curve(pts, true);
}

/** Compose a matrix from a position, a width axis X and a facing axis Z (orthonormalised). */
export function basis(P: THREE.Vector3, X: THREE.Vector3, Z: THREE.Vector3, scale: number | THREE.Vector3, out = new THREE.Matrix4()) {
  const z = Z.clone().normalize();
  const x = X.clone().sub(z.clone().multiplyScalar(X.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const s = typeof scale === 'number' ? v3(scale, scale, scale) : scale;
  out.makeBasis(x.multiplyScalar(s.x), y.multiplyScalar(s.y), z.multiplyScalar(s.z));
  out.setPosition(P);
  return out;
}

/** Matrix for an item at P whose local +Z faces `dir`, uniformly scaled. */
export function facing(P: THREE.Vector3, dir: THREE.Vector3, scale: number | THREE.Vector3, out = new THREE.Matrix4()) {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), dir.clone().normalize());
  const s = typeof scale === 'number' ? v3(scale, scale, scale) : scale;
  return out.compose(P, q, s);
}

/**
 * A vertebral column: `count` vertebrae threaded along a curve (instanced, one draw call).
 * `size(s)` is the vertebra height at curve parameter s.
 */
export function column(
  kit: Kit,
  path: THREE.Curve<THREE.Vector3>,
  count: number,
  material: THREE.Material,
  o: { size: (s: number) => number; detail?: 'full' | 'simple'; closed?: boolean; roll?: number },
) {
  const detail = kit.lite ? 'lite' : (o.detail ?? 'full');
  const mesh = kit.instanced(vertebra(detail), material, count, 'vertebrae');
  const mats = alongCurve(path, count, {
    at: (i) => (o.closed ? i / count : count === 1 ? 0.5 : i / (count - 1)),
    scale: (_i, s) => o.size(s),
    roll: o.roll ? (i) => i * (o.roll ?? 0) : undefined,
  });
  setInstances(mesh, mats);
  return mesh;
}

/** Deterministic 0..1 hash of an integer (stable per index). */
export const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
