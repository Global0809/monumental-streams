import { describe, expect, it } from 'vitest';
import type { Place, Programme, Video } from '../../shared/types.ts';
import {
  coordLabel,
  countryOf,
  entryLabel,
  entryNumeral,
  episodeGroups,
  firstPlayable,
  legBetween,
  originalsShelf,
  programmeTally,
  routeHref,
  routeStops,
  tallyLabel,
} from '../../src/features/programme/programme-model.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const prog = (slug: string) => cat.bySlug('programme', slug) as Programme;
const video = (slug: string) => cat.bySlug('video', slug) as Video;

describe('episodeGroups', () => {
  it('lists a series’ own videos, then each child chapter in series order', () => {
    const groups = episodeGroups(cat, prog('wavemakers'));
    expect(groups.map((g) => [g.programme.slug, g.chapter, g.videos.map((v) => v.slug)])).toEqual([
      ['wavemakers', false, ['wavemakers-teaser']],
      ['wavemakers-pr-ny-london', true, ['wavemakers-ep1', 'wavemakers-ep2']],
    ]);
  });

  it('gives a chapter one untitled group and drops empty groups', () => {
    const groups = episodeGroups(cat, prog('wavemakers-pr-ny-london'));
    expect(groups).toHaveLength(1);
    expect(groups[0].chapter).toBe(false);
    expect(groups[0].season).toBeUndefined();
  });

  it('splits by season when seasons exist', () => {
    const c = fixtureCatalogue();
    const list = c.videos.filter((v) => v.programme === 'programme:open-archive');
    list[0].season = 1;
    list[1].season = 2;
    const groups = episodeGroups(c, c.bySlug('programme', 'open-archive') as Programme);
    expect(groups.map((g) => g.season)).toEqual([1, 2]);
  });

  it('returns nothing for a programme with no videos', () => {
    const c = fixtureCatalogue();
    const empty: Programme = { ...prog('studio-sessions'), id: 'programme:nothing', slug: 'nothing' };
    expect(episodeGroups(c, empty)).toEqual([]);
  });
});

describe('entry labels', () => {
  it('names entries by kind and order', () => {
    expect(entryLabel(video('wavemakers-teaser'))).toBe('Teaser');
    expect(entryLabel(video('wavemakers-ep2'))).toBe('Episode 2');
    expect(entryLabel(video('subway-1905'))).toBe('Film 1');
    expect(entryLabel(video('block-party'))).toBe('Feature');
    expect(entryLabel({ ...video('miami-bass-reel'), order: undefined })).toBe('Reel');
  });

  it('pads series numerals and falls back to position', () => {
    expect(entryNumeral(video('wavemakers-ep2'), 0)).toBe('02');
    expect(entryNumeral({ ...video('block-party'), order: undefined }, 4)).toBe('05');
    expect(entryNumeral({ ...video('wavemakers-teaser'), order: 0 }, 3)).toBe('00');
  });
});

describe('tallies', () => {
  it('counts playable and waiting entries, children included', () => {
    expect(programmeTally(cat, prog('wavemakers'), NOW)).toEqual({ total: 3, playable: 1, waiting: 2 });
    expect(tallyLabel({ total: 3, playable: 1, waiting: 2 })).toBe('1 to watch now · 2 not yet playable');
    expect(tallyLabel({ total: 0, playable: 0, waiting: 0 })).toBe('Nothing to play yet');
    expect(tallyLabel({ total: 2, playable: 2, waiting: 0 })).toBe('2 to watch now');
  });

  it('finds the first playable entry in series order', () => {
    expect(firstPlayable(cat, prog('wavemakers'), NOW)?.slug).toBe('wavemakers-teaser');
    expect(firstPlayable(cat, prog('wavemakers-pr-ny-london'), NOW)).toBeUndefined();
  });
});

describe('routes', () => {
  it('resolves stops in order and links the atlas to the first leg', () => {
    const p = prog('wavemakers-pr-ny-london');
    expect(routeStops(cat, p).map((s) => s.slug)).toEqual(['san-juan', 'new-york-city', 'london']);
    expect(legBetween(cat, 'place:san-juan', 'place:new-york-city')?.id).toBe('route:san-juan-to-new-york');
    expect(legBetween(cat, 'place:new-york-city', 'place:london')).toBeUndefined();
    expect(routeHref(cat, p)).toBe('/world/san-juan?route=san-juan-to-new-york');
  });

  it('prefers a programme route for a leg when both exist', () => {
    const c = fixtureCatalogue();
    c.routes.push({ id: 'route:wm-leg', from: 'place:san-juan', to: 'place:new-york-city', kind: 'programme', label: 'Leg', period: { from: 2025, to: null }, summary: '' });
    expect(legBetween(c, 'place:san-juan', 'place:new-york-city')?.id).toBe('route:wm-leg');
  });

  it('has no route link without a route', () => {
    expect(routeHref(cat, prog('open-archive'))).toBeNull();
    expect(routeStops(cat, prog('open-archive'))).toEqual([]);
  });

  it('labels coordinates and countries', () => {
    expect(coordLabel([18.4655, -66.1057])).toBe('18.47° N · 66.11° W');
    expect(coordLabel([-33.9, 151.2])).toBe('33.90° S · 151.20° E');
    expect(countryOf(cat, cat.get('place:brixton') as Place)?.slug).toBe('uk');
    expect(countryOf(cat, cat.get('place:san-juan') as Place)?.slug).toBe('puerto-rico');
    expect(countryOf(cat, cat.get('place:jamaica') as Place)?.slug).toBe('jamaica');
  });
});

describe('originalsShelf', () => {
  it('puts each original series before its chapters and separates campaigns', () => {
    const c = fixtureCatalogue();
    c.programmes.push({ ...prog('studio-sessions'), id: 'programme:campaign', slug: 'campaign', kind: 'artist-campaign', original: false });
    const { originals, campaigns } = originalsShelf(c);
    expect(originals.map((p) => p.slug)).toEqual(['wavemakers', 'wavemakers-pr-ny-london']);
    expect(campaigns.map((p) => p.slug)).toEqual(['campaign']);
  });
});
