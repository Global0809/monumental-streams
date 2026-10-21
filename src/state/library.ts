/**
 * Personal library ("My World") — immediate local state with a replaceable persistence layer.
 *
 *   LibraryAdapter ── LocalAdapter   guest, this browser only (localStorage)
 *                 └─ ServerAdapter  signed in, synced via /api/me/library (cross-device)
 *
 * Every action updates the in-memory store synchronously (UI reacts instantly), then the
 * active adapter persists with a short debounce and a flush on pagehide. To connect a
 * different backend, implement LibraryAdapter and pass it to attachAdapter().
 */
import type { HistoryEntry, ID, Journey, Library, Preferences } from '../../shared/types.ts';
import { emptyLibrary, mergeLibraries, migrateLibrary, PROGRESS_DONE_RATIO } from '../../shared/library.ts';
import { api } from '../lib/api.ts';
import { createStore, useStore } from '../lib/store.ts';

export interface LibraryAdapter {
  kind: 'local' | 'server';
  load(): Promise<Library | null>;
  save(lib: Library, opts?: { urgent?: boolean }): Promise<Library | void>;
}

const GUEST_KEY = 'ms.library.guest.v1';

export class LocalAdapter implements LibraryAdapter {
  kind = 'local' as const;
  private key: string;
  constructor(key: string = GUEST_KEY) {
    this.key = key;
  }
  async load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? migrateLibrary(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  async save(lib: Library) {
    try {
      localStorage.setItem(this.key, JSON.stringify(lib));
    } catch {
      syncStore.set((s) => ({ ...s, state: 'error', message: 'This browser refused to store your library (storage full or blocked).' }));
    }
  }
  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

export class ServerAdapter implements LibraryAdapter {
  kind = 'server' as const;
  async load() {
    const r = await api<{ library: Library | null }>('/api/me/library');
    return r.library ? migrateLibrary(r.library) : null;
  }
  async save(lib: Library, opts?: { urgent?: boolean }) {
    const r = await api<{ library: Library }>('/api/me/library', { method: 'PUT', body: { library: lib }, keepalive: opts?.urgent });
    return migrateLibrary(r.library);
  }
}

export interface SyncState {
  mode: 'local' | 'server';
  state: 'idle' | 'saving' | 'saved' | 'error' | 'offline';
  lastSyncedAt: number | null;
  message?: string;
}

export const libraryStore = createStore<Library>(emptyLibrary());
export const syncStore = createStore<SyncState>({ mode: 'local', state: 'idle', lastSyncedAt: null });

let adapter: LibraryAdapter = new LocalAdapter();
let timer: number | null = null;
let dirty = false;

function persist(urgent = false) {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (!dirty) return;
  dirty = false;
  const snapshot = libraryStore.get();
  const a = adapter;
  if (a.kind === 'server') syncStore.set((s) => ({ ...s, state: 'saving' }));
  a.save(snapshot, { urgent })
    .then((merged) => {
      if (a !== adapter) return;
      // Pull in changes made on other devices without clobbering edits made meanwhile.
      if (merged) libraryStore.set((cur) => mergeLibraries(cur, merged));
      syncStore.set((s) => ({ ...s, state: 'saved', lastSyncedAt: Date.now(), message: undefined }));
    })
    .catch((err: Error & { status?: number }) => {
      dirty = true;
      syncStore.set((s) => ({
        ...s,
        state: err.status === 0 ? 'offline' : 'error',
        message: err.status === 0 ? 'Offline — changes are kept here and will sync when you reconnect.' : 'Sync failed — changes are kept here and will retry.',
      }));
      if (a.kind === 'server') {
        // keep a local safety copy while the server is unreachable
        void new LocalAdapter(`ms.library.cache.v1`).save(libraryStore.get());
        timer = window.setTimeout(() => persist(), 8000);
      }
    });
}

function schedule() {
  dirty = true;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => persist(), adapter.kind === 'server' ? 1200 : 250);
}

function update(fn: (lib: Library, now: number) => Library) {
  libraryStore.set((cur) => {
    const now = Date.now();
    const next = fn(cur, now);
    return next === cur ? cur : { ...next, updatedAt: now };
  });
  schedule();
}

/** Switch persistence when identity changes. Guest data merges into an account on sign-in. */
export async function attachAdapter(userId: string | null): Promise<{ mergedGuest: boolean }> {
  persist(true);
  if (!userId) {
    adapter = new LocalAdapter();
    syncStore.set({ mode: 'local', state: 'idle', lastSyncedAt: null });
    libraryStore.set((await adapter.load()) ?? emptyLibrary());
    return { mergedGuest: false };
  }
  const guest = new LocalAdapter();
  const server = new ServerAdapter();
  adapter = server;
  syncStore.set({ mode: 'server', state: 'saving', lastSyncedAt: null });
  const guestLib = await guest.load();
  const hasGuestData = !!guestLib && guestLib.updatedAt > 0;
  try {
    const remote = (await server.load()) ?? emptyLibrary();
    const merged = guestLib ? mergeLibraries(remote, guestLib) : remote;
    libraryStore.set(merged);
    if (hasGuestData) {
      dirty = true;
      persist();
      guest.clear(); // the guest copy now lives in the account; keep shared devices clean
    } else {
      syncStore.set((s) => ({ ...s, state: 'saved', lastSyncedAt: Date.now() }));
    }
    return { mergedGuest: hasGuestData };
  } catch {
    syncStore.set((s) => ({ ...s, state: 'offline', message: 'Could not reach your synced library — showing this device only.' }));
    if (guestLib) libraryStore.set(guestLib);
    return { mergedGuest: false };
  }
}

export function initLibraryPersistence() {
  const flush = () => persist(true);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  // Another tab changed the guest library: adopt it.
  window.addEventListener('storage', (e) => {
    if (e.key === GUEST_KEY && adapter.kind === 'local' && e.newValue) {
      try {
        libraryStore.set((cur) => mergeLibraries(cur, migrateLibrary(JSON.parse(e.newValue!))));
      } catch {
        /* ignore malformed */
      }
    }
  });
}

/* ───────────── Actions ───────────── */

const stamp = (removed: boolean, at: number) => (removed ? { at, removed: true } : { at });

export const libraryActions = {
  setProgress(video: ID, pos: number, dur: number) {
    if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return;
    update((lib, at) => ({
      ...lib,
      progress: { ...lib.progress, [video]: { pos: Math.max(0, pos), dur, at, done: pos / dur >= PROGRESS_DONE_RATIO } },
    }));
  },
  markComplete(video: ID, dur: number) {
    update((lib, at) => ({ ...lib, progress: { ...lib.progress, [video]: { pos: dur, dur, at, done: true } } }));
  },
  /** Remove from Continue Watching (keeps history). */
  clearProgress(video: ID) {
    update((lib, at) => {
      const cur = lib.progress[video];
      if (!cur) return lib;
      return { ...lib, progress: { ...lib.progress, [video]: { ...cur, pos: 0, done: false, at } } };
    });
  },
  toggleSave(video: ID): boolean {
    const saved = isSaved(libraryStore.get(), video);
    update((lib, at) => ({ ...lib, saved: { ...lib.saved, [video]: stamp(saved, at) } }));
    return !saved;
  },
  toggleSavePlace(place: ID): boolean {
    const cur = libraryStore.get().savedPlaces[place];
    const saved = !!cur && !cur.removed;
    update((lib, at) => ({ ...lib, savedPlaces: { ...lib.savedPlaces, [place]: stamp(saved, at) } }));
    return !saved;
  },
  saveJourney(j: Omit<Journey, 'at'>) {
    update((lib, at) => ({ ...lib, journeys: { ...lib.journeys, [j.id]: { ...j, at } } }));
  },
  removeJourney(id: string) {
    update((lib, at) => {
      const j = lib.journeys[id];
      return j ? { ...lib, journeys: { ...lib.journeys, [id]: { ...j, removed: true, at } } } : lib;
    });
  },
  recordHistory(video: ID) {
    update((lib, at) => {
      const last = lib.history.find((h) => !h.removed);
      if (last && last.video === video && at - last.at < 30 * 60_000) return lib;
      const entry: HistoryEntry = { video, at };
      return { ...lib, history: [entry, ...lib.history].slice(0, 200) };
    });
  },
  removeHistoryEntry(entry: HistoryEntry) {
    update((lib) => ({
      ...lib,
      history: lib.history.map((h) => (h.video === entry.video && h.at === entry.at ? { ...h, removed: true } : h)),
    }));
  },
  clearHistory() {
    update((lib, at) => ({ ...lib, history: lib.history.map((h) => ({ ...h, removed: true })), historyClearedAt: at }));
  },
  toggleInterest(category: ID): boolean {
    const cur = libraryStore.get().interests[category];
    const on = !!cur && !cur.removed;
    update((lib, at) => ({ ...lib, interests: { ...lib.interests, [category]: stamp(on, at) } }));
    return !on;
  },
  setPrefs(patch: Partial<Preferences>) {
    update((lib, at) => ({ ...lib, prefs: { ...lib.prefs, ...patch, at } }));
  },
  stamp(place: ID, video: ID): boolean {
    if (libraryStore.get().stamps[place]) return false;
    update((lib, at) => ({ ...lib, stamps: { ...lib.stamps, [place]: { at, video } } }));
    return true;
  },
  /** Wipe this device's guest library (My World → settings). */
  resetGuest() {
    new LocalAdapter().clear();
    libraryStore.set(emptyLibrary());
  },
};

export function isSaved(lib: Library, video: ID) {
  const s = lib.saved[video];
  return !!s && !s.removed;
}

export const useLibrary = () => useStore(libraryStore);
export const useSync = () => useStore(syncStore);
export const usePrefs = () => useStore(libraryStore).prefs;
