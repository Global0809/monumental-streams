/**
 * Stage store + page API. Pages call useArrangement(...) and setHighlight(...); the engine
 * (lazy-loaded) subscribes and animates. Imperative one-shots (save flight, pulse, focus) go
 * through stageCommands so they work whether or not WebGL is available.
 */
import { useEffect } from 'react';
import type { ID } from '../../shared/types.ts';
import { createStore, useStore } from '../lib/store.ts';
import type { Arrangement, StageEventName, StageEvents, StageState } from './contract.ts';

export const stageStore = createStore<StageState>({
  arrangement: { kind: 'quiet' },
  highlight: null,
  hovered: null,
  hoveredPlace: null,
  quality: 'off',
  ready: false,
});

export const useStage = () => useStore(stageStore);

const same = (a: Arrangement, b: Arrangement) => JSON.stringify(a) === JSON.stringify(b);

/** Declare the arrangement for the current route. Re-runs when its serialised value changes. */
export function useArrangement(arrangement: Arrangement, highlight: ID[] | null = null) {
  const key = JSON.stringify(arrangement);
  const hkey = highlight ? highlight.join('|') : '';
  useEffect(() => {
    stageStore.set((s) => (same(s.arrangement, arrangement) ? s : { ...s, arrangement }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    stageStore.set((s) => ({ ...s, highlight }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hkey]);
}

export const setHighlight = (ids: ID[] | null) => stageStore.set((s) => ({ ...s, highlight: ids }));
export const setHovered = (id: ID | null) => stageStore.set((s) => (s.hovered === id ? s : { ...s, hovered: id }));

/* ───────── Events (stage → pages) ───────── */

type Handler<K extends StageEventName> = (e: StageEvents[K]) => void;
const handlers: { [K in StageEventName]?: Set<Handler<K>> } = {};

export function onStage<K extends StageEventName>(name: K, fn: Handler<K>) {
  const table = handlers as Record<StageEventName, Set<Handler<K>> | undefined>;
  const set = table[name] ?? (table[name] = new Set<Handler<K>>());
  set.add(fn);
  return () => set.delete(fn);
}

export function emitStage<K extends StageEventName>(name: K, e: StageEvents[K]) {
  const set = handlers[name] as Set<Handler<K>> | undefined;
  if (!set || set.size === 0) return false;
  for (const fn of [...set]) fn(e);
  return true;
}

/** Subscribe for the lifetime of a component. */
export function useStageEvent<K extends StageEventName>(name: K, fn: Handler<K>) {
  useEffect(() => {
    const off = onStage(name, fn);
    return () => {
      off();
    };
  }, [name, fn]);
}

/* ───────── Commands (pages → engine), safe when the engine is absent ───────── */

export interface StageEngineCommands {
  flyToCore(id: ID, from?: DOMRect): void; // saving: the seed travels into My World
  pulse(id: ID): void; // a quick acknowledgement (e.g. resumed, stamped)
  /** Screen position of a seed (for DOM labels anchored to the world); null when hidden. */
  project(id: ID): { x: number; y: number; visible: boolean } | null;
}

let engine: StageEngineCommands | null = null;
export const attachEngine = (e: StageEngineCommands | null) => {
  engine = e;
};
export const stageCommands: StageEngineCommands = {
  flyToCore: (id, from) => engine?.flyToCore(id, from),
  pulse: (id) => engine?.pulse(id),
  project: (id) => engine?.project(id) ?? null,
};
