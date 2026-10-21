/**
 * Deferred history removals. The library has no "restore" for a removed history entry, so
 * My World hides the entry at once and commits the removal only after the Undo window
 * closes (or when the page is hidden/closed). Undo simply cancels the pending commit.
 * Module-level so Undo keeps working if the viewer switches tabs inside My World.
 */
import type { HistoryEntry } from '../../../shared/types.ts';
import { createStore, useStore } from '../../lib/store.ts';
import { libraryActions } from '../../state/library.ts';
import { historyKey } from './helpers.ts';

/** Slightly longer than an action toast stays on screen (7 s). */
const UNDO_WINDOW_MS = 7600;

const pendingStore = createStore<ReadonlySet<string>>(new Set());
const timers = new Map<string, { timer: number; entry: HistoryEntry }>();
let listening = false;

function without(key: string) {
  pendingStore.set((s) => {
    if (!s.has(key)) return s;
    const n = new Set(s);
    n.delete(key);
    return n;
  });
}

function commit(key: string) {
  const t = timers.get(key);
  if (!t) return;
  window.clearTimeout(t.timer);
  timers.delete(key);
  libraryActions.removeHistoryEntry(t.entry);
  without(key);
}

export function commitAllPendingHistory() {
  for (const key of [...timers.keys()]) commit(key);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('pagehide', commitAllPendingHistory);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) commitAllPendingHistory();
  });
}

/** Hide now, remove for real when the undo window closes. Returns the undo function. */
export function removeHistoryLater(entry: HistoryEntry): () => void {
  listen();
  const key = historyKey(entry);
  if (!timers.has(key)) {
    timers.set(key, { entry, timer: window.setTimeout(() => commit(key), UNDO_WINDOW_MS) });
    pendingStore.set((s) => new Set(s).add(key));
  }
  return () => {
    const t = timers.get(key);
    if (!t) return;
    window.clearTimeout(t.timer);
    timers.delete(key);
    without(key);
  };
}

/** Cancel every pending removal without committing (used after "Clear history"). */
export function dropPendingHistory() {
  for (const t of timers.values()) window.clearTimeout(t.timer);
  timers.clear();
  pendingStore.set(new Set());
}

export const usePendingHistory = () => useStore(pendingStore);
