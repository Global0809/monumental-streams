/**
 * THE SYNAPSE — deterministic radial layout (pure, no DOM).
 *
 * The entity sits at the centre. Depth-1 nodes sit on an inner elliptical ring, grouped by
 * kind in a fixed order (places, routes, decades, movements, people, programmes, stories,
 * interests, themes) with a small gap between groups; within a group by weight, then label.
 * Depth-2 nodes sit on an outer ring, ordered by their parent's angle so they fan out near
 * the node that brought them in. Same graph + size ⇒ same picture: no jitter, no physics.
 */
import type { EntityKind } from '../../../shared/catalogue.ts';
import type { GraphEdge, GraphNode } from '../../../shared/relations.ts';
import type { ID } from '../../../shared/types.ts';

export const KIND_ORDER: EntityKind[] = ['place', 'route', 'period', 'movement', 'person', 'programme', 'video', 'interest', 'theme', 'collection'];

export interface LaidNode extends GraphNode {
  x: number;
  y: number;
  r: number;
  /** Radians, 0 = 3 o'clock, clockwise on screen (SVG y down). Centre: 0. */
  angle: number;
  /** Depth-2 nodes: the depth-1 node that brought them in. */
  parent?: ID;
  caption: { lines: string[]; x: number; y: number; anchor: 'start' | 'middle' | 'end'; shown: boolean };
}

export interface LaidEdge extends GraphEdge {
  key: string;
  d: string;
  /** Edge between two first-ring nodes (not through the centre). */
  cross: boolean;
  /** Approximate length in px (for pulse timing). */
  length: number;
}

export interface Layout {
  width: number;
  height: number;
  compact: boolean;
  nodes: LaidNode[];
  edges: LaidEdge[];
  byId: Map<ID, LaidNode>;
  /** Focus order: centre, ring 1 clockwise, then ring 2 clockwise. */
  order: ID[];
}

const kindRank = (k: EntityKind) => {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? KIND_ORDER.length : i;
};

/** Break a label into at most two lines of `max` characters, ellipsising the remainder. */
export function wrapLabel(text: string, max: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < 2) {
    let line = words[i++];
    while (i < words.length && `${line} ${words[i]}`.length <= max) line += ` ${words[i++]}`;
    lines.push(line);
  }
  const cut = (l: string) => `${l.slice(0, max - 1).trimEnd()}…`;
  const out = lines.map((l) => (l.length > max ? cut(l) : l));
  if (i < words.length && out.length) {
    const last = out[out.length - 1];
    if (!last.endsWith('…')) out[out.length - 1] = last.length >= max ? cut(last) : `${last}…`;
  }
  return out;
}

function placeLabel(x: number, y: number, r: number, angle: number, cx: number, cy: number, lines: string[], lineH: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (c > 0.35) return { x: x + r + 7, y: y - ((lines.length - 1) * lineH) / 2, anchor: 'start' as const };
  if (c < -0.35) return { x: x - r - 7, y: y - ((lines.length - 1) * lineH) / 2, anchor: 'end' as const };
  // Top or bottom of the ring: label outside, centred on the node.
  if (s < 0 || (s === 0 && y < cy)) return { x, y: y - r - 8 - (lines.length - 1) * lineH, anchor: 'middle' as const };
  return { x, y: y + r + 14, anchor: 'middle' as const };
}

function curve(ax: number, ay: number, bx: number, by: number, bend: number, pull?: { cx: number; cy: number; k: number }) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let qx = mx - (dy / len) * len * bend;
  let qy = my + (dx / len) * len * bend;
  if (pull) {
    qx = pull.cx + (mx - pull.cx) * pull.k;
    qy = pull.cy + (my - pull.cy) * pull.k;
  }
  const f = (n: number) => n.toFixed(1);
  return { d: `M${f(ax)} ${f(ay)} Q${f(qx)} ${f(qy)} ${f(bx)} ${f(by)}`, length: len * (pull ? 1.15 : 1.04) };
}

export function layoutGraph(graph: { nodes: GraphNode[]; edges: GraphEdge[] }, width: number): Layout {
  const compact = width < 560;
  const W = Math.max(280, Math.round(width));
  const H = Math.round(compact ? W * 1.22 : Math.min(Math.max(W * 0.7, 440), 700));
  const cx = W / 2;
  const cy = H / 2;
  const centre = graph.nodes.find((n) => n.depth === 0);
  const ring1 = graph.nodes.filter((n) => n.depth === 1);
  const ring2 = graph.nodes.filter((n) => n.depth === 2);
  const deep = ring2.length > 0;

  const r1 = deep ? { rx: W * (compact ? 0.2 : 0.19), ry: H * (compact ? 0.2 : 0.23) } : { rx: W * (compact ? 0.27 : 0.29), ry: H * (compact ? 0.31 : 0.36) };
  const r2 = { rx: W * (compact ? 0.43 : 0.44), ry: H * (compact ? 0.44 : 0.45) };
  const maxChars = compact ? (deep ? 9 : 11) : deep ? 16 : 22;
  const lineH = compact ? 12 : 14;

  const maxW = Math.max(1, ...ring1.map((n) => n.weight));
  const nodeR = (n: GraphNode) => {
    if (n.depth === 0) return compact ? 26 : 36;
    if (n.depth === 2) return n.kind === 'video' ? (compact ? 6 : 8) : compact ? 4.5 : 6;
    const base = compact ? 7 : 9;
    const span = compact ? 6 : 9;
    const r = base + span * Math.sqrt(n.weight / maxW);
    return n.kind === 'video' ? Math.max(r, compact ? 11 : 14) : r;
  };

  const nodes: LaidNode[] = [];
  const byId = new Map<ID, LaidNode>();

  if (centre) {
    const c: LaidNode = { ...centre, x: cx, y: cy, r: nodeR(centre), angle: 0, caption: { lines: wrapLabel(centre.label, compact ? 14 : 24), x: cx, y: cy + nodeR(centre) + 16, anchor: 'middle', shown: true } };
    nodes.push(c);
    byId.set(c.id, c);
  }

  // Ring 1: grouped by kind with a half-slot gap between groups.
  const sorted1 = [...ring1].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || b.weight - a.weight || a.label.localeCompare(b.label));
  const groups = new Set(sorted1.map((n) => n.kind)).size;
  const GAP = 0.6;
  const units = sorted1.length + (groups > 1 ? groups * GAP : 0);
  const unit = units ? (Math.PI * 2) / units : 0;
  let cursor = -Math.PI / 2 + unit / 2;
  let prevKind: EntityKind | null = null;
  for (const n of sorted1) {
    if (prevKind && prevKind !== n.kind) cursor += unit * GAP;
    prevKind = n.kind;
    const angle = cursor;
    cursor += unit;
    const x = cx + r1.rx * Math.cos(angle);
    const y = cy + r1.ry * Math.sin(angle);
    const r = nodeR(n);
    const lines = wrapLabel(n.label, maxChars);
    const lab = placeLabel(x, y, r, angle, cx, cy, lines, lineH);
    const laid: LaidNode = { ...n, x, y, r, angle, caption: { lines, ...lab, shown: true } };
    nodes.push(laid);
    byId.set(n.id, laid);
  }

  // Ring 2: each node's parent is the first-ring node of the edge that brought it in.
  const parentOf = new Map<ID, ID>();
  for (const e of graph.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (a?.depth === 1 && !byId.has(e.to) && ring2.some((n) => n.id === e.to) && !parentOf.has(e.to)) parentOf.set(e.to, e.from);
    else if (b?.depth === 1 && !byId.has(e.from) && ring2.some((n) => n.id === e.from) && !parentOf.has(e.from)) parentOf.set(e.from, e.to);
  }
  const norm = (a: number) => {
    const t = (a + Math.PI / 2) % (Math.PI * 2);
    return t < 0 ? t + Math.PI * 2 : t;
  };
  const sorted2 = [...ring2].sort((a, b) => {
    const pa = byId.get(parentOf.get(a.id) ?? '');
    const pb = byId.get(parentOf.get(b.id) ?? '');
    return norm(pa?.angle ?? 0) - norm(pb?.angle ?? 0) || kindRank(a.kind) - kindRank(b.kind) || b.weight - a.weight || a.label.localeCompare(b.label);
  });
  if (sorted2.length) {
    // Rotate the outer ring so its first node starts just before the first parent's angle.
    const step = (Math.PI * 2) / sorted2.length;
    const firstParent = byId.get(parentOf.get(sorted2[0].id) ?? '');
    const kids0 = sorted2.filter((n) => parentOf.get(n.id) === parentOf.get(sorted2[0].id)).length;
    const start = (firstParent?.angle ?? -Math.PI / 2) - (step * (kids0 - 1)) / 2;
    sorted2.forEach((n, i) => {
      const angle = start + i * step;
      const x = cx + r2.rx * Math.cos(angle);
      const y = cy + r2.ry * Math.sin(angle);
      const r = nodeR(n);
      const lines = wrapLabel(n.label, compact ? 12 : 18);
      const lab = placeLabel(x, y, r, angle, cx, cy, lines, lineH);
      const laid: LaidNode = { ...n, x, y, r, angle, parent: parentOf.get(n.id), caption: { lines, ...lab, shown: false } };
      nodes.push(laid);
      byId.set(n.id, laid);
    });
  }

  const centreId = centre?.id;
  const edges: LaidEdge[] = [];
  graph.edges.forEach((e, i) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return;
    const cross = a.depth === 1 && b.depth === 1;
    let path;
    if (cross) path = curve(a.x, a.y, b.x, b.y, 0, { cx, cy, k: 0.42 });
    else if (a.id === centreId || b.id === centreId) path = curve(a.x, a.y, b.x, b.y, 0.1);
    else path = curve(a.x, a.y, b.x, b.y, i % 2 ? 0.14 : -0.14);
    edges.push({ ...e, key: `${e.from}|${e.to}`, d: path.d, cross, length: path.length });
  });

  const order = [...(centreId ? [centreId] : []), ...sorted1.map((n) => n.id), ...sorted2.map((n) => n.id)];
  return { width: W, height: H, compact, nodes, edges, byId, order };
}

/** Edges touching a node, the one that brought it into the web first. */
export function edgesOf(layout: Layout, id: ID): LaidEdge[] {
  const n = layout.byId.get(id);
  const list = layout.edges.filter((e) => e.from === id || e.to === id);
  const primary = (e: LaidEdge) => {
    if (!n) return 1;
    const other = layout.byId.get(e.from === id ? e.to : e.from);
    if (n.depth === 1 && other?.depth === 0) return 0;
    if (n.depth === 2 && other?.id === n.parent) return 0;
    return 1;
  };
  return list.sort((a, b) => primary(a) - primary(b) || b.weight - a.weight);
}
