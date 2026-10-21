/**
 * Explainable connections between any two catalogue entities.
 *
 * Every entity (video, programme, place, period, movement, person, interest, theme, route)
 * is reduced to a profile — its places, years, movements, people, categories, themes,
 * programme and moods, with the entity itself standing in for its own facet (a place's
 * places are [itself], a movement's movements are [itself] …). Comparing two profiles yields
 * specific human reasons ("Wynwood is part of Miami", "Hip hop drew on Sound system
 * culture") with a weight per reason; a connection's weight is the sum.
 */
import { kindOf } from './catalogue.ts';
import type { Catalogue, Entity, EntityKind } from './catalogue.ts';
import { periodPhrase, yearSpan } from './text.ts';
import type { Connection, ID, Mood, Movement, Period, Person, Place, Programme, Reason, ReasonKind, Route, Video } from './types.ts';

/* ───────────────────────── Weights & labels ───────────────────────── */

export const REASON_WEIGHTS: Record<ReasonKind, number> = {
  programme: 5,
  'series-order': 5,
  person: 4,
  place: 4,
  'place-family': 2.5,
  route: 3,
  movement: 3.5,
  lineage: 2,
  period: 2,
  theme: 1.5,
  category: 1,
  mood: 0.5,
  history: 3,
  access: 1,
  editorial: 2,
};

/** Two places that only share a nearby (county-or-smaller) ancestor, e.g. Wynwood & South Beach. */
const SIBLING_PLACE_WEIGHT = 1.5;
/** Different chapters (or a chapter and its series) of the same original series. */
const SERIES_FAMILY_WEIGHT = 3.5;
/** A shared span wider than this many periods is too vague to count as a reason. */
const MAX_PERIOD_SPAN = 4;
/** Graph cross-links between first-ring nodes need at least this much in common… */
const CROSS_LINK_MIN = 4;
/** …and each node keeps only its strongest few. */
const CROSS_LINKS_PER_NODE = 2;
/** Ancestor kinds close enough to make siblings meaningfully related. */
const LOCAL_PLACE_KINDS = new Set<Place['kind']>(['county', 'city', 'borough', 'neighbourhood', 'district', 'venue']);
const PRESENTER_ROLE = /present|host/i;
const THIS_YEAR = new Date().getFullYear();

export const MOOD_LABELS: Record<Mood, string> = { chill: 'chill', lively: 'lively', curious: 'curious', late: 'late-night' };

/** Kinds that take part in connections (collections are containers, not subjects). */
const CONNECTABLE: EntityKind[] = ['video', 'programme', 'place', 'period', 'movement', 'person', 'interest', 'theme', 'route'];

/* ───────────────────────── Public API ───────────────────────── */

export interface GraphNode {
  id: ID;
  kind: EntityKind;
  label: string;
  /** Centre: sum of its edge weights. Others: weight of the edge that brought them in. */
  weight: number;
  depth: number;
}

export interface GraphEdge {
  from: ID;
  to: ID;
  reasons: Reason[];
  weight: number;
}

/** Reasons and summed weight for a pair. Unknown ids or identical ids relate by nothing. */
export function relate(cat: Catalogue, a: ID, b: ID): { reasons: Reason[]; weight: number } {
  const pa = profileOf(cat, a);
  const pb = profileOf(cat, b);
  if (!pa || !pb || a === b) return { reasons: [], weight: 0 };
  return scorePair(cat, pa, pb);
}

export function explainPair(cat: Catalogue, a: ID, b: ID): Reason[] {
  return relate(cat, a, b).reasons;
}

export function connectionsFor(cat: Catalogue, id: ID, opts: { limit?: number; kinds?: EntityKind[] } = {}): Connection[] {
  return rankConnections(cat, id, opts.kinds ?? CONNECTABLE).slice(0, opts.limit ?? 24);
}

/** Videos related to a video, strongest first; playable titles win ties. Excludes the video itself. */
export function relatedVideos(cat: Catalogue, videoId: ID, limit = 12): { video: Video; weight: number; reasons: Reason[] }[] {
  const self = profileOf(cat, videoId);
  if (!self || self.kind !== 'video') return [];
  const out: { video: Video; weight: number; reasons: Reason[]; playable: boolean; published: string }[] = [];
  for (const v of cat.videos) {
    if (v.id === videoId) continue;
    const other = profileOf(cat, v.id);
    if (!other) continue;
    const { reasons, weight } = scorePair(cat, self, other);
    if (weight > 0) out.push({ video: v, weight, reasons, playable: cat.isPlayable(v), published: v.published });
  }
  return out
    .sort((x, y) => y.weight - x.weight || Number(y.playable) - Number(x.playable) || y.published.localeCompare(x.published) || x.video.title.localeCompare(y.video.title))
    .slice(0, limit)
    .map(({ video, weight, reasons }) => ({ video, weight, reasons }));
}

/**
 * A small connection graph around an entity: its strongest `limit` connections (depth 1),
 * optionally each of those nodes' own strongest new neighbours (depth 2), plus a few
 * cross-links between first-ring nodes that share something substantial.
 */
export function graphFor(cat: Catalogue, id: ID, opts: { depth?: 1 | 2; limit?: number } = {}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const depth = opts.depth ?? 1;
  const limit = opts.limit ?? 12;
  const centre = profileOf(cat, id);
  if (!centre) return { nodes: [], edges: [] };

  const nodes = new Map<ID, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const edgeKey = (a: ID, b: ID) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const addNode = (target: ID, weight: number, d: number) => {
    const kind = kindOf(target);
    if (kind) nodes.set(target, { id: target, kind, label: cat.label(target), weight, depth: d });
  };
  const addEdge = (from: ID, to: ID, rel: { reasons: Reason[]; weight: number }) => {
    const key = edgeKey(from, to);
    if (!edges.has(key)) edges.set(key, { from, to, reasons: rel.reasons, weight: rel.weight });
  };

  const root: GraphNode = { id, kind: centre.kind, label: centre.label, weight: 0, depth: 0 };
  nodes.set(id, root);
  const first = rankConnections(cat, id, CONNECTABLE).slice(0, limit);
  for (const c of first) {
    addNode(c.target, c.weight, 1);
    addEdge(id, c.target, c);
    root.weight += c.weight;
  }

  if (depth === 2) {
    const perNode = Math.max(2, Math.ceil(limit / 4));
    for (const c of first) {
      let added = 0;
      for (const next of rankConnections(cat, c.target, CONNECTABLE)) {
        if (added >= perNode) break;
        if (nodes.has(next.target)) continue;
        addNode(next.target, next.weight, 2);
        addEdge(c.target, next.target, next);
        added++;
      }
    }
  }

  // Cross-links among the first ring: strongest first, a few per node so the graph stays legible.
  const ring = first.map((c) => c.target);
  const cross: { a: ID; b: ID; rel: { reasons: Reason[]; weight: number } }[] = [];
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const rel = relate(cat, ring[i], ring[j]);
      if (rel.weight >= CROSS_LINK_MIN) cross.push({ a: ring[i], b: ring[j], rel });
    }
  }
  const degree = new Map<ID, number>();
  for (const { a, b, rel } of cross.sort((x, y) => y.rel.weight - x.rel.weight)) {
    if ((degree.get(a) ?? 0) >= CROSS_LINKS_PER_NODE || (degree.get(b) ?? 0) >= CROSS_LINKS_PER_NODE) continue;
    addEdge(a, b, rel);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/* ───────────────────────── Profiles ───────────────────────── */

interface Profile {
  id: ID;
  kind: EntityKind;
  label: string;
  places: ID[];
  /** Route endpoints (routes only — kept apart from `places` so a route is not "set" anywhere). */
  endpoints: ID[];
  years: [number, number] | null;
  movements: ID[];
  /** Person id → whether they present (vs. feature in) this entity. */
  people: Map<ID, boolean>;
  categories: ID[];
  themes: ID[];
  /** Video: its programme. Programme: itself. */
  programme?: ID;
  moods: Mood[];
}

const profileCaches = new WeakMap<Catalogue, Map<ID, Profile | null>>();

function profileOf(cat: Catalogue, id: ID): Profile | null {
  let cache = profileCaches.get(cat);
  if (!cache) {
    cache = new Map();
    profileCaches.set(cat, cache);
  }
  let p = cache.get(id);
  if (p === undefined) {
    p = buildProfile(cat, id);
    cache.set(id, p);
  }
  return p;
}

function buildProfile(cat: Catalogue, id: ID): Profile | null {
  const e = cat.get(id);
  const kind = kindOf(id);
  if (!e || !kind) return null;
  const p: Profile = { id, kind, label: cat.label(id), places: [], endpoints: [], years: null, movements: [], people: new Map(), categories: [], themes: [], moods: [] };
  switch (kind) {
    case 'video': {
      const v = e as Video;
      p.places = v.places;
      p.years = v.setting ? [v.setting.from, v.setting.to] : null;
      p.movements = v.movements ?? [];
      for (const { person, role } of v.people ?? []) p.people.set(person, PRESENTER_ROLE.test(role));
      p.categories = v.categories;
      p.themes = v.themes;
      p.programme = v.programme;
      p.moods = v.moods;
      break;
    }
    case 'programme': {
      const g = e as Programme;
      p.places = [...new Set([...g.places, ...(g.route ?? [])])];
      const spans = g.periods.map((pid) => cat.get(pid) as Period | undefined).filter((x): x is Period => !!x);
      p.years = spans.length ? [Math.min(...spans.map((s) => s.start)), Math.max(...spans.map((s) => s.end))] : null;
      p.movements = g.movements ?? [];
      for (const person of g.people ?? []) p.people.set(person, false);
      for (const person of g.presenters ?? []) p.people.set(person, true);
      p.categories = g.categories;
      p.themes = g.themes;
      p.programme = g.id;
      break;
    }
    case 'place':
      p.places = [id];
      break;
    case 'period': {
      const d = e as Period;
      p.years = [d.start, d.end];
      break;
    }
    case 'movement': {
      const m = e as Movement;
      p.places = m.places;
      p.years = [m.start, m.end ?? THIS_YEAR];
      p.movements = [id];
      p.categories = m.categories;
      p.themes = m.themes;
      break;
    }
    case 'person': {
      const x = e as Person;
      p.places = x.places ?? [];
      p.movements = x.movements ?? [];
      p.categories = x.categories ?? [];
      p.people.set(id, x.kind === 'presenter');
      break;
    }
    case 'interest':
      p.categories = [id];
      break;
    case 'theme':
      p.themes = [id];
      break;
    case 'route': {
      const r = e as Route;
      p.endpoints = [r.from, r.to];
      p.years = [r.period.from, r.period.to ?? THIS_YEAR];
      p.movements = r.movements ?? [];
      p.themes = r.themes ?? [];
      break;
    }
    case 'collection':
      break;
  }
  return p;
}

function entitiesOf(cat: Catalogue, kind: EntityKind): Entity[] {
  switch (kind) {
    case 'video':
      return cat.videos;
    case 'programme':
      return cat.programmes;
    case 'place':
      return cat.places;
    case 'period':
      return cat.periods;
    case 'movement':
      return cat.movements;
    case 'person':
      return cat.people;
    case 'interest':
      return cat.categories;
    case 'theme':
      return cat.themes;
    case 'route':
      return cat.routes;
    case 'collection':
      return cat.collections;
  }
}

function rankConnections(cat: Catalogue, id: ID, kinds: EntityKind[]): Connection[] {
  const self = profileOf(cat, id);
  if (!self) return [];
  const out: (Connection & { playable: boolean; label: string })[] = [];
  for (const kind of new Set(kinds)) {
    for (const e of entitiesOf(cat, kind)) {
      if (e.id === id) continue;
      const other = profileOf(cat, e.id);
      if (!other) continue;
      const { reasons, weight } = scorePair(cat, self, other);
      if (weight > 0) out.push({ target: e.id, weight, reasons, playable: kind !== 'video' || cat.isPlayable(e as Video), label: other.label });
    }
  }
  return out
    .sort((a, b) => b.weight - a.weight || Number(b.playable) - Number(a.playable) || a.label.localeCompare(b.label))
    .map(({ target, weight, reasons }) => ({ target, weight, reasons }));
}

/* ───────────────────────── Pair scoring ───────────────────────── */

type Add = (kind: ReasonKind, label: string, via?: ID, weight?: number) => void;

/** Videos and programmes are stories that are "set" somewhere / somewhen. */
const isStory = (p: Profile) => p.kind === 'video' || p.kind === 'programme';

function scorePair(cat: Catalogue, a: Profile, b: Profile): { reasons: Reason[]; weight: number } {
  const found: { reason: Reason; weight: number }[] = [];
  const seen = new Set<string>();
  const add: Add = (kind, label, via, weight = REASON_WEIGHTS[kind]) => {
    if (seen.has(label)) return;
    seen.add(label);
    found.push({ reason: via ? { kind, label, via } : { kind, label }, weight });
  };
  programmeReasons(cat, a, b, add);
  peopleReasons(cat, a, b, add);
  placeReasons(cat, a, b, add);
  routeReasons(cat, a, b, add);
  movementReasons(cat, a, b, add);
  periodReasons(cat, a, b, add);
  for (const t of a.themes) {
    if (b.themes.includes(t)) add('theme', a.id === t || b.id === t ? `Explores ${cat.label(t)}` : `Shares the theme ${cat.label(t)}`, t);
  }
  for (const c of a.categories) {
    if (b.categories.includes(c)) add('category', a.id === c || b.id === c ? `Filed under ${cat.label(c)}` : `Both ${cat.label(c)}`, c);
  }
  if (a.kind === 'video' && b.kind === 'video') {
    for (const m of a.moods) if (b.moods.includes(m)) add('mood', `Both ${MOOD_LABELS[m]}`);
  }
  found.sort((x, y) => y.weight - x.weight); // stable: equal weights keep discovery order
  return { reasons: found.map((f) => f.reason), weight: found.reduce((sum, f) => sum + f.weight, 0) };
}

const parentProgramme = (cat: Catalogue, id: ID | undefined) => (id ? (cat.get(id) as Programme | undefined)?.parent : undefined);
const seriesOf = (cat: Catalogue, id: ID | undefined) => (id ? (parentProgramme(cat, id) ?? id) : undefined);

function programmeReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  if (a.kind === 'video' && b.kind === 'video') {
    const va = cat.get(a.id) as Video;
    const vb = cat.get(b.id) as Video;
    if (va.programme && va.programme === vb.programme) {
      const title = cat.label(va.programme);
      if (cat.nextInProgramme(va) === vb) add('series-order', `Next in ${title}`, va.programme);
      else if (cat.previousInProgramme(va) === vb) add('series-order', `Previous in ${title}`, va.programme);
      else add('programme', `Both in ${title}`, va.programme);
      return;
    }
    const series = seriesOf(cat, va.programme);
    if (series && series === seriesOf(cat, vb.programme)) add('programme', `Both part of ${cat.label(series)}`, series, SERIES_FAMILY_WEIGHT);
    return;
  }
  const [prog, other] = a.kind === 'programme' ? [a, b] : [b, a];
  if (prog.kind !== 'programme') return;
  if (other.kind === 'video') {
    if (other.programme === prog.id) add('programme', `In ${prog.label}`, prog.id);
    else if (parentProgramme(cat, other.programme) === prog.id) add('programme', `Part of ${prog.label}`, prog.id);
  } else if (other.kind === 'programme') {
    const progParent = parentProgramme(cat, prog.id);
    const otherParent = parentProgramme(cat, other.id);
    if (otherParent === prog.id) add('programme', `${other.label} is a chapter of ${prog.label}`, prog.id);
    else if (progParent === other.id) add('programme', `${prog.label} is a chapter of ${other.label}`, other.id);
    else if (progParent && progParent === otherParent) add('programme', `Both chapters of ${cat.label(progParent)}`, progParent, SERIES_FAMILY_WEIGHT);
  }
}

function peopleReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  for (const [person, aPresents] of a.people) {
    const bPresents = b.people.get(person);
    if (bPresents === undefined) continue;
    const name = cat.label(person);
    if (a.id === person || b.id === person) {
      // One side is the person: describe their part in the other side.
      const presents = a.id === person ? bPresents : aPresents;
      add('person', presents ? `Presented by ${name}` : `Features ${name}`, person);
    } else {
      add('person', aPresents && bPresents ? `Presented by ${name}` : `Both feature ${name}`, person);
    }
  }
}

function placeReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  const shared = a.places.filter((p) => b.places.includes(p));
  for (const pl of shared) {
    const name = cat.label(pl);
    if (a.id === pl || b.id === pl) {
      const other = a.id === pl ? b : a;
      add('place', isStory(other) ? `Set in ${name}` : other.kind === 'movement' ? `Rooted in ${name}` : `Connected to ${name}`, pl);
    } else {
      add('place', isStory(a) && isStory(b) ? `Both set in ${name}` : `Both connected to ${name}`, pl);
    }
  }

  // Family ties between the places that are not shared outright.
  const family: { label: string; via: ID; weight: number; distance: number }[] = [];
  for (const pa of a.places) {
    if (shared.includes(pa)) continue;
    for (const pb of b.places) {
      if (shared.includes(pb)) continue;
      const ancA = cat.placeAncestors(pa);
      const ancB = cat.placeAncestors(pb);
      const aAboveB = ancB.findIndex((x) => x.id === pa);
      const bAboveA = ancA.findIndex((x) => x.id === pb);
      if (aAboveB >= 0) family.push({ label: `${cat.label(pb)} is part of ${cat.label(pa)}`, via: pa, weight: REASON_WEIGHTS['place-family'], distance: aAboveB });
      else if (bAboveA >= 0) family.push({ label: `${cat.label(pa)} is part of ${cat.label(pb)}`, via: pb, weight: REASON_WEIGHTS['place-family'], distance: bAboveA });
      else {
        const common = ancA.find((x) => ancB.some((y) => y.id === x.id));
        if (common && LOCAL_PLACE_KINDS.has(common.kind)) {
          family.push({ label: `Both in ${common.name}`, via: common.id, weight: SIBLING_PLACE_WEIGHT, distance: ancA.indexOf(common) + ancB.findIndex((y) => y.id === common.id) });
        }
      }
    }
  }
  // Closest ties first, ordered so the result does not depend on which side is `a`.
  family.sort((x, y) => y.weight - x.weight || x.distance - y.distance || x.label.localeCompare(y.label));
  const distinct = family.filter((f, i) => family.findIndex((g) => g.label === f.label) === i);
  for (const f of distinct.slice(0, 2)) add('place-family', f.label, f.via, f.weight);
}

/** "La Gran Migración (San Juan → New York City, 1945–1965)" */
function routePhrase(cat: Catalogue, r: Route): string {
  return `${r.label} (${cat.label(r.from)} → ${cat.label(r.to)}, ${yearSpan(r.period.from, r.period.to)})`;
}

function routeReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  // Is any of these places the target or inside it?
  const within = (places: ID[], target: ID) => places.some((p) => p === target || cat.placeAncestors(p).some((x) => x.id === target));
  if (a.kind === 'route' || b.kind === 'route') {
    const [r, other] = a.kind === 'route' ? [a, b] : [b, a];
    if (other.kind === 'route') {
      for (const e of r.endpoints) if (other.endpoints.includes(e)) add('place', `Both connect to ${cat.label(e)}`, e);
    } else if (r.endpoints.some((e) => within(other.places, e))) {
      add('route', `On ${routePhrase(cat, cat.get(r.id) as Route)}`, r.id);
    }
    return;
  }
  if (!a.places.length || !b.places.length) return;
  for (const route of cat.routes) {
    const forward = within(a.places, route.from) && within(b.places, route.to);
    const backward = within(a.places, route.to) && within(b.places, route.from);
    if (forward || backward) add('route', `Linked by ${routePhrase(cat, route)}`, route.id);
  }
}

function movementReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  for (const m of a.movements) {
    if (b.movements.includes(m)) add('movement', a.id === m || b.id === m ? `Part of ${cat.label(m)}` : `Both part of ${cat.label(m)}`, m);
  }
  for (const ma of a.movements) {
    for (const mb of b.movements) {
      if (ma === mb) continue;
      const A = cat.get(ma) as Movement | undefined;
      const B = cat.get(mb) as Movement | undefined;
      if (!A || !B) continue;
      if (A.influences?.includes(mb)) add('lineage', `${A.name} drew on ${B.name}`, mb);
      else if (B.influences?.includes(ma)) add('lineage', `${B.name} drew on ${A.name}`, ma);
    }
  }
}

function periodReasons(cat: Catalogue, a: Profile, b: Profile, add: Add) {
  if (!a.years || !b.years || (a.kind === 'period' && b.kind === 'period')) return;
  const lo = Math.max(a.years[0], b.years[0]);
  const hi = Math.min(a.years[1], b.years[1]);
  if (lo > hi) return;
  if (a.kind === 'period' || b.kind === 'period') {
    const [period, other] = a.kind === 'period' ? [a, b] : [b, a];
    const phrase = periodPhrase(period.label);
    add('period', isStory(other) ? `Set in ${phrase}` : other.kind === 'movement' ? `Active in ${phrase}` : `During ${phrase}`, period.id);
    return;
  }
  const periods = cat.periodsForYears(lo, hi);
  if (!periods.length || periods.length > MAX_PERIOD_SPAN) return;
  const first = periodPhrase(periods[0].label);
  const span = periods.length === 1 ? first : `${first}–${periods[periods.length - 1].label}`;
  add('period', isStory(a) && isStory(b) ? `Both set in ${span}` : `Both in ${span}`, periods[0].id);
}
