/**
 * Pure helpers for programme + collection screens (and the home shelves that show
 * programmes). Everything is derived from the catalogue — no copy of catalogue text.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { Place, Programme, ProgrammeKind, ProgrammeStatus, Route, Video } from '../../../shared/types.ts';

export const PROGRAMME_KIND_LABEL: Record<ProgrammeKind, string> = {
  'original-series': 'Original series',
  'original-chapter': 'Chapter',
  'artist-campaign': 'Artist campaign',
  'demonstration-series': 'Demonstration series',
  collection: 'Collection',
};

export const PROGRAMME_STATUS_LABEL: Record<ProgrammeStatus, string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

/** A run of videos shown under one heading: a programme's own list, a season, or a child chapter. */
export interface EpisodeGroup {
  key: string;
  programme: Programme;
  season?: number;
  /** True when the group belongs to a child chapter of the programme being viewed. */
  chapter: boolean;
  videos: Video[];
}

/**
 * Videos of a programme in series order, grouped: the programme's own videos (split by season
 * when seasons exist), then each child chapter's videos. Empty groups are dropped.
 */
export function episodeGroups(cat: Catalogue, programme: Programme): EpisodeGroup[] {
  const groups: EpisodeGroup[] = [];
  const own = cat.videos
    .filter((v) => v.programme === programme.id)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));
  const seasons = [...new Set(own.map((v) => v.season))];
  if (seasons.length > 1 || (seasons.length === 1 && seasons[0] !== undefined)) {
    for (const s of seasons) {
      groups.push({ key: `${programme.id}#${s ?? 0}`, programme, season: s, chapter: false, videos: own.filter((v) => v.season === s) });
    }
  } else if (own.length) {
    groups.push({ key: programme.id, programme, chapter: false, videos: own });
  }
  for (const child of cat.programmeChildren(programme.id)) {
    const vids = cat.videos
      .filter((v) => v.programme === child.id)
      .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));
    if (vids.length) groups.push({ key: child.id, programme: child, chapter: true, videos: vids });
  }
  return groups;
}

/** "Teaser", "Episode 2", "Reel 3", "Film 1", "Feature"… — what this entry is within its programme. */
export function entryLabel(v: Video): string {
  const n = v.order && v.order > 0 ? ` ${v.order}` : '';
  switch (v.kind) {
    case 'teaser':
      return 'Teaser';
    case 'episode':
      return `Episode${n}`;
    case 'reel':
      return `Reel${n}`;
    case 'archive-film':
      return `Film${n}`;
    case 'feature':
      return 'Feature';
    case 'short':
      return `Short${n}`;
  }
}

/** Two-digit series numeral for display ("00" for a teaser, "03"…). */
export function entryNumeral(v: Video, index: number): string {
  const n = v.order ?? index + 1;
  return String(Math.max(0, n)).padStart(2, '0');
}

export interface ProgrammeTally {
  total: number;
  playable: number;
  /** Not playable for anyone right now (planned, coming soon, unavailable). */
  waiting: number;
}

export function programmeTally(cat: Catalogue, programme: Programme, now?: Date): ProgrammeTally {
  const vids = cat.videosForProgramme(programme.id);
  const playable = vids.filter((v) => cat.isPlayable(v, now)).length;
  return { total: vids.length, playable, waiting: vids.length - playable };
}

/** Short telemetry line for a programme card: "1 to watch now · 1 planned" / "Nothing to play yet". */
export function tallyLabel(t: ProgrammeTally): string {
  if (!t.total) return 'Nothing to play yet';
  const parts: string[] = [];
  if (t.playable) parts.push(`${t.playable} to watch now`);
  if (t.waiting) parts.push(`${t.waiting} not yet playable`);
  return parts.join(' · ');
}

/** Ordered stops of a journey-shaped programme (unknown ids dropped). */
export function routeStops(cat: Catalogue, programme: Programme): Place[] {
  return (programme.route ?? []).map((id) => cat.get(id) as Place | undefined).filter((p): p is Place => !!p && p.id.startsWith('place:'));
}

/** The programme route between two consecutive stops, if one is catalogued (programme routes first). */
export function legBetween(cat: Catalogue, from: string, to: string): Route | undefined {
  const legs = cat.routes.filter((r) => r.from === from && r.to === to);
  return legs.find((r) => r.kind === 'programme') ?? legs[0];
}

/**
 * Atlas link that follows a programme's journey: the first stop with the first leg's route
 * highlighted (e.g. /atlas/san-juan?route=wavemakers-san-juan-new-york). Null without a route.
 */
export function routeHref(cat: Catalogue, programme: Programme): string | null {
  const stops = routeStops(cat, programme);
  if (!stops.length) return null;
  const leg = stops[1] ? legBetween(cat, stops[0].id, stops[1].id) : undefined;
  return leg ? `/world/${stops[0].slug}?route=${leg.id.slice(leg.id.indexOf(':') + 1)}` : cat.href(stops[0].id);
}

/** The country/territory a place sits in (itself when it is one). */
export function countryOf(cat: Catalogue, place: Place): Place | undefined {
  if (place.kind === 'country' || place.kind === 'territory') return place;
  return cat.placeAncestors(place.id).find((p) => p.kind === 'country' || p.kind === 'territory');
}

/** "18.47° N · 66.11° W" */
export function coordLabel([lat, lon]: [number, number]): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/**
 * Original programmes for a shelf: each top-level original series followed by its chapters,
 * then any other originals. Artist campaigns are returned separately.
 */
export function originalsShelf(cat: Catalogue): { originals: Programme[]; campaigns: Programme[] } {
  const originals: Programme[] = [];
  const seen = new Set<string>();
  const add = (p: Programme) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      originals.push(p);
    }
  };
  for (const p of cat.programmes.filter((x) => x.original && !x.parent)) {
    add(p);
    for (const c of cat.programmeChildren(p.id)) if (c.original) add(c);
  }
  for (const p of cat.programmes) if (p.original) add(p);
  const campaigns = cat.programmes.filter((p) => p.kind === 'artist-campaign');
  return { originals, campaigns };
}

/** First playable entry of a programme in series order (resume candidates are the caller's job). */
export function firstPlayable(cat: Catalogue, programme: Programme, now?: Date): Video | undefined {
  return cat.videosForProgramme(programme.id).find((v) => cat.isPlayable(v, now));
}
