import { describe, expect, it } from 'vitest';
import type { Library, Place } from '../../shared/types.ts';
import {
  MAX_STOPS,
  derivedTitle,
  fitProjection,
  graticuleStep,
  haversineKm,
  inkFor,
  journeyId,
  orderByProximity,
  parsePassport,
  passportSearch,
  placeTrail,
  readyJourneys,
  routeKm,
  searchPlaces,
  stampCount,
  stampFor,
  storiesFor,
  tiltFor,
} from '../../src/features/passport/logic.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const place = (id: string) => cat.get(id) as Place;

describe('passport URL state', () => {
  it('reads ordered, de-duplicated place slugs and a title', () => {
    const p = parsePassport(new URLSearchParams('stops=san-juan,new-york-city,atlantis,san-juan,london&title=%20Wave%20route%20'), cat);
    expect(p.stops).toEqual(['place:san-juan', 'place:new-york-city', 'place:london']);
    expect(p.title).toBe('Wave route');
  });

  it('distinguishes no journey from a blank one', () => {
    expect(parsePassport(new URLSearchParams(''), cat)).toEqual({ stops: null, title: null });
    expect(parsePassport(new URLSearchParams('stops='), cat)).toEqual({ stops: [], title: null });
  });

  it('caps the number of stops', () => {
    const all = cat.places.map((p) => p.slug).join(',');
    expect(parsePassport(new URLSearchParams(`stops=${all}`), cat).stops).toHaveLength(MAX_STOPS);
  });

  it('writes commas literally and round-trips', () => {
    const stops = ['place:san-juan', 'place:new-york-city', 'place:london'];
    const search = passportSearch(cat, stops, 'Puerto Rico & beyond');
    expect(search).toBe('stops=san-juan,new-york-city,london&title=Puerto%20Rico%20%26%20beyond');
    expect(parsePassport(new URLSearchParams(search), cat)).toEqual({ stops, title: 'Puerto Rico & beyond' });
    expect(passportSearch(cat, [], null)).toBe('stops=');
  });

  it('derives a title from the stops when none is given', () => {
    expect(derivedTitle(cat, [])).toBe('A new journey');
    expect(derivedTitle(cat, ['place:london'])).toBe('London');
    expect(derivedTitle(cat, ['place:san-juan', 'place:bronx', 'place:london'])).toBe('San Juan to London');
  });

  it('gives each journey a stable content id', () => {
    expect(journeyId(['place:miami'], 'A')).toBe(journeyId(['place:miami'], 'A'));
    expect(journeyId(['place:miami'], 'A')).not.toBe(journeyId(['place:miami'], 'B'));
    expect(journeyId(['place:miami', 'place:london'], 'A')).not.toBe(journeyId(['place:london', 'place:miami'], 'A'));
  });
});

describe('stamps', () => {
  const stamps: Library['stamps'] = {
    'place:wynwood': { at: 2_000, video: 'video:wynwood-walls' },
    'place:miami': { at: 5_000, video: 'video:miami-bass-reel' },
    'place:london': { at: 9_000, video: 'video:x' },
  };

  it('stamps a stop through any place inside it, earliest first', () => {
    expect(stampFor(cat, stamps, 'place:miami')).toEqual({ at: 2_000, video: 'video:wynwood-walls', place: 'place:wynwood' });
    expect(stampFor(cat, stamps, 'place:miami-dade')?.place).toBe('place:wynwood');
    expect(stampFor(cat, stamps, 'place:brixton')).toBeNull(); // a parent's stamp does not stamp a child
    expect(stampFor(cat, stamps, 'place:little-havana')).toBeNull();
  });

  it('counts stamped stops', () => {
    expect(stampCount(cat, stamps, ['place:miami', 'place:san-juan', 'place:london'])).toBe(2);
    expect(stampCount(cat, {}, ['place:miami'])).toBe(0);
  });

  it('cycles inks and tilts stamps stably within ±12°', () => {
    expect([0, 1, 2, 3, 4].map(inkFor)).toEqual(['ichor', 'plasma', 'aurum', 'ember', 'ichor']);
    for (const p of cat.places) {
      const t = tiltFor(p.id);
      expect(t).toBe(tiltFor(p.id));
      expect(Math.abs(t)).toBeLessThanOrEqual(12);
    }
  });

  it('lists stories at a stop (and inside it), playable first', () => {
    const list = storiesFor(cat, 'place:new-york-city', NOW);
    expect(list.map((v) => v.id)).toContain('video:block-party'); // set in The Bronx
    const firstUnplayable = list.findIndex((v) => !cat.isPlayable(v, NOW));
    expect(list.slice(firstUnplayable).every((v) => !cat.isPlayable(v, NOW))).toBe(true);
  });
});

describe('ready-made journeys', () => {
  const ready = readyJourneys(cat, NOW);
  const byKey = (k: string) => ready.find((r) => r.key === k);

  it('follows programme routes in order', () => {
    const wm = byKey('programme-wavemakers-pr-ny-london');
    expect(wm?.stops).toEqual(['place:san-juan', 'place:new-york-city', 'place:london']);
    expect(wm?.kicker).toBe('Monumental Original · In development');
    expect(wm?.note).toBe('In development.');
    expect(ready[0].group).toBe('programme');
  });

  it('builds the gateway trail from the gateway county, gateway first', () => {
    const trail = ready.find((r) => r.group === 'gateway')!;
    expect(trail.title).toBe('Miami gateway trail');
    expect(trail.stops[0]).toBe('place:miami');
    expect(trail.stops).toContain('place:little-havana');
    expect(trail.stops).toContain('place:south-beach');
    expect(trail.stops).not.toContain('place:miami-dade');
    const county = cat.placeScope('place:miami-dade');
    expect(trail.stops.every((s) => county.has(s))).toBe(true);
  });

  it('picks international routes that carry a music movement', () => {
    const sound = ready.filter((r) => r.group === 'sound');
    expect(sound.map((r) => r.stops)).toEqual([['place:kingston', 'place:london']]);
    expect(sound[0].summary).toBe('Sound system culture');
    expect(sound[0].kicker).toBe('Migration · 1948–1971');
  });

  it('orders the archive trail by setting year', () => {
    const archive = byKey('archive-trail');
    expect(archive?.stops).toEqual(['place:new-york-city', 'place:san-juan']);
    expect(archive?.kicker).toBe('Archive films · 1904–1951');
  });
});

describe('geography', () => {
  it('measures great-circle distances', () => {
    expect(haversineKm([25.7617, -80.1918], [51.5072, -0.1276])).toBeGreaterThan(7000);
    expect(haversineKm([25.7617, -80.1918], [51.5072, -0.1276])).toBeLessThan(7250);
    expect(haversineKm([10, 10], [10, 10])).toBe(0);
    expect(routeKm([place('place:san-juan'), place('place:new-york-city'), place('place:london')])).toBeGreaterThan(8000);
  });

  it('orders a local trail by proximity from the start', () => {
    const ordered = orderByProximity([place('place:south-beach'), place('place:wynwood'), place('place:miami'), place('place:miami-beach')], 'place:miami');
    expect(ordered[0].id).toBe('place:miami');
    expect(ordered).toHaveLength(4);
  });

  it('fits every point inside the padded frame', () => {
    const pts: [number, number][] = [
      [18.4655, -66.1057],
      [40.7128, -74.006],
      [51.5072, -0.1276],
    ];
    const proj = fitProjection(pts, 400, 420, 50);
    for (const [lat, lon] of pts) {
      expect(proj.x(lon)).toBeGreaterThanOrEqual(49.9);
      expect(proj.x(lon)).toBeLessThanOrEqual(350.1);
      expect(proj.y(lat)).toBeGreaterThanOrEqual(49.9);
      expect(proj.y(lat)).toBeLessThanOrEqual(370.1);
    }
    // the land-path matrix agrees with the point projection (x = lon + 180, y = 90 − lat)
    const [a, , , d, e, f] = proj.matrix;
    expect(a * (-74.006 + 180) + e).toBeCloseTo(proj.x(-74.006), 6);
    expect(d * (90 - 40.7128) + f).toBeCloseTo(proj.y(40.7128), 6);
    expect(proj.west).toBeLessThan(-74.006);
    expect(proj.east).toBeGreaterThan(-0.1276);
  });

  it('centres a single stop', () => {
    const proj = fitProjection([[25, -80]], 400, 420, 50, 4);
    expect(proj.x(-80)).toBeCloseTo(200);
    expect(proj.y(25)).toBeCloseTo(210);
  });

  it('chooses round graticule steps', () => {
    expect(graticuleStep(0.3)).toBe(0.05);
    expect(graticuleStep(5)).toBe(1);
    expect(graticuleStep(80)).toBe(15);
    expect(graticuleStep(400)).toBe(60);
  });
});

describe('place search', () => {
  it('folds diacritics and matches aliases', () => {
    expect(searchPlaces(cat, 'loiza', new Set())[0].id).toBe('place:loiza');
    expect(searchPlaces(cat, 'calle', new Set())[0].id).toBe('place:little-havana');
    expect(searchPlaces(cat, 'NYC', new Set())[0].id).toBe('place:new-york-city');
  });

  it('excludes places already on the journey and suggests the gateway first', () => {
    expect(searchPlaces(cat, 'miami', new Set(['place:miami'])).map((p) => p.id)).not.toContain('place:miami');
    expect(searchPlaces(cat, '', new Set())[0].id).toBe('place:miami');
    expect(searchPlaces(cat, 'zzzz', new Set())).toEqual([]);
  });

  it('describes where a place sits', () => {
    expect(placeTrail(cat, place('place:wynwood'))).toBe('Neighbourhood · Miami, United States');
    expect(placeTrail(cat, place('place:puerto-rico'))).toBe('Territory');
    expect(placeTrail(cat, place('place:san-juan'))).toBe('City · Puerto Rico');
  });
});
