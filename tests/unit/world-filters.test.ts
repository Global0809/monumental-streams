import { describe, expect, it } from 'vitest';
import type { Place, Video } from '../../shared/types.ts';
import {
  activeFilterCount,
  cityLevelOf,
  eraDensity,
  erasForPlace,
  facetCounts,
  filterLabels,
  isFiltering,
  matchesMovement,
  matchesVideo,
  narrowsStories,
  NO_FILTERS,
  parseFilters,
  placeConnections,
  placedMatches,
  placeSignals,
  pushTrail,
  routeMatches,
  sectionCounts,
  without,
  writeFilters,
  type WorldFilters,
} from '../../src/features/atlas/filters.ts';
import { atlasHref, buildAtlasModel, placeTree, pruneEmpty, withCounts } from '../../src/features/atlas/model.ts';
import { fixtureCatalogue, NOW } from './fixture.ts';

const cat = fixtureCatalogue();
const lens = (f: Partial<WorldFilters>): WorldFilters => ({ ...NO_FILTERS, ...f });
const titles = (vs: Video[]) => vs.map((v) => v.title).sort();
const video = (slug: string) => cat.bySlug('video', slug) as Video;

describe('lens ⇄ URL', () => {
  it('reads every filter and ignores unknown or inconsistent values', () => {
    const f = parseFilters(new URLSearchParams('cat=culture&facet=art&era=1970s&access=free&stories=only'), cat);
    expect(f).toEqual({ section: 'culture', facet: 'interest:art', era: 'period:1970s', access: 'free', storiesOnly: true });
    // a facet that is not one of the section's facets, an unknown section, era and access
    expect(parseFilters(new URLSearchParams('cat=music&facet=art'), cat)).toEqual(lens({ section: 'music' }));
    expect(parseFilters(new URLSearchParams('cat=opera&era=1850s&access=gold&stories=yes'), cat)).toEqual(NO_FILTERS);
    // a facet without its section means nothing
    expect(parseFilters(new URLSearchParams('facet=art'), cat).facet).toBeNull();
  });

  it('writes the lens in a stable order after route and view, omitting defaults', () => {
    const f = lens({ section: 'culture', facet: 'interest:art', era: 'period:1970s', access: 'premium', storiesOnly: true });
    expect(writeFilters(new URLSearchParams(), f).toString()).toBe('cat=culture&facet=art&era=1970s&access=premium&stories=only');
    expect(writeFilters(new URLSearchParams(), NO_FILTERS).toString()).toBe('');
    expect(atlasHref('miami', { route: 'route:havana-little-havana', view: 'list', filters: f })).toBe(
      '/world/miami?route=havana-little-havana&view=list&cat=culture&facet=art&era=1970s&access=premium&stories=only',
    );
    expect(atlasHref('miami', { view: 'list', filters: NO_FILTERS })).toBe('/world/miami?view=list');
  });

  it('round-trips through the URL', () => {
    const f = lens({ section: 'movies', facet: 'interest:documentary', era: 'period:1900s', access: 'free' });
    expect(parseFilters(writeFilters(new URLSearchParams(), f), cat)).toEqual(f);
  });

  it('counts, labels and removes filters', () => {
    const f = lens({ section: 'culture', facet: 'interest:art', era: 'period:1930s', storiesOnly: true });
    expect(activeFilterCount(f)).toBe(4);
    expect(isFiltering(lens({ storiesOnly: true }))).toBe(true);
    expect(narrowsStories(lens({ storiesOnly: true }))).toBe(false);
    expect(filterLabels(cat, f).map((l) => l.label)).toEqual(['Culture', 'Art', '1930s', 'With stories only']);
    expect(without(f, 'section')).toEqual(lens({ era: 'period:1930s', storiesOnly: true }));
    expect(without(f, 'era').era).toBeNull();
  });
});

describe('matching', () => {
  it('a category is the union of its section interests; a facet narrows it', () => {
    const music = placedMatches(cat, lens({ section: 'music' }), NOW);
    expect(titles(music)).toContain('Block Party Blueprint');
    expect(titles(music)).not.toContain('Wynwood Walls in Motion');
    const docs = placedMatches(cat, lens({ section: 'movies', facet: 'interest:documentary' }), NOW);
    expect(titles(docs)).toEqual(['Interior New York Subway, 1905', 'Old San Juan, 1950']);
    // stories with no place are never on the map
    expect(titles(placedMatches(cat, NO_FILTERS, NOW))).not.toContain('Signal Loop');
  });

  it('an era matches the historical setting, not publication', () => {
    expect(matchesVideo(cat, video('subway-1905'), lens({ era: 'period:1900s' }), NOW)).toBe(true);
    expect(matchesVideo(cat, video('subway-1905'), lens({ era: 'period:2020s' }), NOW)).toBe(false);
    expect(matchesVideo(cat, video('signal-loop'), lens({ era: 'period:2020s' }), NOW)).toBe(false); // timeless
  });

  it('access is what you can watch now: early access counts as premium until it opens', () => {
    const blockParty = video('block-party');
    expect(matchesVideo(cat, blockParty, lens({ access: 'free' }), NOW)).toBe(false);
    expect(matchesVideo(cat, blockParty, lens({ access: 'premium' }), NOW)).toBe(true);
    expect(matchesVideo(cat, blockParty, lens({ access: 'free' }), new Date('2026-12-01'))).toBe(true);
    // planned programming is not watchable at any level
    expect(matchesVideo(cat, video('wavemakers-ep1'), lens({ access: 'premium' }), NOW)).toBe(false);
  });

  it('movements match on category and years alive, never on access', () => {
    const sound = cat.get('movement:sound-system') as Parameters<typeof matchesMovement>[1];
    expect(matchesMovement(cat, sound, lens({ section: 'music', era: 'period:1950s' }))).toBe(true);
    expect(matchesMovement(cat, sound, lens({ era: 'period:1940s' }))).toBe(false);
    expect(matchesMovement(cat, sound, lens({ section: 'movies' }))).toBe(false);
    expect(matchesMovement(cat, sound, lens({ access: 'free' }))).toBe(false);
  });
});

describe('what glows', () => {
  it('signals spread to every ancestor, and movements light places with no matching stories', () => {
    const s = placeSignals(cat, lens({ section: 'music', era: 'period:1970s' }), NOW);
    expect(s.get('place:bronx')?.stories).toBe(1);
    expect(s.get('place:new-york-city')?.stories).toBeGreaterThanOrEqual(1);
    expect(s.get('place:us')?.stories).toBeGreaterThanOrEqual(1);
    expect(s.get('place:london')?.stories).toBe(2); // Brixton Sound Systems + WAVEMAKERS ep. 2, set inside London
    expect(s.get('place:kingston')).toEqual({ stories: 0, movements: 1 }); // sound-system culture, alive then
    expect(s.get('place:miami')).toEqual({ stories: 0, movements: 0 });
  });

  it('no narrowing filter means no movement signal (only story counts)', () => {
    const s = placeSignals(cat, lens({ storiesOnly: true }), NOW);
    expect(s.get('place:kingston')).toEqual({ stories: 0, movements: 0 });
    expect(s.get('place:miami')?.stories).toBe(cat.videosForPlace('place:miami').length);
  });

  it('routes stay lit when alive in the era and carrying the category', () => {
    const r = cat.get('route:kingston-to-london') as Parameters<typeof routeMatches>[1];
    const f1 = lens({ era: 'period:1950s' });
    expect(routeMatches(cat, r, f1, placeSignals(cat, f1, NOW))).toBe(true);
    const f2 = lens({ era: 'period:1990s' });
    expect(routeMatches(cat, r, f2, placeSignals(cat, f2, NOW))).toBe(false);
    const f3 = lens({ section: 'music' });
    expect(routeMatches(cat, r, f3, placeSignals(cat, f3, NOW))).toBe(true); // sound-system culture is music
    const f4 = lens({ section: 'movies' });
    expect(routeMatches(cat, r, f4, placeSignals(cat, f4, NOW))).toBe(false);
  });

  it('counts each lens control under the rest of the lens', () => {
    const counts = sectionCounts(cat, lens({ era: 'period:1970s' }), NOW);
    expect(counts.get('music')).toBe(placedMatches(cat, lens({ section: 'music', era: 'period:1970s' }), NOW).length);
    expect(counts.get('sports')).toBe(0);
    const facets = facetCounts(cat, lens({ section: 'culture' }), NOW);
    expect([...facets.keys()]).toContain('interest:art');
    expect(facets.get('interest:art')).toBe(placedMatches(cat, lens({ section: 'culture', facet: 'interest:art' }), NOW).length);
    const density = eraDensity(cat, lens({ section: 'music' }), NOW);
    expect(density).toHaveLength(cat.periods.length);
    expect(density.find((d) => d.period.slug === '1970s')!.stories).toBeGreaterThan(0);
    expect(density.find((d) => d.period.slug === '1900s')!.stories).toBe(0);
  });

  it('the model seen through the lens, and "stories only" pruning', () => {
    const model = buildAtlasModel(cat);
    const signals = placeSignals(cat, lens({ section: 'movies' }), NOW);
    const seen = withCounts(model, signals);
    expect(seen.counts.get('place:new-york-city')).toBe(signals.get('place:new-york-city')!.stories);
    expect(seen.byId.get('place:miami')!.count).toBe(0);
    const pruned = pruneEmpty(placeTree(cat, seen.counts));
    const names = JSON.stringify(pruned.map((n) => n.place.name));
    expect(names).toContain('United States');
    expect(names).not.toContain('Jamaica');
    // the selected place is kept even when it holds nothing
    expect(JSON.stringify(pruneEmpty(placeTree(cat, seen.counts), 'place:kingston'))).toContain('Kingston');
  });
});

describe('a place in depth', () => {
  it('lists the eras it is present in: stories, movements and routes', () => {
    const eras = erasForPlace(cat, 'place:london');
    const by = new Map(eras.map((e) => [e.period.slug, e]));
    expect(by.get('1970s')!.stories).toBeGreaterThan(0);
    expect(by.get('1950s')!.routes).toBe(1); // Windrush crossings
    expect(by.get('1950s')!.movements.map((m) => m.slug)).toContain('sound-system');
    expect(by.has('1900s')).toBe(false);
  });

  it('connects places by route, shared movement and shared story — never by hierarchy', () => {
    const conns = placeConnections(cat, 'place:kingston');
    const london = conns.find((c) => c.place.id === 'place:london')!;
    expect(london.kind).toBe('migration');
    expect(london.reasons.map((r) => r.kind)).toEqual(['route', 'movement']);
    // Brixton (inside London) is collapsed into London rather than listed again
    expect(conns.some((c) => c.place.id === 'place:brixton')).toBe(false);
    const miami = placeConnections(cat, 'place:miami');
    expect(miami.some((c) => c.place.id === 'place:wynwood' || c.place.id === 'place:florida')).toBe(false);
    const nyc = placeConnections(cat, 'place:new-york-city').map((c) => c.place.id);
    expect(nyc).toContain('place:san-juan');
    expect(nyc).toContain('place:london');
  });

  it('finds the city a local place belongs to', () => {
    expect(cityLevelOf(cat, 'place:brixton')?.id).toBe('place:london');
    expect(cityLevelOf(cat, 'place:miami')?.id).toBe('place:miami');
    expect(cityLevelOf(cat, 'place:florida')).toBeUndefined();
    expect((cat.get('place:kingston') as Place).status).toBe('expanding');
  });
});

describe('recent-places trail', () => {
  it('keeps the most recent first, without duplicates, capped', () => {
    expect(pushTrail([], 'miami')).toEqual(['miami']);
    expect(pushTrail(['havana', 'miami'], 'miami')).toEqual(['miami', 'havana']);
    expect(pushTrail(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
