/**
 * Pure helpers for My World: tab parsing, the greeting, history day-grouping, relative sync
 * times and journey links. No DOM, no React — unit-tested in tests/unit/you-helpers.test.ts
 * and tests/unit/live-you-my-world.test.ts.
 */
import type { HistoryEntry, ID, Journey } from '../../../shared/types.ts';

export const YOU_TABS = ['continue', 'saved', 'places', 'journeys', 'history', 'interests', 'foryou', 'settings', 'membership'] as const;
export type YouTab = (typeof YOU_TABS)[number];

export const TAB_LABELS: Record<YouTab, string> = {
  continue: 'Continue',
  saved: 'Saved',
  places: 'Places',
  journeys: 'Journeys',
  history: 'History',
  interests: 'Interests',
  foryou: 'For you',
  settings: 'Settings',
  membership: 'Membership',
};

export function parseTab(v: string | null | undefined): YouTab {
  return (YOU_TABS as readonly string[]).includes(v ?? '') ? (v as YouTab) : 'continue';
}

/** "Good morning" 05–11, "Good afternoon" 12–17, "Good evening" otherwise (by local hour). */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The first word of a display name, for a personal greeting ("Ana María Colón" → "Ana"). */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** One or two initials for the identity orb. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key, e.g. "2026-10-20". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface HistoryDay {
  key: string;
  label: string;
  entries: HistoryEntry[];
}

/** Groups history newest-first by local day: "Today", "Yesterday", then dated headings. */
export function groupHistoryByDay(entries: HistoryEntry[], now: number = Date.now(), locale?: string): HistoryDay[] {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y.getTime());
  const thisYear = new Date(now).getFullYear();
  const groups = new Map<string, HistoryDay>();
  for (const h of [...entries].sort((a, b) => b.at - a.at)) {
    const key = dayKey(h.at);
    let g = groups.get(key);
    if (!g) {
      const d = new Date(h.at);
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== thisYear ? { year: 'numeric' } : {}) });
      g = { key, label, entries: [] };
      groups.set(key, g);
    }
    g.entries.push(h);
  }
  return [...groups.values()];
}

/** "just now", "3 min ago", "2 hr ago", "4 days ago". */
export function agoLabel(then: number, now: number = Date.now()): string {
  const s = Math.max(0, (now - then) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

export const historyKey = (h: Pick<HistoryEntry, 'video' | 'at'>) => `${h.video}\n${h.at}`;

/** Link that reopens a saved journey in its instrument. */
export function journeyHref(j: Pick<Journey, 'kind' | 'stops' | 'title' | 'params'>, slugOf: (id: ID) => string): string {
  const p = new URLSearchParams(j.params ?? {});
  if (j.kind === 'passport') {
    if (!p.has('stops') && j.stops.length) p.set('stops', j.stops.map(slugOf).join(','));
    if (!p.has('title') && j.title) p.set('title', j.title);
    const qs = p.toString();
    return qs ? `/passport?${qs}` : '/passport';
  }
  const qs = p.toString();
  return qs ? `/somewhere?${qs}` : '/somewhere';
}

/** "Wynwood" from "place:wynwood" when the entity is unknown. */
export const idTail = (id: ID) => id.slice(id.indexOf(':') + 1);

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Nearest offered playback speed (stored prefs may hold any number). */
export function nearestSpeed(rate: number): (typeof SPEEDS)[number] {
  let best: (typeof SPEEDS)[number] = 1;
  for (const s of SPEEDS) if (Math.abs(s - rate) < Math.abs(best - rate)) best = s;
  return best;
}
