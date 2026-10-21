/**
 * Visible sound control. The first press is the explicit activation that creates the
 * audio context (browsers and the brief both require it). Levels live in a small
 * disclosure panel; every change persists to the viewer's preferences.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { libraryActions, usePrefs } from '../state/library.ts';
import { useStore } from '../lib/store.ts';
import { sound, soundStore } from '../systems/sound/engine.ts';
import { Icon } from '../ui/Icon.tsx';
import { Slider } from '../ui/controls.tsx';

export function SoundControl() {
  const prefs = usePrefs();
  const s = useStore(soundStore);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const levelsBtn = useRef<HTMLButtonElement>(null);
  const on = s.prefs.enabled && !s.prefs.muted;
  const wasOnBefore = prefs.sound.enabled && !s.prefs.enabled;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        // the panel unmounts: hand focus back to its button instead of dropping it on <body>
        if (wrap.current?.contains(document.activeElement)) levelsBtn.current?.focus();
        setOpen(false);
      } else if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = async () => {
    if (!s.supported) return;
    if (on) {
      await sound.disable();
      libraryActions.setPrefs({ sound: { ...prefs.sound, enabled: false } });
    } else {
      if (s.prefs.muted) sound.setPrefs({ muted: false });
      await sound.enable();
      libraryActions.setPrefs({ sound: { ...prefs.sound, enabled: true, muted: false } });
    }
  };

  const set = (patch: Partial<typeof prefs.sound>) => libraryActions.setPrefs({ sound: { ...prefs.sound, ...patch } });

  return (
    <div className="sound-control" ref={wrap}>
      <button
        type="button"
        className={`sound-toggle ${on ? 'is-on' : ''} ${wasOnBefore ? 'is-inviting' : ''}`}
        aria-pressed={on}
        aria-label={on ? 'Sound on: turn website sound off' : 'Sound off: turn website sound on'}
        title={s.supported ? (on ? 'Sound on' : wasOnBefore ? 'Sound was on last visit — press to wake it' : 'Sound off') : 'Audio is not supported in this browser'}
        disabled={!s.supported}
        onClick={toggle}
        data-cursor-label={on ? 'Sound off' : 'Wake sound'}
      >
        <span className="sound-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sound-word">{on ? 'Sound on' : 'Sound off'}</span>
      </button>
      <button
        ref={levelsBtn}
        type="button"
        className="icon-btn btn-quiet icon-btn-sm sound-more"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Sound levels"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="down" size={16} />
      </button>
      {open ? (
        <div id={panelId} className="sound-panel panel" role="group" aria-label="Sound levels">
          <p className="kicker">
            Sonic identity · <b>{on ? 'awake' : 'asleep'}</b>
          </p>
          <Slider label="Master" value={prefs.sound.master} onChange={(v) => set({ master: v })} />
          <Slider label="Ambience (respiration)" value={prefs.sound.ambience} onChange={(v) => set({ ambience: v })} />
          <Slider label="Interface effects" value={prefs.sound.effects} onChange={(v) => set({ effects: v })} />
          <p className="sound-note muted">
            Programme volume is set in the player. Ambience falls silent while a programme plays and the whole system sleeps when this tab is hidden.
          </p>
        </div>
      ) : null}
    </div>
  );
}
