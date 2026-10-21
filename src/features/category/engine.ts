/**
 * The category engine — ONE shared model behind all eight category pages.
 *
 *   membership  videosForSection(cat, section): a title belongs because its record carries the
 *               section's interest, never because someone listed it here
 *   facets      sub-filters from section.facets (interest ids), widened per presentation family
 *               (Movies adds Fiction / Archive from the footage labels)
 *   search      the shared catalogue search (typo-tolerant, weighted) scoped to the category
 *   sort        featured · recently added · era · running time · A–Z
 *   grouping    by artist, scene, place or era (families that group)
 *   context     related places (World) and eras (Time Machine) derived from what is showing,
 *               plus movements, people and programmes that share the category's interests
 *   URL         ?facet=&sort=&q=&group= — defaults omitted, unknown values ignored
 *
 * Pure and synchronous: no React, no DOM. Unit tested in tests/unit/categories-engine.test.ts.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import { defaultDiscovery, searchCatalogue } from '../../../shared/search.ts';
import { categorySections, videosForSection, type CategoryLayout, type Section } from '../../../shared/sections.ts';
import type { Category, FootageType, ID, Movement, Period, Person, Place, Programme, Video } from '../../../shared/types.ts';

/* ───────────────────────── Facets ───────────────────────── */

export interface Facet {
  /** URL value: an interest slug ("documentary") or a footage type ("fiction"). */
  key: string;
  label: string;
  test: (v: Video) => boolean;
}

const FOOTAGE_FACET_LABEL: Partial<Record<FootageType, string>> = {
  fiction: 'Fiction',
  archive: 'Archive',
  contemporary: 'Contemporary',
  illustrative: 'Illustrative',
};

/**
 * Facet specs per family: "*" expands to section.facets (interest ids), "footage:x" adds a
 * footage-label facet. Families without an entry use section.facets as they are.
 */
const FAMILY_FACETS: Partial<Record<CategoryLayout, string[]>> = {
  cinema: ['footage:fiction', '*', 'footage:archive'],
};

export function sectionFacets(cat: Catalogue, section: Section): Facet[] {
  const own = section.facets ?? [];
  const spec = section.layout && FAMILY_FACETS[section.layout] ? FAMILY_FACETS[section.layout]!.flatMap((s) => (s === '*' ? own : [s])) : own;
  const out: Facet[] = [];
  const seen = new Set<string>();
  for (const s of spec) {
    if (s.startsWith('footage:')) {
      const f = s.slice('footage:'.length) as FootageType;
      if (seen.has(f)) continue;
      seen.add(f);
      out.push({ key: f, label: FOOTAGE_FACET_LABEL[f] ?? f, test: (v) => v.footage.includes(f) });
      continue;
    }
    const c = cat.get(s) as Category | undefined;
    const slug = c?.slug ?? s.split(':')[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ key: slug, label: c?.name ?? slug, test: (v) => v.categories.includes(s) });
  }
  return out;
}

/* ───────────────────────── Sorting ───────────────────────── */

export type CatSort = 'featured' | 'added' | 'era-old' | 'era-new' | 'short' | 'long' | 'title';
export const CAT_SORTS: readonly CatSort[] = ['featured', 'added', 'era-old', 'era-new', 'short', 'long', 'title'];
export const CAT_SORT_LABEL: Record<CatSort, string> = {
  featured: 'Featured',
  added: 'Recently added',
  'era-old': 'Oldest era first',
  'era-new': 'Newest era first',
  short: 'Shortest first',
  long: 'Longest first',
  title: 'A–Z',
};

/** Default sort per family: News leads with the most recent; everything else is editorial. */
export function defaultSort(section: Section): CatSort {
  return section.layout === 'broadsheet' ? 'added' : 'featured';
}

const KIND_WEIGHT: Record<Video['kind'], number> = { feature: 3, episode: 3, short: 2, 'archive-film': 1, teaser: 0.5, reel: 0 };

/**
 * Editorial ranking used for "Featured": watchable now first, then Monumental Originals, then
 * free, then substantial works (features and shorts) ahead of teasers and loops. Inside a
 * category, titles carrying its primary interest (Culture for Culture) lead the ones that
 * arrive through a wider interest (Documentary).
 */
export function featuredScore(cat: Catalogue, v: Video, now?: Date, section?: Section): number {
  const access = cat.effectiveAccess(v, now);
  let s = 0;
  const primary = section?.interests?.[0];
  if (primary && v.categories.includes(primary)) s += 0.75;
  s += 0.1 * (section?.interests ?? []).filter((i) => v.categories.includes(i)).length;
  if (access !== 'unavailable') s += 10;
  if (v.provenance === 'monumental-original') s += 3;
  if (access === 'free') s += 1;
  s += KIND_WEIGHT[v.kind] ?? 0;
  return s;
}

/** First year a title is about (its historical setting, else the year it was made). */
export function eraStart(v: Video): number | null {
  return v.setting?.from ?? v.made ?? null;
}
export function eraEnd(v: Video): number | null {
  return v.setting?.to ?? v.made ?? null;
}

const byTitle = (a: Video, b: Video) => a.title.localeCompare(b.title);
const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
};

export function sortVideos(cat: Catalogue, videos: Video[], sort: CatSort, opts: { scores?: Map<ID, number>; now?: Date; section?: Section } = {}): Video[] {
  const list = [...videos];
  const { scores, now, section } = opts;
  switch (sort) {
    case 'featured': {
      const fs = new Map(list.map((v) => [v.id, featuredScore(cat, v, now, section)]));
      return list.sort((a, b) => (scores ? (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) : 0) || fs.get(b.id)! - fs.get(a.id)! || byTitle(a, b));
    }
    case 'added':
      return list.sort((a, b) => Date.parse(b.published) - Date.parse(a.published) || nullsLast(a.made ?? null, b.made ?? null, -1) || byTitle(a, b));
    case 'era-old':
      return list.sort((a, b) => nullsLast(eraStart(a), eraStart(b), 1) || byTitle(a, b));
    case 'era-new':
      return list.sort((a, b) => nullsLast(eraEnd(a), eraEnd(b), -1) || byTitle(a, b));
    case 'short':
      return list.sort((a, b) => nullsLast(cat.runtime(a), cat.runtime(b), 1) || byTitle(a, b));
    case 'long':
      return list.sort((a, b) => nullsLast(cat.runtime(a), cat.runtime(b), -1) || byTitle(a, b));
    case 'title':
      return list.sort(byTitle);
  }
}

/* ───────────────────────── Grouping ───────────────────────── */

export type GroupMode = 'artist' | 'scene' | 'place' | 'era' | 'all';
export const GROUP_LABEL: Record<GroupMode, string> = { artist: 'Artist', scene: 'Scene', place: 'Place', era: 'Era', all: 'Everything' };

/** Grouping modes a family offers; the first is its default. */
export function groupModes(section: Section): GroupMode[] {
  switch (section.layout) {
    case 'soundstage':
      return ['artist', 'scene', 'all'];
    case 'atlas-of-ideas':
      return ['place', 'era', 'all'];
    case 'arena':
      return ['place', 'all'];
    default:
      return [];
  }
}

export interface Group {
  key: string;
  label: string;
  /** Where the group's subject lives in the app (a Connections, World or Time Machine page). */
  href?: string;
  /** Short qualifier: a role, a place kind, a year span. */
  note?: string;
  videos: Video[];
}

/** The city a place belongs to (Coney Island → New York City), or the place itself if broader. */
export function placeAnchor(cat: Catalogue, id: ID): Place | undefined {
  const p = cat.get(id) as Place | undefined;
  if (!p) return undefined;
  const fine = new Set<Place['kind']>(['borough', 'neighbourhood', 'district', 'venue']);
  if (!fine.has(p.kind)) return p;
  for (const a of cat.placeAncestors(id)) if (!fine.has(a.kind)) return a;
  return p;
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Groups keep the incoming order of videos; groups are ordered by size, the leftovers last. */
export function groupVideos(cat: Catalogue, videos: Video[], mode: GroupMode): Group[] {
  if (mode === 'all') return [{ key: 'all', label: 'Everything', videos }];
  const groups = new Map<string, Group>();
  const rest: Video[] = [];
  const add = (key: string, make: () => Omit<Group, 'videos'>, v: Video) => {
    let g = groups.get(key);
    if (!g) {
      g = { ...make(), videos: [] };
      groups.set(key, g);
    }
    if (!g.videos.includes(v)) g.videos.push(v);
  };
  for (const v of videos) {
    if (mode === 'artist') {
      const credit = v.people?.[0];
      const person = credit ? (cat.get(credit.person) as Person | undefined) : undefined;
      if (person) add(person.id, () => ({ key: person.id, label: person.name, href: cat.href(person.id), note: credit!.role }), v);
      else rest.push(v);
    } else if (mode === 'scene') {
      const m = v.movements?.[0] ? (cat.get(v.movements[0]) as Movement | undefined) : undefined;
      if (m) add(m.id, () => ({ key: m.id, label: m.name, href: cat.href(m.id), note: `${m.start}–${m.end ?? 'now'}` }), v);
      else if (v.places.length) {
        const names = v.places.map((p) => placeAnchor(cat, p)).filter((p): p is Place => !!p);
        const uniq = [...new Map(names.map((p) => [p.id, p])).values()];
        const key = uniq.map((p) => p.id).join('+');
        add(key, () => ({ key, label: uniq.map((p) => p.name).join(' · '), href: uniq[0] ? cat.href(uniq[0].id) : undefined, note: uniq.length > 1 ? 'A journey between places' : 'Scene' }), v);
      } else rest.push(v);
    } else if (mode === 'place') {
      // a title joins the city of its first (principal) place, so it is listed once
      const a = v.places[0] ? placeAnchor(cat, v.places[0]) : undefined;
      if (!a) rest.push(v);
      else add(a.id, () => ({ key: a.id, label: a.name, href: cat.href(a.id), note: KIND_NOTE[a.kind] }), v);
    } else if (mode === 'era') {
      const y = eraStart(v);
      if (y === null) rest.push(v);
      else {
        const d = decadeOf(y);
        const period = cat.periodsForYears(d, d + 9).find((p) => p.start === d);
        add(String(d), () => ({ key: String(d), label: `${d}s`, href: period ? cat.href(period.id) : undefined, note: 'Set in' }), v);
      }
    }
  }
  const list = [...groups.values()];
  if (mode === 'era') list.sort((a, b) => Number(a.key) - Number(b.key));
  else list.sort((a, b) => b.videos.length - a.videos.length || a.label.localeCompare(b.label));
  if (rest.length) list.push({ key: 'rest', label: REST_LABEL[mode], videos: rest });
  return list;
}

const KIND_NOTE: Partial<Record<Place['kind'], string>> = {
  country: 'Country',
  territory: 'Territory',
  'constituent-country': 'Country',
  state: 'State',
  county: 'County',
  city: 'City',
};
const REST_LABEL: Record<GroupMode, string> = {
  artist: 'No credited artist',
  scene: 'Studio works',
  place: 'Not tied to a place',
  era: 'Timeless',
  all: 'Everything',
};

/* ───────────────────────── URL state ───────────────────────── */

export interface CatState {
  facet: string | null;
  sort: CatSort;
  q: string;
  group: GroupMode | null; // null = the family's default
}

export function catStateFromParams(params: URLSearchParams, section: Section, facets: Facet[]): CatState {
  const facet = params.get('facet');
  const sort = params.get('sort') as CatSort | null;
  const group = params.get('group') as GroupMode | null;
  const modes = groupModes(section);
  const q = params.get('q') ?? '';
  return {
    facet: facet && facets.some((f) => f.key === facet) ? facet : null,
    sort: sort && CAT_SORTS.includes(sort) ? sort : defaultSort(section),
    q: q.trim() === '' ? '' : q,
    group: group && modes.includes(group) && group !== modes[0] ? group : null,
  };
}

/** Query string without "?" — defaults omitted, stable order (facet, sort, q, group). */
export function catStateToSearch(state: CatState, section: Section): string {
  const p = new URLSearchParams();
  if (state.facet) p.set('facet', state.facet);
  if (state.sort !== defaultSort(section)) p.set('sort', state.sort);
  if (state.q.trim() !== '') p.set('q', state.q);
  const modes = groupModes(section);
  if (state.group && modes.includes(state.group) && state.group !== modes[0]) p.set('group', state.group);
  return p.toString();
}

export function isFilteredState(state: CatState, section: Section): boolean {
  return !!state.facet || state.q.trim() !== '' || state.sort !== defaultSort(section);
}

/* ───────────────────────── The view ───────────────────────── */

export interface CategoryView {
  /** Every title in the category (unfiltered, featured order). */
  all: Video[];
  /** What is showing: search → facet → sort. */
  results: Video[];
  /** Per-facet counts within the current search (ignoring the facet itself). */
  facetCounts: Record<string, number>;
  /** Titles matching the search before the facet narrows them. */
  searched: number;
  facet: Facet | null;
}

export function viewCategory(cat: Catalogue, section: Section, state: CatState, now?: Date): CategoryView {
  const facets = sectionFacets(cat, section);
  const all = sortVideos(cat, videosForSection(cat, section), 'featured', { now, section });
  const q = state.q.trim();
  let scores: Map<ID, number> | undefined;
  let searched = all;
  if (q) {
    const hits = searchCatalogue(cat, { ...defaultDiscovery(), q }, now).results;
    scores = new Map(hits.map((h) => [h.video.id, h.score]));
    searched = all.filter((v) => scores!.has(v.id));
  }
  const facet = state.facet ? (facets.find((f) => f.key === state.facet) ?? null) : null;
  const facetCounts: Record<string, number> = {};
  for (const f of facets) facetCounts[f.key] = searched.filter(f.test).length;
  const narrowed = facet ? searched.filter(facet.test) : searched;
  const results = sortVideos(cat, narrowed, state.sort, { scores, now, section });
  return { all, results, facetCounts, searched: searched.length, facet };
}

/* ───────────────────────── Counts & context ───────────────────────── */

export interface CategoryStats {
  titles: number;
  watchNow: number;
  free: number;
  places: number;
  eras: number;
  /** Total measured running time of the playable titles, in seconds. */
  seconds: number;
}

export function categoryStats(cat: Catalogue, videos: Video[], now?: Date): CategoryStats {
  const playable = videos.filter((v) => cat.isPlayable(v, now));
  return {
    titles: videos.length,
    watchNow: playable.length,
    free: playable.filter((v) => cat.effectiveAccess(v, now) === 'free').length,
    places: relatedPlaces(cat, videos, Infinity).length,
    eras: relatedEras(cat, videos).length,
    seconds: playable.reduce((s, v) => s + (cat.runtime(v) ?? 0), 0),
  };
}

/** Places the titles are set in, most stories first (each title counted once per place). */
export function relatedPlaces(cat: Catalogue, videos: Video[], limit = 8): { place: Place; count: number }[] {
  const counts = new Map<ID, number>();
  for (const v of videos) for (const id of new Set(v.places)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ place: cat.get(id) as Place | undefined, count }))
    .filter((e): e is { place: Place; count: number } => !!e.place)
    .sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name))
    .slice(0, limit);
}

/** Decades the titles are set in (historical setting, else year made), in time order. */
export function relatedEras(cat: Catalogue, videos: Video[]): { period: Period; count: number }[] {
  const counts = new Map<ID, number>();
  for (const v of videos) {
    const from = eraStart(v);
    const to = eraEnd(v);
    if (from === null || to === null) continue;
    for (const p of cat.periodsForYears(from, to)) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  return cat.periods.filter((p) => counts.has(p.id)).map((period) => ({ period, count: counts.get(period.id)! }));
}

export interface InterestContext {
  movements: Movement[];
  people: Person[];
  programmes: Programme[];
  /** Places those movements live in (most connected first). */
  places: Place[];
}

/**
 * Catalogue records that share the category's interests — real movements, people and
 * programmes, never invented titles. Used for scenes, connections and the honest empty state.
 */
export function interestContext(cat: Catalogue, section: Section, limit = 6): InterestContext {
  const interests = new Set(section.interests ?? []);
  const hit = (ids: ID[] | undefined) => !!ids?.some((i) => interests.has(i));
  const movements = cat.movements.filter((m) => hit(m.categories));
  const people = cat.people.filter((p) => hit(p.categories));
  const programmes = cat.programmes.filter((p) => hit(p.categories) && !p.parent);
  const placeCounts = new Map<ID, number>();
  for (const m of movements) for (const id of m.places) placeCounts.set(id, (placeCounts.get(id) ?? 0) + 1);
  const places = [...placeCounts.entries()]
    .map(([id, n]) => ({ p: cat.get(id) as Place | undefined, n }))
    .filter((e): e is { p: Place; n: number } => !!e.p)
    .sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name))
    .map((e) => e.p);
  return { movements: movements.slice(0, limit), people: people.slice(0, limit), programmes: programmes.slice(0, limit), places: places.slice(0, limit) };
}

/** Every category with its live title count, in navigation order. */
export function categoryCounts(cat: Catalogue): { section: Section; count: number }[] {
  return categorySections().map((section) => ({ section, count: videosForSection(cat, section).length }));
}

/** Readable list of the interests that put a title in this category ("Film or Documentary"). */
export function membershipLabel(cat: Catalogue, section: Section): string {
  const names = (section.interests ?? []).map((id) => cat.label(id));
  if (names.length <= 1) return names[0] ?? section.label;
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/* ───────────────────────── Constellation (Culture hero) ───────────────────────── */

export interface StarNode {
  place: Place;
  count: number;
  /** 0–1 inside the drawing box */
  x: number;
  y: number;
}
export interface StarEdge {
  a: number; // node index
  b: number;
  kind: 'route' | 'shared';
  label: string;
}

/**
 * Places of the titles laid out by real geography (equirectangular), then gently relaxed so
 * neighbouring places (Miami, Miami Beach, Coral Gables) never sit on top of each other.
 * Edges are the catalogue's cultural routes between those places, plus titles that travel
 * between several of them. Deterministic for a given input.
 */
export function constellation(cat: Catalogue, videos: Video[], limit = 12): { nodes: StarNode[]; edges: StarEdge[] } {
  const ranked = relatedPlaces(cat, videos, limit);
  if (!ranked.length) return { nodes: [], edges: [] };
  const lats = ranked.map((r) => r.place.coords[0]);
  const lons = ranked.map((r) => r.place.coords[1]);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const pad = 0.12;
  const span = (lo: number, hi: number, v: number) => (hi - lo < 1e-6 ? 0.5 : pad + ((v - lo) / (hi - lo)) * (1 - pad * 2));
  const nodes: StarNode[] = ranked.map(({ place, count }) => ({ place, count, x: span(minLon, maxLon, place.coords[1]), y: 1 - span(minLat, maxLat, place.coords[0]) }));
  // relax: push apart anything closer than minD (deterministic order, fixed iterations)
  const minD = Math.min(0.2, 0.9 / Math.sqrt(nodes.length + 1));
  for (let it = 0; it < 90; it++) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 1e-6) {
          // identical coordinates: separate along a stable direction
          const ang = hash01(a.place.id + b.place.id) * Math.PI * 2;
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (minD - Math.min(d, minD)) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    for (const n of nodes) {
      n.x = Math.min(0.94, Math.max(0.06, n.x));
      n.y = Math.min(0.9, Math.max(0.1, n.y));
    }
  }
  const index = (placeId: ID) => {
    const exact = nodes.findIndex((n) => n.place.id === placeId);
    return exact >= 0 ? exact : nodes.findIndex((n) => cat.placeScope(n.place.id).has(placeId));
  };
  const edges: StarEdge[] = [];
  const seen = new Set<string>();
  const link = (a: number, b: number, kind: StarEdge['kind'], label: string) => {
    if (a < 0 || b < 0 || a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, kind, label });
  };
  for (const r of cat.routes) link(index(r.from), index(r.to), 'route', r.label);
  for (const v of videos) for (let i = 1; i < v.places.length; i++) link(index(v.places[i - 1]), index(v.places[i]), 'shared', v.title);
  return { nodes, edges };
}

/**
 * Who made or supplied a title, read from its credit line — "Newspaper Train (1942). Len Lye,
 * Realist Film Unit, for the UK Ministry of Information. Via Wikimedia Commons." → "Len Lye,
 * Realist Film Unit, for the UK Ministry of Information". Falls back to the provenance label.
 */
export function sourceOf(v: Pick<Video, 'credits' | 'provenance'>, fallback: string): string {
  const a = v.credits?.attribution?.trim();
  if (!a) return fallback;
  const afterTitle = a.match(/\)\.\s+(.+)$/s)?.[1];
  if (afterTitle) {
    const cut = afterTitle.search(/[.;]\s+(via\b|library of congress|us national archives|prelinger|internet archive|wikimedia)/i);
    const maker = (cut >= 0 ? afterTitle.slice(0, cut) : afterTitle).replace(/\.$/, '').trim();
    if (maker) return maker;
  }
  const holder = a.match(/(?:©|\(CC\))\s*(?:copyright\s+)?([^|–—]+)/i)?.[1]?.trim();
  if (holder) return holder;
  return a.split(/\s[|–—]\s/)[0].trim() || fallback;
}

/** Deterministic 0–1 noise from a string (stable "signature" shapes per title). */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}
