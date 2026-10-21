/**
 * How the category and Live pages talk to the living world (src/stage) — both directions:
 *
 *   useWorldLit(id)      a seed under the pointer in the world lights its DOM twin
 *   seedPointer(id)      pointer / focus on a DOM item lights its seed (setHovered)
 *   previewSeeds(ids)    while a place or an era is engaged, only its seeds stay alight;
 *   endSeedPreview()     restores the page's own highlight afterwards
 *   useWorldEcho(ref)    mirrors the stage's highlight onto the DOM as data-world-highlight
 *                        ("all", or the lit seed ids) — the DOM can always say what the world
 *                        shows (QA, tests, styling), without re-rendering
 */
import { useEffect, useSyncExternalStore, type FocusEvent, type RefObject } from 'react';
import type { ID } from '../../../shared/types.ts';
import { setHighlight, setHovered, stageStore } from '../../stage/store.ts';

/** True while this story's seed is under the pointer in the world (or its DOM twin is engaged). */
export function useWorldLit(id: ID | undefined): boolean {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => !!id && stageStore.get().hovered === id,
    () => false,
  );
}

/** Pointer / focus handlers that light a story's seed while its DOM item is engaged. */
export function seedPointer(id: ID) {
  const release = () => {
    if (stageStore.get().hovered === id) setHovered(null);
  };
  return {
    onPointerEnter: () => setHovered(id),
    onPointerLeave: release,
    onFocus: () => setHovered(id),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release();
    },
  };
}

let previewing: { ids: ID[]; prev: ID[] | null } | null = null;

/** Light only these seeds while a place or an era is hovered or focused. */
export function previewSeeds(ids: ID[]) {
  const s = stageStore.get();
  const prev = previewing && s.highlight === previewing.ids ? previewing.prev : s.highlight;
  previewing = { ids, prev };
  setHighlight(ids);
}

/** Restore whatever the page had highlighted — unless the page changed it meanwhile. */
export function endSeedPreview() {
  if (!previewing) return;
  const p = previewing;
  previewing = null;
  if (stageStore.get().highlight === p.ids) setHighlight(p.prev);
}

export function useWorldEcho(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const write = () => {
      const el = ref.current;
      if (!el) return;
      const h = stageStore.get().highlight;
      const v = h === null ? 'all' : h.join(' ');
      if (el.dataset.worldHighlight !== v) el.dataset.worldHighlight = v;
    };
    write();
    return stageStore.subscribe(write);
  }, [ref]);
}
