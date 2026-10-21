/**
 * Page chapters. A page declares its sections (useChapters) and the chapter rail renders them
 * as vertebrae along a cord: the cord fills with gold as you scroll, the active chapter is
 * lit, and clicking (or keyboard-activating) a vertebra jumps to it.
 */
import { useEffect } from 'react';
import { createStore, useStore } from '../lib/store.ts';

export interface Chapter {
  id: string; // element id of the section (should contain a heading)
  label: string;
}

export const chaptersStore = createStore<{ list: Chapter[]; active: string | null; progress: number }>({
  list: [],
  active: null,
  progress: 0,
});

export function useChapters(list: Chapter[]) {
  const key = list.map((c) => c.id).join('|');
  useEffect(() => {
    chaptersStore.set((s) => ({ ...s, list }));
    requestAnimationFrame(() => remeasure?.());
    return () => chaptersStore.set((s) => (s.list === list ? { ...s, list: [], active: null } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export const useChapterState = () => useStore(chaptersStore);

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = document.documentElement.dataset.motion === 'reduce';
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const focusable = el.matches('h1, h2, h3, [tabindex]') ? el : el.querySelector<HTMLElement>('h1, h2, h3');
  if (focusable) {
    if (!focusable.hasAttribute('tabindex')) focusable.setAttribute('tabindex', '-1');
    (focusable as HTMLElement).focus({ preventScroll: true });
  }
}

let remeasure: (() => void) | null = null;

/** Tracks scroll progress + the active chapter. One passive listener, rAF-throttled. */
export function initChapterTracking() {
  let ticking = false;
  const measure = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    const { list } = chaptersStore.get();
    let active: string | null = null;
    const line = window.innerHeight * 0.35;
    for (const c of list) {
      const el = document.getElementById(c.id);
      if (el && el.getBoundingClientRect().top <= line) active = c.id;
    }
    if (!active && list.length) active = list[0].id;
    const s = chaptersStore.get();
    if (Math.abs(s.progress - progress) > 0.002 || s.active !== active) chaptersStore.set({ ...s, progress, active });
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(measure);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  remeasure = onScroll; // pages registering chapters get an immediate measurement
  return onScroll;
}
