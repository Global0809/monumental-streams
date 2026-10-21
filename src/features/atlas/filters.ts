/**
 * World filters and exploration memory — pure helpers (no DOM, no React), unit-tested.
 *
 * The lens bar narrows the world by category (a primary-navigation section such as Music,
 * optionally one of its facets), by era (a decade, matched against a story's historical
 * setting and a movement's or route's years), by access (free / premium to watch now) and to
 * places that actually hold stories. Everything is derived from the shared catalogue, so a
 * newly added story lights its places automatically.
 *
 *   ?cat=<section id>&facet=<interest slug>&era=<period slug>&access=free|premium&stories=only
 */
import { overlaps, type Catalogue } from '../../../shared/catalogue.ts';
import { categorySections, type Section, type SectionId } from '../../../shared/sections.ts';
import type { ID, Movement, Period, Place, Reason, Route, Video } from '../../../shared/types.ts';

export type AccessFilter = 'all' | 'free' | 'premium';

export interface WorldFilters {
  /** A category section of the primary navigation (movies, music, …). */
  section: SectionId | null;
  /** One interest id from that section's facets. */
  facet: ID | null;
  /** A period id ("period:1940s"). */
  era: ID | null;
  access: AccessFilter;
  /** Hide places with no matching stories. */
  storiesOnly: boolean;
}

export type FilterKey = 'section' | 'facet' | 'era' | 'access' | 'storiesOnly';

export const NO_FILTERS: WorldFilters = Object.freeze({ section: null, facet: null, era: null, access: 'all', storiesOnly: false }) as WorldFilters;

const THIS_YEAR = new Date().getFullYear();
const slugOfId = (id: ID) => id.slice(id.indexOf(':') + 1);

export const sectionOf = (id: SectionId | null | undefined): Section | undefined => (id ? categorySections().find((s) => s.id === id) : undefined);

/* ───────────── URL ⇄ filters ───────────── */

/** Reads the lens from the query string; unknown or inconsistent values are ignored. */
export function parseFilters(params: URLSearchParams, cat: Catalogue): WorldFilters {
  const section = sectionOf(params.get('cat') as SectionId | null) ?? null;
  const facetSlug = params.get('facet');
  const facetEntity = facetSlug ? cat.bySlug('interest', facetSlug) : undefined;
  const facet = section && facetEntity && (section.facets ?? []).includes(facetEntity.id) ? facetEntity.id : null;
  const eraSlug = params.get('era');
  const era = eraSlug ? (cat.bySlug('period', eraSlug)?.id ?? null) : null;
  const a = params.get('access');
  return {
    section: section?.id ?? null,
    facet,
    era,
    access: a === 'free' || a === 'premium' ? a : 'all',
    storiesOnly: params.get('stories') === 'only',
  };
}

/** Writes the lens into `p` in a stable order, omitting defaults. Ids travel as their slugs. */
export function writeFilters(p: URLSearchParams, f: WorldFilters | null | undefined): URLSearchParams {
  if (!f) return p;
  if (f.section) p.set('cat', f.section);
  if (f.section && f.facet) p.set('facet', slugOfId(f.facet));
  if (f.era) p.set('era', slugOfId(f.era));
  if (f.access !== 'all') p.set('access', f.access);
  if (f.storiesOnly) p.set('stories', 'only');
  return p;
}

/** Any filter that narrows which stories count (everything except "stories only"). */
export const narrowsStories = (f: WorldFilters) => !!(f.section || f.era || f.access !== 'all');
export const isFiltering = (f: WorldFilters) => narrowsStories(f) || f.storiesOnly;
export const activeFilterCount = (f: WorldFilters) => [f.section, f.facet, f.era, f.access !== 'all' ? f.access : null, f.storiesOnly || null].filter(Boolean).length;

/** The lens with one filter removed (clearing the section also clears its facet). */
export function without(f: WorldFilters, key: FilterKey): WorldFilters {
  switch (key) {
    case 'section':
      return { ...f, section: null, facet: null };
    case 'facet':
      return { ...f, facet: null };
    case 'era':
      return { ...f, era: null };
    case 'access':
      return { ...f, access: 'all' };
    case 'storiesOnly':
      return { ...f, storiesOnly: false };
  }
}

export interface FilterLabel {
  key: FilterKey;
  label: string;
}

/** Human labels for the active filters, in reading order. */
export function filterLabels(cat: Catalogue, f: WorldFilters): FilterLabel[] {
  const out: FilterLabel[] = [];
  const s = sectionOf(f.section);
  if (s) out.push({ key: 'section', label: s.label });
  if (s && f.facet) out.push({ key: 'facet', label: cat.label(f.facet) });
  if (f.era) out.push({ key: 'era', label: cat.label(f.era) });
  if (f.access !== 'all') out.push({ key: 'access', label: f.access === 'free' ? 'Free to watch' : 'Premium' });
  if (f.storiesOnly) out.push({ key: 'storiesOnly', label: 'With stories only' });
  return out;
}

/* ───────────── Matching ───────────── */

const periodOf = (cat: Catalogue, id: ID | null) => (id ? (cat.get(id) as Period | undefined) : undefined);

/** Does a story pass the lens? (A story outside a category, setting or access level does not.) */
export function matchesVideo(cat: Catalogue, v: Video, f: WorldFilters, now?: Date): boolean {
  if (f.section) {
    const s = sectionOf(f.section);
    if (!s) return false;
    const inSection = (s.interests ?? []).some((i) => v.categories.includes(i)) || (s.kinds ?? []).includes(v.kind);
    if (!inSection) return false;
    if (f.facet && !v.categories.includes(f.facet)) return false;
  }
  if (f.era) {
    const p = periodOf(cat, f.era);
    if (!p || !v.setting || !overlaps(v.setting.from, v.setting.to, p.start, p.end)) return false;
  }
  if (f.access !== 'all' && cat.effectiveAccess(v, now) !== f.access) return false;
  return true;
}

/**
 * Does a cultural movement pass the lens? Movements are not watchable, so an access filter
 * excludes them; otherwise they match on category (or facet) and on years alive.
 */
export function matchesMovement(cat: Catalogue, m: Movement, f: WorldFilters): boolean {
  if (f.access !== 'all') return false;
  if (f.section) {
    const ids = f.facet ? [f.facet] : (sectionOf(f.section)?.interests ?? []);
    if (!ids.some((i) => m.categories.includes(i))) return false;
  }
  if (f.era) {
    const p = periodOf(cat, f.era);
    if (!p || !overlaps(m.start, m.end ?? THIS_YEAR, p.start, p.end)) return false;
  }
  return true;
}

export interface PlaceSignal {
  /** Matching stories set here or anywhere inside. */
  stories: number;
  /** Matching movements alive here or anywhere inside. */
  movements: number;
}

/** Stories on the map (pinned to at least one place) that pass the lens. */
export function placedMatches(cat: Catalogue, f: WorldFilters, now?: Date): Video[] {
  return cat.videos.filter((v) => v.places.length > 0 && matchesVideo(cat, v, f, now));
}

/** Per-place signal for every place (descendants included), so the stage can glow by it. */
export function placeSignals(cat: Catalogue, f: WorldFilters, now?: Date): Map<ID, PlaceSignal> {
  const out = new Map<ID, PlaceSignal>(cat.places.map((p) => [p.id, { stories: 0, movements: 0 }]));
  const spread = (places: ID[], key: keyof PlaceSignal) => {
    const seen = new Set<ID>();
    for (const pl of places) {
      for (const id of [pl, ...cat.placeAncestors(pl).map((a) => a.id)]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = out.get(id);
        if (s) s[key]++;
      }
    }
  };
  for (const v of placedMatches(cat, f, now)) spread(v.places, 'stories');
  if (narrowsStories(f)) for (const m of cat.movements) if (matchesMovement(cat, m, f)) spread(m.places, 'movements');
  return out;
}

/** A route stays lit when it is alive in the chosen era and carries the chosen category. */
export function routeMatches(cat: Catalogue, r: Route, f: WorldFilters, signals: Map<ID, PlaceSignal>): boolean {
  if (f.era) {
    const p = periodOf(cat, f.era);
    if (!p || !overlaps(r.period.from, r.period.to ?? THIS_YEAR, p.start, p.end)) return false;
  }
  const endStories = (signals.get(r.from)?.stories ?? 0) + (signals.get(r.to)?.stories ?? 0);
  if (f.section) {
    const ids = f.facet ? [f.facet] : (sectionOf(f.section)?.interests ?? []);
    const carries = (r.movements ?? []).some((mid) => (cat.get(mid) as Movement | undefined)?.categories.some((c) => ids.includes(c)));
    if (!carries && endStories === 0) return false;
  }
  if (f.access !== 'all' && endStories === 0) return false;
  return true;
}

/* ───────────── Counts for the lens controls ───────────── */

/** Placed stories per category section under the rest of the lens (era, access). */
export function sectionCounts(cat: Catalogue, f: WorldFilters, now?: Date): Map<SectionId, number> {
  return new Map(categorySections().map((s) => [s.id, placedMatches(cat, { ...f, section: s.id, facet: null }, now).length]));
}

/** Placed stories per facet of the chosen section under the rest of the lens. */
export function facetCounts(cat: Catalogue, f: WorldFilters, now?: Date): Map<ID, number> {
  const s = sectionOf(f.section);
  return new Map((s?.facets ?? []).map((id) => [id, placedMatches(cat, { ...f, facet: id }, now).length]));
}

export interface EraDensity {
  period: Period;
  stories: number;
  movements: number;
}

/** For the era strip: placed stories and movements per decade under the rest of the lens. */
export function eraDensity(cat: Catalogue, f: WorldFilters, now?: Date): EraDensity[] {
  return cat.periods.map((p) => {
    const g = { ...f, era: p.id };
    return {
      period: p,
      stories: placedMatches(cat, g, now).length,
      movements: cat.movements.filter((m) => m.places.length && matchesMovement(cat, m, g)).length,
    };
  });
}

/* ───────────── A place's eras and connections ───────────── */

export interface PlaceEra {
  period: Period;
  stories: number;
  movements: Movement[];
  routes: number;
}

/** The decades a place is present in: stories set then, movements alive, routes travelled. */
export function erasForPlace(cat: Catalogue, placeId: ID): PlaceEra[] {
  const vids = cat.videosForPlace(placeId);
  const movs = cat.movementsForPlace(placeId);
  const routes = cat.routesForPlace(placeId);
  return cat.periods
    .map((p) => ({
      period: p,
      stories: vids.filter((v) => v.setting && overlaps(v.setting.from, v.setting.to, p.start, p.end)).length,
      movements: movs.filter((m) => overlaps(m.start, m.end ?? THIS_YEAR, p.start, p.end)),
      routes: routes.filter((r) => overlaps(r.period.from, r.period.to ?? THIS_YEAR, p.start, p.end)).length,
    }))
    .filter((e) => e.stories || e.movements.length || e.routes);
}

export interface PlaceConnection {
  place: Place;
  reasons: Reason[];
  weight: number;
  /** The strongest kind of link, for colour: a route kind, 'movement' or 'story'. */
  kind: Route['kind'] | 'movement' | 'story';
}

/** The place drawn at world scale for any place: itself if it is a city or free-standing leaf, else its city. */
export function cityLevelOf(cat: Catalogue, id: ID): Place | undefined {
  const self = cat.get(id) as Place | undefined;
  if (!self) return undefined;
  const chain = [self, ...cat.placeAncestors(id)];
  const city = chain.find((p) => p.kind === 'city');
  if (city) return city;
  return cat.placeChildren(id).length === 0 ? self : undefined;
}

/**
 * Cultural connections from a place to other places, each with its reasons: routes (to the
 * exact far end), shared movements and shared stories (collapsed to the far city so the list
 * stays readable). Places inside this one, or containing it, are hierarchy — not connections.
 */
export function placeConnections(cat: Catalogue, placeId: ID, limit = 8): PlaceConnection[] {
  const scope = cat.placeScope(placeId);
  const family = new Set<ID>([...scope, ...cat.placeAncestors(placeId).map((a) => a.id)]);
  const acc = new Map<ID, PlaceConnection>();
  const add = (target: Place | undefined, reason: Reason, weight: number, kind: PlaceConnection['kind']) => {
    if (!target || family.has(target.id)) return;
    // routes are added first, then movements, then stories: the first reason names the kind
    const cur = acc.get(target.id) ?? { place: target, reasons: [], weight: 0, kind };
    if (cur.reasons.some((r) => r.via === reason.via)) return;
    cur.reasons.push(reason);
    cur.weight += weight;
    acc.set(target.id, cur);
  };

  for (const r of cat.routesForPlace(placeId)) {
    const far = scope.has(r.from) && !scope.has(r.to) ? r.to : scope.has(r.to) && !scope.has(r.from) ? r.from : null;
    if (!far) continue;
    const years = r.period.to === null ? `${r.period.from}–present` : r.period.from === r.period.to ? String(r.period.from) : `${r.period.from}–${r.period.to}`;
    add(cat.get(far) as Place | undefined, { kind: 'route', label: `${r.label} · ${years}`, via: r.id }, 3, r.kind);
  }
  for (const m of cat.movementsForPlace(placeId)) {
    const seen = new Set<ID>();
    for (const pl of m.places) {
      const city = cityLevelOf(cat, pl);
      if (!city || seen.has(city.id)) continue;
      seen.add(city.id);
      add(city, { kind: 'movement', label: `Both shaped by ${m.name}`, via: m.id }, 2.5, 'movement');
    }
  }
  for (const v of cat.videosForPlace(placeId)) {
    const seen = new Set<ID>();
    for (const pl of v.places) {
      if (scope.has(pl)) continue;
      const city = cityLevelOf(cat, pl);
      if (!city || seen.has(city.id)) continue;
      seen.add(city.id);
      add(city, { kind: 'place', label: `Both in “${v.title}”`, via: v.id }, 2, 'story');
    }
  }
  return [...acc.values()].sort((a, b) => b.weight - a.weight || a.place.name.localeCompare(b.place.name)).slice(0, limit);
}

/* ───────────── Recent-places trail ───────────── */

/** Most recent first, without duplicates, capped. */
export function pushTrail(trail: readonly string[], slug: string, max = 6): string[] {
  return [slug, ...trail.filter((s) => s !== slug)].slice(0, max);
}
