import { describe, expect, it } from 'vitest';
import {
  applyRelaxation,
  collectionVideos,
  defaultDiscovery,
  discoveryWith,
  durationBucket,
  isDefaultDiscovery,
  searchCatalogue,
} from '../../shared/search.ts';
import type { Collection, DiscoveryState, Video } from '../../shared/types.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const search = (patch: Partial<DiscoveryState>, now: Date = NOW) => searchCatalogue(cat, discoveryWith(patch), now);
const slugs = (patch: Partial<DiscoveryState>, now?: Date) => search(patch, now).results.map((h) => h.video.slug);
const slugSet = (patch: Partial<DiscoveryState>) => new Set(slugs(patch));
const video = (slug: string) => cat.bySlug('video', slug) as Video;

describe('discovery state', () => {
  it('has the documented defaults', () => {
    expect(defaultDiscovery()).toEqual({
      q: '',
      interests: [],
      places: [],
      periods: [],
      access: 'all',
      duration: 'any',
      provenance: [],
      playableOnly: false,
      sort: 'relevance',
    });
    expect(isDefaultDiscovery(defaultDiscovery())).toBe(true);
    expect(isDefaultDiscovery(discoveryWith({ q: '   ' }))).toBe(true);
  });

  it.each<Partial<DiscoveryState>>([{ q: 'x' }, { interests: ['interest:music'] }, { access: 'free' }, { duration: 'under-5' }, { playableOnly: true }, { sort: 'newest' }])(
    'is not default once %o is set',
    (patch) => expect(isDefaultDiscovery(discoveryWith(patch))).toBe(false),
  );
});

describe('text search', () => {
  it('folds diacritics in both the query and the content', () => {
    expect(slugs({ q: 'loiza' })).toEqual(['bomba-loiza']);
    expect(slugs({ q: 'LOÍZA' })).toEqual(['bomba-loiza']);
  });

  it('matches the last token as a prefix for search-as-you-type', () => {
    expect(slugs({ q: 'wynw' })).toEqual(['wynwood-walls']);
    expect(slugs({ q: 'brixton so' })).toContain('brixton-sound');
    // …but only the last token: an unfinished earlier word must still match exactly.
    expect(search({ q: 'wynw walls' }).total).toBe(0);
  });

  it('tolerates one edit in words of five or more letters, at reduced weight', () => {
    const exact = search({ q: 'wynwood' }).results[0];
    const typo = search({ q: 'wynwod' }).results[0];
    expect(typo.video.slug).toBe('wynwood-walls');
    expect(typo.score).toBeLessThan(exact.score);
    expect(slugs({ q: 'brxiton' })).toContain('brixton-sound'); // adjacent transposition
    // Short words are never fuzzy-matched.
    expect(search({ q: 'loza bomba' }).total).toBe(0);
    expect(slugs({ q: 'loiza bomba' })).toEqual(['bomba-loiza']);
  });

  it('requires every token to match some field', () => {
    expect(slugSet({ q: 'brixton music' })).toEqual(new Set(['brixton-sound', 'wavemakers-ep2']));
    expect(search({ q: 'brixton miami' }).total).toBe(0);
  });

  it('ranks title matches first and reports what matched', () => {
    const [top] = search({ q: 'miami' }).results;
    expect(top.video.slug).toBe('miami-bass-reel');
    expect(top.matched[0]).toBe('title');
    expect(top.matched).toEqual(expect.arrayContaining(['place: Miami', 'movement: Miami bass']));
  });

  it('searches place ancestors and aliases', () => {
    expect(slugSet({ q: 'florida' })).toEqual(new Set(['wavemakers-teaser', 'miami-bass-reel', 'south-beach-deco', 'wynwood-walls', 'calle-ocho-nights']));
    expect(slugSet({ q: 'magic city' })).toEqual(new Set(['wavemakers-teaser', 'miami-bass-reel', 'wynwood-walls', 'calle-ocho-nights']));
    const [hit] = search({ q: 'calle ocho' }).results;
    expect(hit.video.slug).toBe('calle-ocho-nights');
    expect(hit.matched).toContain('place: Little Havana');
  });

  it('joins split words ("hiphop" finds "Hip hop") and ignores stopwords', () => {
    expect(slugSet({ q: 'hiphop' })).toEqual(new Set(['block-party', 'wavemakers-ep2']));
    expect(slugs({ q: 'the bronx' })).toEqual(slugs({ q: 'bronx' }));
  });

  it('rewards words typed in their original order', () => {
    const inOrder = search({ q: 'brixton sound' }).results.find((h) => h.video.slug === 'brixton-sound')!;
    const reversed = search({ q: 'sound brixton' }).results.find((h) => h.video.slug === 'brixton-sound')!;
    expect(inOrder.score).toBeGreaterThan(reversed.score);
  });

  it('suggests matching entities of other kinds', () => {
    const entities = search({ q: 'miami' }).entities;
    expect(entities[0]).toMatchObject({ id: 'place:miami', kind: 'place', label: 'Miami' });
    expect(entities.map((e) => e.id)).toEqual(expect.arrayContaining(['movement:miami-bass', 'place:miami-beach', 'place:miami-dade']));
    expect(entities.length).toBeLessThanOrEqual(8);
    expect(search({ q: 'hiphop' }).entities[0]).toMatchObject({ id: 'movement:hip-hop', kind: 'movement' });
    expect(search({ q: 'music' }).entities[0]).toMatchObject({ id: 'interest:music', kind: 'interest' });
    expect(search({}).entities).toEqual([]);
  });
});

describe('filters', () => {
  it('include descendant places (Miami includes Wynwood) but not siblings (Miami Beach)', () => {
    expect(slugSet({ places: ['place:miami'] })).toEqual(new Set(['wavemakers-teaser', 'miami-bass-reel', 'wynwood-walls', 'calle-ocho-nights']));
    expect(slugs({ places: ['place:miami-dade'] })).toContain('south-beach-deco');
    expect(slugs({ places: ['place:uk'] }).sort()).toEqual(['brixton-sound', 'wavemakers-ep2']);
  });

  it('combine with OR inside a facet and AND across facets', () => {
    const music = slugs({ interests: ['interest:music'] });
    const art = slugs({ interests: ['interest:art'] });
    expect(slugSet({ interests: ['interest:music', 'interest:art'] })).toEqual(new Set([...music, ...art]));
    expect(slugSet({ interests: ['interest:music'], places: ['place:miami'] })).toEqual(new Set(['wavemakers-teaser', 'miami-bass-reel', 'calle-ocho-nights']));
    expect(slugs({ interests: ['interest:music'], places: ['place:miami'], access: 'free', duration: 'under-5', q: 'bass' })).toEqual(['miami-bass-reel']);
  });

  it('match periods against the historical setting, never the publication date', () => {
    // Every fixture video was published in 2026.
    expect(slugs({ periods: ['period:1900s'] })).toEqual(['subway-1905']);
    expect(slugs({ periods: ['period:2020s'] })).not.toContain('subway-1905');
    expect(slugSet({ periods: ['period:1950s'] })).toEqual(new Set(['wavemakers-ep1', 'viejo-san-juan']));
    // Timeless stories never match a period.
    expect(slugs({ periods: cat.periods.map((p) => p.id) })).not.toContain('signal-loop');
  });

  it('use effective access at the given moment (early access counts as premium until public)', () => {
    expect(slugSet({ access: 'premium' })).toEqual(new Set(['south-beach-deco', 'block-party', 'brixton-sound']));
    expect(slugs({ access: 'free' })).not.toContain('block-party');
    expect(slugs({ access: 'free' })).not.toContain('calle-ocho-nights'); // coming soon: unavailable
    expect(slugs({ access: 'free' }, new Date('2026-12-01T00:00:00Z'))).toContain('block-party');
  });

  it('bucket durations on measured runtime and drop unknown runtimes', () => {
    expect(slugSet({ duration: 'under-5' })).toEqual(new Set(['wavemakers-teaser', 'wynwood-walls', 'miami-bass-reel', 'signal-loop']));
    expect(slugSet({ duration: '5-to-20' })).toEqual(new Set(['subway-1905', 'calle-ocho-nights', 'viejo-san-juan', 'south-beach-deco', 'bomba-loiza']));
    expect(slugSet({ duration: 'over-20' })).toEqual(new Set(['block-party', 'brixton-sound']));
    expect([durationBucket(299), durationBucket(300), durationBucket(1200), durationBucket(1201), durationBucket(null)]).toEqual([
      'under-5',
      '5-to-20',
      '5-to-20',
      'over-20',
      null,
    ]);
  });

  it('map provenance filters, counting original-programme videos as originals', () => {
    expect(slugSet({ provenance: ['original'] })).toEqual(new Set(['wavemakers-teaser', 'wavemakers-ep1', 'wavemakers-ep2']));
    expect(slugSet({ provenance: ['archive'] })).toEqual(new Set(['subway-1905', 'viejo-san-juan']));
    expect(slugSet({ provenance: ['open-cinema'] })).toEqual(new Set(['block-party', 'bomba-loiza', 'brixton-sound']));
    expect(slugs({ provenance: ['studio'] })).toHaveLength(6);
  });

  it('keep only playable titles when asked', () => {
    const playable = slugs({ playableOnly: true });
    expect(playable).toHaveLength(10);
    expect(playable).not.toContain('wavemakers-ep1');
    expect(playable).not.toContain('calle-ocho-nights');
  });
});

describe('facet counts', () => {
  it('ignore their own selection while applying every other constraint', () => {
    const r = search({ interests: ['interest:music'], places: ['place:miami'] });
    expect(r.facets.interests['interest:music']).toBe(3);
    expect(r.facets.interests['interest:art']).toBe(1); // Wynwood, within Miami
    expect(r.facets.places['place:miami']).toBe(3);
    expect(r.facets.places['place:brixton']).toBe(2); // music in Brixton, outside Miami
    // What a facet promises is what toggling it yields.
    expect(search({ interests: ['interest:art'], places: ['place:miami'] }).total).toBe(r.facets.interests['interest:art']);
    expect(search({ interests: ['interest:music'], places: ['place:brixton'] }).total).toBe(r.facets.places['place:brixton']);
  });

  it('count access, duration and provenance under the text query', () => {
    const r = search({ q: 'miami', access: 'free' });
    expect(r.facets.access).toEqual({ free: 3, premium: 1 }); // Calle Ocho Nights is not yet available
    expect(r.facets.duration).toEqual({ any: 3, 'under-5': 3, '5-to-20': 0, 'over-20': 0 });
    expect(r.facets.provenance.studio).toBe(3);
  });

  it('list every catalogue value, including zeros', () => {
    const { facets } = search({ q: 'loiza' });
    expect(Object.keys(facets.places)).toHaveLength(cat.places.length);
    expect(Object.keys(facets.periods)).toHaveLength(cat.periods.length);
    expect(facets.places['place:cuba']).toBe(0);
    expect(facets.places['place:puerto-rico']).toBe(1); // counted through the Loíza → Puerto Rico ancestry
  });
});

describe('sorting', () => {
  it('relevance without a query: playable first, then newest published', () => {
    const order = slugs({});
    const playable = order.map((s) => cat.isPlayable(video(s), NOW));
    expect(playable.lastIndexOf(true)).toBeLessThan(playable.indexOf(false));
    expect(order.slice(0, 3)).toEqual(['block-party', 'subway-1905', 'wavemakers-teaser']);
    expect(order.slice(-3)).toEqual(['calle-ocho-nights', 'wavemakers-ep2', 'wavemakers-ep1']);
  });

  it('newest by publication date', () => {
    expect(slugs({ sort: 'newest' }).slice(0, 3)).toEqual(['calle-ocho-nights', 'block-party', 'wavemakers-ep2']);
  });

  it('by historical setting, timeless last', () => {
    const oldest = slugs({ sort: 'setting-oldest' });
    expect(oldest[0]).toBe('subway-1905');
    expect(oldest.at(-1)).toBe('signal-loop');
    const newest = slugs({ sort: 'setting-newest' });
    expect(newest[0]).toBe('wavemakers-teaser');
    expect(newest.at(-1)).toBe('signal-loop');
  });

  it('by runtime, unknown runtimes last', () => {
    const shortest = slugs({ sort: 'shortest' });
    expect(shortest.slice(0, 2)).toEqual(['signal-loop', 'wavemakers-teaser']);
    expect(shortest.slice(-2).sort()).toEqual(['wavemakers-ep1', 'wavemakers-ep2']);
    const longest = slugs({ sort: 'longest' });
    expect(longest[0]).toBe('block-party');
    expect(longest.slice(-2).sort()).toEqual(['wavemakers-ep1', 'wavemakers-ep2']);
  });
});

describe('relaxations', () => {
  it('suggest single widenings that would yield more, best first', () => {
    const state = discoveryWith({ places: ['place:brixton'], access: 'free' });
    const r = searchCatalogue(cat, state, NOW);
    expect(r.total).toBe(0);
    expect(r.relaxations).toEqual([
      { key: 'places', value: 'place:brixton', label: 'Remove Brixton', count: 7 },
      { key: 'access', label: 'Include premium titles', count: 2 },
    ]);
    for (const relaxation of r.relaxations) {
      expect(searchCatalogue(cat, applyRelaxation(state, relaxation), NOW).total).toBe(relaxation.count);
    }
  });

  it('offer dropping one query word at a time', () => {
    const state = discoveryWith({ q: 'brixton miami' });
    const r = searchCatalogue(cat, state, NOW);
    const words = r.relaxations.filter((x) => x.key === 'q' && x.value);
    expect(words.map((w) => w.value).sort()).toEqual(['brixton', 'miami']);
    const withoutMiami = applyRelaxation(state, words.find((w) => w.value === 'miami')!);
    expect(withoutMiami.q).toBe('brixton');
    expect(searchCatalogue(cat, withoutMiami, NOW).total).toBe(words.find((w) => w.value === 'miami')!.count);
    expect(r.relaxations.find((x) => x.key === 'q' && !x.value)?.label).toBe('Clear the search “brixton miami”');
  });

  it('reset multi-value facets as a whole', () => {
    const state = discoveryWith({ interests: ['interest:film', 'interest:art'], duration: 'over-20' });
    const r = searchCatalogue(cat, state, NOW);
    expect(r.total).toBe(0);
    const interests = r.relaxations.find((x) => x.key === 'interests')!;
    expect(interests).toMatchObject({ label: 'Any interest', count: 2 });
    expect(interests.value).toBeUndefined();
    expect(applyRelaxation(state, interests).interests).toEqual([]);
  });

  it('are only offered for empty or near-empty results', () => {
    expect(search({}).relaxations).toEqual([]);
    expect(search({ places: ['place:miami'] }).relaxations).toEqual([]);
  });
});

describe('collections', () => {
  it('resolve hand-picked items in order and rules through search', () => {
    const [gateway, picks] = cat.collections as [Collection, Collection];
    expect(new Set(collectionVideos(cat, gateway, NOW).map((v) => v.slug))).toEqual(slugSet({ places: ['place:miami'] }));
    expect(collectionVideos(cat, picks, NOW).map((v) => v.slug)).toEqual(['viejo-san-juan', 'subway-1905']);
  });
});
