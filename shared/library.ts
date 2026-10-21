/**
 * The personal Library ("Your World"): defaults, repair of stored/received data, and a
 * conflict-free merge used by both the client (local ⇄ server) and the server (PUT merge).
 *
 * Merge rules — commutative, associative and idempotent so devices converge:
 *   • keyed entries (progress, saved, savedPlaces, interests, journeys): last writer wins
 *     by `at`; removals are tombstones (`removed: true`) that win only when newer (or tied);
 *   • history: union, deduplicated by (video, at), newest first, capped;
 *   • prefs: whole object, last writer wins by `prefs.at`;
 *   • passport stamps: the earliest stamp per place is kept (a stamp records a first visit);
 *   • updatedAt: the maximum of both sides.
 */
import type { HistoryEntry, ID, Journey, Library, Preferences, ProgressEntry, Stamped } from './types.ts';

/** Watching this fraction of a video marks it as done. */
export const PROGRESS_DONE_RATIO = 0.95;
export const HISTORY_CAP = 200;
/** Less than this is a sample, not a session worth resuming. */
const RESUME_MIN_SECONDS = 5;

export function defaultPreferences(): Preferences {
  return {
    sound: { enabled: false, master: 0.8, ambience: 0.5, effects: 0.7, programme: 1, muted: false },
    motion: 'system',
    previews: 'auto',
    captions: { enabled: false, lang: 'en', size: 'm' },
    playbackRate: 1,
    autoplayNext: true,
    nativeControls: false,
    cursor: 'organic',
    at: 0,
  };
}

export function emptyLibrary(): Library {
  return {
    version: 1,
    progress: {},
    saved: {},
    savedPlaces: {},
    journeys: {},
    history: [],
    interests: {},
    stamps: {},
    prefs: defaultPreferences(),
    updatedAt: 0,
  };
}

/* ───────────────────────── Queries ───────────────────────── */

/** Unfinished videos with meaningful progress, most recently watched first. */
export function continueWatching(lib: Library): { video: ID; entry: ProgressEntry }[] {
  return Object.entries(lib.progress)
    .filter(([, e]) => !e.done && e.pos > RESUME_MIN_SECONDS)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([video, entry]) => ({ video, entry }));
}

/** Ids of live (non-tombstoned) entries, newest first. */
function liveIds(record: Record<ID, Stamped>): ID[] {
  return Object.entries(record)
    .filter(([, s]) => !s.removed)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => id);
}

export function savedIds(lib: Library): ID[] {
  return liveIds(lib.saved);
}

export function savedPlaceIds(lib: Library): ID[] {
  return liveIds(lib.savedPlaces);
}

export function activeInterests(lib: Library): ID[] {
  return liveIds(lib.interests);
}

export function activeJourneys(lib: Library): Journey[] {
  return Object.values(lib.journeys)
    .filter((j) => !j.removed)
    .sort((a, b) => b.at - a.at);
}

/* ───────────────────────── Merge ───────────────────────── */

export function mergeLibraries(a: Library, b: Library): Library {
  // Either side may come from storage or the network; repair first so merging never throws.
  const x = migrateLibrary(a);
  const y = migrateLibrary(b);
  return {
    version: 1,
    progress: mergeRecords(x.progress, y.progress, pickProgress),
    saved: mergeRecords(x.saved, y.saved, pickStamped),
    savedPlaces: mergeRecords(x.savedPlaces, y.savedPlaces, pickStamped),
    journeys: mergeRecords(x.journeys, y.journeys, pickStamped),
    history: normaliseHistory([...x.history, ...y.history], Math.max(x.historyClearedAt ?? 0, y.historyClearedAt ?? 0)),
    interests: mergeRecords(x.interests, y.interests, pickStamped),
    stamps: mergeRecords(x.stamps, y.stamps, (p, q) => (p.at !== q.at ? (p.at < q.at ? p : q) : p.video <= q.video ? p : q)),
    prefs: x.prefs.at !== y.prefs.at ? (x.prefs.at > y.prefs.at ? x.prefs : y.prefs) : tieBreak(x.prefs, y.prefs),
    updatedAt: Math.max(x.updatedAt, y.updatedAt),
    ...(x.historyClearedAt || y.historyClearedAt ? { historyClearedAt: Math.max(x.historyClearedAt ?? 0, y.historyClearedAt ?? 0) } : {}),
  };
}

function mergeRecords<T>(a: Record<ID, T>, b: Record<ID, T>, pick: (x: T, y: T) => T): Record<ID, T> {
  const out: Record<ID, T> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Object.hasOwn(out, k) ? pick(out[k], v) : v;
  return out;
}

/** Deterministic choice between two equally new values, so merge order never matters. */
function tieBreak<T>(x: T, y: T): T {
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}

function pickStamped<T extends Stamped>(x: T, y: T): T {
  if (x.at !== y.at) return x.at > y.at ? x : y;
  if (!!x.removed !== !!y.removed) return x.removed ? x : y; // a tie goes to the removal
  return tieBreak(x, y);
}

function pickProgress(x: ProgressEntry, y: ProgressEntry): ProgressEntry {
  if (x.at !== y.at) return x.at > y.at ? x : y;
  if (x.done !== y.done) return x.done ? x : y;
  return x.pos !== y.pos ? (x.pos > y.pos ? x : y) : tieBreak(x, y);
}

/** Newest first, de-duplicated (a removal tombstone wins), cleared entries dropped, capped. */
function normaliseHistory(list: HistoryEntry[], clearedAt = 0): HistoryEntry[] {
  const byKey = new Map<string, HistoryEntry>();
  for (const h of list) {
    if (h.at <= clearedAt) continue;
    const key = `${h.video}\n${h.at}`;
    const prev = byKey.get(key);
    if (!prev || (h.removed && !prev.removed)) byKey.set(key, h);
  }
  return [...byKey.values()].sort((p, q) => q.at - p.at || (p.video < q.video ? -1 : p.video > q.video ? 1 : 0)).slice(0, HISTORY_CAP);
}

/** History the viewer should see (tombstones hidden). */
export function visibleHistory(lib: Library): HistoryEntry[] {
  return lib.history.filter((h) => !h.removed);
}

/* ───────────────────────── Migration / repair ───────────────────────── */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const safeKey = (k: string) => k.length > 0 && k.length <= 256 && !UNSAFE_KEYS.has(k);
const safeEntries = (v: unknown): [string, unknown][] => (isRecord(v) ? Object.entries(v).filter(([k]) => safeKey(k)) : []);

/**
 * Turn anything (a stored library from an older build, a hand-edited blob, garbage) into a
 * valid Library. Never throws: corrupt entries are dropped, corrupt values reset to defaults.
 */
export function migrateLibrary(input: unknown): Library {
  if (!isRecord(input)) return emptyLibrary();
  const lib: Library = {
    version: 1,
    progress: migrateProgress(input.progress),
    saved: migrateStamped(input.saved),
    savedPlaces: migrateStamped(input.savedPlaces),
    journeys: migrateJourneys(input.journeys),
    history: migrateHistory(input.history),
    interests: migrateStamped(input.interests),
    stamps: migrateStamps(input.stamps),
    prefs: migratePrefs(input.prefs),
    updatedAt: 0,
  };
  if (finite(input.historyClearedAt) && input.historyClearedAt > 0) {
    lib.historyClearedAt = input.historyClearedAt;
    lib.history = lib.history.filter((h) => h.at > (input.historyClearedAt as number));
  }
  lib.updatedAt = finite(input.updatedAt) ? input.updatedAt : latestWrite(lib);
  return lib;
}

function migrateProgress(v: unknown): Record<ID, ProgressEntry> {
  const out: Record<ID, ProgressEntry> = {};
  for (const [id, e] of safeEntries(v)) {
    if (!isRecord(e) || !finite(e.pos) || e.pos < 0) continue;
    const dur = finite(e.dur) && e.dur > 0 ? e.dur : 0;
    const pos = dur > 0 ? Math.min(e.pos, dur) : e.pos;
    const done = typeof e.done === 'boolean' ? e.done : dur > 0 && pos / dur >= PROGRESS_DONE_RATIO;
    out[id] = { pos, dur, at: finite(e.at) ? e.at : 0, done };
  }
  return out;
}

/** Accepts the current shape and simpler legacy ones: an id array, or id → true / timestamp. */
function migrateStamped(v: unknown): Record<ID, Stamped> {
  const out: Record<ID, Stamped> = {};
  if (Array.isArray(v)) {
    for (const id of v) if (typeof id === 'string' && safeKey(id)) out[id] = { at: 0 };
    return out;
  }
  for (const [id, s] of safeEntries(v)) {
    if (isRecord(s) && finite(s.at)) out[id] = s.removed === true ? { at: s.at, removed: true } : { at: s.at };
    else if (s === true) out[id] = { at: 0 };
    else if (finite(s)) out[id] = { at: s };
  }
  return out;
}

function migrateJourneys(v: unknown): Record<string, Journey> {
  const out: Record<string, Journey> = {};
  for (const [key, j] of safeEntries(v)) {
    if (!isRecord(j) || (j.kind !== 'passport' && j.kind !== 'somewhere')) continue;
    const id = typeof j.id === 'string' && safeKey(j.id) ? j.id : key;
    const journey: Journey = {
      id,
      title: typeof j.title === 'string' && j.title.trim() ? j.title : 'Untitled journey',
      kind: j.kind,
      stops: Array.isArray(j.stops) ? j.stops.filter((s): s is string => typeof s === 'string' && s.length > 0) : [],
      at: finite(j.at) ? j.at : 0,
    };
    const params = safeEntries(j.params).filter((e): e is [string, string] => typeof e[1] === 'string');
    if (params.length) journey.params = Object.fromEntries(params);
    if (j.removed === true) journey.removed = true;
    out[id] = journey;
  }
  return out;
}

function migrateHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const list: HistoryEntry[] = [];
  for (const h of v)
    if (isRecord(h) && typeof h.video === 'string' && h.video && finite(h.at)) list.push(h.removed === true ? { video: h.video, at: h.at, removed: true } : { video: h.video, at: h.at });
  return normaliseHistory(list);
}

function migrateStamps(v: unknown): Library['stamps'] {
  const out: Library['stamps'] = {};
  for (const [place, s] of safeEntries(v)) {
    if (isRecord(s) && finite(s.at) && typeof s.video === 'string') out[place] = { at: s.at, video: s.video };
  }
  return out;
}

function migratePrefs(v: unknown): Preferences {
  const d = defaultPreferences();
  if (!isRecord(v)) return d;
  const sound = isRecord(v.sound) ? v.sound : {};
  const captions = isRecord(v.captions) ? v.captions : {};
  const unit = (x: unknown, fallback: number) => (finite(x) ? Math.min(1, Math.max(0, x)) : fallback);
  const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
  const oneOf = <T extends string>(x: unknown, options: readonly T[], fallback: T): T => (options.includes(x as T) ? (x as T) : fallback);
  return {
    sound: {
      enabled: bool(sound.enabled, d.sound.enabled),
      master: unit(sound.master, d.sound.master),
      ambience: unit(sound.ambience, d.sound.ambience),
      effects: unit(sound.effects, d.sound.effects),
      programme: unit(sound.programme, d.sound.programme),
      muted: bool(sound.muted, d.sound.muted),
    },
    motion: oneOf(v.motion, ['system', 'reduce', 'full'], d.motion),
    previews: oneOf(v.previews, ['auto', 'hover', 'off'], d.previews),
    captions: {
      enabled: bool(captions.enabled, d.captions.enabled),
      lang: typeof captions.lang === 'string' && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(captions.lang) ? captions.lang : d.captions.lang,
      size: oneOf(captions.size, ['m', 'l', 'xl'], d.captions.size),
    },
    playbackRate: finite(v.playbackRate) && v.playbackRate >= 0.25 && v.playbackRate <= 4 ? v.playbackRate : d.playbackRate,
    autoplayNext: bool(v.autoplayNext, d.autoplayNext),
    nativeControls: bool(v.nativeControls, d.nativeControls),
    cursor: oneOf(v.cursor, ['organic', 'native'], d.cursor),
    at: finite(v.at) ? v.at : 0,
  };
}

/** Newest timestamp anywhere in a library — the repaired `updatedAt` when the stored one is unusable. */
function latestWrite(lib: Library): number {
  const stamps = [
    lib.prefs.at,
    ...lib.history.map((h) => h.at),
    ...[lib.progress, lib.saved, lib.savedPlaces, lib.interests, lib.journeys, lib.stamps].flatMap((r) => Object.values(r).map((e) => e.at)),
  ];
  return Math.max(0, ...stamps);
}
