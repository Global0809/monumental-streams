import { describe, expect, it } from 'vitest';
import { defaultDiscovery, searchCatalogue } from '../../shared/search.ts';
import { sectionById } from '../../shared/sections.ts';
import type { Video } from '../../shared/types.ts';
import { activeSection, searchSections, sectionCounts, sectionFromParam, withSection } from '../../src/features/catalogue/sections.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const video = (id: string, categories: string[]) => ({ id: `video:${id}`, categories }) as unknown as Video;

describe('search sections', () => {
  it('offers exactly the category destinations, in navigation order', () => {
    expect(searchSections().map((s) => s.label)).toEqual(['Movies', 'Music', 'Sports', 'Gaming', 'News', 'Fashion', 'Culture', 'Kids']);
  });

  it('a section is a lens over the interest filter (so the URL stays ?interest=…)', () => {
    const music = sectionById('music');
    const s = withSection(defaultDiscovery(), music);
    expect(s.interests).toEqual(['interest:music']);
    expect(withSection(s, null).interests).toEqual([]);
    // other constraints are kept
    expect(withSection({ ...defaultDiscovery(), q: 'miami', access: 'free' }, music)).toMatchObject({ q: 'miami', access: 'free' });
  });

  it('lights the section whose interests match exactly — order does not matter, a custom mix lights none', () => {
    const culture = sectionById('culture');
    expect(activeSection([...(culture.interests ?? [])].reverse())?.id).toBe('culture');
    expect(activeSection(['interest:film'])?.id).toBe('movies');
    expect(activeSection(['interest:film', 'interest:music'])).toBeNull();
    expect(activeSection(['interest:documentary'])).toBeNull();
    expect(activeSection([])).toBeNull();
  });

  it('counts each section from the catalogue, one story counted in every section it belongs to', () => {
    const counts = sectionCounts([video('a', ['interest:film']), video('b', ['interest:music', 'interest:culture']), video('c', ['interest:art'])]);
    expect(counts.movies).toBe(1);
    expect(counts.music).toBe(1);
    expect(counts.culture).toBe(2); // culture + art
    expect(counts.kids).toBe(0);
  });

  it('counts follow the real catalogue (new videos appear automatically)', () => {
    const cat = fixtureCatalogue();
    const all = searchCatalogue(cat, defaultDiscovery(), NOW).results.map((h) => h.video);
    const counts = sectionCounts(all);
    const films = all.filter((v) => v.categories.includes('interest:film')).length;
    expect(counts.movies).toBe(films);
  });

  it('accepts ?section= as an id or a path, only for category sections', () => {
    expect(sectionFromParam('movies')?.id).toBe('movies');
    expect(sectionFromParam('/music')?.id).toBe('music');
    expect(sectionFromParam(' Kids ')?.id).toBe('kids');
    expect(sectionFromParam('world')).toBeNull();
    expect(sectionFromParam('my-world')).toBeNull();
    expect(sectionFromParam('nope')).toBeNull();
    expect(sectionFromParam(null)).toBeNull();
  });
});
