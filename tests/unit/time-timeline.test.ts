import { describe, expect, it } from 'vitest';
import type { Period } from '../../shared/types.ts';
import { LENSES, decadeContext, lensCounts, rangeContext, resolveEra, videosInLens } from '../../src/features/time/chrono.ts';
import {
  categoriesPresent,
  decadeRibbon,
  distanceLabel,
  inRange,
  nearestStories,
  nearestYears,
  parseYear,
  periodCounts,
  rangePhrase,
  readTimeParams,
  storiesIn,
  storySpan,
  timeHref,
  timeSearch,
  yearlyCounts,
  yearsOf,
} from '../../src/features/time/timeline.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const period = (slug: string) => cat.bySlug('period', slug) as Period;
const video = (slug: string) => cat.videos.find((v) => v.slug === slug)!;
const ids = (list: { id: string }[]) => list.map((x) => x.id);
const year = (y: number) => ({ start: y, end: y });
const ALL = { start: 1900, end: 2029 };

describe('years of a decade', () => {
  it('lists every year, but never years that have not happened', () => {
    expect(yearsOf(period('1940s'), 2026)).toEqual([1940, 1941, 1942, 1943, 1944, 1945, 1946, 1947, 1948, 1949]);
    expect(yearsOf(period('2020s'), 2026)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  });

  it('accepts only whole years inside the decade', () => {
    expect(parseYear('1942', period('1940s'))).toBe(1942);
    expect(parseYear(' 1949 ', period('1940s'))).toBe(1949);
    expect(parseYear('1955', period('1940s'))).toBeNull();
    expect(parseYear('1942.5')).toBeNull();
    expect(parseYear('nineteen')).toBeNull();
    expect(parseYear(null)).toBeNull();
    expect(parseYear('1955')).toBe(1955);
  });

  it('phrases a year or a decade', () => {
    expect(rangePhrase(period('1940s'), null)).toBe('the 1940s');
    expect(rangePhrase(period('1940s'), 1942)).toBe('1942');
  });
});

describe('matching stories to a year', () => {
  it('matches the setting lens on the historical setting span only', () => {
    // South Beach Deco is set 1930–1945; WAVEMAKERS ep. 1 1945–1965; Old San Juan 1949–1951.
    expect(ids(storiesIn(cat, 'setting', year(1944)))).toEqual(['video:south-beach-deco']);
    expect(ids(storiesIn(cat, 'setting', year(1945)))).toEqual(['video:south-beach-deco', 'video:wavemakers-ep1']);
    expect(ids(storiesIn(cat, 'setting', year(1949)))).toEqual(['video:wavemakers-ep1', 'video:viejo-san-juan']);
    expect(storiesIn(cat, 'setting', year(1912))).toEqual([]);
  });

  it('never confuses setting, making and publication', () => {
    const subway = video('subway-1905'); // set 1904–1905, made 1905, published 2026
    expect(storySpan(subway, 'setting')).toEqual({ start: 1904, end: 1905 });
    expect(storySpan(subway, 'made')).toEqual({ start: 1905, end: 1905 });
    expect(storySpan(subway, 'published')).toEqual({ start: 2026, end: 2026 });
    expect(inRange(subway, 'setting', year(1904))).toBe(true);
    expect(inRange(subway, 'made', year(1904))).toBe(false);
    expect(inRange(subway, 'published', year(1905))).toBe(false);
    // a timeless loop is never placed by its (missing) setting
    expect(storySpan(video('signal-loop'), 'setting')).toBeNull();
  });

  it('agrees with the decade lenses for every decade', () => {
    for (const lens of LENSES) {
      for (const p of cat.periods) expect(ids(storiesIn(cat, lens, p))).toEqual(ids(videosInLens(cat, p, lens)));
      expect(periodCounts(cat, lens)).toEqual(lensCounts(cat, lens));
    }
  });

  it('narrows by interest, and the counts follow', () => {
    expect(ids(storiesIn(cat, 'setting', period('1940s'), 'interest:art'))).toEqual(['video:south-beach-deco']);
    expect(periodCounts(cat, 'setting', 'interest:art')['period:1940s']).toBe(1);
    expect(periodCounts(cat, 'setting', 'interest:film')['period:1970s']).toBe(0);
  });

  it('counts stories per year in one pass', () => {
    const counts = yearlyCounts(cat, 'setting', period('1940s'));
    expect(counts.get(1940)).toBe(1);
    expect(counts.get(1945)).toBe(2);
    expect(counts.get(1949)).toBe(2);
    for (const [y, n] of counts) expect(n).toBe(storiesIn(cat, 'setting', year(y)).length);
    expect(yearlyCounts(cat, 'made', period('1900s')).get(1905)).toBe(1);
  });
});

describe('graceful emptiness', () => {
  it('names the nearest years that hold stories, across decades', () => {
    const counts = yearlyCounts(cat, 'setting', ALL);
    expect(nearestYears(counts, 1912, ALL)).toEqual({ before: { year: 1905, count: 1 }, after: { year: 1930, count: 1 } });
    expect(nearestYears(new Map(), 1912, ALL)).toEqual({});
  });

  it('offers the real stories closest in time, nearest first', () => {
    const near = nearestStories(cat, 'setting', year(1912), null, 2);
    expect(near.map((n) => [n.video.slug, n.distance, n.direction])).toEqual([
      ['subway-1905', 7, 'earlier'],
      ['south-beach-deco', 18, 'later'],
    ]);
    expect(distanceLabel(near[0])).toBe('7 years earlier');
    expect(distanceLabel({ distance: 1, direction: 'later' })).toBe('1 year later');
    // never offers a story that is already in the range
    expect(nearestStories(cat, 'setting', period('1940s')).some((n) => inRange(n.video, 'setting', period('1940s')))).toBe(false);
    // respects the interest filter
    expect(nearestStories(cat, 'setting', year(1912), 'interest:art', 5).every((n) => n.video.categories.includes('interest:art'))).toBe(true);
  });
});

describe('context for a single year', () => {
  it('lists categories with stories first, then those only movements carry', () => {
    const p = period('1970s');
    const stories = storiesIn(cat, 'setting', p);
    const ctx = decadeContext(cat, p, stories);
    const present = categoriesPresent(cat, stories, ctx.movements);
    expect(present[0].category.id).toBe('interest:music');
    expect(present[0].count).toBe(stories.filter((v) => v.categories.includes('interest:music')).length);
    const art = present.find((c) => c.category.id === 'interest:art');
    expect(art?.count).toBe(0);
    expect(ids(art?.movements ?? [])).toContain('movement:nuyorican');
    const counts = present.map((c) => c.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('narrows movements and echoes to the year', () => {
    const decade = decadeContext(cat, period('1970s'), []);
    const y1972 = rangeContext(cat, year(1972), []);
    expect(ids(decade.movements)).toContain('movement:hip-hop');
    expect(ids(y1972.movements)).not.toContain('movement:hip-hop'); // began 1973
    expect(y1972.echoes.map((e) => e.echo.id)).toContain('movement:hip-hop'); // drew on sound systems, started later
    expect(y1972.echoes.every((e) => e.echo.start > 1972)).toBe(true);
  });

  it('marks a story’s three dates on its decade ribbon', () => {
    const cells = decadeRibbon(video('subway-1905'), period('1900s'), 1904);
    expect(cells).toHaveLength(10);
    expect(cells.filter((c) => c.set).map((c) => c.year)).toEqual([1904, 1905]);
    expect(cells.filter((c) => c.made).map((c) => c.year)).toEqual([1905]);
    expect(cells.some((c) => c.published)).toBe(false);
    expect(cells.find((c) => c.selected)?.year).toBe(1904);
  });
});

describe('addresses', () => {
  it('resolves a bare year to its decade, but never a future or uncovered year', () => {
    expect(resolveEra(cat, '1942', 2026)).toMatchObject({ kind: 'known', period: { slug: '1940s' }, year: 1942 });
    expect(resolveEra(cat, '1940s', 2026)).toEqual({ kind: 'known', period: period('1940s') });
    expect(resolveEra(cat, '2028', 2026).kind).toBe('unknown');
    expect(resolveEra(cat, '1850', 2026)).toMatchObject({ kind: 'unknown', nearest: { slug: '1900s' } });
  });

  it('round-trips year, lens, interest and movement through the URL', () => {
    const s = readTimeParams(new URLSearchParams('lens=made&year=1942&interest=film&movement=hip-hop'), cat, period('1940s'));
    expect(s).toEqual({ year: 1942, lens: 'made', interest: 'interest:film', movement: 'hip-hop' });
    expect(timeSearch(cat, s)).toBe('?year=1942&lens=made&interest=film&movement=hip-hop');
    expect(timeHref(cat, period('1940s'), { year: null, lens: 'setting', interest: null, movement: null })).toBe('/time-machine/1940s');
  });

  it('ignores a year outside the decade and unknown slugs', () => {
    const s = readTimeParams(new URLSearchParams('year=1955&lens=sideways&interest=nope&movement=nope'), cat, period('1940s'));
    expect(s).toEqual({ year: null, lens: 'setting', interest: null, movement: null });
    expect(timeSearch(cat, s)).toBe('');
  });
});
