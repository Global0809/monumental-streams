/**
 * Motion system. Resolves the viewer preference (system | reduce | full) against
 * prefers-reduced-motion and publishes it on <html data-motion>. CSS and JS both read it.
 */
import type { MotionPref } from '../../shared/types.ts';
import { createStore, useStore } from '../lib/store.ts';

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const motionStore = createStore<{ pref: MotionPref; reduced: boolean }>({
  pref: 'system',
  reduced: mq?.matches ?? false,
});

function apply() {
  const { pref } = motionStore.get();
  const reduced = pref === 'reduce' || (pref === 'system' && (mq?.matches ?? false));
  motionStore.set((s) => (s.reduced === reduced ? s : { ...s, reduced }));
  document.documentElement.dataset.motion = reduced ? 'reduce' : 'full';
}

export function setMotionPref(pref: MotionPref) {
  motionStore.set((s) => ({ ...s, pref }));
  apply();
}

export function initMotion() {
  apply();
  mq?.addEventListener('change', apply);
}

export const isReducedMotion = () => motionStore.get().reduced;
export const useReducedMotion = () => useStore(motionStore).reduced;
