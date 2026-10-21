/**
 * Planar geometry on longitude/latitude rings for the globe build, with the two classic
 * traps handled explicitly:
 *   antimeridian  rings from world-atlas jump between +180 and -180; they are "unwrapped" so
 *                 consecutive longitudes never differ by more than 180°, and tests/clips are
 *                 repeated on copies shifted by ±360°.
 *   poles         a ring whose unwrapped longitudes advance by a full 360° (Antarctica) winds
 *                 around a pole; it is closed through that pole so it becomes a simple polygon.
 */

/** [longitude, latitude] in degrees. */
export type Point = [number, number];
export type Ring = Point[];

export interface PreparedRing {
  ring: Ring; // unwrapped, pole-closed, explicitly closed (first point repeated last)
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** Removes ±360° jumps between consecutive points and closes pole-encircling rings. */
export function unwrapRing(input: Ring): Ring {
  const ring: Ring = [];
  let offset = 0;
  input.forEach(([lon, lat], i) => {
    if (i > 0) {
      const prev = input[i - 1][0] + offset;
      const d = lon + offset - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    ring.push([lon + offset, lat]);
  });
  const first = ring[0];
  const last = ring[ring.length - 1];
  const winding = last[0] - first[0];
  if (Math.abs(winding) > 180) {
    // Wraps the globe: run down the far meridian to the pole, along it, and back up.
    const pole = ring.reduce((s, p) => s + p[1], 0) / ring.length < 0 ? -90 : 90;
    ring.push([last[0], pole], [first[0], pole], [first[0], first[1]]);
  } else if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

export function prepareRings(rings: Ring[]): PreparedRing[] {
  return rings.map((r) => {
    const ring = unwrapRing(r);
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    return { ring, minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
  });
}

/** Even-odd ray cast (ring must be explicitly closed). */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [xi, yi] = ring[i - 1];
    const [xj, yj] = ring[i];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const SHIFTS = [0, 360, -360];

/**
 * Even-odd test over every ring of a MultiPolygon (so holes such as inland seas count as
 * water). Each ring is tested against the point and its ±360° copies, once per ring.
 */
export function isLand(lon: number, lat: number, rings: PreparedRing[]): boolean {
  let hits = 0;
  for (const r of rings) {
    if (lat < r.minLat || lat > r.maxLat) continue;
    for (const s of SHIFTS) {
      const x = lon + s;
      if (x >= r.minLon && x <= r.maxLon && pointInRing(x, lat, r.ring)) {
        hits++;
        break;
      }
    }
  }
  return hits % 2 === 1;
}

/**
 * Approximately equal-area lattice: rows `spacing` degrees apart (cell centres), each row
 * holding round(360·cos(lat)/spacing) evenly spaced points.
 */
export function equalAreaLattice(spacing: number): Point[] {
  const rows = Math.round(180 / spacing);
  const dLat = 180 / rows;
  const out: Point[] = [];
  for (let i = 0; i < rows; i++) {
    const lat = -90 + (i + 0.5) * dLat;
    const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / dLat));
    for (let j = 0; j < n; j++) out.push([-180 + ((j + 0.5) * 360) / n, lat]);
  }
  return out;
}

/** Sutherland–Hodgman clip of a closed ring to the half-plane x ≥ bound (keep="above") or x ≤ bound. */
function clipHalfPlane(ring: Ring, bound: number, keep: 'above' | 'below'): Ring {
  const inside = (p: Point) => (keep === 'above' ? p[0] >= bound : p[0] <= bound);
  const out: Ring = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (bound - a[0]) / (b[0] - a[0]);
      out.push([bound, a[1] + t * (b[1] - a[1])]);
    }
  }
  if (out.length > 0) out.push(out[0]);
  return out;
}

/** The parts of a prepared ring inside longitude [-180, 180], from each ±360° copy. */
export function splitAtAntimeridian(r: PreparedRing): Ring[] {
  const parts: Ring[] = [];
  for (const s of SHIFTS) {
    if (r.maxLon + s <= -180 || r.minLon + s >= 180) continue;
    const shifted = r.ring.map(([x, y]): Point => [x + s, y]);
    const clipped = clipHalfPlane(clipHalfPlane(shifted, -180, 'above'), 180, 'below');
    if (clipped.length >= 4) parts.push(clipped);
  }
  return parts;
}

/**
 * SVG path data for rings in equirectangular projection on a 360×180 viewBox
 * (x = lon + 180, y = 90 − lat), coordinates rounded to `decimals`.
 */
export function equirectangularPath(rings: Ring[], decimals = 2): string {
  const f = 10 ** decimals;
  const fmt = (v: number) => String(Math.round(v * f) / f);
  return rings
    .map((ring) => {
      const pts: string[] = [];
      for (const [lon, lat] of ring.slice(0, -1)) {
        const p = `${fmt(lon + 180)} ${fmt(90 - lat)}`;
        if (pts[pts.length - 1] !== p) pts.push(p);
      }
      return pts.length >= 3 ? `M${pts.join(' ')}Z` : '';
    })
    .join('');
}
