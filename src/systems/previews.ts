/**
 * Preview loop manager. Guarantees a small number of simultaneous preview videos,
 * pauses them when offscreen, in hidden tabs, or while a programme plays, and honours
 * the viewer's preview / motion / data-saver preferences.
 */
import { saveData, isTouch } from './device.ts';
import { isReducedMotion } from './motion.ts';

type Mode = 'auto' | 'hover' | 'off';

const active = new Set<HTMLVideoElement>();
let mode: Mode = 'auto';
let suspended = false;

const maxActive = () => (isTouch() ? 1 : 2);

export function setPreviewMode(m: Mode) {
  mode = m;
  if (m === 'off') stopAll();
}

/** Whether previews may autoplay without a hover/focus gesture (in-view hero loops). */
export function canAutoplay(): boolean {
  return mode === 'auto' && !suspended && !isReducedMotion() && !saveData() && !document.hidden;
}

/** Whether previews may play at all in response to hover/focus. */
export function canPreview(): boolean {
  return mode !== 'off' && !suspended && !saveData() && !document.hidden;
}

export function requestPreview(video: HTMLVideoElement): boolean {
  if (!canPreview()) return false;
  if (!active.has(video)) {
    while (active.size >= maxActive()) {
      const oldest = active.values().next().value as HTMLVideoElement | undefined;
      if (!oldest) break;
      releasePreview(oldest);
    }
    active.add(video);
  }
  video.muted = true;
  video.playsInline = true;
  const p = video.play();
  if (p) p.catch(() => active.delete(video));
  return true;
}

export function releasePreview(video: HTMLVideoElement) {
  active.delete(video);
  video.pause();
}

export function stopAll() {
  for (const v of [...active]) releasePreview(v);
}

/** Called by the player: programme playback pauses every background preview. */
export function suspendPreviews(on: boolean) {
  suspended = on;
  if (on) stopAll();
  window.dispatchEvent(new CustomEvent('ms:previews', { detail: { suspended: on } }));
}

export function initPreviews() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll();
    window.dispatchEvent(new CustomEvent('ms:previews', { detail: { suspended: document.hidden || suspended } }));
  });
}
