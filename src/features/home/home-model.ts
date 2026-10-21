/**
 * Pure helpers for Home. Every number, place, decade and category shown on Home is derived
 * here from the shared catalogue and the viewer's library. Nothing is hand-listed, so a new
 * video appears in the category index, the World and Time Machine invitations and the seeds
 * they light, on its own.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import { activeInterests, activeJourneys, continueWatching, savedIds, savedPlaceIds } from '../../../shared/library.ts';
import { categorySections, sectionById, videosForSection, type Section, type SectionId } from '../../../shared/sections.ts';
import type { ID, Library, Period, Place, ProgressEntry, Route, Video } from '../../../shared/types.ts';

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

/* ───────────────────────── The constellation index ───────────────────────── */

export interface OrganEntry {
  section: Section;
  /** Stories the shared catalogue holds for it today (videosForSection). */
  count: number;
  /** The seeds it lights in the world. */
  ids: ID[];
  /** Live is a broadcast space, not a shelf of stories. */
  live: boolean;
}

/**
 * The nine organs that orbit the Monumental spine, in the world's order: the eight
 * categories in navigation order, then Live closing the ring. Counts come from
 * videosForSection; Live never claims stories.
 */
export function organIndex(cat: Catalogue): OrganEntry[] {
  const entries = categorySections().map((section) => {
    const videos = videosForSection(cat, section);
    return { section, count: videos.length, ids: videos.map((v) => v.id), live: false };
  });
  return [...entries, { section: sectionById('live'), count: 0, ids: [], live: true }];
}

/** Video id → the category sections it belongs to (lights the index from a seed in the world). */
export function seedSections(cat: Catalogue): Map<ID, SectionId[]> {
  const out = new Map<ID, SectionId[]>();
  for (const s of categorySections()) {
    for (const v of videosForSection(cat, s)) {
      const list = out.get(v.id);
      if (list) list.push(s.id);
      else out.set(v.id, [s.id]);
    }
  }
  return out;
}

/* ───────────────────────── World invitation ───────────────────────── */

/** Angular distance between two coordinates, in degrees (haversine). */
export function arcDegrees([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}

/** Fine-grained places lift to the city that contains them, so destinations are cities. */
const LIFT: ReadonlySet<Place['kind']> = new Set(['neighbourhood', 'borough', 'district']);

export interface WorldHub {
  /** The place the destination opens (gateway first, then the place with the most stories). */
  place: Place;
  /** Nearby places folded into this destination (too close together to pick apart on a globe). */
  nearby: Place[];
  /** Every story set at the destination or its nearby places, deduplicated. */
  videos: Video[];
  playable: number;
  gateway: boolean;
  /** Catalogued routes that start or end within the destination. */
  routes: Route[];
}

/**
 * Destinations with stories: every place with a story set there, lifted to its city and
 * merged with neighbours closer than `mergeDegrees` (Miami Beach sits inside Miami at globe
 * scale). Sorted gateway first, then by story count.
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

export interface WorldInvitation {
  /** Stories with a place on the globe — the seeds that settle there. */
  placed: ID[];
  hubs: WorldHub[];
}

/** What Home says (and lights) about the World: the stories it places and its destinations. */
export function worldInvitation(cat: Catalogue, now?: Date): WorldInvitation {
  const coords = new Set(cat.places.filter((p) => Array.isArray(p.coords)).map((p) => p.id));
  return {
    placed: cat.videos.filter((v) => v.places.some((id) => coords.has(id))).map((v) => v.id),
    hubs: worldHubs(cat, { now }),
  };
}

/* ───────────────────────── Time Machine invitation ───────────────────────── */

export interface DecadeStop {
  period: Period;
  count: number;
  playable: number;
}

export const decadeStops = (cat: Catalogue): DecadeStop[] => cat.periodCoverage();

/** The decade with the most stories (earliest on a tie). */
export function liveliestDecade(stops: DecadeStop[]): DecadeStop | null {
  let best: DecadeStop | null = null;
  for (const s of stops) if (!best || s.count > best.count) best = s;
  return best;
}

export interface TimeInvitation {
  /** Stories with a historical setting — the seeds that unspool along the helix. */
  dated: ID[];
  /** Decades that hold stories, in time order. */
  decades: DecadeStop[];
  span: { from: number; to: number } | null;
}

export function timeInvitation(cat: Catalogue): TimeInvitation {
  const dated = cat.videos.filter((v) => v.setting);
  return {
    dated: dated.map((v) => v.id),
    decades: decadeStops(cat).filter((s) => s.count > 0),
    span: yearSpan(dated),
  };
}

/** The ids of a decade's stories (what the decade link lights). */
export const decadeIds = (cat: Catalogue, periodId: ID): ID[] => cat.videosForPeriod(periodId).map((v) => v.id);

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
