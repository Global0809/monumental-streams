import { describe, expect, it } from 'vitest';
import { agoLabel, dayKey, groupHistoryByDay, journeyHref, nearestSpeed, parseTab } from '../../src/features/you/helpers.ts';

describe('parseTab', () => {
  it('accepts known tabs and falls back to continue', () => {
    expect(parseTab('history')).toBe('history');
    expect(parseTab('foryou')).toBe('foryou');
    expect(parseTab('nope')).toBe('continue');
    expect(parseTab(null)).toBe('continue');
  });
});

describe('groupHistoryByDay', () => {
  const now = new Date(2026, 9, 20, 15, 0).getTime(); // local 20 Oct 2026, 15:00
  const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).getTime();

  it('groups newest first into Today / Yesterday / dated days', () => {
    const groups = groupHistoryByDay(
      [
        { video: 'video:a', at: at(18, 9) },
        { video: 'video:b', at: at(20, 10) },
        { video: 'video:c', at: at(19, 23) },
        { video: 'video:d', at: at(20, 14) },
      ],
      now,
      'en-GB',
    );
    expect(groups.map((g) => g.label.split(' ')[0])).toEqual(['Today', 'Yesterday', 'Sunday']);
    expect(groups[0].entries.map((e) => e.video)).toEqual(['video:d', 'video:b']);
    expect(groups[2].key).toBe(dayKey(at(18, 9)));
  });

  it('adds the year only for other years', () => {
    const groups = groupHistoryByDay([{ video: 'video:x', at: new Date(2025, 0, 5, 12).getTime() }], now, 'en-GB');
    expect(groups[0].label).toContain('2025');
  });

  it('returns nothing for an empty history', () => {
    expect(groupHistoryByDay([], now)).toEqual([]);
  });
});

describe('agoLabel', () => {
  const now = 1_000_000_000_000;
  it('describes elapsed time briefly', () => {
    expect(agoLabel(now - 10_000, now)).toBe('just now');
    expect(agoLabel(now + 5_000, now)).toBe('just now');
    expect(agoLabel(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(agoLabel(now - 2 * 3_600_000, now)).toBe('2 hr ago');
    expect(agoLabel(now - 26 * 3_600_000, now)).toBe('1 day ago');
    expect(agoLabel(now - 5 * 86_400_000, now)).toBe('5 days ago');
  });
});

describe('journeyHref', () => {
  const slug = (id: string) => id.split(':')[1];
  it('rebuilds a passport route from its stops', () => {
    const href = journeyHref({ kind: 'passport', stops: ['place:miami', 'place:london'], title: 'Two cities' }, slug);
    const u = new URL(href, 'https://x.test');
    expect(u.pathname).toBe('/passport');
    expect(u.searchParams.get('stops')).toBe('miami,london');
    expect(u.searchParams.get('title')).toBe('Two cities');
  });
  it('keeps saved params when present', () => {
    const href = journeyHref({ kind: 'passport', stops: ['place:miami'], title: 'T', params: { stops: 'custom' } }, slug);
    expect(new URL(href, 'https://x.test').searchParams.get('stops')).toBe('custom');
  });
  it('reopens Take Me Somewhere with its params', () => {
    const href = journeyHref({ kind: 'somewhere', stops: ['video:a'], title: 'Set', params: { minutes: '20', mood: 'chill', seed: '7' } }, slug);
    const u = new URL(href, 'https://x.test');
    expect(u.pathname).toBe('/somewhere');
    expect(u.searchParams.get('minutes')).toBe('20');
    expect(u.searchParams.get('mood')).toBe('chill');
    expect(journeyHref({ kind: 'somewhere', stops: [], title: '' }, slug)).toBe('/somewhere');
  });
});

describe('nearestSpeed', () => {
  it('snaps stored rates to an offered speed', () => {
    expect(nearestSpeed(1)).toBe(1);
    expect(nearestSpeed(1.3)).toBe(1.25);
    expect(nearestSpeed(3)).toBe(2);
    expect(nearestSpeed(0.5)).toBe(0.75);
  });
});
