/**
 * Procedural geometry for the organ family: vertebrae, tapered tendons, ribbons, sheets and
 * curve placement. Pure three.js (no DOM), deterministic, modest triangle counts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type RadiusFn = (s: number) => number;

/** Rounded (domed) ends for a tube radius profile: r(s) eased to 0 within `cap` of each end. */
export function domed(r: RadiusFn | number, cap = 0.06, ends: 'both' | 'start' | 'end' = 'both'): RadiusFn {
  const base = typeof r === 'number' ? () => r : r;
  const dome = (x: number) => Math.sqrt(Math.max(0, 1 - (1 - Math.min(1, x)) ** 2));
  return (s) => {
    let k = 1;
    if (ends !== 'end') k *= dome(s / cap);
    if (ends !== 'start') k *= dome((1 - s) / cap);
    return base(s) * Math.max(k, 0.0001);
  };
}

/** Linear taper r0 → r1. */
export const taper = (r0: number, r1: number): RadiusFn => (s) => r0 + (r1 - r0) * s;

/**
 * A tube with a varying radius along any curve. uv.x runs along the length (0..1), uv.y around.
 */
export function tube(curve: THREE.Curve<THREE.Vector3>, o: { segments: number; radial: number; radius: RadiusFn | number; closed?: boolean }) {
  const { segments, radial } = o;
  const radius = typeof o.radius === 'number' ? () => o.radius as number : o.radius;
  const frames = curve.computeFrenetFrames(segments, !!o.closed);
  const verts = (segments + 1) * (radial + 1);
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const P = new THREE.Vector3();
  const n = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    curve.getPointAt(s, P);
    const r = radius(s);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      n.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize();
      pos[k * 3] = P.x + r * n.x;
      pos[k * 3 + 1] = P.y + r * n.y;
      pos[k * 3 + 2] = P.z + r * n.z;
      nor[k * 3] = n.x;
      nor[k * 3 + 1] = n.y;
      nor[k * 3 + 2] = n.z;
      uv[k * 2] = s;
      uv[k * 2 + 1] = j / radial;
      k++;
    }
  }
  const index: number[] = [];
  for (let i = 1; i <= segments; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * A flat ribbon along a curve (uv.x along, uv.y across). `up` orients its width; the normal is
 * stored so shaders can flutter the ribbon along it.
 */
export function ribbon(curve: THREE.Curve<THREE.Vector3>, o: { segments: number; width: RadiusFn | number; up?: THREE.Vector3; twist?: RadiusFn }) {
  const width = typeof o.width === 'number' ? () => o.width as number : o.width;
  const up = o.up ?? new THREE.Vector3(0, 0, 1);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const side = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= o.segments; i++) {
    const s = i / o.segments;
    curve.getPointAt(s, P);
    curve.getTangentAt(s, T);
    side.crossVectors(T, up).normalize();
    if (o.twist) side.applyAxisAngle(T, o.twist(s));
    n.crossVectors(side, T).normalize();
    const w = width(s) / 2;
    for (const k of [-1, 1]) {
      pos.push(P.x + side.x * w * k, P.y + side.y * w * k, P.z + side.z * w * k);
      nor.push(n.x, n.y, n.z);
      uv.push(s, k < 0 ? 0 : 1);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < o.segments; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/** A parametric sheet f(u, v) → point, with smooth normals; uv = (u, v). */
export function sheet(fn: (u: number, v: number, out: THREE.Vector3) => void, uSeg: number, vSeg: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const P = new THREE.Vector3();
  for (let j = 0; j <= vSeg; j++) {
    for (let i = 0; i <= uSeg; i++) {
      const u = i / uSeg;
      const v = j / vSeg;
      fn(u, v, P);
      pos.push(P.x, P.y, P.z);
      uv.push(u, v);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < vSeg; j++) {
    for (let i = 0; i < uSeg; i++) {
      const a = j * (uSeg + 1) + i;
      const b = a + uSeg + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Adds a constant (or per-vertex computed) float attribute. */
export function withAttribute(g: THREE.BufferGeometry, name: string, value: number | ((i: number, uv: THREE.Vector2) => number)) {
  const count = g.getAttribute('position').count;
  const data = new Float32Array(count);
  const uvAttr = g.getAttribute('uv');
  const uv = new THREE.Vector2();
  for (let i = 0; i < count; i++) {
    if (typeof value === 'number') data[i] = value;
    else {
      if (uvAttr) uv.fromBufferAttribute(uvAttr as THREE.BufferAttribute, i);
      data[i] = value(i, uv);
    }
  }
  g.setAttribute(name, new THREE.BufferAttribute(data, 1));
  return g;
}

/** Merges geometries (same attributes, all indexed) and disposes the inputs. */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 1) return list[0];
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!out) throw new Error('organs: geometries could not be merged (attribute mismatch)');
  return out;
}

/** Keeps only position / normal / uv (so primitives from different generators can merge). */
export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.index) {
    const n = g.getAttribute('position').count;
    g.setIndex([...Array(n).keys()]);
  }
  return g;
}

/**
 * The family vertebra: a waisted spool with a spinal canal (lathe), plus two transverse
 * processes and a spinous process in 'full' detail. Height 1 along +y, radius ≈ 0.52.
 */
export function vertebra(detail: 'full' | 'simple' | 'lite'): THREE.BufferGeometry {
  const profile =
    detail === 'full'
      ? [
          [0.24, -0.5], [0.4, -0.5], [0.5, -0.44], [0.52, -0.33], [0.44, -0.15], [0.41, 0], [0.44, 0.15], [0.52, 0.33], [0.5, 0.44],
          [0.4, 0.5], [0.24, 0.5], [0.18, 0.38], [0.16, 0], [0.18, -0.38], [0.24, -0.5],
        ]
      : [[0.22, -0.5], [0.46, -0.46], [0.52, -0.3], [0.42, 0], [0.52, 0.3], [0.46, 0.46], [0.22, 0.5], [0.16, 0], [0.22, -0.5]];
  const segments = detail === 'full' ? 14 : detail === 'simple' ? 10 : 7;
  const body = plain(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments));
  if (detail !== 'full') return body;
  const parts = [body];
  for (const side of [-1, 1]) {
    const c = plain(new THREE.CapsuleGeometry(0.075, 0.34, 2, 6));
    c.rotateZ((Math.PI / 2) * side + side * 0.35);
    c.translate(0.56 * side, 0.12, -0.06);
    parts.push(c);
  }
  const spine = plain(new THREE.CapsuleGeometry(0.07, 0.36, 2, 6));
  spine.rotateX(Math.PI / 2 + 0.55);
  spine.translate(0, -0.1, -0.56);
  parts.push(spine);
  return merge(parts);
}

/**
 * Matrices placing `count` items along a curve, local +y aligned to the tangent.
 * `at(i)` maps an item to its curve parameter (default evenly spaced), `scale(i, s)` sizes it.
 */
export function alongCurve(
  curve: THREE.Curve<THREE.Vector3>,
  count: number,
  o: { at?: (i: number) => number; scale?: (i: number, s: number) => number | THREE.Vector3; roll?: (i: number, s: number) => number } = {},
  out: THREE.Matrix4[] = [],
): THREE.Matrix4[] {
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const S = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const s = o.at ? o.at(i) : count === 1 ? 0.5 : i / (count - 1);
    const u = Math.min(1, Math.max(0, s));
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    q.setFromUnitVectors(Y, T.normalize());
    if (o.roll) q.multiply(roll.setFromAxisAngle(Y, o.roll(i, u)));
    const sc = o.scale ? o.scale(i, u) : 1;
    if (typeof sc === 'number') S.setScalar(sc);
    else S.copy(sc);
    (out[i] ??= new THREE.Matrix4()).compose(P, q, S);
  }
  return out;
}

/** Writes matrices into an InstancedMesh and flags it for upload. */
export function setInstances(mesh: THREE.InstancedMesh, matrices: THREE.Matrix4[]) {
  const n = Math.min(mesh.count, matrices.length);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
}

/** Triangle count of everything under an object (instanced meshes counted per instance). */
export function triangleCount(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    total += tris * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  return Math.round(total);
}
