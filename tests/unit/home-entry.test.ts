/** Home's entry experiences, category band and personal summary — all derived from data. */
import { describe, expect, it } from 'vitest';
import { emptyLibrary } from '../../shared/library.ts';
import { sectionById, videosForSection } from '../../shared/sections.ts';
import type { Video } from '../../shared/types.ts';
import {
  arcDegrees,
  categoryTiles,
  decadePreview,
  decadeStops,
  hubContext,
  liveliestDecade,
  myWorldSummary,
  platformStats,
  splitTitle,
  stopAt,
  storyCountLabel,
  worldArcs,
  worldHubs,
} from '../../src/features/home/home-model.ts';
import { buildCatalogue } from '../../shared/catalogue.ts';
import { NOW, fixtureCatalogue, fixturePayload } from './fixture.ts';

const cat = fixtureCatalogue();
const slugs = (vs: Video[]) => vs.map((v) => v.slug);

describe('storyCountLabel', () => {
  it('counts honestly and names an empty category', () => {
    expect(storyCountLabel(0)).toBe('Coming soon');
    expect(storyCountLabel(0, 'No stories yet')).toBe('No stories yet');
    expect(storyCountLabel(1)).toBe('1 story');
    expect(storyCountLabel(6)).toBe('6 stories');
  });
});

describe('arcDegrees', () => {
  it('measures the angle between two places', () => {
    expect(arcDegrees([0, 0], [0, 90])).toBeCloseTo(90, 5);
    expect(arcDegrees([51.5, -0.1], [51.5, -0.1])).toBe(0);
    expect(arcDegrees([90, 0], [-90, 0])).toBeCloseTo(180, 5);
  });
});

describe('worldHubs', () => {
  const hubs = worldHubs(cat, { now: NOW });
  const byId = (id: string) => hubs.find((h) => h.place.id === id)!;

  it('pins cities: neighbourhoods and boroughs lift to their city, close neighbours merge', () => {
    expect(hubs.map((h) => h.place.slug)).toEqual(['miami', 'new-york-city', 'san-juan', 'london']);
    // Miami Beach sits a few km from Miami: one pin, named after the gateway
    expect(byId('place:miami').nearby.map((p) => p.slug)).toEqual(['miami-beach']);
    expect(byId('place:san-juan').nearby.map((p) => p.slug)).toEqual(['loiza']);
    expect(byId('place:london').nearby).toEqual([]);
  });

  it('collects every story at the pin once, playable first then by setting', () => {
    const miami = byId('place:miami');
    expect(miami.gateway).toBe(true);
    expect(slugs(miami.videos)).toEqual(['south-beach-deco', 'miami-bass-reel', 'wynwood-walls', 'wavemakers-teaser', 'calle-ocho-nights']);
    expect(miami.playable).toBe(4); // Calle Ocho Nights is dated for 2027
    expect(new Set(slugs(byId('place:new-york-city').videos))).toEqual(new Set(['wavemakers-ep1', 'wavemakers-ep2', 'subway-1905', 'block-party']));
  });

  it('knows each pin’s connections', () => {
    expect(byId('place:new-york-city').routes.map((r) => r.id)).toEqual(['route:san-juan-to-new-york']);
    expect(byId('place:london').routes.map((r) => r.id)).toEqual(['route:kingston-to-london']);
  });

  it('a newly added video brings its place onto the globe and into the category band', () => {
    const payload = fixturePayload();
    const base = payload.content.videos.find((v) => v.slug === 'subway-1905')!;
    payload.content.videos.push({ ...base, id: 'video:kingston-dub', slug: 'kingston-dub', title: 'Kingston Dub', places: ['place:kingston'], categories: ['interest:sport'] });
    const grown = buildCatalogue(payload);
    const kingston = worldHubs(grown, { now: NOW }).find((h) => h.place.slug === 'kingston');
    expect(kingston && slugs(kingston.videos)).toEqual(['kingston-dub']);
    expect(categoryTiles(grown, NOW).find((t) => t.section.id === 'sports')!.count).toBe(1);
  });

  it('describes where a pin sits', () => {
    expect(hubContext(cat, byId('place:miami'))).toBe('Gateway · United States');
    expect(hubContext(cat, byId('place:miami'), true)).toBe('Gateway');
    expect(hubContext(cat, byId('place:london'))).toBe('City · United Kingdom');
    expect(hubContext(cat, byId('place:london'), true)).toBe('United Kingdom');
    expect(hubContext(cat, byId('place:san-juan'))).toBe('City · Puerto Rico');
  });

  it('draws only routes whose two ends have coordinates', () => {
    const arcs = worldArcs(cat);
    expect(arcs.map((a) => a.route.id)).toEqual(['route:san-juan-to-new-york', 'route:kingston-to-london']);
    expect(arcs[0].from).toEqual([18.4655, -66.1057]);
  });
});

describe('Time Machine preview', () => {
  const stops = decadeStops(cat);

  it('opens on the decade with the most stories, the earliest on a tie', () => {
    const best = liveliestDecade(stops)!;
    expect(best.count).toBe(Math.max(...stops.map((s) => s.count)));
    expect(stops.findIndex((s) => s.count === best.count)).toBe(stops.indexOf(best));
    const p = (n: number, count: number) => ({ period: stops[n].period, count, playable: count });
    expect(liveliestDecade([p(0, 1), p(1, 3), p(2, 3)])?.period.slug).toBe('1910s');
    expect(liveliestDecade([])).toBeNull();
  });

  it('changing the decade changes the stories, places and movements', () => {
    const seventies = decadePreview(cat, 'period:1970s', NOW)!;
    expect(new Set(slugs(seventies.videos))).toEqual(new Set(['wavemakers-ep2', 'block-party', 'bomba-loiza', 'brixton-sound']));
    expect(seventies.playable).toBe(3);
    expect(slugs(seventies.videos).at(-1)).toBe('wavemakers-ep2'); // planned, so last
    // Brixton lifts to London and a story in London and Brixton counts once
    expect(seventies.places.map((p) => p.slug)).toEqual(['london', 'new-york-city', 'loiza']);
    expect(seventies.movements.map((m) => m.slug).sort()).toEqual(['hip-hop', 'nuyorican', 'sound-system']);

    const nineteens = decadePreview(cat, 'period:1900s', NOW)!;
    expect(slugs(nineteens.videos)).toEqual(['subway-1905']);
    expect(nineteens.places.map((p) => p.slug)).toEqual(['new-york-city']);
  });

  it('an empty decade says so instead of inventing content', () => {
    const tens = decadePreview(cat, 'period:1910s', NOW)!;
    expect(tens.videos).toEqual([]);
    expect(tens.movements).toEqual([]);
    expect(tens.places).toEqual([]);
    expect(decadePreview(cat, 'period:1800s')).toBeNull();
  });

  it('maps a pointer position on the spine to a decade', () => {
    expect(stopAt(0, 13)).toBe(0);
    expect(stopAt(0.5, 13)).toBe(6);
    expect(stopAt(0.999, 13)).toBe(12);
    expect(stopAt(1.4, 13)).toBe(12);
    expect(stopAt(-0.2, 13)).toBe(0);
    expect(stopAt(0.3, 0)).toBe(-1);
  });
});

describe('category band', () => {
  const tiles = categoryTiles(cat, NOW);

  it('has every category in navigation order, counted from the shared catalogue', () => {
    expect(tiles.map((t) => t.section.label)).toEqual(['Movies', 'Music', 'Sports', 'Gaming', 'News', 'Fashion', 'Culture', 'Kids']);
    for (const t of tiles) expect(t.count).toBe(videosForSection(cat, t.section).length);
    expect(tiles.find((t) => t.section.id === 'movies')!.count).toBe(2);
  });

  it('labels empty categories honestly and peeks at real stories, playable first', () => {
    const sports = tiles.find((t) => t.section.id === 'sports')!;
    expect(sports.count).toBe(0);
    expect(sports.sample).toEqual([]);
    expect(storyCountLabel(sports.count)).toBe('Coming soon');
    const music = tiles.find((t) => t.section.id === 'music')!;
    expect(music.sample.length).toBe(3);
    expect(music.sample.every((v) => cat.isPlayable(v, NOW))).toBe(true);
  });

  it('never lists Live as a category with stories', () => {
    expect(tiles.some((t) => t.section.id === sectionById('live').id)).toBe(false);
  });
});

describe('My World summary', () => {
  it('invites when nothing is personal yet', () => {
    expect(myWorldSummary(emptyLibrary())).toEqual({ inProgress: 0, saved: 0, places: 0, journeys: 0, stamps: 0, following: 0, empty: true });
  });

  it('counts live entries only — a removed save is not counted', () => {
    const lib = emptyLibrary();
    lib.saved['video:subway-1905'] = { at: 2 };
    lib.saved['video:block-party'] = { at: 3, removed: true };
    lib.savedPlaces['place:miami'] = { at: 2 };
    lib.interests['interest:music'] = { at: 1 };
    lib.stamps['place:london'] = { at: 1, video: 'video:brixton-sound' };
    lib.progress['video:viejo-san-juan'] = { pos: 120, dur: 540, at: 4, done: false };
    expect(myWorldSummary(lib)).toEqual({ inProgress: 1, saved: 1, places: 1, journeys: 0, stamps: 1, following: 1, empty: false });
  });
});

describe('hero', () => {
  it('reports what the catalogue holds today', () => {
    const s = platformStats(cat, NOW);
    expect(s.stories).toBe(cat.videos.length);
    expect(s.playable).toBe(cat.videos.filter((v) => cat.isPlayable(v, NOW)).length);
    expect(s.places).toBe(cat.places.filter((p) => cat.videosForPlace(p.id, false).length > 0).length);
    expect(s.decades).toBe(cat.periodCoverage().filter((c) => c.count > 0).length);
  });

  it('splits a chapter title around its series name', () => {
    expect(splitTitle('Valid ID presents WAVEMAKERS: Puerto Rico, New York to London', 'WAVEMAKERS')).toEqual(['Valid ID presents', 'Puerto Rico, New York to London']);
    expect(splitTitle('WAVEMAKERS: Puerto Rico, New York to London', 'WAVEMAKERS')).toEqual(['', 'Puerto Rico, New York to London']);
    expect(splitTitle('Open Archive', 'WAVEMAKERS')).toEqual(['', 'Open Archive']);
    expect(splitTitle('Open Archive')).toEqual(['', '']);
  });
});
