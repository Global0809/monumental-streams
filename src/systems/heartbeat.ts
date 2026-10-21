/**
 * The organism's heartbeat. One clock shared by breathing UI (CSS --beat-dur),
 * the ambience pulse and the cursor membrane. Idle 62 bpm; settles to 48 bpm while
 * a programme plays; stops entirely in hidden tabs.
 */
import { createStore } from '../lib/store.ts';

export const heartbeat = createStore<{ bpm: number; playing: boolean; hidden: boolean }>({
  bpm: 62,
  playing: false,
  hidden: typeof document !== 'undefined' ? document.hidden : false,
});

function publish() {
  const { playing, hidden } = heartbeat.get();
  const bpm = hidden ? 0 : playing ? 48 : 62;
  heartbeat.set((s) => (s.bpm === bpm ? s : { ...s, bpm }));
  document.documentElement.style.setProperty('--beat-dur', bpm ? `${(60 / bpm).toFixed(3)}s` : '0s');
  document.documentElement.dataset.state = playing ? 'watching' : 'roaming';
}

export function setProgrammePlaying(playing: boolean) {
  heartbeat.set((s) => ({ ...s, playing }));
  publish();
}

export function initHeartbeat() {
  publish();
  document.addEventListener('visibilitychange', () => {
    heartbeat.set((s) => ({ ...s, hidden: document.hidden }));
    publish();
  });
}
