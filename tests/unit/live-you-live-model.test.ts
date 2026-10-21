import { describe, expect, it } from 'vitest';
import { categorySections } from '../../shared/sections.ts';
import type { ActivityItem, PlatformConfig } from '../../shared/types.ts';
import {
  activityInDate,
  availabilityWindows,
  bucketActivity,
  buildSchedule,
  dayParts,
  daysUntil,
  feedStatus,
  inSection,
  monthTicks,
  orbitAngle,
  orbitHorizon,
  publicationDays,
  publishedAgo,
  recentlyPublished,
  sectionFacets,
  untilLabel,
} from '../../src/features/live/model.ts';
import { fixtureCatalogue } from './fixture.ts';

// Local noon on 20 Oct 2026: day arithmetic follows the viewer's calendar in any time zone.
const now = new Date(2026, 9, 20, 12, 0);

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: 'a',
  kind: 'event',
  title: 'Item',
  summary: 'Summary',
  source: 'Monumental editorial',
  verifiedAt: '2026-10-01',
  ...over,
});

describe('dates', () => {
  it('counts calendar days from the viewer’s today', () => {
    expect(daysUntil('2026-10-20', now)).toBe(0);
    expect(daysUntil('2026-10-21', now)).toBe(1);
    expect(daysUntil('2026-12-01', now)).toBe(42);
    expect(daysUntil('2026-10-18', now)).toBe(-2);
    expect(Number.isNaN(daysUntil('not a date', now))).toBe(true);
  });

  it('words a real difference, never a countdown clock', () => {
    expect(untilLabel(0)).toBe('today');
    expect(untilLabel(1)).toBe('tomorrow');
    expect(untilLabel(42)).toBe('in 42 days');
    expect(untilLabel(Number.NaN)).toBe('');
  });

  it('reads date-only values as calendar dates', () => {
    const d = dayParts('2026-12-01', 'en-GB');
    expect(d.day).toBe('1');
    expect(d.year).toBe('2026');
    expect(d.long).toBe('1 December 2026');
  });

  it('labels recent publication days', () => {
    expect(publishedAgo('2026-10-20', now)).toBe('Today');
    expect(publishedAgo('2026-10-19', now)).toBe('Yesterday');
    expect(publishedAgo('2026-10-16', now)).toBe('4 days ago');
    expect(publishedAgo('2026-09-01', now)).toBeNull();
    expect(publishedAgo('2026-11-01', now)).toBeNull();
  });
});

describe('maintained activity', () => {
  it('drops items once they have ended (events last their start day)', () => {
    expect(activityInDate(item({ starts: '2026-10-20' }), now)).toBe(true);
    expect(activityInDate(item({ starts: '2026-10-19' }), now)).toBe(false);
    expect(activityInDate(item({ kind: 'release', starts: '2026-10-01' }), now)).toBe(true);
    expect(activityInDate(item({ kind: 'release', starts: '2026-10-01', ends: '2026-10-10' }), now)).toBe(false);
    expect(activityInDate(item({ kind: 'status' }), now)).toBe(true);
  });

  it('buckets into happening now, upcoming and undated notes', () => {
    const b = bucketActivity(
      [
        item({ id: 'past', starts: '2026-10-01' }),
        item({ id: 'today', starts: '2026-10-20T00:00:00Z', ends: '2026-10-22' }),
        item({ id: 'later', starts: '2026-11-03', title: 'B' }),
        item({ id: 'sooner', starts: '2026-10-30', title: 'A' }),
        item({ id: 'note', kind: 'status' }),
      ],
      now,
    );
    expect(b.now.map((a) => a.id)).toEqual(['today']);
    expect(b.upcoming.map((a) => a.id)).toEqual(['sooner', 'later']);
    expect(b.notices.map((a) => a.id)).toEqual(['note']);
  });
});

describe('the schedule', () => {
  const cat = fixtureCatalogue();

  it('takes only future availability windows from the catalogue', () => {
    const w = availabilityWindows(cat.videos, now);
    // fixture: block party opens to everyone on 15 Nov; Calle Ocho becomes playable 15 Jan
    expect(w.map((e) => [e.title, e.kind, e.date])).toEqual([
      ['Block Party Blueprint', 'opens-to-everyone', '2026-11-15'],
      ['Calle Ocho Nights', 'premiere', '2027-01-15'],
    ]);
    expect(availabilityWindows(cat.videos, new Date(2026, 10, 20))).toHaveLength(1);
    expect(availabilityWindows(cat.videos, new Date(2027, 1, 1))).toHaveLength(0);
  });

  it('merges dated activity and sorts soonest first', () => {
    const s = buildSchedule(cat.videos, [item({ id: 'fest', title: 'Festival', starts: '2026-11-01' }), item({ id: 'gone', starts: '2026-09-01' })], now);
    expect(s.map((e) => e.title)).toEqual(['Festival', 'Block Party Blueprint', 'Calle Ocho Nights']);
    expect(s[0].kind).toBe('event');
    expect(s[0].source).toContain('maintained listing');
    expect(s[1].source).toBe('Catalogue availability window');
  });

  it('sizes the orbit to hold the furthest change', () => {
    expect(orbitHorizon([], now)).toBe(90);
    expect(orbitHorizon([{ date: '2026-11-15' }], now)).toBe(90);
    expect(orbitHorizon([{ date: '2027-01-15' }], now)).toBe(120);
    expect(orbitHorizon([{ date: '2029-01-01' }], now)).toBe(365);
    expect(orbitAngle(0, 90)).toBe(0);
    expect(orbitAngle(45, 90)).toBe(180);
    expect(orbitAngle(400, 90)).toBe(360);
  });

  it('ticks the first of each month inside the horizon', () => {
    const t = monthTicks(now, 90, 'en-GB');
    expect(t.map((x) => x.days)).toEqual([12, 42, 73]);
    expect(t.map((x) => x.label)).toEqual(['Nov', 'Dec', 'Jan']);
  });
});

describe('recently published', () => {
  const cat = fixtureCatalogue();

  it('lists newest first and hides future publication dates', () => {
    const list = recentlyPublished(cat.videos, now);
    expect(list.length).toBe(cat.videos.filter((v) => v.published <= '2026-10-20').length);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].published >= list[i].published).toBe(true);
    expect(recentlyPublished(cat.videos, new Date(2026, 0, 1))).toEqual([]);
  });

  it('counts stories per publication day', () => {
    expect(publicationDays([{ published: '2026-10-20' }, { published: '2026-10-20' }, { published: '2026-10-02' }])).toEqual([
      { date: '2026-10-20', count: 2 },
      { date: '2026-10-02', count: 1 },
    ]);
  });

  it('filters by the same section rule the category pages use', () => {
    const sections = categorySections();
    const list = recentlyPublished(cat.videos, now);
    const facets = sectionFacets(list, sections);
    for (const f of facets) {
      expect(f.count).toBeGreaterThan(0);
      expect(f.count).toBeLessThanOrEqual(list.length);
    }
    const music = sections.find((s) => s.id === 'music')!;
    expect(inSection({ categories: ['interest:music'], kind: 'reel' }, music)).toBe(true);
    expect(inSection({ categories: ['interest:art'], kind: 'reel' }, music)).toBe(false);
    // sections with nothing published are not offered as filters
    expect(sectionFacets([{ categories: ['interest:music'], kind: 'reel' }], sections).map((f) => f.section.id)).toEqual(['music']);
  });
});

describe('integration honesty', () => {
  const config = (integrations: PlatformConfig['integrations']): PlatformConfig => ({
    billing: { mode: 'setup-pending', devPreviewEnabled: false },
    sync: { mode: 'server' },
    integrations,
    environment: 'development',
  });

  it('never reports broadcasts as connected without a live integration', () => {
    const s = feedStatus(config([{ id: 'activity', name: 'Current activity feed', status: 'not-connected', detail: 'No live feed is connected.' }]));
    expect(s.broadcasts.connected).toBe(false);
    expect(s.activity).toEqual({ connected: false, detail: 'No live feed is connected.' });
    expect(feedStatus(null).activity).toBeNull();
    expect(feedStatus(config([{ id: 'live', name: 'Live', status: 'connected', detail: 'Live source' }])).broadcasts.connected).toBe(true);
  });
});
