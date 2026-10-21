import { describe, expect, it } from 'vitest';
import { emptyLibrary } from '../../shared/library.ts';
import type { Video } from '../../shared/types.ts';
import { portalLines, portalStats, remainingLabel, spanLabel, yearSpan } from '../../src/features/home/home-model.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const video = (slug: string) => cat.bySlug('video', slug) as Video;

describe('yearSpan / spanLabel', () => {
  it('spans the earliest to latest setting year', () => {
    const span = yearSpan([video('viejo-san-juan'), video('subway-1905'), video('miami-bass-reel')]);
    expect(span).toEqual({ from: 1904, to: 1992 });
    expect(spanLabel(span)).toBe('from 1904 to 1992');
  });

  it('falls back to the year made and ignores timeless videos', () => {
    const made = { ...video('subway-1905'), setting: null };
    expect(yearSpan([made, video('signal-loop')])).toEqual({ from: 1905, to: 1905 });
    expect(spanLabel({ from: 1905, to: 1905 })).toBe('in 1905');
  });

  it('is null when nothing is dated', () => {
    expect(yearSpan([video('signal-loop')])).toBeNull();
    expect(yearSpan([])).toBeNull();
    expect(spanLabel(null)).toBeNull();
  });
});

describe('remainingLabel', () => {
  it('reads the time left in a sensible unit', () => {
    expect(remainingLabel({ pos: 60, dur: 780, at: 0, done: false })).toBe('12 min left');
    expect(remainingLabel({ pos: 260, dur: 300, at: 0, done: false })).toBe('40 sec left');
    expect(remainingLabel({ pos: 0, dur: 5400, at: 0, done: false })).toBe('1 hr 30 min left');
    expect(remainingLabel({ pos: 0, dur: 3600, at: 0, done: false })).toBe('1 hr left');
    expect(remainingLabel({ pos: 10, dur: 0, at: 0, done: false })).toBe('');
  });
});

describe('portal telemetry', () => {
  it('derives every number from the catalogue and library', () => {
    const lib = emptyLibrary();
    const stats = portalStats(cat, lib, NOW);
    expect(stats.placesMapped).toBe(cat.places.length);
    expect(stats.decadesMapped).toBe(13);
    expect(stats.placesWithStories).toBe(cat.places.filter((p) => cat.videosForPlace(p.id, false).length).length);
    expect(stats.playable).toBe(cat.videos.filter((v) => cat.isPlayable(v, NOW)).length);
    expect(stats.stamps).toBe(0);
    const lines = portalLines(stats);
    expect(lines.passport).toBe('No stamps yet');
    expect(lines.atlas).toMatch(/^\d+ places? with stories · \d+ mapped$/);
  });

  it('speaks in singular and plural correctly', () => {
    const lines = portalLines({ placesWithStories: 1, placesMapped: 5, decadesWithStories: 0, decadesMapped: 13, playable: 1, stamps: 1 });
    expect(lines).toEqual({
      atlas: '1 place with stories · 5 mapped',
      time: '13 decades mapped',
      somewhere: '1 playable story to route through',
      passport: '1 stamp collected',
    });
  });
});
