/**
 * TIME MACHINE — the year-level model (pure: no DOM, no React).
 *
 * A place in time is a decade (the dial) and, optionally, one year inside it (the strand).
 * Stories are matched against a range of years under a lens, and the lens decides which of a
 * story's dates is compared — never a mixture:
 *   setting   — the story's historical setting {from, to}; a year matches when the setting includes it
 *   made      — the single year the work was originally produced
 *   published — the year it arrived on Monumental Streams
 * A story without the date a lens needs (a timeless loop under "setting") is simply not placed.
 * Nothing here invents a date: years come only from the records.
 *
 * The URL carries the whole position so links, refresh and Back restore it:
 *   /time-machine/1940s?year=1942&lens=made&interest=film&movement=plena
 */
import { overlaps, type Catalogue } from '../../../shared/catalogue.ts';
import type { Category, ID, Movement, Period, Video } from '../../../shared/types.ts';
import { decadePhrase, parseLens, publishedYear, type Lens } from './chrono.ts';

/** Inclusive span of years. A Period is structurally a TimeRange. */
export interface TimeRange {
  start: number;
  end: number;
}

/* ───────────── Years ───────────── */

/** The selectable years of a decade. The archive never claims years that have not happened yet. */
export function yearsOf(p: TimeRange, thisYear: number): number[] {
  const out: number[] = [];
  for (let y = p.start; y <= Math.min(p.end, thisYear); y++) out.push(y);
  return out;
}

/** A year from the URL, accepted only when it is a whole year inside `within` (when given). */
export function parseYear(raw: string | null | undefined, within?: TimeRange): number | null {
  const s = raw?.trim();
  if (!s || !/^\d{3,4}$/.test(s)) return null;
  const y = Number(s);
  if (within && (y < within.start || y > within.end)) return null;
  return y;
}

/** "1942" for a year, "the 1940s" for a decade. */
export function rangePhrase(period: Pick<Period, 'label'>, year: number | null): string {
  return year == null ? decadePhrase(period) : String(year);
}

/* ───────────── Matching stories ───────────── */

/** The years a story occupies under a lens, or null when its record does not date it that way. */
export function storySpan(v: Video, lens: Lens): TimeRange | null {
  if (lens === 'setting') return v.setting ? { start: v.setting.from, end: v.setting.to } : null;
  if (lens === 'made') return v.made != null ? { start: v.made, end: v.made } : null;
  const y = publishedYear(v);
  return y == null ? null : { start: y, end: y };
}

export function inRange(v: Video, lens: Lens, range: TimeRange): boolean {
  const s = storySpan(v, lens);
  return !!s && overlaps(s.start, s.end, range.start, range.end);
}

const byTitle = (a: Video, b: Video) => a.title.localeCompare(b.title);

/** Reading order per lens: by when the story begins, when it was made, or newest publication first. */
export function sortForLens(list: Video[], lens: Lens): Video[] {
  const out = [...list];
  if (lens === 'setting') return out.sort((a, b) => (a.setting?.from ?? 0) - (b.setting?.from ?? 0) || byTitle(a, b));
  if (lens === 'made') return out.sort((a, b) => (a.made ?? 0) - (b.made ?? 0) || byTitle(a, b));
  return out.sort((a, b) => b.published.localeCompare(a.published) || byTitle(a, b));
}

/** Stories placed in a range under a lens, optionally limited to one interest (category id). */
export function storiesIn(cat: Catalogue, lens: Lens, range: TimeRange, interest?: ID | null): Video[] {
  return sortForLens(
    cat.videos.filter((v) => inRange(v, lens, range) && (!interest || v.categories.includes(interest))),
    lens,
  );
}

/** Story counts per decade (period id) under a lens and interest — what lights the dial. */
export function periodCounts(cat: Catalogue, lens: Lens, interest?: ID | null): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of cat.periods) out[p.id] = storiesIn(cat, lens, p, interest).length;
  return out;
}

/** Story counts per year (inclusive range) in one pass — what lights the year strand. */
export function yearlyCounts(cat: Catalogue, lens: Lens, range: TimeRange, interest?: ID | null): Map<number, number> {
  const out = new Map<number, number>();
  for (let y = range.start; y <= range.end; y++) out.set(y, 0);
  for (const v of cat.videos) {
    if (interest && !v.categories.includes(interest)) continue;
    const s = storySpan(v, lens);
    if (!s) continue;
    for (let y = Math.max(s.start, range.start); y <= Math.min(s.end, range.end); y++) out.set(y, (out.get(y) ?? 0) + 1);
  }
  return out;
}

/* ───────────── Graceful emptiness ───────────── */

export interface NearYear {
  year: number;
  count: number;
}

/** The nearest years on either side of `year` (within `bounds`) that hold stories under these counts. */
export function nearestYears(counts: Map<number, number>, year: number, bounds: TimeRange): { before?: NearYear; after?: NearYear } {
  const out: { before?: NearYear; after?: NearYear } = {};
  for (let y = year - 1; y >= bounds.start; y--) {
    const n = counts.get(y) ?? 0;
    if (n > 0) {
      out.before = { year: y, count: n };
      break;
    }
  }
  for (let y = year + 1; y <= bounds.end; y++) {
    const n = counts.get(y) ?? 0;
    if (n > 0) {
      out.after = { year: y, count: n };
      break;
    }
  }
  return out;
}

export interface NearStory {
  video: Video;
  /** Whole years between the story's dates and the range (always >= 1). */
  distance: number;
  direction: 'earlier' | 'later';
}

/** Stories closest in time to a range that holds none: real records, ranked by how far away they sit. */
export function nearestStories(cat: Catalogue, lens: Lens, range: TimeRange, interest?: ID | null, limit = 3): NearStory[] {
  const out: NearStory[] = [];
  for (const v of cat.videos) {
    if (interest && !v.categories.includes(interest)) continue;
    const s = storySpan(v, lens);
    if (!s || overlaps(s.start, s.end, range.start, range.end)) continue;
    out.push(s.end < range.start ? { video: v, distance: range.start - s.end, direction: 'earlier' } : { video: v, distance: s.start - range.end, direction: 'later' });
  }
  return out.sort((a, b) => a.distance - b.distance || (a.direction === b.direction ? 0 : a.direction === 'earlier' ? -1 : 1) || byTitle(a.video, b.video)).slice(0, limit);
}

/** "1 year earlier", "41 years later". */
export function distanceLabel(n: Pick<NearStory, 'distance' | 'direction'>): string {
  return `${n.distance} ${n.distance === 1 ? 'year' : 'years'} ${n.direction}`;
}

/* ───────────── Categories present ───────────── */

export interface CategoryPresence {
  category: Category;
  /** Stories in view carrying this interest. */
  count: number;
  /** Movements active in the range that carry it (context even when no story does yet). */
  movements: Movement[];
}

/** Interests present in a place in time: first those with stories (most first), then those only its movements carry. */
export function categoriesPresent(cat: Catalogue, stories: Video[], movements: Movement[]): CategoryPresence[] {
  const map = new Map<ID, CategoryPresence>();
  const entry = (id: ID) => {
    let e = map.get(id);
    if (!e) {
      const category = cat.get(id) as Category | undefined;
      if (!category || !id.startsWith('interest:')) return undefined;
      map.set(id, (e = { category, count: 0, movements: [] }));
    }
    return e;
  };
  for (const v of stories) for (const c of new Set(v.categories)) {
    const e = entry(c);
    if (e) e.count++;
  }
  for (const m of movements) for (const c of new Set(m.categories)) {
    const e = entry(c);
    if (e && !e.movements.includes(m)) e.movements.push(m);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.movements.length - a.movements.length || a.category.name.localeCompare(b.category.name));
}

/* ───────────── The decade ribbon on each card ───────────── */

export interface RibbonCell {
  year: number;
  /** Inside the story's historical setting. */
  set: boolean;
  made: boolean;
  published: boolean;
  /** The year chosen on the strand. */
  selected: boolean;
}

/** One cell per year of the decade, marking where this story's three dates fall. */
export function decadeRibbon(v: Video, decade: TimeRange, year: number | null): RibbonCell[] {
  const pub = publishedYear(v);
  const cells: RibbonCell[] = [];
  for (let y = decade.start; y <= decade.end; y++) {
    cells.push({
      year: y,
      set: !!v.setting && y >= v.setting.from && y <= v.setting.to,
      made: v.made === y,
      published: pub === y,
      selected: year === y,
    });
  }
  return cells;
}

/* ───────────── URL state ───────────── */

export interface TimeState {
  year: number | null;
  lens: Lens;
  interest: ID | null;
  movement: string | null;
}

/** Read the query string. A year outside `range`, an unknown interest or movement is ignored. */
export function readTimeParams(params: URLSearchParams, cat: Catalogue, range?: TimeRange): TimeState {
  const interestSlug = params.get('interest');
  const movementSlug = params.get('movement');
  const interest = interestSlug ? (cat.bySlug('interest', interestSlug)?.id ?? null) : null;
  return {
    year: parseYear(params.get('year'), range),
    lens: parseLens(params.get('lens')),
    interest,
    movement: movementSlug && cat.bySlug('movement', movementSlug) ? movementSlug : null,
  };
}

/** Canonical query string ("" or "?year=…&lens=…&interest=…&movement=…"), defaults omitted. */
export function timeSearch(cat: Catalogue, s: TimeState): string {
  const q = new URLSearchParams();
  if (s.year != null) q.set('year', String(s.year));
  if (s.lens !== 'setting') q.set('lens', s.lens);
  if (s.interest) {
    const e = cat.get(s.interest);
    if (e && 'slug' in e) q.set('interest', e.slug);
  }
  if (s.movement) q.set('movement', s.movement);
  const str = q.toString();
  return str ? `?${str}` : '';
}

export function timeHref(cat: Catalogue, period: Pick<Period, 'slug'>, s: TimeState): string {
  return `/time-machine/${period.slug}${timeSearch(cat, s)}`;
}
