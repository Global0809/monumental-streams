import { describe, expect, it } from 'vitest';
import { planJourney } from '../../shared/journey.ts';
import type { JourneyParams, JourneyPlan } from '../../shared/journey.ts';
import type { Video } from '../../shared/types.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const plan = (p: Partial<JourneyParams>): JourneyPlan => planJourney(cat, { minutes: 30, seed: 1, premium: false, ...p }, NOW);

/** Largest total runtime of any subset of `videos` that fits the budget (brute force). */
function bestFill(videos: Video[], budget: number): number {
  const runtimes = videos.map((v) => cat.runtime(v) ?? 0);
  let best = 0;
  for (let mask = 0; mask < 1 << runtimes.length; mask++) {
    let total = 0;
    for (let i = 0; i < runtimes.length; i++) if (mask & (1 << i)) total += runtimes[i];
    if (total <= budget && total > best) best = total;
  }
  return best;
}

const watchable = (premium: boolean) =>
  cat.videos.filter((v) => {
    const access = cat.effectiveAccess(v, NOW);
    return cat.runtime(v) !== null && (access === 'free' || (premium && access === 'premium'));
  });

describe('planJourney', () => {
  it('never exceeds the budget and fills it about as fully as possible', () => {
    for (const premium of [false, true]) {
      const pool = watchable(premium);
      for (const minutes of [1, 2, 4, 5, 8, 10, 15, 20, 25, 30, 45, 60, 90]) {
        for (const seed of [1, 7, 42]) {
          const p = plan({ minutes, seed, premium });
          const sum = p.items.reduce((s, i) => s + (cat.runtime(i.video) ?? 0), 0);
          expect(p.budgetSeconds).toBe(minutes * 60);
          expect(p.totalSeconds).toBe(sum);
          expect(p.totalSeconds).toBeLessThanOrEqual(p.budgetSeconds);
          const tolerance = Math.min(60, Math.max(10, Math.round(p.budgetSeconds * 0.03)));
          expect(p.totalSeconds).toBeGreaterThanOrEqual(bestFill(pool, p.budgetSeconds) - tolerance);
          expect(new Set(p.items.map((i) => i.video.id)).size).toBe(p.items.length);
        }
      }
    }
  });

  it('only uses playable titles the viewer may watch', () => {
    for (const premium of [false, true]) {
      const p = plan({ minutes: 120, premium });
      for (const { video } of p.items) {
        const access = cat.effectiveAccess(video, NOW);
        expect(access).not.toBe('unavailable');
        if (!premium) expect(access).toBe('free');
      }
    }
    expect(plan({ minutes: 120, premium: true }).items.map((i) => i.video.slug)).toContain('block-party'); // early access
    expect(plan({ minutes: 120, premium: false }).items.map((i) => i.video.slug)).not.toContain('block-party');
  });

  it('is deterministic for a given seed', () => {
    const params = { minutes: 25, seed: 1234, premium: true, interest: 'interest:music' };
    expect(plan(params)).toEqual(plan(params));
  });

  it('keeps every requested constraint when enough matches', () => {
    const p = plan({ minutes: 15, interest: 'interest:film' });
    expect(p.relaxed).toEqual([]);
    expect(p.items.every((i) => i.video.categories.includes('interest:film'))).toBe(true);
    expect(p.items[0].reasons[0]).toEqual({ kind: 'category', label: 'Because you picked Film', via: 'interest:film' });
  });

  it('relaxes mood first, then interest, then where', () => {
    const moodOnly = plan({ minutes: 10, interest: 'interest:film', mood: 'late' });
    expect(moodOnly.relaxed).toEqual(['mood']);
    expect(moodOnly.items.every((i) => i.video.categories.includes('interest:film'))).toBe(true);

    const everything = plan({ minutes: 30, interest: 'interest:art', mood: 'late', where: 'place:loiza' });
    expect(everything.relaxed).toEqual(['mood', 'interest', 'where']);
    expect(everything.totalSeconds).toBeGreaterThan(everything.budgetSeconds * 0.6);

    const where = plan({ minutes: 20, where: 'place:miami' });
    expect(where.relaxed).toEqual(['where']);
    // Items that still match are preferred and say so.
    expect(where.items.some((i) => i.reasons.some((r) => r.label === 'Set in Miami'))).toBe(true);
  });

  it('understands places by scope and routes by their two ends', () => {
    const miami = plan({ minutes: 4, where: 'place:miami', seed: 3 });
    expect(miami.relaxed).toEqual([]);
    expect(miami.items.every((i) => i.video.places.some((p) => cat.placeScope('place:miami').has(p)))).toBe(true);
    const wynwood = miami.items.find((i) => i.video.slug === 'wynwood-walls');
    if (wynwood) expect(wynwood.reasons[0].label).toBe('Set in Wynwood, part of Miami');

    const route = plan({ minutes: 14, where: 'route:san-juan-to-new-york' });
    expect(route.relaxed).toEqual([]);
    expect(route.items.map((i) => i.video.slug).sort()).toEqual(['subway-1905', 'viejo-san-juan']);
    expect(route.items[0].reasons[0].label).toBe('On La Gran Migración');
  });

  it('orders the plan as a narrative: programme order, then setting year', () => {
    const p = plan({ minutes: 60, premium: true, seed: 5 });
    const groupKey = (v: Video) => v.programme ?? v.id;
    const firstYear = new Map<string, number>();
    p.items.forEach(({ video }) => {
      const key = groupKey(video);
      if (!firstYear.has(key)) firstYear.set(key, Math.min(...p.items.filter((i) => groupKey(i.video) === key).map((i) => i.video.setting?.from ?? Infinity)));
    });
    // Programme members are contiguous and in series order…
    for (const key of firstYear.keys()) {
      const idx = p.items.flatMap((i, n) => (groupKey(i.video) === key ? [n] : []));
      expect(idx.at(-1)! - idx[0]).toBe(idx.length - 1);
      const orders = idx.map((n) => p.items[n].video.order ?? 0);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
    // …and groups advance through history.
    const years = [...firstYear.values()];
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('explains itself in one sentence, and every item has a reason', () => {
    const p = plan({ minutes: 10, interest: 'interest:film', mood: 'late' });
    expect(p.explanation).toBe('A 9-minute journey through Film in one stop, fitted to your 10-minute window, widened beyond your late-night mood to fill the time.');
    for (const minutes of [5, 30, 90]) {
      const q = plan({ minutes, mood: 'chill', where: 'place:miami' });
      expect(q.explanation).toMatch(/^[A-Z][^.]*\.$/);
      for (const item of q.items) expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty, explained plan when nothing fits', () => {
    const p = plan({ minutes: 0.5 });
    expect(p.items).toEqual([]);
    expect(p.totalSeconds).toBe(0);
    expect(p.explanation).toMatch(/^Nothing you can watch right now fits/);
    expect(plan({ minutes: Number.NaN }).items).toEqual([]);
  });
});
