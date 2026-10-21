/**
 * Pure helpers for Home. Every number, place, decade and category shown on Home is derived
 * here from the shared catalogue and the viewer's library — nothing is hand-listed, so new
 * videos appear in the World preview, the Time Machine preview and the category band on
 * their own.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import { activeInterests, activeJourneys, continueWatching, savedIds, savedPlaceIds } from '../../../shared/library.ts';
import { categorySections, sectionById, videosForSection, type Section } from '../../../shared/sections.ts';
import type { Library, Movement, Period, Place, ProgressEntry, Route, Video } from '../../../shared/types.ts';

/* ───────────────────────── Small labels ───────────────────────── */

/** Earliest and latest year a set of videos is set in (falls back to when a film was made). */
export function yearSpan(videos: Video[]): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  for (const v of videos) {
    const a = v.setting?.from ?? v.made;
    const b = v.setting?.to ?? v.made;
    if (a !== undefined && Number.isFinite(a)) from = Math.min(from, a);
    if (b !== undefined && Number.isFinite(b)) to = Math.max(to, b);
  }
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

/** "from 1905 to 1969" · "in 1905" · null. */
export function spanLabel(span: { from: number; to: number } | null): string | null {
  if (!span) return null;
  return span.from === span.to ? `in ${span.from}` : `from ${span.from} to ${span.to}`;
}

/** "12 min left" / "40 sec left" from a progress entry; empty when unknown. */
export function remainingLabel(entry: ProgressEntry): string {
  const left = Math.max(0, entry.dur - entry.pos);
  if (!entry.dur || !Number.isFinite(left)) return '';
  if (left < 60) return `${Math.max(1, Math.round(left))} sec left`;
  const m = Math.round(left / 60);
  return m < 60 ? `${m} min left` : `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60} min ` : ''}left`;
}

/** "1 story" · "6 stories" · "Coming soon" (an empty category is labelled honestly). */
export function storyCountLabel(n: number, empty = 'Coming soon'): string {
  return n <= 0 ? empty : `${n} ${n === 1 ? 'story' : 'stories'}`;
}

/* ───────────────────────── Tool telemetry ───────────────────────── */

export interface PortalStats {
  /** Places with at least one story set there directly. */
  placesWithStories: number;
  placesMapped: number;
  decadesWithStories: number;
  decadesMapped: number;
  playable: number;
  stamps: number;
}

export function portalStats(cat: Catalogue, library: Library, now?: Date): PortalStats {
  const coverage = cat.periodCoverage();
  return {
    placesWithStories: cat.places.filter((p) => cat.videosForPlace(p.id, false).length > 0).length,
    placesMapped: cat.places.length,
    decadesWithStories: coverage.filter((c) => c.count > 0).length,
    decadesMapped: coverage.length,
    playable: cat.videos.filter((v) => cat.isPlayable(v, now)).length,
    stamps: Object.keys(library.stamps).length,
  };
}

/** One true, data-derived line per discovery tool. */
export function portalLines(s: PortalStats): Record<'atlas' | 'time' | 'somewhere' | 'passport', string> {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  return {
    atlas: `${n(s.placesWithStories, 'place', 'places')} with stories · ${s.placesMapped} mapped`,
    time: s.decadesWithStories ? `${s.decadesWithStories} of ${s.decadesMapped} decades hold stories` : `${s.decadesMapped} decades mapped`,
    somewhere: `${n(s.playable, 'playable story', 'playable stories')} to route through`,
    passport: s.stamps ? `${n(s.stamps, 'stamp', 'stamps')} collected` : 'No stamps yet',
  };
}

/** The platform at a glance, for the hero: what exists in the catalogue today. */
export function platformStats(cat: Catalogue, now?: Date) {
  return {
    stories: cat.videos.length,
    playable: cat.videos.filter((v) => cat.isPlayable(v, now)).length,
    places: cat.places.filter((p) => cat.videosForPlace(p.id, false).length > 0).length,
    decades: cat.periodCoverage().filter((c) => c.count > 0).length,
  };
}

/* ───────────────────────── World preview ───────────────────────── */

/** Angular distance between two coordinates, in degrees (haversine). */
export function arcDegrees([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}

/** Fine-grained places lift to the city that contains them, so the preview pins cities. */
const LIFT: ReadonlySet<Place['kind']> = new Set(['neighbourhood', 'borough', 'district']);

export interface WorldHub {
  /** The place the pin opens (gateway first, then the place with the most stories). */
  place: Place;
  /** Nearby places folded into this pin (they sit too close together to pick apart). */
  nearby: Place[];
  /** Every story set at the pin or its nearby places, deduplicated. */
  videos: Video[];
  playable: number;
  gateway: boolean;
  /** Catalogued routes that start or end within the pin. */
  routes: Route[];
}

/**
 * Destinations for the World preview: every place with a story set there, lifted to its city
 * and merged with neighbours closer than `mergeDegrees` (Miami Beach and Coral Gables sit
 * inside one pin with Miami at globe scale). Sorted gateway first, then by story count.
 */
export function worldHubs(cat: Catalogue, opts: { mergeDegrees?: number; now?: Date } = {}): WorldHub[] {
  const merge = opts.mergeDegrees ?? 2.5;
  const lifted = new Map<string, Place>();
  for (const p of cat.places) {
    if (!cat.videosForPlace(p.id, false).length) continue;
    let target = p;
    if (LIFT.has(p.kind)) target = cat.placeAncestors(p.id).find((a) => a.kind === 'city') ?? p;
    lifted.set(target.id, target);
  }
  const weight = (p: Place) => cat.videosForPlace(p.id, true).length;
  const ordered = [...lifted.values()].sort((a, b) => Number(!!b.gateway) - Number(!!a.gateway) || weight(b) - weight(a) || a.name.localeCompare(b.name));

  const groups: { place: Place; nearby: Place[] }[] = [];
  for (const p of ordered) {
    const host = groups.find((g) => arcDegrees(g.place.coords, p.coords) < merge);
    if (host) host.nearby.push(p);
    else groups.push({ place: p, nearby: [] });
  }

  return groups
    .map(({ place, nearby }) => {
      const seen = new Set<string>();
      const videos: Video[] = [];
      const scope = new Set<string>();
      for (const member of [place, ...nearby]) {
        for (const id of cat.placeScope(member.id)) scope.add(id);
        for (const v of cat.videosForPlace(member.id, true)) {
          if (!seen.has(v.id)) {
            seen.add(v.id);
            videos.push(v);
          }
        }
      }
      const routes = cat.routes.filter((r) => scope.has(r.from) || scope.has(r.to));
      return {
        place,
        nearby,
        videos: sortStories(cat, videos, opts.now),
        playable: videos.filter((v) => cat.isPlayable(v, opts.now)).length,
        gateway: !!place.gateway || nearby.some((n) => n.gateway),
        routes,
      };
    })
    .sort((a, b) => Number(b.gateway) - Number(a.gateway) || b.videos.length - a.videos.length || a.place.name.localeCompare(b.place.name));
}

/** Playable stories first, then by when they are set, then by title. */
export function sortStories(cat: Catalogue, videos: Video[], now?: Date): Video[] {
  const year = (v: Video) => v.setting?.from ?? v.made ?? 9999;
  return [...videos].sort(
    (a, b) => Number(cat.isPlayable(b, now)) - Number(cat.isPlayable(a, now)) || year(a) - year(b) || a.title.localeCompare(b.title),
  );
}

/** Great-circle connections the preview can draw: both ends need coordinates. */
export function worldArcs(cat: Catalogue): { route: Route; from: [number, number]; to: [number, number] }[] {
  const out: { route: Route; from: [number, number]; to: [number, number] }[] = [];
  const seen = new Set<string>();
  for (const r of cat.routes) {
    const a = cat.get(r.from) as Place | undefined;
    const b = cat.get(r.to) as Place | undefined;
    if (!a?.coords || !b?.coords) continue;
    // a programme leg retraces a migration route; draw each pair of places once
    const key = [a.id, b.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ route: r, from: a.coords, to: b.coords });
  }
  return out;
}

/**
 * Where a pin sits, in words: "Gateway · United States", "City · Jamaica", "Territory".
 * The short form keeps one part — the country, or the gateway / kind for a top-level place.
 */
export function hubContext(cat: Catalogue, hub: WorldHub, short = false): string {
  const p = hub.place;
  const kind = p.kind === 'constituent-country' ? 'Country' : p.kind[0].toUpperCase() + p.kind.slice(1);
  const country = cat.placeAncestors(p.id).find((a) => a.kind === 'country' || a.kind === 'territory');
  const where = country && country.id !== p.id ? country.name : null;
  if (short) return hub.gateway ? 'Gateway' : (where ?? kind);
  return [hub.gateway ? 'Gateway' : kind, where].filter(Boolean).join(' · ');
}

/* ───────────────────────── Time Machine preview ───────────────────────── */

export interface DecadeStop {
  period: Period;
  count: number;
  playable: number;
}

export const decadeStops = (cat: Catalogue): DecadeStop[] => cat.periodCoverage();

/** The decade the preview opens on: the one with the most stories (earliest on a tie). */
export function liveliestDecade(stops: DecadeStop[]): DecadeStop | null {
  let best: DecadeStop | null = null;
  for (const s of stops) if (!best || s.count > best.count) best = s;
  return best;
}

export interface DecadePreview {
  period: Period;
  videos: Video[];
  playable: number;
  movements: Movement[];
  /** Places the decade's stories are set in, lifted to cities, most stories first. */
  places: Place[];
}

export function decadePreview(cat: Catalogue, periodId: string, now?: Date): DecadePreview | null {
  const period = cat.get(periodId) as Period | undefined;
  if (!period) return null;
  const videos = sortStories(cat, cat.videosForPeriod(periodId), now);
  const tally = new Map<string, { place: Place; n: number }>();
  for (const v of videos) {
    // a story set in both London and Brixton counts once for London
    const mine = new Map<string, Place>();
    for (const id of v.places) {
      const p = cat.get(id) as Place | undefined;
      if (!p) continue;
      const lifted = LIFT.has(p.kind) || p.kind === 'venue' ? (cat.placeAncestors(p.id).find((a) => a.kind === 'city') ?? p) : p;
      mine.set(lifted.id, lifted);
    }
    for (const place of mine.values()) {
      const cur = tally.get(place.id);
      if (cur) cur.n += 1;
      else tally.set(place.id, { place, n: 1 });
    }
  }
  return {
    period,
    videos,
    playable: videos.filter((v) => cat.isPlayable(v, now)).length,
    movements: cat.movementsForPeriod(periodId),
    places: [...tally.values()].sort((a, b) => b.n - a.n || a.place.name.localeCompare(b.place.name)).map((t) => t.place),
  };
}

/** Index of the stop a pointer at fraction `x` (0–1 across the strip) lands on. */
export function stopAt(x: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, Math.floor(x * count)));
}

/* ───────────────────────── Category band ───────────────────────── */

export interface CategoryTile {
  section: Section;
  count: number;
  playable: number;
  /** A few real stories from the category, playable first, for the hover peek. */
  sample: Video[];
}

export function categoryTiles(cat: Catalogue, now?: Date): CategoryTile[] {
  return categorySections().map((section) => {
    const videos = sortStories(cat, videosForSection(cat, section), now);
    return { section, count: videos.length, playable: videos.filter((v) => cat.isPlayable(v, now)).length, sample: videos.slice(0, 3) };
  });
}

export const liveSection = () => sectionById('live');

/* ───────────────────────── My World summary ───────────────────────── */

export interface MyWorldSummary {
  inProgress: number;
  saved: number;
  places: number;
  journeys: number;
  stamps: number;
  following: number;
  /** Nothing personal yet — Home invites instead of showing zeros. */
  empty: boolean;
}

export function myWorldSummary(lib: Library): MyWorldSummary {
  const s = {
    inProgress: continueWatching(lib).length,
    saved: savedIds(lib).length,
    places: savedPlaceIds(lib).length,
    journeys: activeJourneys(lib).length,
    stamps: Object.keys(lib.stamps).length,
    following: activeInterests(lib).length,
  };
  return { ...s, empty: Object.values(s).every((n) => n === 0) };
}

/* ───────────────────────── Featured title ───────────────────────── */

/** "Valid ID presents WAVEMAKERS: Puerto Rico, New York to London" → ["Valid ID presents", "Puerto Rico, New York to London"]. */
export function splitTitle(title: string, series?: string): [string, string] {
  if (!series) return ['', ''];
  const i = title.indexOf(series);
  if (i < 0) return ['', title];
  return [title.slice(0, i).trim(), title.slice(i + series.length).replace(/^[\s:–—-]+/, '').trim()];
}
