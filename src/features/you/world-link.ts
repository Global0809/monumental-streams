/**
 * DOM ⇄ world links for pages in this lane (My World, Take Me Somewhere). Video cards
 * (VideoPod) already light their own seed; these hooks do the same for rows that are not
 * cards — history entries, itinerary stops, journeys and places:
 *
 *   · seedHover(id)       reaching a row (pointer or keyboard focus) lights its seed
 *   · useSeedLitAny(ids)  true while the world's hovered seed is one of the row's stories,
 *                         whether that came from the pointer in the world or from the DOM
 *   · OrbitPreview        My World's transient highlight: a hovered journey, place or counter
 *                         singles out the saved seeds it is about (see orbitSubset)
 */
import { createContext, useContext, useSyncExternalStore, type FocusEvent } from 'react';
import type { ID } from '../../../shared/types.ts';
import { setHovered, stageStore } from '../../stage/store.ts';

export function useSeedLitAny(ids: readonly ID[]): boolean {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => {
      const h = stageStore.get().hovered;
      return !!h && ids.includes(h);
    },
    () => false,
  );
}

const release = (id: ID) => {
  if (stageStore.get().hovered === id) setHovered(null);
};

/** Spread onto a row: pointer or focus on it lights `id` in the world; leaving releases it. */
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

/** My World's orbit preview: called with the ids an item is about, then with null. */
export const OrbitPreview = createContext<(ids: ID[] | null) => void>(() => {});

/** Spread onto an item whose stories should be singled out in the orbit while it is reached. */
export function useOrbitPreview(ids: readonly ID[]) {
  const preview = useContext(OrbitPreview);
  return {
    onPointerEnter: () => preview([...ids]),
    onPointerLeave: () => preview(null),
    onFocus: () => preview([...ids]),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) preview(null);
    },
  };
}
