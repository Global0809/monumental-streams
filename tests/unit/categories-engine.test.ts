import { describe, expect, it } from 'vitest';
import { buildCatalogue } from '../../shared/catalogue.ts';
import { sectionById, videosForSection } from '../../shared/sections.ts';
import type { Video } from '../../shared/types.ts';
import {
  catStateFromParams,
  catStateToSearch,
  categoryStats,
  constellation,
  defaultSort,
  groupVideos,
  hash01,
  interestContext,
  isFilteredState,
  placeAnchor,
  relatedEras,
  relatedPlaces,
  sectionFacets,
  sortVideos,
  sourceOf,
  viewCategory,
  type CatState,
} from '../../src/features/category/engine.ts';
import { NOW, fixtureCatalogue, fixturePayload } from './fixture.ts';

const cat = fixtureCatalogue();
const movies = sectionById('movies');
const music = sectionById('music');
const culture = sectionById('culture');
const news = sectionById('news');
const sports = sectionById('sports');
const slugs = (list: Video[]) => list.map((v) => v.slug);
const state = (patch: Partial<CatState> = {}, section = music): CatState => ({ facet: null, sort: defaultSort(section), q: '', group: null, ...patch });

describe('facets', () => {
  it('Movies offers Fiction, Documentary and Archive (footage + interest facets)', () => {
    const f = sectionFacets(cat, movies);
    expect(f.map((x) => x.key)).toEqual(['fiction', 'documentary', 'archive']);
    expect(f.map((x) => x.label)).toEqual(['Fiction', 'Documentary', 'Archive']);
  });

  it('Culture offers its interest facets in authored order; Music has none', () => {
    expect(sectionFacets(cat, culture).map((x) => x.key)).toEqual(['culture', 'art', 'documentary', 'food', 'lifestyle']);
    expect(sectionFacets(cat, music)).toEqual([]);
  });
});

describe('viewCategory', () => {
  it('membership is derived from the catalogue (videosForSection), never hand-listed', () => {
    const v = viewCategory(cat, music, state(), NOW);
    expect(v.all).toHaveLength(videosForSection(cat, music).length);
    expect(v.all.every((x) => x.categories.includes('interest:music'))).toBe(true);
    expect(v.results).toHaveLength(v.all.length);
  });

  it('counts each facet within the current search, and the facet narrows the results', () => {
    const all = viewCategory(cat, movies, state({}, movies), NOW);
    expect(all.facetCounts).toEqual({ fiction: 0, documentary: 2, archive: 2 });
    const narrowed = viewCategory(cat, culture, state({ facet: 'art' }, culture), NOW);
    expect(narrowed.results.length).toBeGreaterThan(0);
    expect(narrowed.results.every((x) => x.categories.includes('interest:art'))).toBe(true);
    expect(narrowed.facet?.label).toBe('Art');
    expect(narrowed.searched).toBe(narrowed.all.length);
  });

  it('searches within the category only (typo-tolerant shared search), with facet counts following', () => {
    const v = viewCategory(cat, music, state({ q: 'bronx' }), NOW);
    expect(slugs(v.results)).toEqual(['block-party']);
    expect(v.searched).toBe(1);
    // a subway film matches "subway" but is not music
    expect(viewCategory(cat, music, state({ q: 'subway' }), NOW).results).toHaveLength(0);
    expect(slugs(viewCategory(cat, movies, state({ q: 'subway' }, movies), NOW).results)).toEqual(['subway-1905']);
  });

  it('an unknown facet in state is ignored rather than emptying the page', () => {
    const v = viewCategory(cat, music, state({ facet: 'nope' }), NOW);
    expect(v.facet).toBeNull();
    expect(v.results).toHaveLength(v.all.length);
  });
});

describe('sorting', () => {
  it('featured puts what can be watched now first and planned or dated titles last', () => {
    const v = viewCategory(cat, music, state(), NOW);
    const playable = v.results.map((x) => cat.isPlayable(x, NOW));
    const firstLocked = playable.indexOf(false);
    expect(firstLocked).toBeGreaterThan(0);
    expect(playable.slice(firstLocked).every((p) => !p)).toBe(true);
    expect(slugs(v.results).slice(firstLocked)).toEqual(expect.arrayContaining(['wavemakers-ep1', 'wavemakers-ep2', 'calle-ocho-nights']));
  });

  it('featured favours titles carrying the category’s primary interest', () => {
    // both free public-domain archive films; only Old San Juan is tagged Culture itself
    const order = slugs(viewCategory(cat, culture, state({}, culture), NOW).results);
    expect(order.indexOf('viejo-san-juan')).toBeLessThan(order.indexOf('subway-1905'));
  });

  it('era sorts by historical setting with timeless titles last', () => {
    const vids = viewCategory(cat, culture, state({ sort: 'era-old' }, culture), NOW).results;
    const years = vids.map((v) => v.setting?.from ?? null);
    const dated = years.filter((y): y is number => y !== null);
    expect(dated).toEqual([...dated].sort((a, b) => a - b));
    const firstNull = years.indexOf(null);
    if (firstNull >= 0) expect(years.slice(firstNull).every((y) => y === null)).toBe(true);
    const newest = viewCategory(cat, music, state({ sort: 'era-new' }), NOW).results;
    expect(newest[0].setting!.to).toBeGreaterThanOrEqual(newest[1].setting!.to);
  });

  it('recently added sorts by publication, then by year made with undated titles last', () => {
    const a = { ...cat.videos[0], id: 'video:a', title: 'A', published: '2026-01-01', made: undefined };
    const b = { ...cat.videos[0], id: 'video:b', title: 'B', published: '2026-01-01', made: 1950 };
    const c = { ...cat.videos[0], id: 'video:c', title: 'C', published: '2026-05-01', made: 1900 };
    expect(sortVideos(cat, [a, b, c], 'added').map((v) => v.id)).toEqual(['video:c', 'video:b', 'video:a']);
  });

  it('running time sorts put unmeasured titles last in both directions', () => {
    const short = sortVideos(cat, videosForSection(cat, music), 'short');
    const long = sortVideos(cat, videosForSection(cat, music), 'long');
    const rt = (v: Video) => cat.runtime(v);
    expect(rt(short[0])).toBe(90); // the WAVEMAKERS teaser
    expect(rt(long[0])).toBe(1500); // block party
    expect(rt(short[short.length - 1])).toBeNull();
    expect(rt(long[long.length - 1])).toBeNull();
  });
});

describe('URL state', () => {
  it('reads facet, sort, query and group, ignoring unknown values', () => {
    const facets = sectionFacets(cat, movies);
    expect(catStateFromParams(new URLSearchParams('facet=fiction&sort=era-old&q=night'), movies, facets)).toEqual({ facet: 'fiction', sort: 'era-old', q: 'night', group: null });
    expect(catStateFromParams(new URLSearchParams('facet=bogus&sort=bogus&q=%20%20'), movies, facets)).toEqual({ facet: null, sort: 'featured', q: '', group: null });
    expect(catStateFromParams(new URLSearchParams('group=scene'), music, []).group).toBe('scene');
    // the family default and modes it does not offer are not stored
    expect(catStateFromParams(new URLSearchParams('group=artist'), music, []).group).toBeNull();
    expect(catStateFromParams(new URLSearchParams('group=scene'), movies, facets).group).toBeNull();
  });

  it('writes defaults as nothing and round-trips', () => {
    const facets = sectionFacets(cat, movies);
    expect(catStateToSearch(state({}, movies), movies)).toBe('');
    const s: CatState = { facet: 'archive', sort: 'long', q: 'coney island', group: null };
    const qs = catStateToSearch(s, movies);
    expect(qs).toBe('facet=archive&sort=long&q=coney+island');
    expect(catStateFromParams(new URLSearchParams(qs), movies, facets)).toEqual(s);
  });

  it('News defaults to most recent; a filtered state is recognised', () => {
    expect(defaultSort(news)).toBe('added');
    expect(catStateToSearch(state({ sort: 'added' }, news), news)).toBe('');
    expect(isFilteredState(state({}, news), news)).toBe(false);
    expect(isFilteredState(state({ q: 'x' }, news), news)).toBe(true);
  });
});

describe('grouping', () => {
  const all = viewCategory(cat, music, state(), NOW).results;

  it('by artist: credited people first (largest group first), uncredited last', () => {
    const g = groupVideos(cat, all, 'artist');
    expect(g[0].label).toBe('Valid ID');
    expect(g[0].href).toBe('/synapse/person/valid-id');
    expect(g[0].videos).toHaveLength(3);
    expect(g[g.length - 1].label).toBe('No credited artist');
    expect(g.flatMap((x) => x.videos)).toHaveLength(all.length);
  });

  it('by scene: movements, then the places a title travels between', () => {
    const g = groupVideos(cat, all, 'scene');
    const labels = g.map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining(['Hip hop', 'Sound system culture', 'Miami bass']));
    const sound = g.find((x) => x.label === 'Sound system culture')!;
    expect(slugs(sound.videos).sort()).toEqual(['brixton-sound', 'wavemakers-ep2']);
  });

  it('by place: each title joins the city of its principal place, once', () => {
    const vids = viewCategory(cat, culture, state({}, culture), NOW).results;
    const g = groupVideos(cat, vids, 'place');
    expect(g.flatMap((x) => x.videos)).toHaveLength(vids.length);
    const miami = g.find((x) => x.label === 'Miami');
    expect(miami?.href).toBe('/world/miami');
    expect(placeAnchor(cat, 'place:wynwood')?.name).toBe('Miami');
    expect(placeAnchor(cat, 'place:bronx')?.name).toBe('New York City');
    expect(placeAnchor(cat, 'place:miami')?.name).toBe('Miami');
  });

  it('by era: decades in time order linking to the Time Machine, timeless last', () => {
    const vids = viewCategory(cat, culture, state({}, culture), NOW).results;
    const g = groupVideos(cat, vids, 'era');
    const decades = g.filter((x) => x.key !== 'rest').map((x) => Number(x.key));
    expect(decades).toEqual([...decades].sort((a, b) => a - b));
    expect(g.find((x) => x.key === '1970')?.href).toBe('/time-machine/1970s');
  });
});

describe('context', () => {
  it('related places are counted once per title and ordered by count', () => {
    const vids = videosForSection(cat, music);
    const places = relatedPlaces(cat, vids, 20);
    const nyc = places.find((p) => p.place.slug === 'new-york-city');
    expect(nyc?.count).toBe(2); // two WAVEMAKERS episodes
    const counts = places.map((p) => p.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('related eras follow historical settings, in time order', () => {
    const eras = relatedEras(cat, [cat.bySlug('video', 'block-party') as Video, cat.bySlug('video', 'subway-1905') as Video, cat.bySlug('video', 'signal-loop') as Video]);
    expect(eras.map((e) => e.period.slug)).toEqual(['1900s', '1970s']);
  });

  it('live counts describe what is really there', () => {
    const s = categoryStats(cat, videosForSection(cat, music), NOW);
    expect(s.titles).toBe(videosForSection(cat, music).length);
    expect(s.watchNow).toBe(videosForSection(cat, music).filter((v) => cat.isPlayable(v, NOW)).length);
    expect(s.watchNow).toBeLessThan(s.titles);
    expect(categoryStats(cat, [], NOW)).toEqual({ titles: 0, watchNow: 0, free: 0, places: 0, eras: 0, seconds: 0 });
  });

  it('interest context lists only real records sharing the interest — empty for Sports', () => {
    const m = interestContext(cat, music);
    expect(m.movements.map((x) => x.slug)).toEqual(expect.arrayContaining(['sound-system', 'hip-hop', 'miami-bass']));
    expect(m.people.map((x) => x.slug)).toEqual(['valid-id']);
    expect(m.programmes.every((p) => !p.parent)).toBe(true);
    expect(interestContext(cat, sports)).toEqual({ movements: [], people: [], programmes: [], places: [] });
  });
});

describe('data-driven guarantee', () => {
  it('an empty category fills itself the moment a title carries its interest', () => {
    expect(videosForSection(cat, sports)).toHaveLength(0);
    const payload = fixturePayload();
    payload.content.videos.find((v) => v.slug === 'bomba-loiza')!.categories.push('interest:sport');
    const next = buildCatalogue(payload);
    const v = viewCategory(next, sports, state({}, sports), NOW);
    expect(slugs(v.results)).toEqual(['bomba-loiza']);
    expect(relatedPlaces(next, v.results).map((p) => p.place.slug)).toEqual(['loiza']);
  });
});

describe('constellation', () => {
  it('lays places out inside the box, apart from each other, joined by real routes', () => {
    const vids = videosForSection(cat, culture);
    const { nodes, edges } = constellation(cat, vids);
    expect(nodes.length).toBeGreaterThan(2);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0.06);
      expect(n.x).toBeLessThanOrEqual(0.94);
      expect(n.y).toBeGreaterThanOrEqual(0.1);
      expect(n.y).toBeLessThanOrEqual(0.9);
    }
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)).toBeGreaterThan(0.08);
    const names = (e: (typeof edges)[number]) => [nodes[e.a].place.slug, nodes[e.b].place.slug].sort().join('>');
    expect(edges.filter((e) => e.kind === 'route').map(names)).toContain('new-york-city>san-juan');
    // deterministic
    expect(constellation(cat, vids)).toEqual({ nodes, edges });
  });

  it('is empty when nothing is placed', () => {
    expect(constellation(cat, [cat.bySlug('video', 'signal-loop') as Video])).toEqual({ nodes: [], edges: [] });
  });
});

describe('sourceOf', () => {
  const src = (attribution: string) => sourceOf({ provenance: 'public-domain', credits: { licence: 'x', attribution } }, 'fallback');
  it('reads the maker from real credit lines', () => {
    expect(src('Newspaper Train (1942). Len Lye, Realist Film Unit, for the UK Ministry of Information. Via Wikimedia Commons.')).toBe('Len Lye, Realist Film Unit, for the UK Ministry of Information');
    expect(src('Interior N.Y. Subway, 14th St. to 42nd St. (1905). American Mutoscope & Biograph Co.; camera G. W. "Billy" Bitzer. Library of Congress, via Wikimedia Commons.')).toBe(
      'American Mutoscope & Biograph Co.; camera G. W. "Billy" Bitzer',
    );
    expect(src('Kingston Jamaica (1920). Ford Educational Library, Ford Motor Company. US National Archives, via Internet Archive.')).toBe('Ford Educational Library, Ford Motor Company');
    expect(src('Sintel – © copyright Blender Foundation | www.sintel.org – CC BY 3.0')).toBe('Blender Foundation');
    expect(src('Tears of Steel – (CC) Blender Foundation | mango.blender.org – CC BY 3.0')).toBe('Blender Foundation');
    expect(src('NASA/Kennedy Space Center')).toBe('NASA/Kennedy Space Center');
    expect(sourceOf({ provenance: 'studio-concept' }, 'Studio concept')).toBe('Studio concept');
  });
});

describe('hash01', () => {
  it('is deterministic and within 0–1', () => {
    expect(hash01('video:a', 3)).toBe(hash01('video:a', 3));
    expect(hash01('video:a', 3)).not.toBe(hash01('video:a', 4));
    for (let i = 0; i < 50; i++) {
      const h = hash01(`x${i}`, i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
