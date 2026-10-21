/**
 * World — pure model helpers (no DOM, no Three.js) so they can be unit-tested and shared by
 * the globe, the flat map, the list and the Miami tissue map.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { ID, Movement, Place, PlaceKind, Route } from '../../../shared/types.ts';
import { writeFilters, type PlaceSignal, type WorldFilters } from './filters.ts';

/* ───────────── Views & URLs ───────────── */

export type AtlasView = 'globe' | 'map' | 'list';
export const VIEWS: AtlasView[] = ['globe', 'map', 'list'];

export function parseView(v: string | null | undefined): AtlasView | null {
  return v && (VIEWS as string[]).includes(v) ? (v as AtlasView) : null;
}

/** Route ids travel in the URL without their "route:" prefix. */
export const routeSlug = (id: ID) => id.replace(/^route:/, '');

/**
 * Canonical World URL: place, then route, view and the lens (filters). Params are written in
 * a stable order and omitted when empty, so the address alone restores an exploration.
 */
export function atlasHref(slug: string | null | undefined, opts: { route?: string | null; view?: AtlasView | null; filters?: WorldFilters | null } = {}): string {
  const p = new URLSearchParams();
  if (opts.route) p.set('route', routeSlug(opts.route));
  if (opts.view) p.set('view', opts.view);
  writeFilters(p, opts.filters);
  const q = p.toString();
  return `/world${slug ? `/${slug}` : ''}${q ? `?${q}` : ''}`;
}

/* ───────────── Labels ───────────── */

export const KIND_LABEL: Record<PlaceKind, string> = {
  country: 'Country',
  territory: 'Territory',
  'constituent-country': 'Constituent country',
  state: 'State',
  county: 'County',
  city: 'City',
  borough: 'Borough',
  neighbourhood: 'Neighbourhood',
  district: 'District',
  venue: 'Venue',
};

export const ROUTE_KIND_LABEL: Record<Route['kind'], string> = {
  migration: 'Migration',
  influence: 'Influence',
  exchange: 'Exchange',
  programme: 'Programme journey',
};

const trimNum = (v: number) => String(Number(Math.abs(v).toFixed(4)));

/** "25.7617° N, 80.1918° W" — never pads precision the data does not have. */
export function formatCoords([lat, lon]: [number, number]): string {
  return `${trimNum(lat)}° ${lat < 0 ? 'S' : 'N'}, ${trimNum(lon)}° ${lon < 0 ? 'W' : 'E'}`;
}

/** "1959–present", "1980", "1946–1964". */
export function yearsLabel(from: number, to: number | null): string {
  if (to === null) return `${from}–present`;
  return from === to ? String(from) : `${from}–${to}`;
}

/* ───────────── Atlas model ───────────── */

export interface AtlasNode {
  id: ID;
  place: Place;
  lat: number;
  lon: number;
  /** Stories here, descendants included. */
  count: number;
  expanding: boolean;
  gateway: boolean;
  /** 'city' nodes are drawn at world scale; 'local' ones (neighbourhoods, boroughs…) only up close. */
  level: 'city' | 'local';
}

export interface AtlasModel {
  nodes: AtlasNode[]; // every mappable place (city-level + local)
  byId: Map<ID, AtlasNode>;
  counts: Map<ID, number>;
  gateway: Place | undefined;
  active: number;
  expanding: number;
  /** Stories pinned to at least one place. */
  placedStories: number;
}

/** A place is drawn at world scale when it is a city, or a leaf that no city contains (e.g. a launch pad). */
export function isCityLevel(cat: Catalogue, p: Place): boolean {
  if (p.kind === 'city') return true;
  if (cat.placeAncestors(p.id).some((a) => a.kind === 'city')) return false;
  return cat.placeChildren(p.id).length === 0;
}

export function buildAtlasModel(cat: Catalogue): AtlasModel {
  const counts = new Map<ID, number>();
  for (const p of cat.places) counts.set(p.id, cat.videosForPlace(p.id).length);
  const nodes: AtlasNode[] = [];
  for (const p of cat.places) {
    const city = isCityLevel(cat, p);
    const local = !city && cat.placeAncestors(p.id).some((a) => a.kind === 'city');
    if (!city && !local) continue; // countries, states, counties are regions, not nodes
    nodes.push({
      id: p.id,
      place: p,
      lat: p.coords[0],
      lon: p.coords[1],
      count: counts.get(p.id) ?? 0,
      expanding: p.status === 'expanding',
      gateway: !!p.gateway,
      level: city ? 'city' : 'local',
    });
  }
  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    counts,
    gateway: cat.places.find((p) => p.gateway),
    active: cat.places.filter((p) => p.status === 'active').length,
    expanding: cat.places.filter((p) => p.status === 'expanding').length,
    placedStories: cat.videos.filter((v) => v.places.length > 0).length,
  };
}

/** The same model seen through the lens: story counts replaced by the filtered ones. */
export function withCounts(model: AtlasModel, signals: Map<ID, PlaceSignal> | null): AtlasModel {
  if (!signals) return model;
  const counts = new Map<ID, number>([...model.counts.keys()].map((id) => [id, signals.get(id)?.stories ?? 0]));
  const nodes = model.nodes.map((n) => ({ ...n, count: counts.get(n.id) ?? 0 }));
  return { ...model, counts, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
}

/** Node core diameter in CSS px, by story count (descendants included). */
export function nodeSize(count: number, expanding: boolean): number {
  if (expanding) return 9;
  return Math.min(22, 8 + 4 * Math.sqrt(count));
}

/* ───────────── Stage data (shared by globe and flat map) ───────────── */

export interface StageNode {
  id: ID;
  slug: string;
  name: string;
  /** Short telemetry line, e.g. "Gateway · 3 stories". */
  meta: string;
  lat: number;
  lon: number;
  size: number;
  expanding: boolean;
  gateway: boolean;
  /** 0 normal · 1 dimmed · 2 highlighted · 3 selected */
  state: 0 | 1 | 2 | 3;
  /** Always labelled (selected, gateway, route ends, small scopes). */
  label: boolean;
  level: 'city' | 'local';
}

export interface StageRoute {
  id: ID;
  from: [number, number];
  to: [number, number];
  kind: Route['kind'];
  /** 0 dimmed · 1 normal · 2 touches the selection · 3 selected */
  state: 0 | 1 | 2 | 3;
}

/* ───────────── Relations used by the panel ───────────── */

export type RouteDirection = 'outward' | 'inward' | 'within';

/** The end of a route on the far side of a place (its scope includes descendants). */
export function otherEnd(cat: Catalogue, route: Route, placeId: ID): { id: ID; direction: RouteDirection } {
  const scope = cat.placeScope(placeId);
  const fromIn = scope.has(route.from);
  const toIn = scope.has(route.to);
  if (fromIn && !toIn) return { id: route.to, direction: 'outward' };
  if (toIn && !fromIn) return { id: route.from, direction: 'inward' };
  return { id: placeId === route.to ? route.from : route.to, direction: 'within' };
}

/** A movement opens the Time Machine at the decade it began, or its connections when it predates the periods. */
export function movementHref(cat: Catalogue, m: Movement): string {
  const p = cat.periods.find((x) => x.start <= m.start && m.start <= x.end);
  return p ? `/time-machine/${p.slug}?movement=${m.slug}` : `/synapse/movement/${m.slug}`;
}

/** The region that gets the complete "up close" treatment: the gateway's county (Miami-Dade). */
export function gatewayRegion(cat: Catalogue): Place | undefined {
  const g = cat.places.find((p) => p.gateway);
  const county = g ? cat.placeAncestors(g.id).find((a) => a.kind === 'county') : undefined;
  return county ?? (cat.get('place:miami-dade-county') as Place | undefined);
}

export function isWithin(cat: Catalogue, placeId: ID, regionId: ID): boolean {
  return placeId === regionId || cat.placeAncestors(placeId).some((a) => a.id === regionId);
}

/** The municipality (direct child of the region) a place belongs to. */
export function municipalityOf(cat: Catalogue, placeId: ID, regionId: ID): ID | undefined {
  const chain = [cat.get(placeId) as Place | undefined, ...cat.placeAncestors(placeId)].filter(Boolean) as Place[];
  return chain.find((p) => p.parent === regionId)?.id;
}

/* ───────────── Hierarchy (list view) ───────────── */

export interface TreeNode {
  place: Place;
  count: number;
  children: TreeNode[];
  /** Set by filterTree: this node itself matches the query. */
  match?: boolean;
}

export function placeTree(cat: Catalogue, counts: Map<ID, number>): TreeNode[] {
  const build = (p: Place): TreeNode => ({
    place: p,
    count: counts.get(p.id) ?? 0,
    children: [...cat.placeChildren(p.id)].sort((a, b) => a.name.localeCompare(b.name)).map(build),
  });
  const ids = new Set(cat.places.map((p) => p.id));
  return cat.places
    .filter((p) => !p.parent || !ids.has(p.parent))
    .map(build)
    .sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name));
}

export const normalise = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Keeps nodes that match (name, aliases or kind) plus the ancestors that lead to them. */
export function filterTree(tree: TreeNode[], query: string): { tree: TreeNode[]; matches: number } {
  const q = normalise(query);
  if (!q) return { tree, matches: countNodes(tree) };
  let matches = 0;
  const walk = (n: TreeNode): TreeNode | null => {
    const hay = [n.place.name, ...(n.place.aliases ?? []), KIND_LABEL[n.place.kind]].map(normalise);
    const match = hay.some((h) => h.includes(q));
    if (match) matches++;
    const children = n.children.map(walk).filter((c): c is TreeNode => !!c);
    return match || children.length ? { ...n, children, match } : null;
  };
  return { tree: tree.map(walk).filter((c): c is TreeNode => !!c), matches };
}

/** Drops places with no stories (counts include descendants, so a kept node's ancestors stay). */
export function pruneEmpty(tree: TreeNode[], keep: ID | null = null): TreeNode[] {
  const walk = (n: TreeNode): TreeNode | null => {
    const children = n.children.map(walk).filter((c): c is TreeNode => !!c);
    return n.count > 0 || n.place.id === keep || children.length ? { ...n, children } : null;
  };
  return tree.map(walk).filter((c): c is TreeNode => !!c);
}

function countNodes(tree: TreeNode[]): number {
  return tree.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

/* ───────────── Sphere geometry ─────────────
 * The living globe is drawn by the shared stage (src/stage). These pure helpers and the camera
 * targets below no longer drive a page-owned globe; they remain for their unit tests. */

export type Vec3 = [number, number, number];
const RAD = Math.PI / 180;

/** y-up unit vector: (lat 0, lon 0) faces +z. */
export function toVec(lat: number, lon: number, r = 1): Vec3 {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

export function toLatLon([x, y, z]: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, y / r))) / RAD, lon: Math.atan2(x, z) / RAD };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Central angle between two lat/lon points, in degrees. */
export function angularDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const d = Math.max(-1, Math.min(1, dot(toVec(a.lat, a.lon), toVec(b.lat, b.lon))));
  return Math.acos(d) / RAD;
}

export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const omega = Math.acos(d);
  if (omega < 1e-6) return [a[0], a[1], a[2]];
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** A great-circle arc lifted off the surface (higher for longer journeys). */
export function arcPoints(from: [number, number], to: [number, number], segments = 64, radius = 1): Vec3[] {
  const a = toVec(from[0], from[1]);
  const b = toVec(to[0], to[1]);
  const omega = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  const lift = 0.03 + 0.24 * (omega / Math.PI);
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = slerp(a, b, t);
    const h = radius * (1.004 + lift * Math.sin(Math.PI * t));
    out.push([p[0] * h, p[1] * h, p[2] * h]);
  }
  return out;
}

export function midpoint(a: [number, number], b: [number, number]): { lat: number; lon: number } {
  return toLatLon(slerp(toVec(a[0], a[1]), toVec(b[0], b[1]), 0.5));
}

/* ───────────── Camera targets ───────────── */

export interface CameraTarget {
  lat: number;
  lon: number;
  dist: number; // camera distance from the globe centre (globe radius = 1)
}

/** Whole-globe view centred on the Atlantic, with Miami on the western shore. */
export const ATLANTIC: CameraTarget = { lat: 24, lon: -42, dist: 4.3 };

// The land field is Natural Earth 1:110m, so the globe keeps regional context even for a
// neighbourhood; street-level detail lives in the schematic panels (e.g. Miami, up close).
const KIND_DIST: Record<PlaceKind, number> = {
  country: 3.0,
  territory: 2.7,
  'constituent-country': 2.8,
  state: 2.75,
  county: 2.5,
  city: 2.45,
  borough: 2.4,
  neighbourhood: 2.4,
  district: 2.4,
  venue: 2.4,
};

export function focusFor(place: Place | undefined, route: { from: [number, number]; to: [number, number] } | undefined): CameraTarget {
  if (route) {
    const m = midpoint(route.from, route.to);
    const ang = angularDistance({ lat: route.from[0], lon: route.from[1] }, { lat: route.to[0], lon: route.to[1] });
    return { lat: m.lat, lon: m.lon, dist: Math.min(4.3, Math.max(1.9, 1.75 + ang * 0.03)) };
  }
  if (place) return { lat: place.coords[0], lon: place.coords[1], dist: KIND_DIST[place.kind] };
  return ATLANTIC;
}

/** Flat-map (equirectangular, viewBox 0 0 360 180) box to frame a selection: [cx, cy, width]. */
const KIND_SPAN: Record<PlaceKind, number> = {
  country: 64,
  territory: 9,
  'constituent-country': 14,
  state: 18,
  county: 2.4,
  city: 1.4,
  borough: 0.8,
  neighbourhood: 0.6,
  district: 0.6,
  venue: 1.2,
};

export const eqX = (lon: number) => lon + 180;
export const eqY = (lat: number) => 90 - lat;

export function mapFocus(place: Place | undefined, route: { from: [number, number]; to: [number, number] } | undefined): { cx: number; cy: number; w: number } {
  if (route) {
    const xs = [eqX(route.from[1]), eqX(route.to[1])];
    const ys = [eqY(route.from[0]), eqY(route.to[0])];
    const w = Math.max(12, (Math.max(...xs) - Math.min(...xs)) * 1.5, (Math.max(...ys) - Math.min(...ys)) * 2.4);
    return { cx: (xs[0] + xs[1]) / 2, cy: (ys[0] + ys[1]) / 2 - w * 0.05, w };
  }
  if (place) return { cx: eqX(place.coords[1]), cy: eqY(place.coords[0]), w: KIND_SPAN[place.kind] };
  return { cx: eqX(-38), cy: eqY(28), w: 200 };
}

/** Quadratic arc between two flat-map points, bowed towards the north. */
export function mapArc(a: [number, number], b: [number, number]): string {
  const [x1, y1] = [eqX(a[1]), eqY(a[0])];
  const [x2, y2] = [eqX(b[1]), eqY(b[0])];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  let nx = -(y2 - y1) / (len || 1);
  let ny = (x2 - x1) / (len || 1);
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const k = len * 0.22;
  const f = (v: number) => Number(v.toFixed(3));
  return `M${f(x1)} ${f(y1)}Q${f(mx + nx * k)} ${f(my + ny * k)} ${f(x2)} ${f(y2)}`;
}

/* ───────────── Local projection (Miami tissue map) ───────────── */

export interface Projected {
  id: ID;
  x: number;
  y: number;
}

/**
 * Local equirectangular projection (x scaled by cos of the mean latitude) fitted into a box.
 * Positions are to scale relative to each other; returns px per km for a scale bar.
 */
export function projectLocal(points: { id: ID; lat: number; lon: number }[], width: number, height: number, pad: number): { points: Projected[]; pxPerKm: number } {
  if (!points.length) return { points: [], pxPerKm: 0 };
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos(lat0 * RAD);
  const xs = points.map((p) => p.lon * k);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (width - spanX * s) / 2;
  const oy = (height - spanY * s) / 2;
  return {
    points: points.map((p, i) => ({ id: p.id, x: ox + (xs[i] - minX) * s, y: oy + (maxY - ys[i]) * s })),
    pxPerKm: s / 111.32,
  };
}

/** The height a local projection needs for a given width (so the box hugs the data). */
export function localAspect(points: { lat: number; lon: number }[]): number {
  if (points.length < 2) return 0.75;
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos(lat0 * RAD);
  const spanX = Math.max(...points.map((p) => p.lon * k)) - Math.min(...points.map((p) => p.lon * k));
  const spanY = Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat));
  return spanX > 0 ? Math.min(1.4, Math.max(0.5, spanY / spanX)) : 0.75;
}

/** A tidy scale-bar length (km) that draws between roughly 70 and 160 px. */
export function niceKm(pxPerKm: number): number {
  for (const km of [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]) if (km * pxPerKm >= 70) return km;
  return 100;
}

/** Monotone-chain convex hull (counter-clockwise), for the municipality "cells". */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The convex hull of some points grown outward by `pad` with rounded corners — an organic
 * "cell membrane" around a municipality. One point → circle; two → stadium.
 */
export function roundedHullPath(pts: [number, number][], pad: number): string {
  const f = (v: number) => Number(v.toFixed(2));
  if (!pts.length) return '';
  const hull = convexHull(pts);
  if (hull.length === 1 || (hull.length === 2 && hull[0][0] === hull[1][0] && hull[0][1] === hull[1][1])) {
    const [x, y] = hull[0];
    return `M${f(x - pad)} ${f(y)}a${pad} ${pad} 0 1 0 ${f(pad * 2)} 0a${pad} ${pad} 0 1 0 ${f(-pad * 2)} 0Z`;
  }
  if (hull.length === 2) {
    const [a, b] = hull;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * pad;
    const ny = ((b[0] - a[0]) / len) * pad;
    return `M${f(a[0] + nx)} ${f(a[1] + ny)}L${f(b[0] + nx)} ${f(b[1] + ny)}A${pad} ${pad} 0 0 0 ${f(b[0] - nx)} ${f(b[1] - ny)}L${f(a[0] - nx)} ${f(a[1] - ny)}A${pad} ${pad} 0 0 0 ${f(a[0] + nx)} ${f(a[1] + ny)}Z`;
  }
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  const k = hull.length;
  const normals = hull.map((a, i) => {
    const b = hull[(i + 1) % k];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny] as [number, number];
  });
  let d = `M${f(hull[0][0] + normals[0][0] * pad)} ${f(hull[0][1] + normals[0][1] * pad)}`;
  for (let i = 0; i < k; i++) {
    const v = hull[(i + 1) % k];
    const n0 = normals[i];
    const n1 = normals[(i + 1) % k];
    const sweep = n0[0] * n1[1] - n0[1] * n1[0] > 0 ? 1 : 0;
    d += `L${f(v[0] + n0[0] * pad)} ${f(v[1] + n0[1] * pad)}A${pad} ${pad} 0 0 ${sweep} ${f(v[0] + n1[0] * pad)} ${f(v[1] + n1[1] * pad)}`;
  }
  return `${d}Z`;
}

/* ───────────── Label placement ───────────── */

export interface LabelInput {
  id: string;
  x: number;
  y: number;
  r: number; // node radius
  w: number; // label width (px)
  h: number; // label height (px)
  /** Optional labels are dropped rather than overlapping others. */
  optional?: boolean;
}

export interface LabelPlacement {
  id: string;
  /** Top-left of the label box. */
  x: number;
  y: number;
  /** Whether a leader line is needed (the label sits away from its node). */
  leader: boolean;
  overlap: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Greedy label placement in priority order. Tries positions around each node (then further out,
 * with a leader line), scoring overlap with placed labels, other nodes and the bounds.
 * With `dropOnOverlap`, labels that cannot be placed cleanly are omitted.
 */
export function placeLabels(items: LabelInput[], bounds: { w: number; h: number }, opts: { dropOnOverlap?: boolean; gap?: number } = {}): LabelPlacement[] {
  const gap = opts.gap ?? 5;
  const placed: Box[] = [];
  const nodes: Box[] = items.map((n) => ({ x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 }));
  const out: LabelPlacement[] = [];
  items.forEach((n, i) => {
    const near = n.r + gap;
    const far = n.r + gap + 16;
    const c: { x: number; y: number; leader: boolean }[] = [
      { x: n.x + near, y: n.y - n.h / 2, leader: false },
      { x: n.x - near - n.w, y: n.y - n.h / 2, leader: false },
      { x: n.x - n.w / 2, y: n.y - near - n.h, leader: false },
      { x: n.x - n.w / 2, y: n.y + near, leader: false },
      { x: n.x + near * 0.75, y: n.y - near * 0.75 - n.h, leader: false },
      { x: n.x + near * 0.75, y: n.y + near * 0.75, leader: false },
      { x: n.x - near * 0.75 - n.w, y: n.y - near * 0.75 - n.h, leader: false },
      { x: n.x - near * 0.75 - n.w, y: n.y + near * 0.75, leader: false },
      { x: n.x + far, y: n.y - n.h / 2 - 14, leader: true },
      { x: n.x + far, y: n.y - n.h / 2 + 14, leader: true },
      { x: n.x - far - n.w, y: n.y - n.h / 2 - 14, leader: true },
      { x: n.x - far - n.w, y: n.y - n.h / 2 + 14, leader: true },
      { x: n.x - n.w / 2, y: n.y - far - n.h - 6, leader: true },
      { x: n.x - n.w / 2, y: n.y + far + 6, leader: true },
    ];
    let best: { x: number; y: number; leader: boolean; score: number; raw: number } | null = null;
    for (const [ci, cand] of c.entries()) {
      const box = { x: cand.x, y: cand.y, w: n.w, h: n.h };
      let raw = 0;
      for (const b of placed) raw += area(box, b);
      nodes.forEach((b, j) => {
        if (j !== i) raw += area(box, b) * 1.5;
      });
      const outX = Math.max(0, -box.x) + Math.max(0, box.x + box.w - bounds.w);
      const outY = Math.max(0, -box.y) + Math.max(0, box.y + box.h - bounds.h);
      raw += (outX * n.h + outY * n.w) * 2;
      // Prefer near positions, and earlier candidates, when overlap is equal.
      const score = raw + ci * 0.01 + (cand.leader ? 0.5 : 0);
      if (!best || score < best.score) best = { ...cand, score, raw };
      if (raw === 0 && !cand.leader) break;
    }
    if (!best) return;
    const overlap = Math.round(best.raw);
    if ((opts.dropOnOverlap || n.optional) && overlap > 0) return;
    placed.push({ x: best.x, y: best.y, w: n.w, h: n.h });
    out.push({ id: n.id, x: best.x, y: best.y, leader: best.leader, overlap });
  });
  return out;
}

/** Rough text width for label boxes (proportional sans at the given px size). */
export const textWidth = (s: string, px = 12) => Math.ceil(s.length * px * 0.56) + 4;
