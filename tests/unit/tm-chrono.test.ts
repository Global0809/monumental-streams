import { describe, expect, it } from 'vitest';
import type { Period } from '../../shared/types.ts';
import {
  angleToIndex,
  decadeContext,
  dialValueText,
  lensCounts,
  movementSpan,
  movementYears,
  nearestStoried,
  parseLens,
  pickDefaultPeriod,
  resolveEra,
  videosInLens,
} from '../../src/features/time/chrono.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const period = (slug: string) => cat.bySlug('period', slug) as Period;
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe('lenses', () => {
  it('parses the lens parameter with setting as the default', () => {
    expect(parseLens(null)).toBe('setting');
    expect(parseLens('made')).toBe('made');
    expect(parseLens('published')).toBe('published');
    expect(parseLens('nonsense')).toBe('setting');
  });

  it('never confuses setting with publication', () => {
    expect(ids(videosInLens(cat, period('1900s'), 'setting'))).toEqual(['video:subway-1905']);
    expect(ids(videosInLens(cat, period('1900s'), 'made'))).toEqual(['video:subway-1905']);
    expect(videosInLens(cat, period('1900s'), 'published')).toEqual([]);
    const published2020s = ids(videosInLens(cat, period('2020s'), 'published'));
    expect(published2020s).toContain('video:subway-1905');
    expect(published2020s[0]).toBe('video:calle-ocho-nights'); // newest first (2026-10-15)
    expect(ids(videosInLens(cat, period('2020s'), 'setting'))).not.toContain('video:subway-1905');
  });

  it('orders the setting lens by when stories begin', () => {
    const list = videosInLens(cat, period('1970s'), 'setting');
    const starts = list.map((v) => v.setting!.from);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('counts the setting lens exactly as periodCoverage', () => {
    const counts = lensCounts(cat, 'setting');
    for (const { period: p, count } of cat.periodCoverage()) expect(counts[p.id]).toBe(count);
    expect(lensCounts(cat, 'published')['period:2020s']).toBe(cat.videos.length);
  });
});

describe('choosing and resolving decades', () => {
  it('defaults to the decade with the most stories, else the 1900s', () => {
    const counts = lensCounts(cat, 'setting');
    const best = Math.max(...Object.values(counts));
    expect(counts[pickDefaultPeriod(cat.periods, counts)!.id]).toBe(best);
    expect(pickDefaultPeriod(cat.periods, {})!.slug).toBe('1900s');
  });

  it('names the nearest decades that have stories', () => {
    const counts: Record<string, number> = { 'period:1940s': 2, 'period:1990s': 1 };
    const i = cat.periods.findIndex((p) => p.slug === '1970s');
    const near = nearestStoried(cat.periods, counts, i);
    expect(near.before?.period.slug).toBe('1940s');
    expect(near.after?.period.slug).toBe('1990s');
    expect(nearestStoried(cat.periods, {}, i)).toEqual({});
  });

  it('resolves unknown eras to the nearest decade in range', () => {
    expect(resolveEra(cat, '1950s')).toMatchObject({ kind: 'known', period: { slug: '1950s' } });
    const early = resolveEra(cat, '1850s');
    expect(early.kind).toBe('unknown');
    if (early.kind === 'unknown') {
      expect(early.year).toBe(1850);
      expect(early.nearest?.slug).toBe('1900s');
      expect(early.first?.slug).toBe('1900s');
      expect(early.last?.slug).toBe('2020s');
    }
    const late = resolveEra(cat, '2090');
    expect(late.kind === 'unknown' && late.nearest?.slug).toBe('2020s');
    const word = resolveEra(cat, 'jazz-age');
    expect(word.kind === 'unknown' && word.nearest).toBeUndefined();
  });
});

describe('movement spans', () => {
  it('clips roots older than the axis and marks ongoing movements', () => {
    const s = movementSpan({ start: 1600, end: null }, 1900, 2029, 2026);
    expect(s.before).toBe(true);
    expect(s.ongoing).toBe(true);
    expect(s.left).toBe(0);
    expect(s.left + s.width).toBeCloseTo(((2026 + 1 - 1900) / 130) * 100);
  });

  it('places a bounded movement on its real years', () => {
    const s = movementSpan({ start: 1973, end: 1979 }, 1900, 2029, 2026);
    expect(s.before).toBe(false);
    expect(s.ongoing).toBe(false);
    expect(s.left).toBeCloseTo((73 / 130) * 100);
    expect(s.width).toBeCloseTo((7 / 130) * 100);
    expect(movementYears({ start: 1973, end: 1979 })).toBe('1973–1979');
    expect(movementYears({ start: 1950, end: null })).toBe('1950–present');
  });
});

describe('decade context and lineage', () => {
  it('finds roots, echoes forward, places and people for the 1970s', () => {
    const p = period('1970s');
    const ctx = decadeContext(cat, p, videosInLens(cat, p, 'setting'));
    expect(ids(ctx.movements)).toEqual(expect.arrayContaining(['movement:sound-system', 'movement:hip-hop', 'movement:nuyorican']));
    expect(ctx.roots.map((r) => [r.root.id, ids(r.into)])).toContainEqual(['movement:sound-system', ['movement:hip-hop']]);
    expect(ctx.echoes.map((e) => [e.echo.id, e.generation])).toContainEqual(['movement:miami-bass', 1]);
    expect(ctx.echoes.every((e) => e.echo.start > p.end)).toBe(true);
    expect(ids(ctx.places.map((x) => x.item))).toContain('place:bronx');
    expect(ids(ctx.people.map((x) => x.item))).toContain('person:desmond-hale');
  });

  it('keeps "today" links explained and above the threshold', () => {
    const p = period('1970s');
    const ctx = decadeContext(cat, p, videosInLens(cat, p, 'setting'));
    for (const t of ctx.today) {
      expect(t.reasons.length).toBeGreaterThan(0);
      expect(t.weight).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the dial', () => {
  it('describes its value for assistive tech', () => {
    expect(dialValueText(period('1940s'), 3, 2)).toBe('1940s — 3 stories, 2 movements');
    expect(dialValueText(period('1940s'), 1, 1)).toBe('1940s — 1 story, 1 movement');
  });

  it('maps clock angles to detents and clamps the seam', () => {
    const step = 270 / 12;
    expect(angleToIndex(-135, 13, -135, step)).toBe(0);
    expect(angleToIndex(0, 13, -135, step)).toBe(6);
    expect(angleToIndex(135, 13, -135, step)).toBe(12);
    expect(angleToIndex(170, 13, -135, step)).toBe(12);
    expect(angleToIndex(-170, 13, -135, step)).toBe(0);
    expect(angleToIndex(360 + 10, 13, -135, step)).toBe(6);
  });
});
