/**
 * LIVE — pure data model. Live never invents a broadcast: everything on the page is derived
 * from three real sources and labelled with which one it came from.
 *
 *  1. Maintained activity (GET /api/activity): events, releases and status notes, in date.
 *  2. Catalogue availability windows: videos whose `availability.publicFrom` is still ahead
 *     (an early-access item opening to everyone, a dated premiere).
 *  3. Publication dates: what was most recently published on Monumental (not live).
 *
 * No DOM, no React — unit-tested in tests/unit/live-you-live-model.test.ts.
 */
import type { ActivityItem, PlatformConfig, Video } from '../../../shared/types.ts';

export const DAY_MS = 86_400_000;

/* ───────────── Dates ───────────── */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Epoch ms of an ISO date or datetime. Date-only values start at UTC midnight. */
export function startOf(iso: string): number {
  return DATE_ONLY.test(iso) ? Date.parse(`${iso}T00:00:00.000Z`) : Date.parse(iso);
}

/** End of an ISO date or datetime. Date-only values last the whole UTC day. */
export function endOf(iso: string): number {
  return DATE_ONLY.test(iso) ? Date.parse(`${iso}T23:59:59.999Z`) : Date.parse(iso);
}

/** Day number of the viewer's local calendar date of an instant. */
const localDay = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

/** Day number of a date as written: a date-only value is a calendar date, a datetime is read locally. */
function calendarDay(iso: string): number {
  if (DATE_ONLY.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NaN : localDay(new Date(t));
}

/** Whole calendar days from the viewer's today to `iso`: 0 = today, 1 = tomorrow, negative = past. */
export function daysUntil(iso: string, now: Date): number {
  return calendarDay(iso) - localDay(now);
}

/**
 * Calendar parts of a date for display. Date-only values are read in UTC so "2026-12-01" is
 * 1 December everywhere (a local reading would show 30 November west of Greenwich).
 */
export function dayParts(iso: string, locale?: string): { day: string; month: string; year: string; weekday: string; long: string } {
  const t = startOf(iso);
  if (Number.isNaN(t)) return { day: '', month: '', year: '', weekday: '', long: iso };
  const d = new Date(t);
  const tz = DATE_ONLY.test(iso) ? { timeZone: 'UTC' } : {};
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, { ...o, ...tz });
  return {
    day: f({ day: 'numeric' }),
    month: f({ month: 'short' }),
    year: f({ year: 'numeric' }),
    weekday: f({ weekday: 'long' }),
    long: f({ day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/** "today", "tomorrow", "in 41 days" — a real date difference, never a fabricated countdown. */
export function untilLabel(days: number): string {
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** "Today", "Yesterday", "3 days ago" for the last week; otherwise null (caller shows the date). */
export function publishedAgo(iso: string, now: Date): string | null {
  const d = -daysUntil(iso, now);
  if (!Number.isFinite(d) || d < 0) return null;
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return null;
}

/* ───────────── Maintained activity ───────────── */

/** Same rule as the server: shown until it ends; an event without an end lasts its start day. */
export function activityInDate(item: ActivityItem, now: Date): boolean {
  const until = item.ends ?? (item.kind === 'event' ? item.starts : undefined);
  if (!until) return true;
  const end = endOf(until);
  return Number.isNaN(end) || end >= now.getTime();
}

export interface ActivityBuckets {
  /** Started and not yet ended. */
  now: ActivityItem[];
  /** Dated and still ahead. */
  upcoming: ActivityItem[];
  /** Undated notes and releases (no start date). */
  notices: ActivityItem[];
}

export function bucketActivity(items: ActivityItem[], now: Date): ActivityBuckets {
  const out: ActivityBuckets = { now: [], upcoming: [], notices: [] };
  const t = now.getTime();
  for (const a of items) {
    if (!activityInDate(a, now)) continue;
    if (!a.starts) out.notices.push(a);
    else if (startOf(a.starts) <= t) out.now.push(a);
    else out.upcoming.push(a);
  }
  const byStart = (a: ActivityItem, b: ActivityItem) => (a.starts ?? '').localeCompare(b.starts ?? '') || a.title.localeCompare(b.title);
  out.now.sort(byStart);
  out.upcoming.sort(byStart);
  out.notices.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));
  return out;
}

/* ───────────── The schedule: every real, dated change still ahead ───────────── */

export type ScheduleKind = 'opens-to-everyone' | 'premiere' | 'event' | 'release';

export interface ScheduleEntry {
  key: string;
  kind: ScheduleKind;
  /** ISO date or datetime the change happens. */
  date: string;
  ends?: string;
  title: string;
  /** What happens on the date, in words. */
  what: string;
  /** Where the date comes from. */
  source: string;
  video?: Video;
  activity?: ActivityItem;
}

export const SCHEDULE_WORD: Record<ScheduleKind, string> = {
  'opens-to-everyone': 'Opens to everyone',
  premiere: 'Becomes playable',
  event: 'Event',
  release: 'Release',
};

/** Catalogue availability windows that are still ahead of `now`. */
export function availabilityWindows(videos: Video[], now: Date): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (const v of videos) {
    const a = v.availability;
    if (!a.publicFrom || (a.status !== 'early-access' && a.status !== 'coming-soon')) continue;
    const at = startOf(a.publicFrom);
    if (Number.isNaN(at) || at <= now.getTime()) continue;
    const early = a.status === 'early-access';
    out.push({
      key: `window:${v.id}`,
      kind: early ? 'opens-to-everyone' : 'premiere',
      date: a.publicFrom,
      title: v.title,
      what: early
        ? v.access === 'free'
          ? 'Premium members can watch now. It becomes free for everyone on this date.'
          : 'Premium members can watch now. Its early-access window closes on this date.'
        : 'Not playable yet. It becomes playable on this date.',
      source: 'Catalogue availability window',
      video: v,
    });
  }
  return out;
}

/** Availability windows plus dated activity still ahead, soonest first. */
export function buildSchedule(videos: Video[], activity: ActivityItem[], now: Date): ScheduleEntry[] {
  const windows = availabilityWindows(videos, now);
  const dated = bucketActivity(activity, now).upcoming.map<ScheduleEntry>((a) => ({
    key: `activity:${a.id}`,
    kind: a.kind === 'event' ? 'event' : 'release',
    date: a.starts!,
    ends: a.ends,
    title: a.title,
    what: a.summary,
    source: `${a.source} · maintained listing`,
    activity: a,
  }));
  return [...windows, ...dated].sort((a, b) => startOf(a.date) - startOf(b.date) || a.title.localeCompare(b.title));
}

/* ───────────── Recently published (never "live") ───────────── */

/** Everything published on or before `now`, newest first (ties by title). Future dates are hidden. */
export function recentlyPublished(videos: Video[], now: Date): Video[] {
  const t = now.getTime();
  return videos
    .filter((v) => {
      const p = startOf(v.published);
      return !Number.isNaN(p) && p <= t;
    })
    .sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
}

/** Publication days, newest first, with how many stories each brought — the honest "pulse". */
export function publicationDays(videos: Pick<Video, 'published'>[]): { date: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of videos) m.set(v.published.slice(0, 10), (m.get(v.published.slice(0, 10)) ?? 0) + 1);
  return [...m.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
}

/* ───────────── The signal orbit: dates around a ring ───────────── */

/** Days shown around the orbit: at least 90, enough to hold the furthest entry, at most a year. */
export function orbitHorizon(entries: Pick<ScheduleEntry, 'date'>[], now: Date): number {
  const far = entries.reduce((m, e) => Math.max(m, daysUntil(e.date, now)), 0);
  if (!Number.isFinite(far) || far <= 0) return 90;
  const padded = Math.ceil((far * 1.15) / 30) * 30;
  return Math.min(365, Math.max(90, padded));
}

/** Clockwise from the top ("now" at 0°). Entries beyond the horizon sit at the end of the ring. */
export function orbitAngle(days: number, horizon: number): number {
  const f = Math.min(1, Math.max(0, days / horizon));
  return f * 360;
}

export interface MonthTick {
  label: string;
  days: number;
}

/** The first day of each calendar month inside the horizon, for the orbit's ticks. */
export function monthTicks(now: Date, horizon: number, locale?: string): MonthTick[] {
  const out: MonthTick[] = [];
  const y = now.getFullYear();
  const m = now.getMonth();
  for (let i = 1; i <= 13; i++) {
    const d = new Date(Date.UTC(y, m + i, 1));
    const days = Math.round(d.getTime() / DAY_MS) - localDay(now);
    if (days > horizon) break;
    out.push({ label: d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }), days });
  }
  return out;
}

/* ───────────── Integration honesty ───────────── */

export interface FeedStatus {
  /** A live video source is connected (none exists in this build). */
  broadcasts: { connected: boolean; detail: string };
  /** The maintained activity feed (content/activity.json today). */
  activity: { connected: boolean; detail: string } | null;
}

export function feedStatus(config: PlatformConfig | null): FeedStatus {
  const live = config?.integrations.find((i) => i.id === 'live');
  const activity = config?.integrations.find((i) => i.id === 'activity');
  return {
    broadcasts: live
      ? { connected: live.status === 'connected', detail: live.detail }
      : { connected: false, detail: 'No live video source is configured on this server, so nothing can stream live.' },
    activity: activity ? { connected: activity.status === 'connected', detail: activity.detail } : null,
  };
}

/* ───────────── Section filter for recent publications ───────────── */

export interface SectionLike {
  id: string;
  interests?: string[];
  kinds?: string[];
}

/** Category membership — the same rule the category pages use (shared/sections.ts). */
export function inSection(v: Pick<Video, 'categories' | 'kind'>, s: SectionLike): boolean {
  return (s.interests ?? []).some((i) => v.categories.includes(i)) || (s.kinds ?? []).includes(v.kind);
}

/** Sections that actually hold at least one of `videos`, with counts, in navigation order. */
export function sectionFacets<S extends SectionLike>(videos: Pick<Video, 'categories' | 'kind'>[], sections: S[]): { section: S; count: number }[] {
  return sections.map((section) => ({ section, count: videos.filter((v) => inSection(v, section)).length })).filter((f) => f.count > 0);
}
