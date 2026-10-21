import { describe, expect, it } from 'vitest';
import { defaultDiscovery, discoveryWith, searchCatalogue } from '../../shared/search.ts';
import type { DiscoveryState } from '../../shared/types.ts';
import { activeFilters, clearFilters, decadeOptions, destinationTree, filterCount, isFiltered, removeFilter, toggleIn } from '../../src/features/catalogue/facets.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const facets = (patch: Partial<DiscoveryState> = {}) => searchCatalogue(cat, discoveryWith(patch), NOW).facets;

describe('destinationTree', () => {
  it('puts the gateway first and keeps only places with stories', () => {
    const tree = destinationTree(cat, facets().places, []);
    expect(tree.gateway?.place.slug).toBe('miami');
    expect(tree.gateway?.children.map((n) => n.place.slug).sort()).toEqual(['little-havana', 'wynwood']);
    const roots = tree.roots.map((n) => n.place.slug);
    expect(roots).toContain('us');
    expect(roots).toContain('puerto-rico');
    expect(roots).toContain('uk');
    expect(roots).not.toContain('jamaica');
    expect(roots).not.toContain('cuba');
  });

  it('orders by count, then name, and nests sub-places', () => {
    const tree = destinationTree(cat, facets().places, []);
    const counts = tree.roots.map((n) => n.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    const us = tree.roots.find((n) => n.place.slug === 'us')!;
    expect(us.children.map((n) => n.place.slug)).toEqual(expect.arrayContaining(['florida', 'new-york']));
  });

  it('keeps a selected place even when nothing matches, and marks its ancestors', () => {
    const tree = destinationTree(cat, facets().places, ['place:cuba', 'place:wynwood']);
    const cuba = tree.roots.find((n) => n.place.slug === 'cuba');
    expect(cuba).toMatchObject({ count: 0, selected: true });
    const us = tree.roots.find((n) => n.place.slug === 'us')!;
    expect(us.holdsSelection).toBe(true);
    expect(tree.gateway?.holdsSelection).toBe(true);
  });

  it('reflects other constraints in the counts', () => {
    const tree = destinationTree(cat, facets({ interests: ['interest:film'] }).places, []);
    expect(tree.gateway).toBeNull();
    expect(tree.roots.map((n) => n.place.slug).sort()).toEqual(['puerto-rico', 'us']);
  });
});

describe('decadeOptions', () => {
  it('lists decades with stories set in them, chronologically', () => {
    const opts = decadeOptions(cat, facets().periods, []);
    const labels = opts.map((o) => o.period.label);
    expect(labels[0]).toBe('1900s');
    expect(labels).toContain('1970s');
    expect(opts.every((o) => o.count > 0)).toBe(true);
  });

  it('keeps a selected decade with no stories', () => {
    const opts = decadeOptions(cat, facets({ q: 'subway' }).periods, ['period:1960s']);
    expect(opts.map((o) => [o.period.label, o.selected])).toEqual([
      ['1900s', false],
      ['1960s', true],
    ]);
  });
});

describe('active filters', () => {
  const state: DiscoveryState = {
    q: '  bomba ',
    interests: ['interest:music'],
    places: ['place:miami'],
    periods: ['period:1970s'],
    access: 'premium',
    duration: 'under-5',
    provenance: ['original', 'archive'],
    playableOnly: true,
    sort: 'newest',
  };

  it('lists every constraint as a removable chip (sort excluded)', () => {
    const chips = activeFilters(cat, state);
    expect(chips.map((c) => c.label)).toEqual([
      '“bomba”',
      'Music',
      'Miami',
      'Set in 1970s',
      'Premium only',
      'Under 5 min',
      'Monumental Originals',
      'Public-domain archive',
      'Playable now',
    ]);
    expect(chips.find((c) => c.key === 'periods')?.tone).toBe('plasma');
    expect(chips.find((c) => c.key === 'access')?.tone).toBe('aurum');
    expect(chips.every((c) => c.removeLabel.length > c.label.length - 3)).toBe(true);
  });

  it('removes exactly one constraint at a time', () => {
    const chips = activeFilters(cat, state);
    const without = (label: string) => removeFilter(state, chips.find((c) => c.label === label)!);
    expect(without('Music').interests).toEqual([]);
    expect(without('“bomba”').q).toBe('');
    expect(without('Public-domain archive').provenance).toEqual(['original']);
    expect(without('Premium only').access).toBe('all');
    expect(without('Playable now').playableOnly).toBe(false);
    expect(without('Under 5 min')).toEqual({ ...state, duration: 'any' });
  });

  it('clears everything but the sort order', () => {
    expect(clearFilters(state)).toEqual({ ...defaultDiscovery(), sort: 'newest' });
  });

  it('knows when anything narrows the results', () => {
    expect(isFiltered(defaultDiscovery())).toBe(false);
    expect(isFiltered({ ...defaultDiscovery(), sort: 'longest' })).toBe(false);
    expect(isFiltered({ ...defaultDiscovery(), q: '   ' })).toBe(false);
    expect(isFiltered({ ...defaultDiscovery(), q: 'x' })).toBe(true);
    expect(isFiltered({ ...defaultDiscovery(), playableOnly: true })).toBe(true);
    expect(filterCount(state)).toBe(8);
    expect(filterCount(defaultDiscovery())).toBe(0);
  });

  it('toggles list membership', () => {
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleIn(['a'], 'c')).toEqual(['a', 'c']);
  });
});
