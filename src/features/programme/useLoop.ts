/**
 * A preview loop bound to a <video> element, run through the shared preview manager.
 *
 *   autoplay  — plays while in view only when canAutoplay() allows it (motion, data saver,
 *               preview preference, hidden tab, programme playback all respected)
 *   wake/sleep — hover / focus gestures (canPreview() rules)
 *   toggle     — the viewer's explicit pause / play, which wins over both
 *
 * The source is attached lazily, the element is released when offscreen or unmounted, and
 * the manager's suspend events (player opened, tab hidden) re-evaluate the loop.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isTouch } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { canAutoplay, canPreview, releasePreview, requestPreview } from '../../systems/previews.ts';

type Mode = 'auto' | 'paused' | 'playing';

export interface LoopControls {
  /** The element is actually playing frames now. */
  playing: boolean;
  /** The viewer explicitly paused it. */
  paused: boolean;
  wake: () => void;
  sleep: () => void;
  toggle: () => void;
}

export function useLoop(ref: RefObject<HTMLVideoElement | null>, sources: { large?: string; small?: string } | null, opts: { autoplay?: boolean } = {}): LoopControls {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>('auto');
  const [playing, setPlaying] = useState(false);
  const inView = useRef(false);
  const hovering = useRef(false);
  const modeRef = useRef<Mode>('auto');
  modeRef.current = mode;
  const autoplay = !!opts.autoplay;
  const src = sources ? ((isTouch() || window.innerWidth < 768 ? sources.small : sources.large) ?? sources.large ?? sources.small) : undefined;

  const evaluate = useCallback(() => {
    const v = ref.current;
    if (!v || !src) return;
    const m = modeRef.current;
    const want =
      inView.current &&
      (m === 'paused' ? false : m === 'playing' ? canPreview() : (autoplay && canAutoplay()) || (hovering.current && canPreview()));
    if (want) {
      if (v.getAttribute('src') !== src) v.src = src;
      requestPreview(v);
    } else {
      releasePreview(v);
    }
  }, [ref, src, autoplay]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('emptied', onPause);
    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting;
        evaluate();
      },
      { threshold: 0.2 },
    );
    io.observe(v);
    const onSuspend = () => evaluate();
    window.addEventListener('ms:previews', onSuspend);
    return () => {
      io.disconnect();
      window.removeEventListener('ms:previews', onSuspend);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('emptied', onPause);
      releasePreview(v);
      // Drop the media resource so the decoder and buffered data are freed.
      v.removeAttribute('src');
      v.load();
    };
  }, [ref, src, evaluate]);

  // Motion preference changes (system or in-app) re-run the rules.
  useEffect(() => evaluate(), [reduced, mode, evaluate]);

  return {
    playing,
    paused: mode === 'paused',
    wake: () => {
      hovering.current = true;
      evaluate();
    },
    sleep: () => {
      hovering.current = false;
      evaluate();
    },
    toggle: () => setMode(() => (playing ? 'paused' : 'playing')),
  };
}
