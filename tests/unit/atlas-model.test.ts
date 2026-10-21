import { describe, expect, it } from 'vitest';
import type { Movement, Place, Route } from '../../shared/types.ts';
import {
  angularDistance,
  arcPoints,
  atlasHref,
  buildAtlasModel,
  convexHull,
  filterTree,
  focusFor,
  formatCoords,
  gatewayRegion,
  isCityLevel,
  isWithin,
  mapArc,
  movementHref,
  municipalityOf,
  niceKm,
  otherEnd,
  parseView,
  placeLabels,
  placeTree,
  projectLocal,
  roundedHullPath,
  toLatLon,
  toVec,
  yearsLabel,
} from '../../src/features/atlas/model.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const place = (id: string) => cat.get(id) as Place;

describe('labels and URLs', () => {
  it('formats coordinates with hemispheres and no invented precision', () => {
    expect(formatCoords([25.7617, -80.1918])).toBe('25.7617° N, 80.1918° W');
    expect(formatCoords([25.801, -80.199])).toBe('25.801° N, 80.199° W');
    expect(formatCoords([-22.9068, 151.2])).toBe('22.9068° S, 151.2° E');
  });

  it('labels open and closed year ranges', () => {
    expect(yearsLabel(1959, null)).toBe('1959–present');
    expect(yearsLabel(1980, 1980)).toBe('1980');
    expect(yearsLabel(1946, 1964)).toBe('1946–1964');
  });

  it('builds stable atlas URLs and strips the route prefix', () => {
    expect(atlasHref(null)).toBe('/world');
    expect(atlasHref('miami')).toBe('/world/miami');
    expect(atlasHref('london', { route: 'route:kingston-to-london', view: 'map' })).toBe('/world/london?route=kingston-to-london&view=map');
    expect(atlasHref('london', { route: null, view: null })).toBe('/world/london');
  });

  it('parses only known views', () => {
    expect(parseView('globe')).toBe('globe');
    expect(parseView('list')).toBe('list');
    expect(parseView('3d')).toBeNull();
    expect(parseView(null)).toBeNull();
  });
});

describe('atlas model', () => {
  const model = buildAtlasModel(cat);

  it('draws cities at world scale and neighbourhoods only up close', () => {
    expect(isCityLevel(cat, place('place:miami'))).toBe(true);
    expect(isCityLevel(cat, place('place:wynwood'))).toBe(false);
    expect(model.byId.get('place:miami')?.level).toBe('city');
    expect(model.byId.get('place:wynwood')?.level).toBe('local');
    expect(model.byId.has('place:florida')).toBe(false); // regions are not nodes
  });

  it('counts stories including descendants and derives status totals from data', () => {
    expect(model.counts.get('place:miami')).toBe(cat.videosForPlace('place:miami').length);
    expect(model.counts.get('place:miami')).toBeGreaterThan(cat.videosForPlace('place:miami', false).length);
    expect(model.active + model.expanding).toBe(cat.places.length);
    expect(model.gateway?.id).toBe('place:miami');
  });

  it('finds the gateway region and municipalities', () => {
    const region = gatewayRegion(cat)!;
    expect(region.kind).toBe('county');
    expect(isWithin(cat, 'place:south-beach', region.id)).toBe(true);
    expect(isWithin(cat, 'place:london', region.id)).toBe(false);
    expect(municipalityOf(cat, 'place:south-beach', region.id)).toBe('place:miami-beach');
    expect(municipalityOf(cat, 'place:wynwood', region.id)).toBe('place:miami');
  });
});

describe('relations', () => {
  const route = cat.get('route:kingston-to-london') as Route;

  it('finds the far end of a route from either side, including from inside a place', () => {
    expect(otherEnd(cat, route, 'place:london')).toEqual({ id: 'place:kingston', direction: 'inward' });
    expect(otherEnd(cat, route, 'place:kingston')).toEqual({ id: 'place:london', direction: 'outward' });
    expect(otherEnd(cat, route, 'place:uk').id).toBe('place:kingston');
  });

  it('opens a movement at the decade it began, or its synapse when it predates the periods', () => {
    const m = { id: 'movement:x', slug: 'x', name: 'X', start: 1973, end: 1979, places: [], categories: [], themes: [], summary: '' } as Movement;
    const first = cat.periods[0];
    expect(movementHref(cat, m)).toMatch(/^\/time-machine\/1970s\?movement=x$/);
    expect(movementHref(cat, { ...m, start: first.start - 300 })).toBe('/synapse/movement/x');
  });
});

describe('hierarchy', () => {
  const model = buildAtlasModel(cat);
  const tree = placeTree(cat, model.counts);

  it('roots at places without parents and nests children', () => {
    const us = tree.find((n) => n.place.id === 'place:us')!;
    expect(us.children.map((c) => c.place.id)).toContain('place:florida');
  });

  it('keeps ancestors of matches, matches aliases and ignores accents', () => {
    const { tree: t, matches } = filterTree(tree, 'calle ocho');
    expect(matches).toBe(1);
    expect(t.map((n) => n.place.id)).toEqual(['place:us']);
    expect(filterTree(tree, 'loiza').matches).toBe(1);
    expect(filterTree(tree, 'borough').matches).toBeGreaterThan(0);
    expect(filterTree(tree, 'zzzz').tree).toEqual([]);
  });
});

describe('geometry', () => {
  it('round-trips lat/lon through unit vectors', () => {
    const p = toLatLon(toVec(25.76, -80.19));
    expect(p.lat).toBeCloseTo(25.76, 6);
    expect(p.lon).toBeCloseTo(-80.19, 6);
    expect(angularDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(90, 6);
  });

  it('lifts route arcs off the surface between exact endpoints', () => {
    const pts = arcPoints([18, -76.8], [51.5, -0.13], 32);
    expect(pts).toHaveLength(33);
    const r = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
    expect(r(pts[0])).toBeCloseTo(1.004, 3);
    expect(r(pts[16])).toBeGreaterThan(1.05);
    const end = toLatLon(pts[32]);
    expect(end.lat).toBeCloseTo(51.5, 4);
  });

  it('frames the whole world, a place, or a route', () => {
    expect(focusFor(undefined, undefined).dist).toBeGreaterThan(4);
    const city = focusFor(place('place:miami'), undefined);
    expect(city).toMatchObject({ lat: 25.7617, lon: -80.1918 });
    const route = focusFor(undefined, { from: [18, -76.8], to: [51.5, -0.13] });
    expect(route.dist).toBeGreaterThan(city.dist);
  });

  it('draws flat-map arcs that bow north', () => {
    expect(mapArc([0, 0], [0, 10])).toMatch(/^M180 90Q185 [0-9.]+ 190 90$/);
    const ctrlY = Number(mapArc([0, 0], [0, 10]).split('Q')[1].split(' ')[1]);
    expect(ctrlY).toBeLessThan(90);
  });

  it('projects locally to scale and fits the box', () => {
    const { points, pxPerKm } = projectLocal(
      [
        { id: 'a', lat: 25.7, lon: -80.3 },
        { id: 'b', lat: 25.8, lon: -80.1 },
      ],
      400,
      300,
      20,
    );
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(380 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(280 + 1e-6);
    }
    expect(points[1].y).toBeLessThan(points[0].y); // north is up
    expect(pxPerKm).toBeGreaterThan(0);
    expect(niceKm(pxPerKm) * pxPerKm).toBeGreaterThanOrEqual(70);
  });

  it('builds hulls and rounded cell outlines', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [5, 5],
      [10, 10],
      [0, 10],
    ]);
    expect(hull).toHaveLength(4);
    expect(roundedHullPath([[5, 5]], 10)).toMatch(/^M-5 5a10 10/);
    expect(roundedHullPath([[0, 0], [10, 0]], 4)).toContain('A4 4');
    const d = roundedHullPath(hull, 6);
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/A6 6/g)).toHaveLength(4);
  });
});

describe('label placement', () => {
  it('avoids overlaps when there is room', () => {
    const items = [
      { id: 'a', x: 100, y: 100, r: 5, w: 60, h: 16 },
      { id: 'b', x: 104, y: 104, r: 5, w: 60, h: 16 },
      { id: 'c', x: 108, y: 96, r: 5, w: 60, h: 16 },
    ];
    const out = placeLabels(items, { w: 400, h: 300 });
    expect(out).toHaveLength(3);
    const boxes = out.map((l) => ({ ...l, w: 60, h: 16 }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
  });

  it('drops optional labels that cannot be placed cleanly', () => {
    const items = [
      { id: 'a', x: 10, y: 10, r: 4, w: 30, h: 16 },
      { id: 'b', x: 12, y: 12, r: 4, w: 30, h: 16, optional: true },
    ];
    const out = placeLabels(items, { w: 40, h: 30 });
    expect(out.map((l) => l.id)).toEqual(['a']);
  });
});
