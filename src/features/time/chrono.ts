/**
 * TIME MACHINE — pure helpers (no DOM, no React).
 *
 * Three lenses place a story in time, and they must never be confused:
 *   setting   — when the story takes place (cat.videosForPeriod, historical setting overlap)
 *   made      — when the work itself was originally produced (video.made)
 *   published — when it went up on Monumental Streams (video.published)
 * Everything else here derives a decade's (or a single year's) context from the catalogue:
 * active movements, the places and people they touch, their roots (influences) and their
 * echoes forward. Year-level matching lives in timeline.ts.
 */
import { overlaps, type Catalogue } from '../../../shared/catalogue.ts';
import { connectionsFor } from '../../../shared/relations.ts';
import type { ID, Movement, Period, Person, Place, Programme, Reason, Video } from '../../../shared/types.ts';

export type Lens = 'setting' | 'made' | 'published';
export const LENSES: readonly Lens[] = ['setting', 'made', 'published'];

export const LENS_LABEL: Record<Lens, string> = { setting: 'Set in', made: 'Made in', published: 'Published' };
/** Lens used in a sentence: "Stories set in the 1940s". */
export const LENS_VERB: Record<Lens, string> = { setting: 'set in', made: 'made in', published: 'published in' };
export const LENS_EXPLAIN = 'Set in is when a story takes place. Made in is when the footage was originally produced. Published is when it arrived on Monumental Streams.';

export function parseLens(value: string | null | undefined): Lens {
  return value === 'made' || value === 'published' ? value : 'setting';
}

export function publishedYear(v: Pick<Video, 'published'>): number | null {
  const y = Number(v.published.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

/** "the 1940s" for decade labels; other labels unchanged. */
export function decadePhrase(p: Pick<Period, 'label'>): string {
  return /^\d{3,4}s$/.test(p.label) ? `the ${p.label}` : p.label;
}

/** Videos that belong to a period under a lens, in a sensible reading order. */
export function videosInLens(cat: Catalogue, period: Period, lens: Lens): Video[] {
  const byTitle = (a: Video, b: Video) => a.title.localeCompare(b.title);
  if (lens === 'setting') {
    return [...cat.videosForPeriod(period.id)].sort((a, b) => (a.setting?.from ?? 0) - (b.setting?.from ?? 0) || byTitle(a, b));
  }
  if (lens === 'made') {
    return cat.videos.filter((v) => v.made != null && v.made >= period.start && v.made <= period.end).sort((a, b) => (a.made ?? 0) - (b.made ?? 0) || byTitle(a, b));
  }
  return cat.videos
    .filter((v) => {
      const y = publishedYear(v);
      return y != null && y >= period.start && y <= period.end;
    })
    .sort((a, b) => b.published.localeCompare(a.published) || byTitle(a, b));
}

/** Stories per period id under a lens. The setting lens is exactly cat.periodCoverage(). */
export function lensCounts(cat: Catalogue, lens: Lens): Record<ID, number> {
  const out: Record<ID, number> = {};
  if (lens === 'setting') {
    for (const { period, count } of cat.periodCoverage()) out[period.id] = count;
    return out;
  }
  for (const p of cat.periods) out[p.id] = videosInLens(cat, p, lens).length;
  return out;
}

/** The decade with the most setting-matched stories (earliest wins ties); 1900s when the archive is empty. */
export function pickDefaultPeriod(periods: Period[], counts: Record<ID, number>): Period | undefined {
  let best: Period | undefined;
  let bestCount = 0;
  for (const p of periods) {
    const n = counts[p.id] ?? 0;
    if (n > bestCount) {
      best = p;
      bestCount = n;
    }
  }
  return best ?? periods.find((p) => p.slug === '1900s') ?? periods[0];
}

export interface Storied {
  period: Period;
  count: number;
}

/** The nearest decades on either side of `index` that have stories under the current counts. */
export function nearestStoried(periods: Period[], counts: Record<ID, number>, index: number): { before?: Storied; after?: Storied } {
  const out: { before?: Storied; after?: Storied } = {};
  for (let i = index - 1; i >= 0; i--) {
    const n = counts[periods[i].id] ?? 0;
    if (n > 0) {
      out.before = { period: periods[i], count: n };
      break;
    }
  }
  for (let i = index + 1; i < periods.length; i++) {
    const n = counts[periods[i].id] ?? 0;
    if (n > 0) {
      out.after = { period: periods[i], count: n };
      break;
    }
  }
  return out;
}

export type Era =
  | { kind: 'known'; period: Period; /** Set when the address was a bare year ("/time-machine/1942"). */ year?: number }
  | { kind: 'unknown'; slug: string; year: number | null; nearest: Period | undefined; first: Period | undefined; last: Period | undefined };

/**
 * Resolve /time-machine/:slug. A decade slug is known; a bare year inside a decade the archive
 * covers (and not in the future) resolves to that decade and year. Anything else that looks like a
 * year or decade ("1850s", "1850", "2090") is unknown, with the nearest decade offered.
 */
export function resolveEra(cat: Catalogue, slug: string, thisYear = new Date().getFullYear()): Era {
  const hit = cat.bySlug('period', slug) as Period | undefined;
  if (hit) return { kind: 'known', period: hit };
  const periods = cat.periods;
  const first = periods[0];
  const last = periods[periods.length - 1];
  const m = /^(\d{3,4})(['’]?s)?$/i.exec(slug.trim());
  const year = m ? Number(m[1]) : null;
  if (year != null && !m?.[2] && year <= thisYear) {
    const home = periods.find((p) => year >= p.start && year <= p.end);
    if (home) return { kind: 'known', period: home, year };
  }
  return { kind: 'unknown', slug, year, nearest: year == null ? undefined : nearestPeriod(periods, year), first, last };
}

export function nearestPeriod(periods: Period[], year: number): Period | undefined {
  let best: Period | undefined;
  let bestDist = Infinity;
  for (const p of periods) {
    const d = year < p.start ? p.start - year : year > p.end ? year - p.end : 0;
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/* ───────────── Movement spans (the gantt) ───────────── */

export interface Span {
  /** Percent of the axis, 0–100. */
  left: number;
  width: number;
  /** Began before the axis starts (e.g. Bomba, rooted in the 1600s). */
  before: boolean;
  /** No end year: still going today. */
  ongoing: boolean;
}

export function movementSpan(m: Pick<Movement, 'start' | 'end'>, axisFrom: number, axisTo: number, thisYear: number): Span {
  const total = axisTo + 1 - axisFrom;
  const s = Math.max(m.start, axisFrom);
  const e = Math.min(m.end ?? Math.min(thisYear, axisTo), axisTo);
  const left = ((s - axisFrom) / total) * 100;
  const right = ((Math.max(e, s) + 1 - axisFrom) / total) * 100;
  return { left, width: Math.max(0.9, right - left), before: m.start < axisFrom, ongoing: m.end === null };
}

/** "1973–1979", "1950–present", "Rooted c. 1600 · ongoing" style spans for movements. */
export function movementYears(m: Pick<Movement, 'start' | 'end'>): string {
  if (m.end === null) return `${m.start}–present`;
  return m.start === m.end ? String(m.start) : `${m.start}–${m.end}`;
}

/* ───────────── Decade context and lineage ───────────── */

export interface Via<T> {
  item: T;
  via: string[];
}

export interface Root {
  root: Movement;
  /** Active movements of the decade that drew on this root. */
  into: Movement[];
}

export interface Echo {
  echo: Movement;
  /** The earlier movements in the thread it drew on. */
  from: Movement[];
  generation: 1 | 2;
}

export interface Today {
  id: ID;
  kind: 'video' | 'programme';
  weight: number;
  reasons: Reason[];
  /** Movement the connection was found through. */
  through: ID;
}

export interface DecadeContext {
  movements: Movement[];
  places: Via<Place>[];
  people: Via<Person>[];
  roots: Root[];
  echoes: Echo[];
  today: Today[];
}

/** Minimum connection weight for a "today" link — more than a shared interest label. */
const TODAY_MIN_WEIGHT = 3;

export function decadeContext(cat: Catalogue, period: Period, results: Video[]): DecadeContext {
  return rangeContext(cat, period, results);
}

/**
 * Context for any span of years — a decade on the dial or one year on the strand: the movements
 * alive then, the places and people they touch (or the stories in view feature), their roots,
 * their echoes forward, and what on Monumental today carries the thread.
 */
export function rangeContext(cat: Catalogue, period: { start: number; end: number }, results: Video[]): DecadeContext {
  const movements = cat.movements.filter((m) => overlaps(m.start, m.end ?? 9999, period.start, period.end));
  const active = new Set(movements.map((m) => m.id));

  // Places active then: from movements, then from the stories in view.
  const placeVia = new Map<ID, Set<string>>();
  const addPlace = (id: ID, via: string) => {
    if (!cat.get(id)) return;
    let s = placeVia.get(id);
    if (!s) placeVia.set(id, (s = new Set()));
    s.add(via);
  };
  for (const m of movements) for (const p of m.places) addPlace(p, m.name);
  for (const v of results) for (const p of v.places) addPlace(p, v.title);
  const places = [...placeVia.entries()]
    .map(([id, via]) => ({ item: cat.get(id) as Place, via: [...via] }))
    .sort((a, b) => b.via.length - a.via.length || a.item.name.localeCompare(b.item.name));

  // People: tied to an active movement, or featured in a story in view.
  const personVia = new Map<ID, Set<string>>();
  const addPerson = (id: ID, via: string) => {
    if (!cat.get(id)) return;
    let s = personVia.get(id);
    if (!s) personVia.set(id, (s = new Set()));
    s.add(via);
  };
  for (const p of cat.people) for (const m of p.movements ?? []) if (active.has(m)) addPerson(p.id, cat.label(m));
  for (const v of results) for (const { person } of v.people ?? []) addPerson(person, v.title);
  const people = [...personVia.entries()]
    .map(([id, via]) => ({ item: cat.get(id) as Person, via: [...via] }))
    .sort((a, b) => b.via.length - a.via.length || a.item.name.localeCompare(b.item.name));

  // Roots: what the active movements drew on.
  const rootMap = new Map<ID, Root>();
  for (const m of movements) {
    for (const inf of m.influences ?? []) {
      const root = cat.get(inf) as Movement | undefined;
      if (!root) continue;
      const r = rootMap.get(inf) ?? { root, into: [] };
      if (!r.into.includes(m)) r.into.push(m);
      rootMap.set(inf, r);
    }
  }
  const roots = [...rootMap.values()].sort((a, b) => a.root.start - b.root.start || a.root.name.localeCompare(b.root.name));

  // Echoes forward: later movements that list an active movement (gen 1) or a gen-1 echo (gen 2) as an influence.
  const echoes: Echo[] = [];
  const seen = new Set<ID>(active);
  let frontier = movements;
  for (const generation of [1, 2] as const) {
    const next: Movement[] = [];
    for (const later of cat.movements) {
      if (seen.has(later.id) || later.start <= period.end) continue;
      const from = frontier.filter((f) => later.influences?.includes(f.id));
      if (!from.length) continue;
      echoes.push({ echo: later, from, generation });
      next.push(later);
    }
    for (const n of next) seen.add(n.id);
    frontier = next;
    if (!frontier.length) break;
  }
  echoes.sort((a, b) => a.generation - b.generation || a.echo.start - b.echo.start || a.echo.name.localeCompare(b.echo.name));

  // Today: stories and programmes connected to the echoes (or, failing that, the active movements).
  const sources = echoes.length ? echoes.map((e) => e.echo) : movements;
  const todayMap = new Map<ID, Today>();
  for (const src of sources) {
    for (const c of connectionsFor(cat, src.id, { kinds: ['programme', 'video'], limit: 8 })) {
      if (c.weight < TODAY_MIN_WEIGHT) continue;
      const e = cat.get(c.target);
      if (!e) continue;
      const kind = c.target.startsWith('video:') ? 'video' : 'programme';
      if (kind === 'video') {
        const v = e as Video;
        if (v.setting && v.setting.to < src.start) continue; // contemporary only: not set before the movement began
      }
      const prev = todayMap.get(c.target);
      if (!prev || prev.weight < c.weight) todayMap.set(c.target, { id: c.target, kind, weight: c.weight, reasons: c.reasons, through: src.id });
    }
  }
  const today = [...todayMap.values()].sort((a, b) => b.weight - a.weight || cat.label(a.id).localeCompare(cat.label(b.id))).slice(0, 6);

  return { movements, places, people, roots, echoes, today };
}

/** Programmes a decade's stories belong to (for "part of" hints); unused ids are skipped. */
export function programmesOf(cat: Catalogue, videos: Video[]): Programme[] {
  const ids = [...new Set(videos.map((v) => v.programme).filter((x): x is ID => !!x))];
  return ids.map((id) => cat.get(id) as Programme | undefined).filter((p): p is Programme => !!p);
}

/** aria-valuetext for the dial: "1940s — 3 stories, 2 movements". */
export function dialValueText(p: Period, stories: number, movements: number): string {
  return `${p.label} — ${stories} ${stories === 1 ? 'story' : 'stories'}, ${movements} ${movements === 1 ? 'movement' : 'movements'}`;
}

/** Map a clock angle (degrees, 0 = 12 o'clock, clockwise) to the nearest detent on an arc. */
export function angleToIndex(angle: number, count: number, startDeg: number, stepDeg: number): number {
  let a = angle;
  // Normalise into (-180, 180]
  a = ((((a + 180) % 360) + 360) % 360) - 180;
  const raw = (a - startDeg) / stepDeg;
  return Math.min(count - 1, Math.max(0, Math.round(raw)));
}
