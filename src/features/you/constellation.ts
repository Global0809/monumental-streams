/**
 * The My World constellation — pure layout. The viewer's library drawn as orbits around the
 * story at its centre: what is in progress closest in, then saved stories, places (with
 * passport stamps marked) and journeys furthest out. One node per real item; nothing is
 * decorative filler. No DOM, no React — unit-tested in tests/unit/live-you-my-world.test.ts.
 */

export type RingId = 'continue' | 'saved' | 'places' | 'journeys';

export interface OrbitItem {
  id: string;
  label: string;
  /** 0–1 for stories in progress. */
  progress?: number;
  /** A place that carries a passport stamp. */
  stamp?: boolean;
}

export interface OrbitNode extends OrbitItem {
  ring: RingId;
  angle: number; // degrees, clockwise from the top
  x: number;
  y: number;
}

export interface OrbitRing {
  id: RingId;
  r: number;
  /** Items on the ring (before the cap). */
  count: number;
  /** Items beyond the cap, not drawn. */
  hidden: number;
}

export const ORBIT_SIZE = 480;
export const RING_ORDER: RingId[] = ['continue', 'saved', 'places', 'journeys'];
const RADIUS: Record<RingId, number> = { continue: 122, saved: 158, places: 194, journeys: 228 };
/** Each ring starts at its own angle so nodes on neighbouring rings do not line up. */
const OFFSET: Record<RingId, number> = { continue: 20, saved: 62, places: 104, journeys: 146 };

export function constellation(items: Record<RingId, OrbitItem[]>, maxPerRing = 16, size = ORBIT_SIZE): { rings: OrbitRing[]; nodes: OrbitNode[] } {
  const c = size / 2;
  const scale = size / ORBIT_SIZE;
  const rings: OrbitRing[] = [];
  const nodes: OrbitNode[] = [];
  for (const id of RING_ORDER) {
    const list = items[id] ?? [];
    const shown = list.slice(0, maxPerRing);
    const r = RADIUS[id] * scale;
    rings.push({ id, r, count: list.length, hidden: list.length - shown.length });
    shown.forEach((item, i) => {
      const angle = (OFFSET[id] + (360 / shown.length) * i) % 360;
      const a = ((angle - 90) * Math.PI) / 180;
      nodes.push({ ...item, ring: id, angle, x: c + r * Math.cos(a), y: c + r * Math.sin(a) });
    });
  }
  return { rings, nodes };
}
