/**
 * Take Me Somewhere — pure helpers for the Discovery Instrument.
 *
 * The URL is the source of truth: /somewhere?interest=&minutes=&where=&mood=&seed=
 * (slugs, never raw ids). A plan exists only when a seed is present, so the same link
 * always rebuilds the same itinerary. Knob options are derived from the catalogue —
 * only interests and places that have playable stories are offered.
 */
import { kindOf } from '../../../shared/catalogue.ts';
import type { Catalogue, EntityKind } from '../../../shared/catalogue.ts';
import { MOOD_LABELS } from '../../../shared/relations.ts';
import type { ID, Mood, Place, Video } from '../../../shared/types.ts';
import { timecode } from '../../lib/format.ts';

export const MINUTE_OPTIONS = [10, 15, 30, 45, 60, 90] as const;
export const DEFAULT_MINUTES = 30;
export const MOODS: Mood[] = ['chill', 'lively', 'curious', 'late'];
const MAX_SEED = 99_999;

export interface Dial {
  interest: ID | null;
  minutes: number;
  where: ID | null;
  mood: Mood | null;
}

export interface DialOption {
  value: string; // '' = any
  label: string;
  count?: number; // playable stories behind this option
}

export const DEFAULT_DIAL: Dial = { interest: null, minutes: DEFAULT_MINUTES, where: null, mood: null };

/* ───────────── Knob geometry ───────────── */

/** Knobs turn through 270°: from -135° (first detent) to +135° (last), 0° = straight up. */
export const KNOB_SWEEP = 270;

export function knobAngle(index: number, count: number): number {
  if (count <= 1) return 0;
  const i = Math.min(count - 1, Math.max(0, index));
  return -KNOB_SWEEP / 2 + (KNOB_SWEEP * i) / (count - 1);
}

/** Nearest detent for a pointer angle (degrees, 0 = up, clockwise). The dead gap at the bottom clamps to the nearer end. */
export function indexForAngle(angle: number, count: number): number {
  if (count <= 1) return 0;
  let a = ((((angle + 180) % 360) + 360) % 360) - 180; // normalise to [-180, 180)
  a = Math.min(KNOB_SWEEP / 2, Math.max(-KNOB_SWEEP / 2, a));
  return Math.round(((a + KNOB_SWEEP / 2) / KNOB_SWEEP) * (count - 1));
}

/* ───────────── Options derived from the catalogue ───────────── */

/** Stories someone can play right now that have a measured runtime. */
export function playableStories(cat: Catalogue, now?: Date): Video[] {
  return cat.videos.filter((v) => cat.isPlayable(v, now) && (cat.runtime(v) ?? 0) > 0);
}

export function interestOptions(cat: Catalogue, now?: Date): DialOption[] {
  const counts = new Map<ID, number>();
  for (const v of playableStories(cat, now)) for (const c of v.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [
    { value: '', label: 'Any' },
    ...cat.categories.filter((c) => counts.has(c.id)).map((c) => ({ value: c.id, label: c.name, count: counts.get(c.id) })),
  ];
}

/** The level a story's place is offered at: its city (Wynwood → Miami), or the place itself when it is not inside one. */
export function whereLevel(cat: Catalogue, id: ID): ID {
  const self = cat.get(id) as Place | undefined;
  if (!self || kindOf(id) !== 'place') return id;
  if (self.kind === 'city') return id;
  return cat.placeAncestors(id).find((p) => p.kind === 'city')?.id ?? id;
}

/**
 * Anywhere + the places that have playable stories, at city level (or the place itself),
 * plus the shared parent of two or more of those levels (Miami + Miami Beach → Miami-Dade County).
 * The launch gateway comes first, then by number of stories.
 */
export function whereOptions(cat: Catalogue, now?: Date): DialOption[] {
  const pool = playableStories(cat, now);
  const levels = new Set<ID>();
  for (const v of pool) for (const pl of v.places) if (cat.get(pl)) levels.add(whereLevel(cat, pl));
  const byParent = new Map<ID, Set<ID>>();
  for (const l of levels) {
    const parent = (cat.get(l) as Place | undefined)?.parent;
    if (!parent || !cat.get(parent)) continue;
    const set = byParent.get(parent) ?? new Set<ID>();
    set.add(l);
    byParent.set(parent, set);
  }
  for (const [parent, kids] of byParent) if (kids.size >= 2) levels.add(parent);

  const options = [...levels].map((id) => {
    const scope = cat.placeScope(id);
    const place = cat.get(id) as Place;
    return { place, count: pool.filter((v) => v.places.some((pl) => scope.has(pl))).length };
  });
  options.sort(
    (a, b) => Number(!!b.place.gateway) - Number(!!a.place.gateway) || b.count - a.count || a.place.name.localeCompare(b.place.name),
  );
  return [{ value: '', label: 'Anywhere' }, ...options.map((o) => ({ value: o.place.id, label: o.place.name, count: o.count }))];
}

export function minuteOptions(): DialOption[] {
  return MINUTE_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }));
}

export function moodOptions(): DialOption[] {
  return [{ value: '', label: 'Any' }, ...MOODS.map((m) => ({ value: m, label: MOOD_LABELS[m][0].toUpperCase() + MOOD_LABELS[m].slice(1) }))];
}

/** Keep a value that arrived by link selectable even when the derived list does not offer it. */
export function withOption(list: DialOption[], value: string, label: string): DialOption[] {
  if (!value || list.some((o) => o.value === value)) return list;
  return [...list, { value, label }];
}

/* ───────────── URL state ───────────── */

export function snapMinutes(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MINUTES;
  let best: number = MINUTE_OPTIONS[0];
  for (const m of MINUTE_OPTIONS) if (Math.abs(m - n) < Math.abs(best - n)) best = m;
  return best;
}

export function parseSeed(raw: string | null): number | null {
  if (raw === null || !/^\d{1,9}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n <= 2_147_483_647 ? n : null;
}

function idFromSlug(cat: Catalogue, kind: EntityKind, slug: string | null): ID | null {
  if (!slug) return null;
  return cat.bySlug(kind, slug.trim().toLowerCase())?.id ?? null;
}

function slugOf(cat: Catalogue, id: ID | null): string {
  if (!id) return '';
  const e = cat.get(id);
  return e && 'slug' in e && e.slug ? e.slug : '';
}

export function dialFromParams(params: URLSearchParams, cat: Catalogue): { dial: Dial; seed: number | null } {
  const mood = params.get('mood');
  return {
    dial: {
      interest: idFromSlug(cat, 'interest', params.get('interest')),
      minutes: snapMinutes(Number(params.get('minutes') ?? DEFAULT_MINUTES)),
      where: idFromSlug(cat, 'place', params.get('where')),
      mood: MOODS.includes(mood as Mood) ? (mood as Mood) : null,
    },
    seed: parseSeed(params.get('seed')),
  };
}

/** Stable, readable query string (no leading "?"): interest, minutes, where, mood, seed. */
export function dialToSearch(cat: Catalogue, dial: Dial, seed: number | null): string {
  const parts: string[] = [];
  const interest = slugOf(cat, dial.interest);
  const where = slugOf(cat, dial.where);
  if (interest) parts.push(`interest=${encodeURIComponent(interest)}`);
  parts.push(`minutes=${snapMinutes(dial.minutes)}`);
  if (where) parts.push(`where=${encodeURIComponent(where)}`);
  if (dial.mood) parts.push(`mood=${dial.mood}`);
  if (seed !== null) parts.push(`seed=${seed}`);
  return parts.join('&');
}

export function dialEquals(a: Dial, b: Dial): boolean {
  return a.interest === b.interest && a.minutes === b.minutes && a.where === b.where && a.mood === b.mood;
}

/** A fresh seed in 1…99999 that differs from the previous one. */
export function newSeed(prev: number | null, rand: () => number = Math.random): number {
  const s = 1 + Math.floor(rand() * MAX_SEED);
  return s === prev ? (s % MAX_SEED) + 1 : s;
}

/* ───────────── Journeys ───────────── */

/** Deterministic library key: saving the same journey twice never duplicates it. */
export function journeyKey(cat: Catalogue, dial: Dial, seed: number): string {
  return ['somewhere', slugOf(cat, dial.interest) || 'any', snapMinutes(dial.minutes), slugOf(cat, dial.where) || 'anywhere', dial.mood ?? 'any', seed].join('-');
}

export function journeyTitle(cat: Catalogue, dial: Dial): string {
  let t = `${snapMinutes(dial.minutes)}-minute ${dial.mood ? `${MOOD_LABELS[dial.mood]} ` : ''}journey`;
  if (dial.interest) t += ` through ${cat.label(dial.interest)}`;
  if (dial.where) t += ` around ${cat.label(dial.where)}`;
  return t;
}

export function journeyParams(cat: Catalogue, dial: Dial, seed: number): Record<string, string> {
  const out: Record<string, string> = { minutes: String(snapMinutes(dial.minutes)), seed: String(seed) };
  const interest = slugOf(cat, dial.interest);
  const where = slugOf(cat, dial.where);
  if (interest) out.interest = interest;
  if (where) out.where = where;
  if (dial.mood) out.mood = dial.mood;
  return out;
}

/** /watch/<first>?queue=<every slug> — the player auto-advances through the queue. */
export function queueHref(videos: Pick<Video, 'slug'>[]): string | null {
  if (!videos.length) return null;
  return `/watch/${videos[0].slug}?queue=${videos.map((v) => v.slug).join(',')}`;
}

export function budgetLabel(total: number, budget: number): string {
  return `${timecode(total)} of ${timecode(budget)}`;
}

/**
 * Live telemetry for the dialled settings: stories that match every knob exactly and that
 * this viewer can watch, their combined runtime, and how many more need a membership.
 */
export function poolStats(cat: Catalogue, dial: Dial, premium: boolean, now?: Date): { count: number; seconds: number; locked: number } {
  const scope = dial.where ? cat.placeScope(dial.where) : null;
  const strict = playableStories(cat, now).filter(
    (v) =>
      (!dial.interest || v.categories.includes(dial.interest)) &&
      (!scope || v.places.some((pl) => scope.has(pl))) &&
      (!dial.mood || v.moods.includes(dial.mood)),
  );
  const open = strict.filter((v) => {
    const a = cat.effectiveAccess(v, now);
    return a === 'free' || (a === 'premium' && premium);
  });
  return { count: open.length, seconds: open.reduce((s, v) => s + (cat.runtime(v) ?? 0), 0), locked: strict.length - open.length };
}

/** "Mood (chill)", "Interest (Music)", "Where (Miami)" for the constraints a plan had to widen. */
export function relaxedLabels(cat: Catalogue, dial: Dial, relaxed: ('mood' | 'interest' | 'where')[]): string[] {
  return relaxed.map((c) =>
    c === 'mood' ? `mood (${dial.mood ? MOOD_LABELS[dial.mood] : 'any'})` : c === 'interest' ? `interest (${dial.interest ? cat.label(dial.interest) : 'any'})` : `place (${dial.where ? cat.label(dial.where) : 'anywhere'})`,
  );
}
