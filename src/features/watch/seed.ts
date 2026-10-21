/**
 * DOM ⇄ world for story items that are not VideoPods (the Up next card, programme episode
 * rows, end-card picks): hovering or focusing the item lights its seed in the living world,
 * and a seed lit from the world (pointer over it) lights the item. VideoPod does the same
 * for seed cards.
 */
import { useEffect, useRef, useSyncExternalStore, type FocusEvent } from 'react';
import type { ID } from '../../../shared/types.ts';
import { setHighlight, setHovered, stageStore } from '../../stage/store.ts';

/** True while this story's seed is under the pointer in the world (or its item is hovered). */
export function useSeedLit(id: ID | null | undefined): boolean {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => !!id && stageStore.get().hovered === id,
    () => false,
  );
}

const release = (id: ID) => {
  if (stageStore.get().hovered === id) setHovered(null);
};

/** Pointer + focus handlers that light a seed while its item is hovered or focused. */
export function seedHover(id: ID) {
  return {
    onPointerEnter: () => setHovered(id),
    onPointerLeave: () => release(id),
    onFocus: () => setHovered(id),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release(id);
    },
  };
}

/** Let go of a seed this item may have lit (on unmount). */
export const releaseSeed = release;

/**
 * A temporary world highlight while an item is hovered or focused (a collection, a programme
 * card): its stories light up, and the page's own highlight comes back on leave — unless the
 * page changed it in the meantime.
 */
export function useHighlightPreview(ids: () => ID[]) {
  const held = useRef<{ ids: ID[]; prev: ID[] | null } | null>(null);
  const end = () => {
    const h = held.current;
    held.current = null;
    if (h && stageStore.get().highlight === h.ids) setHighlight(h.prev);
  };
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => () => endRef.current(), []);
  const start = () => {
    if (held.current) return;
    const list = ids();
    if (!list.length) return;
    held.current = { ids: list, prev: stageStore.get().highlight };
    setHighlight(list);
  };
  return {
    start,
    end,
    /** Spread onto the element: pointer + focus (focus moving inside the element keeps it). */
    handlers: {
      onPointerEnter: start,
      onPointerLeave: end,
      onFocus: start,
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) end();
      },
    },
  };
}
