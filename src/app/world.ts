/**
 * The shell's side of the living world.
 *
 *  · The arrangement director gives every route a default arrangement (arrangement.ts) the
 *    moment the route changes — in a layout effect, so it lands BEFORE the page's own
 *    useArrangement(...) effect and the page always wins. Once a page has declared its own
 *    arrangement, moves within the same page (e.g. /world/miami → /world/london) leave it
 *    alone: the page re-declares when its inputs change.
 *  · While a programme plays on a watch route (heartbeat → :root[data-state='watching']) the
 *    world takes the `watch` arrangement, and returns to what it was when playback stops.
 *  · Navigation previews: hovering or focusing a category destination highlights its stories
 *    in the world, and restores the page's highlight on leave.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router';
import type { Catalogue } from '../../shared/catalogue.ts';
import { sectionById, videosForSection, type SectionId } from '../../shared/sections.ts';
import type { ID } from '../../shared/types.ts';
import { createStore, useStore, type Store } from '../lib/store.ts';
import type { Arrangement, StageState } from '../stage/contract.ts';
import { stageStore } from '../stage/store.ts';
import { heartbeat } from '../systems/heartbeat.ts';
import { arrangementKey, defaultArrangement, organOf, previewableSection, watchingArrangement, type ArrangementCatalogue } from './arrangement.ts';

/* ───────────── Arrangement director ───────────── */

export interface ArrangementDirector {
  /** Call on every location change, before page effects run. */
  route(pathname: string, search: string): void;
  /** Call when playback starts/stops (and after a route change). */
  playing(isPlaying: boolean, pathname: string): void;
}

export function createArrangementDirector(cat: ArrangementCatalogue, store: Store<StageState> = stageStore): ArrangementDirector {
  let applied: string | null = null; // the arrangement the shell last wrote
  let organ: string | null = null;
  let beforeWatch: { arrangement: Arrangement; applied: string | null } | null = null;
  let watchKey: string | null = null;

  const write = (a: Arrangement, resetHighlight: boolean) => {
    applied = arrangementKey(a);
    store.set((s) => {
      const sameArrangement = arrangementKey(s.arrangement) === applied;
      if (sameArrangement && (!resetHighlight || s.highlight === null)) return s;
      return { ...s, arrangement: sameArrangement ? s.arrangement : a, highlight: resetHighlight ? null : s.highlight };
    });
  };

  return {
    route(pathname, search) {
      const nextOrgan = organOf(pathname);
      const sameOrgan = nextOrgan === organ;
      organ = nextOrgan;
      const current = arrangementKey(store.get().arrangement);
      const pageOwned = applied !== null && current !== applied;
      if (!sameOrgan) {
        beforeWatch = null;
        watchKey = null;
      }
      if (sameOrgan && pageOwned) return;
      write(defaultArrangement(pathname, search, cat), !sameOrgan);
    },
    playing(isPlaying, pathname) {
      const s = store.get();
      if (isPlaying) {
        if (s.arrangement.kind === 'watch') return;
        const next = watchingArrangement(s.arrangement, pathname, cat);
        if (!next) return;
        beforeWatch = { arrangement: s.arrangement, applied };
        write(next, false);
        watchKey = applied;
        return;
      }
      if (beforeWatch && watchKey && arrangementKey(s.arrangement) === watchKey) {
        const prev = beforeWatch;
        beforeWatch = null;
        watchKey = null;
        store.set((st) => ({ ...st, arrangement: prev.arrangement }));
        applied = prev.applied;
      }
    },
  };
}

/** Mount once in the Shell. */
export function useWorldDirector(cat: Catalogue) {
  const { pathname, search } = useLocation();
  const director = useMemo(() => createArrangementDirector(cat), [cat]);
  const path = useRef(pathname);
  path.current = pathname;

  // before any page effect: the page's own declaration (a passive effect) lands after this
  useLayoutEffect(() => {
    director.route(pathname, search);
  }, [director, pathname, search]);

  // after page effects (parents run their effects after children): keep `watch` while playing
  useEffect(() => {
    director.playing(heartbeat.get().playing, pathname);
  }, [director, pathname]);

  useEffect(() => {
    let was = heartbeat.get().playing;
    return heartbeat.subscribe(() => {
      const now = heartbeat.get().playing;
      if (now === was) return;
      was = now;
      director.playing(now, path.current);
    });
  }, [director]);
}

/* ───────────── Navigation previews (index ⇄ world) ───────────── */

/** The destination currently previewed from the navigation (tints the static world too). */
export const previewStore = createStore<SectionId | null>(null);
export const usePreviewSection = () => useStore(previewStore);

let preview: { ids: ID[]; prev: ID[] | null } | null = null;

/** Light a category's stories in the world while its destination is hovered or focused. */
export function startPreview(cat: Pick<Catalogue, 'videos'>, id: SectionId, store: Store<StageState> = stageStore) {
  if (!previewableSection(id)) {
    endPreview(store);
    return;
  }
  const ids = videosForSection(cat as Catalogue, sectionById(id)).map((v) => v.id);
  const s = store.get();
  const prev = preview && s.highlight === preview.ids ? preview.prev : s.highlight;
  preview = { ids, prev };
  store.set((st) => ({ ...st, highlight: ids }));
  previewStore.set(id);
}

/** Restore whatever the page had highlighted — unless the page has changed it meanwhile. */
export function endPreview(store: Store<StageState> = stageStore) {
  previewStore.set(null);
  if (!preview) return;
  const p = preview;
  preview = null;
  if (store.get().highlight === p.ids) store.set((st) => ({ ...st, highlight: p.prev }));
}
