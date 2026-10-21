/** Home's constellation index, World / Time Machine invitations and personal summary — all derived from data. */
import { describe, expect, it } from 'vitest';
import { emptyLibrary } from '../../shared/library.ts';
import { videosForSection } from '../../shared/sections.ts';
import type { Video } from '../../shared/types.ts';
import {
  arcDegrees,
  decadeIds,
  liveliestDecade,
  myWorldSummary,
  organIndex,
  seedSections,
  splitTitle,
  storyCountLabel,
  timeInvitation,
  worldHubs,
  worldInvitation,
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

describe('World invitation', () => {
  const hubs = worldHubs(cat, { now: NOW });
  const byId = (id: string) => hubs.find((h) => h.place.id === id)!;

  it('destinations are cities: neighbourhoods and boroughs lift to their city, close neighbours merge', () => {
    expect(hubs.map((h) => h.place.slug)).toEqual(['miami', 'new-york-city', 'san-juan', 'london']);
    // Miami Beach sits a few km from Miami: one destination, named after the gateway
    expect(byId('place:miami').nearby.map((p) => p.slug)).toEqual(['miami-beach']);
    expect(byId('place:san-juan').nearby.map((p) => p.slug)).toEqual(['loiza']);
    expect(byId('place:london').nearby).toEqual([]);
  });

  it('collects every story at the destination once, playable first then by setting', () => {
    const miami = byId('place:miami');
    expect(miami.gateway).toBe(true);
    expect(slugs(miami.videos)).toEqual(['south-beach-deco', 'miami-bass-reel', 'wynwood-walls', 'wavemakers-teaser', 'calle-ocho-nights']);
    expect(miami.playable).toBe(4); // Calle Ocho Nights is dated for 2027
    expect(new Set(slugs(byId('place:new-york-city').videos))).toEqual(new Set(['wavemakers-ep1', 'wavemakers-ep2', 'subway-1905', 'block-party']));
  });

  it('knows each destination’s connections', () => {
    expect(byId('place:new-york-city').routes.map((r) => r.id)).toEqual(['route:san-juan-to-new-york']);
    expect(byId('place:london').routes.map((r) => r.id)).toEqual(['route:kingston-to-london']);
  });

  it('lights exactly the stories that have a place on the globe', () => {
    const inv = worldInvitation(cat, NOW);
    expect(inv.placed).toEqual(cat.videos.filter((v) => v.places.length > 0).map((v) => v.id));
    expect(inv.placed).not.toContain('video:signal-loop'); // placeless: it never settles on the globe
    expect(inv.hubs.map((h) => h.place.slug)).toEqual(hubs.map((h) => h.place.slug));
  });

  it('a newly added video brings its place into World and its category into the index', () => {
    const payload = fixturePayload();
    const base = payload.content.videos.find((v) => v.slug === 'subway-1905')!;
    payload.content.videos.push({ ...base, id: 'video:kingston-dub', slug: 'kingston-dub', title: 'Kingston Dub', places: ['place:kingston'], categories: ['interest:sport'] });
    const grown = buildCatalogue(payload);
    const kingston = worldInvitation(grown, NOW).hubs.find((h) => h.place.slug === 'kingston');
    expect(kingston && slugs(kingston.videos)).toEqual(['kingston-dub']);
    const sports = organIndex(grown).find((e) => e.section.id === 'sports')!;
    expect(sports.count).toBe(1);
    expect(sports.ids).toEqual(['video:kingston-dub']);
  });
});

describe('Time Machine invitation', () => {
  const inv = timeInvitation(cat);

  it('lights the stories with a historical setting and lists only decades that hold stories', () => {
    expect(inv.dated).toEqual(cat.videos.filter((v) => v.setting).map((v) => v.id));
    expect(inv.dated).not.toContain('video:signal-loop');
    expect(inv.decades.every((d) => d.count > 0)).toBe(true);
    expect(inv.decades.map((d) => d.period.slug)).toEqual(cat.periodCoverage().filter((c) => c.count > 0).map((c) => c.period.slug));
    expect(inv.span).toEqual({ from: 1904, to: 2026 });
  });

  it('a decade lights that decade’s stories', () => {
    expect(new Set(decadeIds(cat, 'period:1970s'))).toEqual(new Set(['video:wavemakers-ep2', 'video:block-party', 'video:bomba-loiza', 'video:brixton-sound']));
    expect(decadeIds(cat, 'period:1910s')).toEqual([]);
  });

  it('marks the decade with the most stories, the earliest on a tie', () => {
    const best = liveliestDecade(inv.decades)!;
    expect(best.count).toBe(Math.max(...inv.decades.map((s) => s.count)));
    const stops = cat.periodCoverage();
    const p = (n: number, count: number) => ({ period: stops[n].period, count, playable: count });
    expect(liveliestDecade([p(0, 1), p(1, 3), p(2, 3)])?.period.slug).toBe('1910s');
    expect(liveliestDecade([])).toBeNull();
  });
});

describe('constellation index', () => {
  const entries = organIndex(cat);

  it('has the nine organs: every category in navigation order, then Live closing the ring', () => {
    expect(entries.map((e) => e.section.label)).toEqual(['Movies', 'Music', 'Sports', 'Gaming', 'News', 'Fashion', 'Culture', 'Kids', 'Live']);
    for (const e of entries.filter((x) => !x.live)) {
      expect(e.count).toBe(videosForSection(cat, e.section).length);
      expect(e.ids).toEqual(videosForSection(cat, e.section).map((v) => v.id));
    }
    expect(entries.find((e) => e.section.id === 'movies')!.count).toBe(2);
  });

  it('labels empty categories honestly and never claims stories for Live', () => {
    const sports = entries.find((e) => e.section.id === 'sports')!;
    expect(sports.count).toBe(0);
    expect(sports.ids).toEqual([]);
    expect(storyCountLabel(sports.count)).toBe('Coming soon');
    const live = entries.at(-1)!;
    expect(live.live).toBe(true);
    expect(live.count).toBe(0);
    expect(live.ids).toEqual([]);
  });

  it('maps a seed back to the categories it belongs to (the world lights the index)', () => {
    const map = seedSections(cat);
    expect(map.get('video:block-party')).toEqual(['music', 'culture']);
    expect(map.get('video:subway-1905')).toEqual(['movies', 'culture']);
    for (const e of entries.filter((x) => !x.live)) for (const id of e.ids) expect(map.get(id)).toContain(e.section.id);
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

describe('featured chapter', () => {
  it('splits a chapter title around its series name', () => {
    expect(splitTitle('Valid ID presents WAVEMAKERS: Puerto Rico, New York to London', 'WAVEMAKERS')).toEqual(['Valid ID presents', 'Puerto Rico, New York to London']);
    expect(splitTitle('WAVEMAKERS: Puerto Rico, New York to London', 'WAVEMAKERS')).toEqual(['', 'Puerto Rico, New York to London']);
    expect(splitTitle('Open Archive', 'WAVEMAKERS')).toEqual(['', 'Open Archive']);
    expect(splitTitle('Open Archive')).toEqual(['', '']);
  });
});
