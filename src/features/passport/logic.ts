/**
 * Culture Passport — pure helpers: URL state, stamps, ready-made journeys derived from the
 * catalogue, place search, and the fitted projection for the route schematic.
 *
 *   /passport                                → the first ready-made journey
 *   /passport?stops=san-juan,london&title=…  → any journey (place slugs, in order)
 *   /passport?stops=                         → a blank journey to build
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import { fold } from '../../../shared/text.ts';
import type { ID, Library, Movement, Place, PlaceKind, Programme, Route, Video } from '../../../shared/types.ts';

export const MAX_STOPS = 16;
export const MAX_TITLE = 80;

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  country: 'Country',
  territory: 'Territory',
  'constituent-country': 'Constituent country',
  state: 'State',
  county: 'County',
  city: 'City',
  borough: 'Borough',
  neighbourhood: 'Neighbourhood',
  district: 'District',
  venue: 'Venue',
};

const PROGRAMME_STATUS: Record<Programme['status'], string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

const ROUTE_KIND: Record<Route['kind'], string> = {
  migration: 'Migration',
  influence: 'Influence',
  exchange: 'Exchange',
  programme: 'Programme route',
};

/* ───────────── URL state ───────────── */

export function parsePassport(params: URLSearchParams, cat: Catalogue): { stops: ID[] | null; title: string | null } {
  const title = params.get('title')?.trim().slice(0, MAX_TITLE) || null;
  if (!params.has('stops')) return { stops: null, title };
  const stops: ID[] = [];
  for (const raw of (params.get('stops') ?? '').split(',')) {
    const slug = raw.trim().toLowerCase();
    if (!slug) continue;
    const place = cat.bySlug('place', slug);
    if (place && !stops.includes(place.id)) stops.push(place.id);
    if (stops.length >= MAX_STOPS) break;
  }
  return { stops, title };
}

/** "stops=a,b,c&title=…" — commas kept literal (slugs are URL-safe). */
export function passportSearch(cat: Catalogue, stops: ID[], title: string | null): string {
  const slugs = stops.map((id) => (cat.get(id) as Place | undefined)?.slug).filter((s): s is string => !!s);
  const t = title?.trim().slice(0, MAX_TITLE);
  return `stops=${slugs.join(',')}${t ? `&title=${encodeURIComponent(t)}` : ''}`;
}

export function derivedTitle(cat: Catalogue, stops: ID[]): string {
  if (!stops.length) return 'A new journey';
  if (stops.length === 1) return cat.label(stops[0]);
  return `${cat.label(stops[0])} to ${cat.label(stops[stops.length - 1])}`;
}

export const sameStops = (a: ID[], b: ID[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Stable id for a journey's content, so saving the same journey twice never duplicates it. */
export function journeyId(stops: ID[], title: string): string {
  let h = 0x811c9dc5;
  const s = `${stops.join(',')}|${title}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `passport-${(h >>> 0).toString(36)}`;
}

/* ───────────── Stamps ───────────── */

export interface StampInfo {
  at: number;
  video: ID;
  place: ID;
}

/** A stop is stamped when the stop itself or any place inside it has a stamp; the earliest counts. */
export function stampFor(cat: Catalogue, stamps: Library['stamps'], stop: ID): StampInfo | null {
  let best: StampInfo | null = null;
  for (const id of cat.placeScope(stop)) {
    const s = stamps[id];
    if (s && (!best || s.at < best.at)) best = { at: s.at, video: s.video, place: id };
  }
  return best;
}

export function stampCount(cat: Catalogue, stamps: Library['stamps'], stops: ID[]): number {
  return stops.filter((s) => stampFor(cat, stamps, s)).length;
}

export function stampDate(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

/** Stories set at a stop (including places inside it): playable first, then by setting year. */
export function storiesFor(cat: Catalogue, stop: ID, now?: Date): Video[] {
  return [...cat.videosForPlace(stop, true)].sort(
    (a, b) =>
      Number(cat.isPlayable(b, now)) - Number(cat.isPlayable(a, now)) ||
      (a.setting?.from ?? 9999) - (b.setting?.from ?? 9999) ||
      a.title.localeCompare(b.title),
  );
}

export const INKS = ['ichor', 'plasma', 'aurum', 'ember'] as const;
export type Ink = (typeof INKS)[number];
export const inkFor = (index: number): Ink => INKS[((index % INKS.length) + INKS.length) % INKS.length];

/** A hand-stamped tilt in [-12°, 12°], stable per place. */
export function tiltFor(id: ID): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 25) - 12;
}

/* ───────────── Geography ───────────── */

export function haversineKm(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeKm(places: Pick<Place, 'coords'>[]): number {
  let km = 0;
  for (let i = 1; i < places.length; i++) km += haversineKm(places[i - 1].coords, places[i].coords);
  return km;
}

/** Greedy nearest-neighbour walk from `start` — a sensible on-foot order for a local trail. */
export function orderByProximity(places: Place[], start: ID): Place[] {
  const rest = [...places];
  const first = rest.findIndex((p) => p.id === start);
  if (first < 0) return rest;
  const out = rest.splice(first, 1);
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0;
    for (let i = 1; i < rest.length; i++) if (haversineKm(last.coords, rest[i].coords) < haversineKm(last.coords, rest[bi].coords)) bi = i;
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

export interface Projection {
  x(lon: number): number;
  y(lat: number): number;
  /** Linear map from land-path space (x = lon + 180, y = 90 − lat) into the frame. */
  matrix: [number, number, number, number, number, number];
  west: number;
  east: number;
  south: number;
  north: number;
}

/**
 * Equirectangular projection fitted to the points (cos-latitude corrected), centred in a
 * width × height frame with `pad` on every side. A tiny or single-point extent is widened to
 * `minSpan` degrees so the map never zooms to nothing.
 */
export function fitProjection(points: [number, number][], width: number, height: number, pad: number, minSpan = 2): Projection {
  const pts = points.length ? points : ([[30, -40]] as [number, number][]);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const latC = (south + north) / 2;
  const lonC = (west + east) / 2;
  const cos = Math.max(0.2, Math.cos((latC * Math.PI) / 180));
  const span = points.length ? minSpan : 80;
  const spanX = Math.max(east - west, span) * cos;
  const spanY = Math.max(north - south, span);
  const k = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const kx = k * cos;
  const ky = k;
  return {
    x: (lon) => width / 2 + (lon - lonC) * kx,
    y: (lat) => height / 2 + (latC - lat) * ky,
    matrix: [kx, 0, 0, ky, width / 2 - (180 + lonC) * kx, height / 2 + (latC - 90) * ky],
    west: lonC - width / 2 / kx,
    east: lonC + width / 2 / kx,
    south: latC - height / 2 / ky,
    north: latC + height / 2 / ky,
  };
}

const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 45];
/** A round graticule step giving about six lines or fewer across `span` degrees. */
export function graticuleStep(span: number): number {
  return STEPS.find((s) => span / s <= 6) ?? 60;
}

/* ───────────── Ready-made journeys ───────────── */

export type ReadyGroup = 'programme' | 'gateway' | 'sound' | 'archive';

export const READY_GROUP_LABEL: Record<ReadyGroup, string> = {
  programme: 'Programme routes',
  gateway: 'Launch gateway',
  sound: 'Atlantic sound routes',
  archive: 'Archive trail',
};

export interface ReadyJourney {
  key: string;
  group: ReadyGroup;
  kicker: string;
  title: string;
  summary: string;
  note?: string;
  stops: ID[];
}

const exists = (cat: Catalogue) => (id: ID) => !!cat.get(id);
const rootOf = (cat: Catalogue, id: ID) => cat.placeAncestors(id).at(-1)?.id ?? id;

/**
 * Journeys derived from the catalogue — nothing hand-written:
 *  • every programme with an ordered route (WAVEMAKERS: Puerto Rico → New York → London);
 *  • the launch gateway trail: the gateway city and the places of its county that have stories,
 *    or are active cities / neighbourhoods (honestly marked "No stories yet" when empty);
 *  • Atlantic sound routes: international cultural routes carrying a music movement;
 *  • the archive trail: archive films' places in the order their films are set.
 */
export function readyJourneys(cat: Catalogue, now?: Date): ReadyJourney[] {
  const out: ReadyJourney[] = [];
  const known = exists(cat);

  for (const p of cat.programmes) {
    const stops = (p.route ?? []).filter(known);
    if (stops.length < 2) continue;
    out.push({
      key: `programme-${p.slug}`,
      group: 'programme',
      kicker: `${p.original ? 'Monumental Original' : 'Programme'} · ${PROGRAMME_STATUS[p.status]}`,
      title: p.title,
      summary: p.tagline,
      note: p.statusNote,
      stops,
    });
  }

  const gateway = cat.places.find((p) => p.gateway);
  if (gateway) {
    const region = cat.placeAncestors(gateway.id).find((p) => p.kind === 'county') ?? gateway;
    const candidates = [gateway, ...cat.placeDescendants(region.id)].filter(
      (p, i, all) =>
        all.indexOf(p) === i &&
        p.id !== region.id &&
        (p.id === gateway.id ||
          (p.kind === 'venue' ? cat.videosForPlace(p.id, false).length > 0 : cat.videosForPlace(p.id, true).length > 0 || (p.status === 'active' && (p.kind === 'city' || p.kind === 'neighbourhood')))),
    );
    const stops = orderByProximity(candidates, gateway.id).map((p) => p.id);
    const watchable = stops.filter((s) => cat.videosForPlace(s, true).some((v) => cat.isPlayable(v, now))).length;
    out.push({
      key: `gateway-${gateway.slug}`,
      group: 'gateway',
      kicker: `Launch gateway · ${region.name}`,
      title: `${gateway.name} gateway trail`,
      summary: `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} across ${region.name}; ${watchable} with stories to watch now.`,
      stops,
    });
  }

  const music = (m: ID) => (cat.get(m) as Movement | undefined)?.categories.includes('interest:music') ?? false;
  const sound = cat.routes
    .filter((r) => r.kind !== 'programme' && known(r.from) && known(r.to) && rootOf(cat, r.from) !== rootOf(cat, r.to) && (r.movements ?? []).some(music))
    .sort((a, b) => a.period.from - b.period.from || a.label.localeCompare(b.label));
  for (const r of sound) {
    const years = r.period.to === null ? `since ${r.period.from}` : r.period.to === r.period.from ? `${r.period.from}` : `${r.period.from}–${r.period.to}`;
    out.push({
      key: `route-${r.id.split(':')[1]}`,
      group: 'sound',
      kicker: `${ROUTE_KIND[r.kind]} · ${years}`,
      title: r.label,
      summary: (r.movements ?? []).filter(known).map((m) => cat.label(m)).join(' · ') || r.summary,
      stops: [r.from, r.to],
    });
  }

  const films = cat.videos
    .filter((v) => v.footage.includes('archive') && v.setting && v.places.some(known))
    .sort((a, b) => a.setting!.from - b.setting!.from || a.title.localeCompare(b.title));
  const archiveStops: ID[] = [];
  for (const v of films) {
    const place = v.places.find(known)!;
    if (!archiveStops.includes(place)) archiveStops.push(place);
  }
  if (archiveStops.length) {
    const from = films[0].setting!.from;
    const to = Math.max(...films.map((v) => v.setting!.to));
    out.push({
      key: 'archive-trail',
      group: 'archive',
      kicker: `Archive films · ${from === to ? from : `${from}–${to}`}`,
      title: 'Archive trail',
      summary: `${archiveStops.length} ${archiveStops.length === 1 ? 'place' : 'places'} in the order their archive films are set.`,
      stops: archiveStops.slice(0, MAX_STOPS),
    });
  }
  return out;
}

/* ───────────── Place search (combobox) ───────────── */

/**
 * Places matching a query by name, alias or slug (diacritics folded): name prefix first, then
 * word prefix, then substring; ties go to places with more stories. An empty query suggests the
 * gateway and places with stories.
 */
export function searchPlaces(cat: Catalogue, query: string, exclude: Set<ID>, limit = 8): Place[] {
  const q = fold(query.trim());
  const stories = (p: Place) => cat.videosForPlace(p.id, true).length;
  const scored: { p: Place; s: number; n: number }[] = [];
  for (const p of cat.places) {
    if (exclude.has(p.id)) continue;
    const n = stories(p);
    if (!q) {
      scored.push({ p, s: (p.gateway ? 10 : 0) + (n > 0 ? 5 : 0) + (p.kind === 'city' ? 1 : 0), n });
      continue;
    }
    const name = fold(p.name);
    const words = [name, ...(p.aliases ?? []).map(fold)];
    let s = 0;
    if (name.startsWith(q)) s = 4;
    else if (words.some((w) => w.startsWith(q))) s = 3;
    else if (words.some((w) => w.split(/[^\p{L}\p{N}]+/u).some((part) => part.startsWith(q)))) s = 2;
    else if (words.some((w) => w.includes(q)) || p.slug.includes(q.replace(/\s+/g, '-'))) s = 1;
    if (s) scored.push({ p, s, n });
  }
  return scored
    .sort((a, b) => b.s - a.s || b.n - a.n || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

/** "Neighbourhood · Miami, United States" */
export function placeTrail(cat: Catalogue, p: Place): string {
  const parent = cat.placeAncestors(p.id)[0];
  const root = cat.placeAncestors(p.id).at(-1);
  const where = [parent?.name, root && root !== parent ? root.name : null].filter(Boolean).join(', ');
  return `${PLACE_KIND_LABEL[p.kind]}${where ? ` · ${where}` : ''}`;
}
