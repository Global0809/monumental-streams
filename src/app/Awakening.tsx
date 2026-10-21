/**
 * The Awakening — a short first-visit entry where the world assembles itself. Thirteen
 * vertebrae — one per destination, each flashing its own hue — drop into a spine, the gold
 * cord lights up through them, and the wordmark settles beside it; as soon as the 3D world is
 * ready its own Monumental spine takes over (the CSS one dissolves into it). Then the world
 * is yours.
 *
 * Shown only on the home route for first-time visitors (or with ?intro=1); deep links and
 * returning visitors go straight to content. Skippable at any moment: Skip, Enter, Escape.
 * "Enter with sound" is the explicit gesture that wakes website audio. Reduced motion: no
 * assembly, everything is simply there.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SECTIONS } from '../../shared/sections.ts';
import { libraryActions, usePrefs } from '../state/library.ts';
import { useStage } from '../stage/store.ts';
import { isReducedMotion } from '../systems/motion.ts';
import { sound } from '../systems/sound/engine.ts';
import { Icon } from '../ui/Icon.tsx';
import './awakening.css';

const KEY = 'ms.awakened.v1';
/** Matches the fade-out in awakening.css. */
const LEAVE_MS = 700;

export function shouldAwaken(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('intro') === '1') return true;
  if (window.location.pathname.replace(/\/$/, '') !== import.meta.env.BASE_URL.replace(/\/$/, '')) return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

type Phase = 'assemble' | 'reveal' | 'ready' | 'leaving';

export function Awakening({ onDone }: { onDone: () => void }) {
  const prefs = usePrefs();
  const { quality, ready } = useStage();
  // once the 3D world is up, its own spine takes over from the CSS one
  const worldLive = quality !== 'off' && ready;
  const [phase, setPhase] = useState<Phase>(() => (isReducedMotion() ? 'ready' : 'assemble'));
  const enterBtn = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode: the intro simply shows again next time */
    }
    if (window.location.search.includes('intro=1')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('intro');
      window.history.replaceState(window.history.state, '', url);
    }
    setPhase('leaving');
    window.setTimeout(onDone, isReducedMotion() ? 0 : LEAVE_MS);
  }, [onDone]);

  useEffect(() => {
    enterBtn.current?.focus({ preventScroll: true });
    if (isReducedMotion()) {
      const t = window.setTimeout(finish, 5000);
      return () => window.clearTimeout(t);
    }
    const t1 = window.setTimeout(() => setPhase('reveal'), 1500);
    const t2 = window.setTimeout(() => setPhase('ready'), 2900);
    const t3 = window.setTimeout(finish, 7200);
    return () => [t1, t2, t3].forEach((t) => window.clearTimeout(t));
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const enterWithSound = async () => {
    await sound.enable();
    libraryActions.setPrefs({ sound: { ...prefs.sound, enabled: true, muted: false } });
    finish();
  };

  return (
    <div className="wake awakening" data-stage={phase} data-world={worldLive ? 'live' : 'static'} role="dialog" aria-modal="true" aria-labelledby="wake-title" aria-describedby="wake-desc">
      <div className="wake-veil" aria-hidden="true" />
      <div className="wake-spine" aria-hidden="true">
        <span className="wake-cord" />
        {SECTIONS.map((s, i) => (
          <span key={s.id} className="wake-vertebra" data-hue={s.id} style={{ ['--i' as string]: i }} />
        ))}
      </div>
      <div className="wake-core">
        <p className="eyebrow wake-eyebrow">The living archive</p>
        <h1 id="wake-title" className="wake-word">
          <span className="wake-mark">MONUMENTAL</span>
          <span className="wake-streams">STREAMS</span>
        </h1>
        <p id="wake-desc" className="wake-tag">
          <span className="wake-tag-lead">Stream the world.</span> Every story is a seed in one living archive — explore what you love and discover where it lives.
        </p>
        <div className="wake-actions">
          <button ref={enterBtn} type="button" className="btn btn-primary btn-lg" onClick={finish}>
            Enter
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={enterWithSound}>
            <Icon name="wave" size={18} />
            Enter with sound
          </button>
        </div>
      </div>
      <button type="button" className="wake-skip" onClick={finish}>
        Skip intro <kbd aria-hidden="true">Esc</kbd>
      </button>
    </div>
  );
}
