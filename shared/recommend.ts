/**
 * Explainable, content-based recommendations from a viewer's Library.
 *
 * Signals: followed interests, watch history (with recency decay), saved videos, saved
 * places and passport stamps. Each candidate's score is built from those signals through
 * shared/relations.ts, so every recommendation carries the reasons that produced it.
 * Completed and in-progress videos are left out (they live in Continue Watching), playable
 * titles are preferred, premium-locked titles sink for non-members, and an MMR-style pass
 * keeps one programme or place from taking over the rail. An empty Library gets a
 * curated cold start: the gateway city, free playable titles and Monumental Original teasers.
 */
import { kindOf } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { activeInterests, continueWatching, savedPlaceIds } from './library.ts';
import { relate, relatedVideos } from './relations.ts';
import { matchesProvenance } from './search.ts';
import type { ID, Library, Programme, Reason, Video } from './types.ts';

export interface Recommendation {
  video: Video;
  score: number;
  reasons: Reason[];
}

const DAY_MS = 86_400_000;
const HISTORY_HALF_LIFE_DAYS = 21;
const SAVED_HALF_LIFE_DAYS = 60;
const MAX_SEEDS = 12;
/** One seed's relation weight is capped so a single near-duplicate cannot dominate. */
const SEED_RELATION_CAP = 10;
/** Each further seed pointing at the same candidate counts for this fraction of the previous one. */
const SEED_DIMINISHING = 0.6;
const INTEREST_BOOST = 4;
const SAVED_PLACE_BOOST = 4;
const STAMP_BOOST = 2;
const COLD_GATEWAY = 5;
const COLD_ORIGINAL = 3;
const COLD_FREE = 3;
const NOT_PLAYABLE_FACTOR = 0.25;
const LOCKED_FACTOR = 0.6;
const SAME_PROGRAMME_DECAY = 0.65;
const SAME_PLACE_DECAY = 0.8;
const MAX_REASONS = 3;

interface Seed {
  video: Video;
  weight: number;
  verb: 'watched' | 'saved';
}

interface Part {
  weight: number;
  reasons: Reason[];
}

interface Candidate {
  video: Video;
  score: number;
  reasons: Reason[];
  series?: ID;
  published: number;
}

export function recommend(
  cat: Catalogue,
  input: { library: Library; premium: boolean; now?: Date; limit?: number; exclude?: ID[] },
): Recommendation[] {
  const { library, premium } = input;
  const now = input.now ?? new Date();
  const limit = input.limit ?? 12;
  const blocked = new Set([...(input.exclude ?? []), ...unavailableToRecommend(library)]);

  const seeds = seedsFrom(cat, library, now);
  const interests = activeInterests(library).filter((id) => kindOf(id) === 'interest' && cat.get(id));
  const savedPlaces = savedPlaceIds(library).filter((id) => kindOf(id) === 'place' && cat.get(id));
  const stamps = Object.keys(library.stamps).filter((id) => kindOf(id) === 'place' && cat.get(id) && !savedPlaces.includes(id));
  const warm = seeds.length + interests.length + savedPlaces.length + stamps.length > 0;
  const gateway = cat.places.find((p) => p.gateway);

  const personal: Candidate[] = [];
  const fallback: Candidate[] = [];
  for (const v of cat.videos) {
    if (blocked.has(v.id)) continue;
    const access = cat.effectiveAccess(v, now);
    const factor = (access === 'unavailable' ? NOT_PLAYABLE_FACTOR : 1) * (access === 'premium' && !premium ? LOCKED_FACTOR : 1);
    const parts: Part[] = [];
    if (warm) {
      const seedParts: Part[] = [];
      for (const seed of seeds) {
        if (seed.video.id === v.id) continue;
        const rel = relate(cat, seed.video.id, v.id);
        if (!rel.weight) continue;
        seedParts.push({
          weight: seed.weight * Math.min(rel.weight, SEED_RELATION_CAP),
          reasons: [{ kind: rel.reasons[0].kind, label: `Because you ${seed.verb} “${seed.video.title}”`, via: seed.video.id }, rel.reasons[0]],
        });
      }
      seedParts.sort((a, b) => b.weight - a.weight).forEach((p, i) => parts.push({ ...p, weight: p.weight * SEED_DIMINISHING ** i }));
      for (const c of interests) {
        if (v.categories.includes(c)) parts.push({ weight: INTEREST_BOOST, reasons: [{ kind: 'category', label: `You follow ${cat.label(c)}`, via: c }] });
      }
      const inScope = (place: ID) => {
        const scope = cat.placeScope(place);
        return v.places.some((p) => scope.has(p));
      };
      for (const p of savedPlaces) {
        if (inScope(p)) parts.push({ weight: SAVED_PLACE_BOOST, reasons: [{ kind: 'place', label: `In ${cat.label(p)}, a place you saved`, via: p }] });
      }
      for (const p of stamps) {
        if (inScope(p)) parts.push({ weight: STAMP_BOOST, reasons: [{ kind: 'place', label: `In ${cat.label(p)}, stamped in your passport`, via: p }] });
      }
    }
    const target = parts.length ? personal : fallback;
    const scored = parts.length ? parts : coldStartParts(cat, v, access, gateway);
    target.push(candidate(cat, v, scored, factor));
  }

  const picked = diversify(personal, limit, []);
  if (picked.length < limit) picked.push(...diversify(fallback, limit - picked.length, picked));
  return picked.map(({ video, score, reasons }) => ({ video, score: Math.round(score * 1000) / 1000, reasons }));
}

/**
 * "Because you watched X": related titles for the most recent watched video that has any
 * (completed and in-progress titles excluded). Null when there is no usable history.
 */
export function becauseYouWatched(cat: Catalogue, library: Library, limit = 8): { seed: Video; items: Recommendation[] } | null {
  const blocked = new Set(unavailableToRecommend(library));
  const tried = new Set<ID>();
  for (const h of library.history.filter((x) => !x.removed).sort((a, b) => b.at - a.at)) {
    if (tried.has(h.video)) continue;
    tried.add(h.video);
    const seed = kindOf(h.video) === 'video' ? (cat.get(h.video) as Video | undefined) : undefined;
    if (!seed) continue;
    const items = relatedVideos(cat, seed.id, cat.videos.length)
      .filter((r) => !blocked.has(r.video.id))
      .slice(0, limit)
      .map((r) => ({ video: r.video, score: r.weight, reasons: r.reasons }));
    if (items.length) return { seed, items };
  }
  return null;
}

/** Completed videos and those in Continue Watching. */
function unavailableToRecommend(library: Library): ID[] {
  const done = Object.entries(library.progress)
    .filter(([, e]) => e.done)
    .map(([id]) => id);
  return [...done, ...continueWatching(library).map((c) => c.video)];
}

/** Watched and saved videos as weighted seeds, decayed by age. */
function seedsFrom(cat: Catalogue, library: Library, now: Date): Seed[] {
  const decay = (at: number, halfLifeDays: number) => 0.5 ** (Math.max(0, now.getTime() - at) / (halfLifeDays * DAY_MS));
  const seeds = new Map<ID, Seed>();
  const videoOf = (id: ID) => (kindOf(id) === 'video' ? (cat.get(id) as Video | undefined) : undefined);

  // Newest play counts in full; repeat plays add a little (capped) — rewatching is a signal.
  for (const h of library.history.filter((x) => !x.removed).sort((a, b) => b.at - a.at)) {
    const video = videoOf(h.video);
    if (!video) continue;
    const w = decay(h.at, HISTORY_HALF_LIFE_DAYS);
    const seed = seeds.get(video.id);
    if (seed) seed.weight = Math.min(1.5, seed.weight + 0.25 * w);
    else seeds.set(video.id, { video, weight: w, verb: 'watched' });
  }
  // Completed progress that never reached history (e.g. imported) still counts as watched.
  for (const [id, e] of Object.entries(library.progress)) {
    const video = videoOf(id);
    if (video && e.done && !seeds.has(id)) seeds.set(id, { video, weight: decay(e.at, HISTORY_HALF_LIFE_DAYS), verb: 'watched' });
  }
  for (const [id, s] of Object.entries(library.saved)) {
    const video = videoOf(id);
    if (!video || s.removed) continue;
    const w = 0.8 * decay(s.at, SAVED_HALF_LIFE_DAYS);
    const seed = seeds.get(id);
    if (seed) seed.weight = Math.min(1.5, seed.weight + 0.3 * w);
    else seeds.set(id, { video, weight: w, verb: 'saved' });
  }
  return [...seeds.values()]
    .filter((s) => s.weight > 0.01)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SEEDS);
}

/** Reasons for viewers with no signals yet (or for padding a short personal rail). */
function coldStartParts(cat: Catalogue, v: Video, access: 'free' | 'premium' | 'unavailable', gateway: { id: ID; name: string } | undefined): Part[] {
  const parts: Part[] = [];
  if (gateway) {
    const scope = cat.placeScope(gateway.id);
    if (v.places.some((p) => scope.has(p))) parts.push({ weight: COLD_GATEWAY, reasons: [{ kind: 'place', label: `Start at the ${gateway.name} gateway`, via: gateway.id }] });
  }
  if (matchesProvenance(cat, v, 'original')) {
    const prog = v.programme ? (cat.get(v.programme) as Programme | undefined) : undefined;
    const label = prog ? (v.kind === 'teaser' ? `A first look at ${prog.title}` : `A Monumental Original from ${prog.title}`) : 'A Monumental Original';
    parts.push({ weight: COLD_ORIGINAL, reasons: [prog ? { kind: 'programme', label, via: prog.id } : { kind: 'programme', label }] });
  }
  if (access === 'free') {
    parts.push({ weight: COLD_FREE, reasons: [{ kind: 'access', label: 'Free to watch now' }] });
  }
  if (!parts.length) {
    // Still explain why it is here: what kind of story it is.
    const c = v.categories[0];
    const place = v.places[0];
    const reason: Reason = c
      ? { kind: 'category', label: `Explore ${cat.label(c)}`, via: c }
      : place
        ? { kind: 'place', label: `Explore ${cat.label(place)}`, via: place }
        : { kind: 'editorial', label: 'Something new to explore' };
    parts.push({ weight: 0, reasons: [reason] });
  }
  return parts;
}

function candidate(cat: Catalogue, v: Video, parts: Part[], factor: number): Candidate {
  const reasons: Reason[] = [];
  const seen = new Set<string>();
  for (const part of [...parts].sort((a, b) => b.weight - a.weight)) {
    for (const r of part.reasons) {
      if (reasons.length < MAX_REASONS && !seen.has(r.label)) {
        seen.add(r.label);
        reasons.push(r);
      }
    }
  }
  const published = Date.parse(v.published);
  const programme = v.programme ? (cat.get(v.programme) as Programme | undefined) : undefined;
  return {
    video: v,
    score: parts.reduce((sum, p) => sum + p.weight, 0) * factor,
    reasons,
    series: programme?.parent ?? programme?.id,
    published: Number.isNaN(published) ? 0 : published,
  };
}

/**
 * Greedy MMR-style selection: each pick discounts remaining candidates from the same series
 * or sharing a place with what is already chosen, so the rail stays varied.
 */
function diversify(pool: Candidate[], count: number, already: Candidate[]): Candidate[] {
  const chosen: Candidate[] = [];
  const remaining = [...pool];
  while (chosen.length < count && remaining.length) {
    const context = [...already, ...chosen];
    let best = -1;
    let bestScore = -Infinity;
    remaining.forEach((c, i) => {
      const sameSeries = c.series ? context.filter((x) => x.series === c.series).length : 0;
      const samePlace = context.filter((x) => x.video.places.some((p) => c.video.places.includes(p))).length;
      const adjusted = c.score * SAME_PROGRAMME_DECAY ** sameSeries * SAME_PLACE_DECAY ** samePlace;
      const b = remaining[best];
      if (adjusted > bestScore || (adjusted === bestScore && b && (c.published > b.published || (c.published === b.published && c.video.id < b.video.id)))) {
        best = i;
        bestScore = adjusted;
      }
    });
    const [pick] = remaining.splice(best, 1);
    chosen.push({ ...pick, score: bestScore });
  }
  return chosen;
}
