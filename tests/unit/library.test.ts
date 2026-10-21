import { describe, expect, it } from 'vitest';
import {
  HISTORY_CAP,
  PROGRESS_DONE_RATIO,
  activeInterests,
  activeJourneys,
  continueWatching,
  defaultPreferences,
  emptyLibrary,
  mergeLibraries,
  migrateLibrary,
  savedIds,
  savedPlaceIds,
} from '../../shared/library.ts';
import type { Library } from '../../shared/types.ts';

const lib = (patch: Partial<Library>): Library => ({ ...emptyLibrary(), ...patch });

describe('defaults', () => {
  it('match the documented preferences', () => {
    expect(defaultPreferences()).toEqual({
      sound: { enabled: false, master: 0.8, ambience: 0.5, effects: 0.7, programme: 1, muted: false },
      motion: 'system',
      previews: 'auto',
      captions: { enabled: false, lang: 'en', size: 'm' },
      playbackRate: 1,
      autoplayNext: true,
      nativeControls: false,
      cursor: 'organic',
      at: 0,
    });
    expect(PROGRESS_DONE_RATIO).toBe(0.95);
  });

  it('start from an empty, versioned library', () => {
    expect(emptyLibrary()).toMatchObject({ version: 1, progress: {}, saved: {}, history: [], updatedAt: 0 });
    expect(emptyLibrary()).not.toBe(emptyLibrary());
  });
});

describe('migrateLibrary', () => {
  it.each([null, undefined, 42, 'library', [], true, NaN])('turns %p into an empty library', (input) => {
    expect(migrateLibrary(input)).toEqual(emptyLibrary());
  });

  it('repairs corrupt fields and keeps the valid ones', () => {
    const repaired = migrateLibrary({
      version: 7,
      progress: {
        'video:a': { pos: 98, dur: 100, at: 5 },
        'video:b': { pos: 'x' },
        'video:c': { pos: -1, dur: 10, at: 1 },
        'video:d': { pos: 500, dur: 100, at: 2, done: false },
      },
      saved: ['video:a', 42],
      savedPlaces: { 'place:miami': { at: 3 }, 'place:x': 'nope' },
      interests: { 'interest:music': true, 'interest:film': { at: 4, removed: true }, 'interest:art': 9 },
      journeys: {
        j1: { title: 'Trip', kind: 'passport', stops: ['place:miami', 7], at: 9, params: { a: 'b', c: 3 } },
        j2: { kind: 'unknown' },
        j3: 'junk',
      },
      history: [{ video: 'video:a', at: 2 }, { video: 'video:a', at: 2 }, { video: 3 }, 'junk', { video: 'video:b', at: 8 }],
      stamps: { 'place:miami': { at: 1, video: 'video:a' }, 'place:x': { at: 'soon' } },
      prefs: { sound: { master: 4, enabled: 'yes', muted: true }, motion: 'warp', playbackRate: 2, captions: { lang: 'es', size: 'xl' }, cursor: 'native' },
      updatedAt: 'later',
    });
    expect(repaired.version).toBe(1);
    expect(repaired.progress).toEqual({
      'video:a': { pos: 98, dur: 100, at: 5, done: true }, // done inferred from the ratio
      'video:d': { pos: 100, dur: 100, at: 2, done: false }, // position clamped to duration
    });
    expect(repaired.saved).toEqual({ 'video:a': { at: 0 } });
    expect(repaired.savedPlaces).toEqual({ 'place:miami': { at: 3 } });
    expect(repaired.interests).toEqual({ 'interest:music': { at: 0 }, 'interest:film': { at: 4, removed: true }, 'interest:art': { at: 9 } });
    expect(repaired.journeys).toEqual({ j1: { id: 'j1', title: 'Trip', kind: 'passport', stops: ['place:miami'], at: 9, params: { a: 'b' } } });
    expect(repaired.history).toEqual([
      { video: 'video:b', at: 8 },
      { video: 'video:a', at: 2 },
    ]);
    expect(repaired.stamps).toEqual({ 'place:miami': { at: 1, video: 'video:a' } });
    expect(repaired.prefs).toEqual({
      ...defaultPreferences(),
      sound: { ...defaultPreferences().sound, master: 1, muted: true },
      playbackRate: 2,
      captions: { enabled: false, lang: 'es', size: 'xl' },
      cursor: 'native',
    });
    expect(repaired.updatedAt).toBe(9); // newest timestamp found when the stored one is unusable
  });

  it('never lets prototype keys through', () => {
    const repaired = migrateLibrary(JSON.parse('{"saved":{"__proto__":{"at":1},"constructor":{"at":1},"video:a":{"at":2}},"journeys":{"__proto__":{"kind":"passport","at":1}}}'));
    expect(Object.keys(repaired.saved)).toEqual(['video:a']);
    expect(Object.getPrototypeOf(repaired.saved)).toBe(Object.prototype);
    expect(repaired.journeys).toEqual({});
  });

  it('is idempotent and keeps a valid library intact', () => {
    const valid = lib({
      progress: { 'video:a': { pos: 30, dur: 100, at: 3, done: false } },
      saved: { 'video:a': { at: 4 }, 'video:b': { at: 5, removed: true } },
      journeys: { j: { id: 'j', title: 'Somewhere', kind: 'somewhere', stops: ['video:a'], at: 6, params: { minutes: '30' } } },
      history: [{ video: 'video:a', at: 3 }],
      stamps: { 'place:miami': { at: 2, video: 'video:a' } },
      updatedAt: 6,
    });
    expect(migrateLibrary(valid)).toEqual(valid);
    expect(migrateLibrary(migrateLibrary(valid))).toEqual(valid);
  });

  it('caps and orders history', () => {
    const history = Array.from({ length: HISTORY_CAP + 50 }, (_, i) => ({ video: `video:v${i}`, at: i }));
    const repaired = migrateLibrary({ history });
    expect(repaired.history).toHaveLength(HISTORY_CAP);
    expect(repaired.history[0].at).toBe(HISTORY_CAP + 49);
  });
});

describe('mergeLibraries', () => {
  it('lets the last writer win per progress entry', () => {
    const a = lib({ progress: { 'video:x': { pos: 10, dur: 100, at: 1, done: false }, 'video:y': { pos: 90, dur: 100, at: 9, done: false } } });
    const b = lib({ progress: { 'video:x': { pos: 40, dur: 100, at: 2, done: false }, 'video:y': { pos: 5, dur: 100, at: 3, done: false } } });
    const m = mergeLibraries(a, b);
    expect(m.progress['video:x'].pos).toBe(40);
    expect(m.progress['video:y'].pos).toBe(90);
  });

  it('applies tombstones only when they are newer (ties go to the removal)', () => {
    const a = lib({ saved: { 'video:new-removal': { at: 5, removed: true }, 'video:old-removal': { at: 1, removed: true }, 'video:tie': { at: 3 } } });
    const b = lib({ saved: { 'video:new-removal': { at: 4 }, 'video:old-removal': { at: 2 }, 'video:tie': { at: 3, removed: true }, 'video:only-b': { at: 1 } } });
    const m = mergeLibraries(a, b);
    expect(m.saved['video:new-removal']).toEqual({ at: 5, removed: true });
    expect(m.saved['video:old-removal']).toEqual({ at: 2 });
    expect(m.saved['video:tie'].removed).toBe(true);
    expect(savedIds(m)).toEqual(['video:old-removal', 'video:only-b']);
  });

  it('merges journeys, interests and saved places the same way', () => {
    const a = lib({
      journeys: { j: { id: 'j', title: 'Old', kind: 'passport', stops: [], at: 1 } },
      interests: { 'interest:music': { at: 2 } },
      savedPlaces: { 'place:miami': { at: 9, removed: true } },
    });
    const b = lib({
      journeys: { j: { id: 'j', title: 'Renamed', kind: 'passport', stops: ['place:miami'], at: 2 } },
      interests: { 'interest:music': { at: 3, removed: true }, 'interest:film': { at: 1 } },
      savedPlaces: { 'place:miami': { at: 8 } },
    });
    const m = mergeLibraries(a, b);
    expect(activeJourneys(m).map((j) => j.title)).toEqual(['Renamed']);
    expect(activeInterests(m)).toEqual(['interest:film']);
    expect(savedPlaceIds(m)).toEqual([]);
  });

  it('unions history without duplicates, newest first, capped', () => {
    const a = lib({ history: [{ video: 'video:x', at: 3 }, { video: 'video:y', at: 1 }] });
    const b = lib({ history: [{ video: 'video:x', at: 3 }, { video: 'video:z', at: 2 }] });
    expect(mergeLibraries(a, b).history).toEqual([
      { video: 'video:x', at: 3 },
      { video: 'video:z', at: 2 },
      { video: 'video:y', at: 1 },
    ]);
    const big = lib({ history: Array.from({ length: HISTORY_CAP }, (_, i) => ({ video: 'video:a', at: i * 2 })) });
    const other = lib({ history: Array.from({ length: HISTORY_CAP }, (_, i) => ({ video: 'video:b', at: i * 2 + 1 })) });
    const merged = mergeLibraries(big, other).history;
    expect(merged).toHaveLength(HISTORY_CAP);
    expect(merged[0]).toEqual({ video: 'video:b', at: HISTORY_CAP * 2 - 1 });
  });

  it('takes preferences as a whole from the newer side', () => {
    const a = lib({ prefs: { ...defaultPreferences(), motion: 'reduce', playbackRate: 1.5, at: 10 } });
    const b = lib({ prefs: { ...defaultPreferences(), cursor: 'native', at: 11 } });
    expect(mergeLibraries(a, b).prefs).toEqual(b.prefs);
  });

  it('keeps the earliest passport stamp and the latest updatedAt', () => {
    const a = lib({ stamps: { 'place:miami': { at: 5, video: 'video:late' } }, updatedAt: 50 });
    const b = lib({ stamps: { 'place:miami': { at: 2, video: 'video:first' }, 'place:london': { at: 7, video: 'video:l' } }, updatedAt: 20 });
    const m = mergeLibraries(a, b);
    expect(m.stamps).toEqual({ 'place:miami': { at: 2, video: 'video:first' }, 'place:london': { at: 7, video: 'video:l' } });
    expect(m.updatedAt).toBe(50);
  });

  it('is commutative, associative and idempotent', () => {
    const a = lib({
      saved: { 'video:1': { at: 3 }, 'video:2': { at: 3, removed: true } },
      progress: { 'video:1': { pos: 10, dur: 100, at: 4, done: false } },
      prefs: { ...defaultPreferences(), at: 5, motion: 'full' },
      history: [{ video: 'video:1', at: 4 }],
      updatedAt: 5,
    });
    const b = lib({
      saved: { 'video:1': { at: 3, removed: true }, 'video:2': { at: 3 } },
      progress: { 'video:1': { pos: 20, dur: 100, at: 4, done: false } },
      prefs: { ...defaultPreferences(), at: 5, motion: 'reduce' },
      history: [{ video: 'video:2', at: 6 }],
      updatedAt: 6,
    });
    const c = lib({ savedPlaces: { 'place:miami': { at: 1 } }, stamps: { 'place:miami': { at: 1, video: 'video:1' } }, updatedAt: 2 });
    expect(mergeLibraries(a, b)).toEqual(mergeLibraries(b, a));
    expect(mergeLibraries(mergeLibraries(a, b), c)).toEqual(mergeLibraries(a, mergeLibraries(b, c)));
    expect(mergeLibraries(a, a)).toEqual(migrateLibrary(a));
  });

  it('survives corrupt input on either side', () => {
    const good = lib({ saved: { 'video:a': { at: 1 } } });
    expect(mergeLibraries(good, 'garbage' as unknown as Library).saved).toEqual({ 'video:a': { at: 1 } });
  });
});

describe('queries', () => {
  const library = lib({
    progress: {
      'video:recent': { pos: 60, dur: 600, at: 30, done: false },
      'video:older': { pos: 120, dur: 600, at: 10, done: false },
      'video:finished': { pos: 590, dur: 600, at: 40, done: true },
      'video:sampled': { pos: 3, dur: 600, at: 50, done: false },
    },
    savedPlaces: { 'place:a': { at: 1 }, 'place:b': { at: 3 }, 'place:c': { at: 2, removed: true } },
    journeys: {
      old: { id: 'old', title: 'Old', kind: 'passport', stops: [], at: 1 },
      gone: { id: 'gone', title: 'Gone', kind: 'passport', stops: [], at: 5, removed: true },
      new: { id: 'new', title: 'New', kind: 'somewhere', stops: [], at: 4 },
    },
  });

  it('continueWatching lists unfinished, meaningful progress newest first', () => {
    expect(continueWatching(library).map((c) => c.video)).toEqual(['video:recent', 'video:older']);
    expect(continueWatching(library)[0].entry.pos).toBe(60);
  });

  it('list live entries newest first', () => {
    expect(savedPlaceIds(library)).toEqual(['place:b', 'place:a']);
    expect(activeJourneys(library).map((j) => j.id)).toEqual(['new', 'old']);
  });
});
