import { describe, expect, it } from 'vitest';
import { buildCatalogue } from '../../shared/catalogue.ts';
import { artStatus, contentCounts, creditsFrom, footageCounts, provenanceCounts, safeHttpUrl } from '../../src/features/about/data.ts';
import { fixtureCatalogue, fixturePayload, NOW } from './fixture.ts';

describe('about data', () => {
  const cat = fixtureCatalogue();

  it('derives counts from the catalogue', () => {
    const rows = Object.fromEntries(contentCounts(cat, NOW).map((r) => [r.key, r]));
    expect(rows.videos.value).toBe(cat.videos.length);
    expect(rows.videos.detail).toBe(`${cat.videos.filter((v) => cat.isPlayable(v, NOW)).length} playable now`);
    expect(rows.places.value).toBe(cat.places.length);
    expect(rows.interests.value).toBe(cat.categories.length);
  });

  it('tallies provenance and footage per video', () => {
    const prov = provenanceCounts(cat);
    const total = Object.values(prov).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(cat.videos.length);
    const foot = footageCounts(cat);
    for (const [k, n] of Object.entries(foot)) expect(n).toBe(cat.videos.filter((v) => v.footage.includes(k as never)).length);
  });

  it('lists every credited video, alphabetically, and nothing else', () => {
    expect(creditsFrom(cat)).toEqual(cat.videos.filter((v) => v.credits).length ? expect.any(Array) : []);
    const payload = fixturePayload();
    const [a, b] = payload.content.videos;
    a.credits = { licence: 'CC BY 3.0', attribution: '(CC) Blender Foundation | mango.blender.org', sourceUrl: 'https://mango.blender.org' };
    b.credits = { licence: 'Public domain', attribution: 'Library of Congress' };
    const withCredits = buildCatalogue(payload);
    const list = creditsFrom(withCredits);
    expect(list.map((c) => c.video.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.map((c) => c.video.title)).toEqual([...list.map((c) => c.video.title)].sort((x, y) => x.localeCompare(y)));
  });

  it('counts provisional art', () => {
    const s = artStatus(cat);
    expect(s.total).toBe(Object.keys(cat.art).length);
    expect(s.provisional).toBeLessThanOrEqual(s.total);
  });

  it('only links http(s) sources', () => {
    expect(safeHttpUrl('https://archive.org/details/x')).toBe('https://archive.org/details/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
