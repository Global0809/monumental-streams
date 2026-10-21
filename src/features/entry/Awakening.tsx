/**
 * The Awakening — a ~4 second first-visit entry. A flat gold line finds a heartbeat, the
 * beat dissolves into the gold-chrome wordmark, two orbits draw themselves around it and the
 * living membrane blooms in behind.
 * Shown only on the home route for first-time visitors (or with ?intro=1); deep links and
 * returning visitors go straight to content. Skippable at any moment: Skip, Enter, Escape.
 * "Enter with sound" is the explicit gesture that wakes website audio.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, usePrefs } from '../../state/library.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { canAutoplay } from '../../systems/previews.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import './awakening.css';

const KEY = 'ms.awakened.v1';
/** Matches the fade-out in awakening.css. */
const LEAVE_MS = 600;

export function shouldAwaken(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('intro') === '1') return true;
  if (window.location.pathname !== '/') return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

export function Awakening({ onDone }: { onDone: () => void }) {
  const cat = useCatalogue();
  const prefs = usePrefs();
  const [stage, setStage] = useState<'pulse' | 'reveal' | 'ready' | 'leaving'>(() => (isReducedMotion() ? 'ready' : 'pulse'));
  const enterBtn = useRef<HTMLButtonElement>(null);
  const membrane = cat.artFor('art:living-membrane');

  const finish = useCallback(() => {
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
    setStage('leaving');
    window.setTimeout(onDone, isReducedMotion() ? 0 : LEAVE_MS);
  }, [onDone]);

  useEffect(() => {
    enterBtn.current?.focus({ preventScroll: true });
    if (isReducedMotion()) {
      const t = window.setTimeout(finish, 5000);
      return () => window.clearTimeout(t);
    }
    const t1 = window.setTimeout(() => setStage('reveal'), 1500);
    const t2 = window.setTimeout(() => setStage('ready'), 3400);
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

  const video = membrane?.preview && canAutoplay() ? membrane.preview : null;

  return (
    <div className="awakening" data-stage={stage} role="dialog" aria-modal="true" aria-labelledby="awakening-title" aria-describedby="awakening-desc">
      <div className="awakening-bg" aria-hidden="true">
        {video ? <video src={video} poster={membrane?.poster} autoPlay muted loop playsInline /> : membrane ? <img src={membrane.poster} alt="" /> : null}
      </div>
      <div className="awakening-bloom" aria-hidden="true" />
      <div className="awakening-orbits" aria-hidden="true">
        <span className="awakening-orbit awakening-orbit-gold">
          <i />
        </span>
        <span className="awakening-orbit awakening-orbit-iris">
          <i />
        </span>
      </div>
      <svg className="awakening-ekg" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 100 H470 l18 -22 l16 44 l22 -96 l22 128 l16 -70 l14 16 H1200" />
      </svg>
      <div className="awakening-core">
        <h1 id="awakening-title" className="awakening-word">
          <span className="awakening-mark">MONUMENTAL</span>
          <span className="awakening-streams">STREAMS</span>
        </h1>
        <p id="awakening-desc" className="awakening-tag">
          <span className="awakening-tag-lead">Stream the world.</span> Explore what you love. Discover where it lives.
        </p>
        <div className="awakening-actions">
          <button ref={enterBtn} type="button" className="btn btn-primary btn-lg" onClick={finish}>
            Enter
          </button>
          <button type="button" className="btn btn-chrome btn-lg" onClick={enterWithSound}>
            <Icon name="wave" size={18} />
            Enter with sound
          </button>
        </div>
      </div>
      <button type="button" className="awakening-skip" onClick={finish}>
        Skip intro <kbd aria-hidden="true">Esc</kbd>
      </button>
    </div>
  );
}
