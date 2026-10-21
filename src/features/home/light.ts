/**
 * Home ⇄ the living world. Pointing at (or focusing) a part of Home's editorial layer lights
 * the seeds it is about — a destination's stories, a decade's stories, a programme's entries;
 * leaving restores whatever was lit before, unless the highlight changed meanwhile (the same
 * contract as the navigation preview in app/world.ts). The reverse direction — a seed under
 * the pointer in the world lighting the DOM — reads stageStore.hovered (useHoveredSeed).
 */
import { useEffect, useRef, useSyncExternalStore, type FocusEvent, type PointerEvent } from 'react';
import type { ID } from '../../../shared/types.ts';
import { stageStore } from '../../stage/store.ts';

let lit: { ids: ID[]; prev: ID[] | null } | null = null;

/** Light these seeds (the rest of the world recedes). */
export function lightSeeds(ids: ID[]) {
  const s = stageStore.get();
  const prev = lit && s.highlight === lit.ids ? lit.prev : s.highlight;
  lit = { ids, prev };
  stageStore.set((st) => ({ ...st, highlight: ids }));
}

/** Put back what was lit before lightSeeds (unless something else changed it since). */
export function restoreSeeds() {
  if (!lit) return;
  const l = lit;
  lit = null;
  if (stageStore.get().highlight === l.ids) stageStore.set((st) => ({ ...st, highlight: l.prev }));
}

/** The seed under the pointer in the world, or under keyboard focus in the DOM. */
export function useHoveredSeed(): ID | null {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => stageStore.get().hovered,
    () => null,
  );
}

const keyOf = (target: EventTarget | null, zone: Element): string => {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-light]') : null;
  return el && zone.contains(el) ? (el.dataset.light ?? '') : '';
};

/**
 * Handlers for a zone of the page that lights seeds. `resolve(key)` maps the closest
 * [data-light] key under the pointer or focus ('' for the zone itself) to the seeds to light;
 * an empty list lights nothing. Pointer moves wait a moment for intent; focus is immediate.
 */
export function useLightZone(resolve: (key: string) => ID[] | null | undefined) {
  const current = useRef<string | null>(null);
  const timer = useRef(0);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  const apply = (k: string | null) => {
    if (k === current.current) return;
    current.current = k;
    const ids = k === null ? null : resolveRef.current(k);
    if (ids && ids.length) lightSeeds(ids);
    else restoreSeeds();
  };

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (current.current !== null) restoreSeeds();
      current.current = null;
    },
    [],
  );

  return {
    onPointerOver(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'touch') return;
      const k = keyOf(e.target, e.currentTarget);
      if (k === current.current) {
        window.clearTimeout(timer.current);
        return;
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => apply(k), current.current === null ? 90 : 40);
    },
    onPointerLeave(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'touch') return;
      window.clearTimeout(timer.current);
      apply(null);
    },
    onFocus(e: FocusEvent<HTMLElement>) {
      window.clearTimeout(timer.current);
      apply(keyOf(e.target, e.currentTarget));
    },
    onBlur(e: FocusEvent<HTMLElement>) {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      window.clearTimeout(timer.current);
      apply(null);
    },
  };
}
