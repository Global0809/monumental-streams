/**
 * "Take Me Somewhere": fit real runtimes into a viewer's time budget.
 *
 * 1. Pool: videos playable now that this viewer may watch (premium via effectiveAccess) and
 *    that have a measured runtime.
 * 2. Constraints (interest / where / mood) filter the pool. When the best plan fills less
 *    than MIN_FILL of the budget, constraints are relaxed in the order mood → interest →
 *    where, and the plan reports which ones were widened.
 * 3. Selection is an exact 0/1 knapsack over whole seconds: find the fullest fill that does
 *    not exceed the budget, then — within a small tolerance of it — the set with the best
 *    bonus (items matching more of the original wishes, plus seeded jitter for variety).
 *    The same params and seed always give the same plan.
 * 4. The plan is ordered as a narrative: programme groups in series order, groups and
 *    standalone stories by historical setting year.
 */
import { kindOf } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { MOOD_LABELS } from './relations.ts';
import { listPhrase, mulberry32, periodPhrase } from './text.ts';
import type { ID, Mood, Reason, Route, Video } from './types.ts';

export interface JourneyParams {
  interest?: ID;
  minutes: number;
  /** A place id (its sub-places count) or a route id (both ends count). */
  where?: ID;
  mood?: Mood;
  seed: number;
  premium: boolean;
}

export interface JourneyPlan {
  items: { video: Video; reasons: Reason[] }[];
  totalSeconds: number;
  budgetSeconds: number;
  relaxed: ('mood' | 'interest' | 'where')[];
  explanation: string;
}

type Constraint = 'mood' | 'interest' | 'where';

const RELAX_ORDER: Constraint[] = ['mood', 'interest', 'where'];
/** Below this share of the budget, the next constraint is relaxed. */
const MIN_FILL = 0.6;
const MAX_MINUTES = 600;
/** Knapsack candidates considered (best-matching first) — bounds memory at long budgets. */
const MAX_POOL = 120;
const MATCH_BONUS = 10;
const VARIETY_BONUS = 4;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function planJourney(cat: Catalogue, p: JourneyParams, now: Date = new Date()): JourneyPlan {
  const minutes = Number.isFinite(p.minutes) ? Math.min(MAX_MINUTES, Math.max(0, p.minutes)) : 0;
  const budget = Math.floor(minutes * 60);
  const watchable = cat.videos.filter((v) => {
    const access = cat.effectiveAccess(v, now);
    const runtime = cat.runtime(v);
    return runtime !== null && runtime > 0 && (access === 'free' || (access === 'premium' && p.premium));
  });

  // Seeded jitter per video, drawn in catalogue order so it is stable for a given seed.
  const rng = mulberry32(p.seed);
  const jitter = new Map(watchable.map((v) => [v.id, rng()]));

  const scope = whereScope(cat, p.where);
  const matches: Record<Constraint, (v: Video) => boolean> = {
    mood: (v) => !p.mood || v.moods.includes(p.mood),
    interest: (v) => !p.interest || v.categories.includes(p.interest),
    where: (v) => !scope || v.places.some((pl) => scope.has(pl)),
  };
  const wanted = RELAX_ORDER.filter((c) => Boolean(p[c]));
  const bonus = (v: Video) => MATCH_BONUS * wanted.filter((c) => matches[c](v)).length + VARIETY_BONUS * (jitter.get(v.id) ?? 0);

  let best: { picked: Video[]; total: number; relaxed: Constraint[] } | null = null;
  for (let k = 0; k <= wanted.length; k++) {
    const active = wanted.slice(k);
    const pool = watchable.filter((v) => active.every((c) => matches[c](v)));
    const solution = fillBudget(cat, pool, budget, bonus);
    if (!best || solution.total > best.total) best = { ...solution, relaxed: wanted.slice(0, k) };
    if (solution.total >= budget * MIN_FILL) break;
  }
  const { picked, total, relaxed } = best!;

  const ordered = narrativeOrder(picked);
  const items = ordered.map((video, i) => ({ video, reasons: reasonsFor(cat, p, video, ordered[i - 1], scope) }));
  return {
    items,
    totalSeconds: total,
    budgetSeconds: budget,
    relaxed,
    explanation: explain(cat, p, items.length, total, budget, wanted, relaxed),
  };
}

/** Place ids that satisfy `where`: a place and its descendants, or both ends of a route. */
function whereScope(cat: Catalogue, where: ID | undefined): Set<ID> | null {
  if (!where) return null;
  if (kindOf(where) === 'route') {
    const r = cat.get(where) as Route | undefined;
    return r ? new Set([...cat.placeScope(r.from), ...cat.placeScope(r.to)]) : new Set();
  }
  return kindOf(where) === 'place' && cat.get(where) ? cat.placeScope(where) : new Set();
}

/**
 * Exact 0/1 knapsack on whole seconds (runtimes rounded up, so the real total never exceeds
 * the budget). best[c] = highest bonus of any set whose rounded runtimes sum to exactly c.
 */
function fillBudget(cat: Catalogue, pool: Video[], budget: number, bonusOf: (v: Video) => number): { picked: Video[]; total: number } {
  if (budget <= 0) return { picked: [], total: 0 };
  const items = pool
    .map((v) => ({ v, w: Math.ceil(cat.runtime(v) ?? 0), b: bonusOf(v) }))
    .filter((it) => it.w > 0 && it.w <= budget)
    .sort((a, b) => b.b - a.b)
    .slice(0, MAX_POOL);
  if (!items.length) return { picked: [], total: 0 };

  const best = new Float64Array(budget + 1).fill(-Infinity);
  best[0] = 0;
  const took = items.map(() => new Uint8Array(budget + 1));
  items.forEach((it, i) => {
    for (let c = budget; c >= it.w; c--) {
      const candidate = best[c - it.w] + it.b;
      if (candidate > best[c]) {
        best[c] = candidate;
        took[i][c] = 1;
      }
    }
  });

  let fullest = budget;
  while (fullest > 0 && best[fullest] === -Infinity) fullest--;
  // Within a few seconds of the fullest fill, prefer the better-matching / seeded set.
  const tolerance = Math.min(60, Math.max(10, Math.round(budget * 0.03)));
  let pick = fullest;
  for (let c = fullest - 1; c >= Math.max(0, fullest - tolerance); c--) if (best[c] > best[pick]) pick = c;

  const picked: Video[] = [];
  for (let i = items.length - 1, c = pick; i >= 0 && c > 0; i--) {
    if (took[i][c]) {
      picked.push(items[i].v);
      c -= items[i].w;
    }
  }
  return { picked, total: picked.reduce((sum, v) => sum + (cat.runtime(v) ?? 0), 0) };
}

const asc = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
const settingYear = (v: Video) => v.setting?.from ?? Infinity;

/** Programme groups (in series order) and standalone stories, ordered by setting year. */
function narrativeOrder(videos: Video[]): Video[] {
  const groups = new Map<string, Video[]>();
  for (const v of videos) {
    const key = v.programme ?? v.id;
    const list = groups.get(key);
    if (list) list.push(v);
    else groups.set(key, [v]);
  }
  const inSeries = (a: Video, b: Video) =>
    asc(a.season ?? 0, b.season ?? 0) || asc(a.order ?? Infinity, b.order ?? Infinity) || asc(settingYear(a), settingYear(b)) || a.title.localeCompare(b.title);
  const anchor = (list: Video[]) => Math.min(...list.map(settingYear));
  return [...groups.values()]
    .map((list) => list.sort(inSeries))
    .sort((a, b) => asc(anchor(a), anchor(b)) || a[0].title.localeCompare(b[0].title))
    .flat();
}

function reasonsFor(cat: Catalogue, p: JourneyParams, v: Video, prev: Video | undefined, scope: Set<ID> | null): Reason[] {
  const out: Reason[] = [];
  if (p.interest && v.categories.includes(p.interest)) out.push({ kind: 'category', label: `Because you picked ${cat.label(p.interest)}`, via: p.interest });
  if (p.where && scope && v.places.some((pl) => scope.has(pl))) {
    const whereLabel = cat.label(p.where);
    if (kindOf(p.where) === 'route') out.push({ kind: 'route', label: `On ${whereLabel}`, via: p.where });
    else if (v.places.includes(p.where)) out.push({ kind: 'place', label: `Set in ${whereLabel}`, via: p.where });
    else {
      const inside = v.places.find((pl) => scope.has(pl))!;
      out.push({ kind: 'place-family', label: `Set in ${cat.label(inside)}, part of ${whereLabel}`, via: p.where });
    }
  }
  if (p.mood && v.moods.includes(p.mood)) out.push({ kind: 'mood', label: `Fits a ${MOOD_LABELS[p.mood]} mood` });
  if (prev?.programme && prev.programme === v.programme) out.push({ kind: 'series-order', label: `Continues ${cat.label(v.programme)}`, via: v.programme });
  if (out.length) return out;

  // Added to fill the time after relaxing: say what the story is instead.
  const period = v.setting ? cat.periodsForYears(v.setting.from, v.setting.to)[0] : undefined;
  if (period) return [{ kind: 'period', label: `Set in ${periodPhrase(period.label)}`, via: period.id }];
  if (v.places[0]) return [{ kind: 'place', label: `Set in ${cat.label(v.places[0])}`, via: v.places[0] }];
  if (v.categories[0]) return [{ kind: 'category', label: `Filed under ${cat.label(v.categories[0])}`, via: v.categories[0] }];
  return [{ kind: 'category', label: 'Fits your time window' }];
}

function explain(cat: Catalogue, p: JourneyParams, count: number, total: number, budget: number, wanted: Constraint[], relaxed: Constraint[]): string {
  const budgetMinutes = Math.round(budget / 60);
  if (!count) {
    return `Nothing you can watch right now fits in ${budgetMinutes} ${budgetMinutes === 1 ? 'minute' : 'minutes'}${wanted.length ? ', even with your choices widened' : ''} — try a longer window.`;
  }
  const kept = (c: Constraint) => wanted.includes(c) && !relaxed.includes(c);
  const mood = kept('mood') && p.mood ? `${MOOD_LABELS[p.mood]} ` : '';
  const through = kept('interest') && p.interest ? ` through ${cat.label(p.interest)}` : '';
  const where = kept('where') && p.where ? (kindOf(p.where) === 'route' ? ` along ${cat.label(p.where)}` : ` around ${cat.label(p.where)}`) : '';
  const stops = `${NUMBER_WORDS[count] ?? count} ${count === 1 ? 'stop' : 'stops'}`;
  const widened = relaxed.map((c) =>
    c === 'mood' && p.mood ? `${MOOD_LABELS[p.mood]} mood` : c === 'interest' && p.interest ? `interest in ${cat.label(p.interest)}` : `focus on ${cat.label(p.where ?? '')}`,
  );
  const relaxedPhrase = widened.length ? `, widened beyond your ${listPhrase(widened)} to fill the time` : '';
  const totalMinutes = Math.max(1, Math.round(total / 60));
  return `A ${totalMinutes}-minute ${mood}journey${through}${where} in ${stops}, fitted to your ${budgetMinutes}-minute window${relaxedPhrase}.`;
}
