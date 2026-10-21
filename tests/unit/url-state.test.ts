import { describe, expect, it } from 'vitest';
import { defaultDiscovery, discoveryWith } from '../../shared/search.ts';
import type { DiscoveryState } from '../../shared/types.ts';
import { discoveryFromParams, discoveryToParams, discoveryToSearch } from '../../shared/url-state.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const roundTrip = (s: DiscoveryState) => discoveryFromParams(discoveryToParams(s, cat), cat);

/** A state using every parameter, already in canonical (slug-sorted) order. */
const full: DiscoveryState = {
  q: 'bomba de Loíza, 1970s',
  interests: ['interest:culture', 'interest:music'],
  places: ['place:loiza', 'place:miami'],
  periods: ['period:1970s', 'period:1980s'],
  access: 'free',
  duration: '5-to-20',
  provenance: ['original', 'open-cinema'],
  playableOnly: true,
  sort: 'setting-oldest',
};

describe('discoveryToParams', () => {
  it('omits every default', () => {
    expect(discoveryToParams(defaultDiscovery(), cat).toString()).toBe('');
    expect(discoveryToParams(discoveryWith({ q: '  ' }), cat).toString()).toBe('');
  });

  it('writes slugs, never raw ids, in a stable order', () => {
    const p = discoveryToParams(discoveryWith({ interests: ['interest:music', 'interest:film'], places: ['place:wynwood', 'place:bronx'], provenance: ['studio', 'archive'] }), cat);
    expect(p.get('interest')).toBe('film,music');
    expect(p.get('place')).toBe('bronx,wynwood');
    expect(p.get('prov')).toBe('archive,studio');
    expect(p.toString()).not.toContain('%3A'); // no "kind:" prefixes
    expect([...p.keys()]).toEqual(['interest', 'place', 'prov']);
  });

  it('uses the documented parameter names', () => {
    expect([...discoveryToParams(full, cat).keys()]).toEqual(['q', 'interest', 'place', 'period', 'access', 'dur', 'prov', 'playable', 'sort']);
    expect(discoveryToParams(full, cat).get('playable')).toBe('1');
  });

  it('drops ids that are unknown or of the wrong kind', () => {
    const p = discoveryToParams(discoveryWith({ places: ['place:atlantis', 'theme:diaspora', 'place:miami'] }), cat);
    expect(p.get('place')).toBe('miami');
  });
});

describe('round trip', () => {
  it('is lossless for canonical states', () => {
    expect(roundTrip(full)).toEqual(full);
    expect(roundTrip(defaultDiscovery())).toEqual(defaultDiscovery());
  });

  it('canonicalises list order so equal selections give equal URLs', () => {
    const shuffled = { ...full, interests: [...full.interests].reverse(), provenance: [...full.provenance].reverse() };
    expect(roundTrip(shuffled)).toEqual(full);
    expect(discoveryToParams(shuffled, cat).toString()).toBe(discoveryToParams(full, cat).toString());
  });

  it('survives serialising to a readable query string', () => {
    const search = discoveryToSearch(full, cat);
    expect(search).toContain('place=loiza,miami');
    expect(discoveryFromParams(new URLSearchParams(search), cat)).toEqual(full);
  });
});

describe('discoveryFromParams', () => {
  it('ignores unknown slugs and invalid values safely', () => {
    const s = discoveryFromParams(new URLSearchParams('place=atlantis,miami&interest=&dur=forever&sort=chaos&access=vip&prov=archive,bogus&playable=maybe&period=1066s'), cat);
    expect(s).toEqual({ ...defaultDiscovery(), places: ['place:miami'], provenance: ['archive'] });
  });

  it('accepts repeated parameters and full ids of the right kind', () => {
    const s = discoveryFromParams(new URLSearchParams('interest=music&interest=film,interest:art&place=theme:diaspora'), cat);
    expect(s.interests).toEqual(['interest:art', 'interest:film', 'interest:music']);
    expect(s.places).toEqual([]);
  });
});
