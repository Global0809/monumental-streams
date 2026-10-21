import { describe, expect, it } from 'vitest';
import { emptyLibrary } from '../../shared/library.ts';
import { becauseYouWatched, recommend } from '../../shared/recommend.ts';
import type { Library } from '../../shared/types.ts';
import { NOW, fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const DAY = 86_400_000;
const at = (daysAgo: number) => NOW.getTime() - daysAgo * DAY;

/** Watched Brixton Sound Systems to the end yesterday; halfway through Old San Juan. */
function watchedBrixton(): Library {
  const lib = emptyLibrary();
  lib.history = [
    { video: 'video:viejo-san-juan', at: at(0.5) },
    { video: 'video:brixton-sound', at: at(1) },
  ];
  lib.progress['video:brixton-sound'] = { pos: 1310, dur: 1320, at: at(1), done: true };
  lib.progress['video:viejo-san-juan'] = { pos: 200, dur: 540, at: at(0.5), done: false };
  return lib;
}

describe('recommend — cold start', () => {
  const recs = recommend(cat, { library: emptyLibrary(), premium: false, now: NOW, limit: 13 });

  it('explains every recommendation', () => {
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('starts at the Miami gateway with the original teaser and free playable titles', () => {
    expect(recs[0].video.slug).toBe('wavemakers-teaser');
    expect(recs[0].reasons.map((r) => r.label)).toEqual(['Start at the Miami gateway', 'A first look at WAVEMAKERS', 'Free to watch now']);
    expect(recs[0].reasons[0]).toMatchObject({ kind: 'place', via: 'place:miami' });
    for (const r of recs.slice(0, 6)) expect(cat.effectiveAccess(r.video, NOW)).toBe('free');
  });

  it('ranks in non-increasing score order', () => {
    const scores = recs.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe('recommend — from a library', () => {
  const lib = watchedBrixton();
  const recs = recommend(cat, { library: lib, premium: false, now: NOW });

  it('leaves out completed and in-progress videos', () => {
    const ids = recs.map((r) => r.video.id);
    expect(ids).not.toContain('video:brixton-sound');
    expect(ids).not.toContain('video:viejo-san-juan');
  });

  it('explains recommendations by what was watched', () => {
    const blockParty = recs.find((r) => r.video.slug === 'block-party')!;
    expect(blockParty.reasons.map((r) => r.label)).toEqual(expect.arrayContaining(['Because you watched “Brixton Sound Systems”', 'Hip hop drew on Sound system culture']));
    for (const r of recs) expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('uses followed interests, saved places and passport stamps as signals', () => {
    const l = emptyLibrary();
    l.interests['interest:film'] = { at: at(2) };
    l.interests['interest:art'] = { at: at(3), removed: true };
    l.savedPlaces['place:puerto-rico'] = { at: at(1) };
    l.stamps['place:london'] = { at: at(5), video: 'video:brixton-sound' };
    const r = recommend(cat, { library: l, premium: true, now: NOW });
    const reasons = r.flatMap((x) => x.reasons.map((y) => y.label));
    expect(reasons).toContain('You follow Film');
    expect(reasons).not.toContain('You follow Art'); // tombstoned interest
    expect(reasons).toContain('In Puerto Rico, a place you saved');
    expect(reasons).toContain('In London, stamped in your passport');
    expect(r[0].video.slug).toBe('viejo-san-juan'); // film + saved Puerto Rico
  });

  it('ranks premium-locked titles lower for non-members', () => {
    const member = recommend(cat, { library: lib, premium: true, now: NOW });
    const rank = (list: typeof recs) => list.findIndex((r) => r.video.slug === 'block-party');
    expect(rank(recs)).toBeGreaterThan(rank(member));
    expect(recs.find((r) => r.video.slug === 'block-party')!.score).toBeLessThan(member.find((r) => r.video.slug === 'block-party')!.score);
  });

  it('honours explicit exclusions and the limit', () => {
    const r = recommend(cat, { library: lib, premium: false, now: NOW, limit: 3, exclude: ['video:miami-bass-reel'] });
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.video.id)).not.toContain('video:miami-bass-reel');
  });

  it('keeps one programme from dominating the rail', () => {
    // Following Art scores both Studio Sessions shorts and Signal Loop equally…
    const l = emptyLibrary();
    l.interests['interest:art'] = { at: at(1) };
    const r = recommend(cat, { library: l, premium: true, now: NOW, limit: 3 });
    // …so after the newest short, the older stand-alone loop beats a second Studio Sessions pick.
    expect(r.map((x) => x.video.slug)).toEqual(['south-beach-deco', 'signal-loop', 'wynwood-walls']);
    expect(r[2].score).toBeLessThan(r[1].score);
  });
});

describe('becauseYouWatched', () => {
  it('uses the most recent watched video that has unwatched relatives', () => {
    const result = becauseYouWatched(cat, watchedBrixton(), 4)!;
    expect(result.seed.slug).toBe('viejo-san-juan');
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(4);
    const ids = result.items.map((i) => i.video.id);
    expect(ids).not.toContain('video:viejo-san-juan');
    expect(ids).not.toContain('video:brixton-sound'); // completed
    for (const item of result.items) expect(item.reasons.length).toBeGreaterThan(0);
  });

  it('is null without history', () => {
    expect(becauseYouWatched(cat, emptyLibrary())).toBeNull();
  });
});
