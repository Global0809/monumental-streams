/**
 * My World → Settings. Every control writes to the viewer's preferences immediately
 * (and syncs when signed in); the Shell applies them to the live systems.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Preferences } from '../../../shared/types.ts';
import { useStore } from '../../lib/store.ts';
import { libraryActions, usePrefs } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound, soundStore } from '../../systems/sound/engine.ts';
import { Button, Segmented, Slider, Switch } from '../../ui/controls.tsx';
import { Dialog, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, SectionHeader } from '../../ui/Pod.tsx';
import { nearestSpeed, SPEEDS } from './helpers.ts';

function useSystemReducedMotion() {
  const [on, setOn] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return on;
}

const PREVIEW_NOTES: Record<Preferences['previews'], string> = {
  auto: 'Pods wake on hover or focus, and a single hero loop may play on its own when motion and data-saver settings allow.',
  hover: 'Loops play only while you hover or focus a pod. Nothing plays on its own.',
  off: 'No preview loops anywhere — posters only. Saves data and battery.',
};

export function SettingsPanel() {
  const prefs = usePrefs();
  const { session } = useSession();
  const s = useStore(soundStore);
  const reduced = useReducedMotion();
  const systemReduced = useSystemReducedMotion();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const closeReset = useCallback(() => setConfirmReset(false), []);

  const set = (patch: Partial<Preferences>) => libraryActions.setPrefs(patch);
  const setSound = (patch: Partial<Preferences['sound']>) => set({ sound: { ...prefs.sound, ...patch } });
  const engineOn = s.prefs.enabled;
  const wasOnBefore = prefs.sound.enabled && !engineOn;

  const toggleSound = async () => {
    if (!s.supported || busy) return;
    setBusy(true);
    try {
      if (engineOn) {
        await sound.disable();
        setSound({ enabled: false });
      } else {
        const ok = await sound.enable(); // this click is the required user gesture
        setSound({ enabled: ok });
        if (!ok) toast('This browser would not start audio.', { tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const resetGuest = () => {
    libraryActions.resetGuest();
    setConfirmReset(false);
    toast('This browser’s guest library was reset', { tone: 'success' });
  };

  return (
    <>
      <SectionHeader title="Make it yours" id="you-settings-h">
        Changes apply immediately{session.user ? ' and sync to your account' : ' and are kept in this browser'}.
      </SectionHeader>

      <div className="you-settings">
        <section className="you-set panel panel-pad" aria-labelledby="you-set-sound">
          <h3 id="you-set-sound" className="you-set-title">
            <Icon name="volume" size={20} /> Sound
          </h3>
          <p className="you-set-note">
            Website sound is <b>off by default</b> and stays silent until you turn it on. Everything works without it.
          </p>
          <div className="you-sound-row">
            <p className="you-set-state" role="status" aria-live="polite">
              {!s.supported ? 'Audio is not supported in this browser' : engineOn ? (prefs.sound.muted ? 'Sound on · muted' : 'Sound on') : 'Sound off'}
            </p>
            <Button variant={engineOn ? 'ghost' : 'primary'} icon={engineOn ? 'mute' : 'volume'} onClick={toggleSound} busy={busy} disabled={!s.supported} aria-pressed={engineOn}>
              {engineOn ? 'Turn sound off' : 'Turn sound on'}
            </Button>
          </div>
          {wasOnBefore ? <p className="you-set-hint muted">Sound was on last time. Browsers need a press before audio can wake, so use the button above.</p> : null}
          <Switch
            checked={prefs.sound.muted}
            onChange={(v) => setSound({ muted: v })}
            label="Mute all website sound"
            description="Keeps your levels but silences ambience and interface effects."
          />
          <Slider label="Master" value={prefs.sound.master} onChange={(v) => setSound({ master: v })} />
          <Slider label="Ambience (respiration)" value={prefs.sound.ambience} onChange={(v) => setSound({ ambience: v })} />
          <Slider label="Interface effects" value={prefs.sound.effects} onChange={(v) => setSound({ effects: v })} />
          <p className="you-set-hint muted">Programme volume is set in the player. Ambience falls silent while a programme plays.</p>
        </section>

        <section className="you-set panel panel-pad" aria-labelledby="you-set-motion">
          <h3 id="you-set-motion" className="you-set-title">
            <Icon name="wave" size={20} /> Motion
          </h3>
          <Segmented
            label="Motion"
            hideLabel
            value={prefs.motion}
            onChange={(v) => set({ motion: v })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduce', label: 'Reduce' },
              { value: 'full', label: 'Full' },
            ]}
          />
          <p className="you-set-note" role="status" aria-live="polite">
            Your device {systemReduced ? 'asks for reduced motion' : 'does not ask for reduced motion'}. Motion is currently <b>{reduced ? 'reduced' : 'full'}</b>
            {prefs.motion === 'system' ? ' (following your device).' : '.'}
          </p>
          <p className="you-set-hint muted">Reduced motion stills the heartbeat, flowing veins and transitions and stops preview loops from playing on their own.</p>

          <h3 id="you-set-previews" className="you-set-title you-set-title-sub">
            <Icon name="play" size={20} /> Preview loops
          </h3>
          <Segmented
            label="Preview loops"
            hideLabel
            value={prefs.previews}
            onChange={(v) => set({ previews: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'hover', label: 'On hover only' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="you-set-note">{PREVIEW_NOTES[prefs.previews]}</p>

          <h3 id="you-set-cursor" className="you-set-title you-set-title-sub">
            <Icon name="spark" size={20} /> Cursor
          </h3>
          <Segmented
            label="Cursor"
            hideLabel
            value={prefs.cursor}
            onChange={(v) => set({ cursor: v })}
            options={[
              { value: 'organic', label: 'Organic' },
              { value: 'native', label: 'Native' },
            ]}
          />
          <p className="you-set-note">
            {prefs.cursor === 'organic'
              ? 'The living cursor appears with a mouse or trackpad and says what a click will do. Touch screens never show it.'
              : 'Your system pointer is used everywhere.'}
          </p>
        </section>

        <section className="you-set panel panel-pad" aria-labelledby="you-set-captions">
          <h3 id="you-set-captions" className="you-set-title">
            <Icon name="captions" size={20} /> Captions
          </h3>
          <Switch
            checked={prefs.captions.enabled}
            onChange={(v) => set({ captions: { ...prefs.captions, enabled: v } })}
            label="Show captions by default"
            description="Turns on captions whenever a story has them. You can still switch them in the player."
          />
          <Segmented
            label="Caption size"
            value={prefs.captions.size}
            onChange={(v) => set({ captions: { ...prefs.captions, size: v } })}
            options={[
              { value: 'm', label: 'Medium' },
              { value: 'l', label: 'Large' },
              { value: 'xl', label: 'Extra large' },
            ]}
          />
          <div className="you-captions-sample" data-size={prefs.captions.size} aria-hidden="true">
            <Art art="art:still-tears-of-steel" alt="" className="you-captions-art" />
            <span className="you-captions-line">This is how captions will look</span>
          </div>
        </section>

        <section className="you-set panel panel-pad" aria-labelledby="you-set-playback">
          <h3 id="you-set-playback" className="you-set-title">
            <Icon name="settings" size={20} /> Playback
          </h3>
          <Switch
            checked={prefs.autoplayNext}
            onChange={(v) => set({ autoplayNext: v })}
            label="Play the next story automatically"
            description="When a story ends, the next one in its programme follows."
          />
          <Segmented
            label="Default speed"
            value={String(nearestSpeed(prefs.playbackRate))}
            onChange={(v) => set({ playbackRate: Number(v) })}
            options={SPEEDS.map((n) => ({ value: String(n), label: `${n}×` }))}
          />
          <Switch
            checked={prefs.nativeControls}
            onChange={(v) => set({ nativeControls: v })}
            label="Use the browser’s own video controls"
            description="Swaps the organic player controls for your browser’s built-in ones."
          />
        </section>

        <section className="you-set panel panel-pad" aria-labelledby="you-set-system">
          <h3 id="you-set-system" className="you-set-title">
            <Icon name="replay" size={20} /> The awakening &amp; this browser
          </h3>
          <p className="you-set-note">The awakening is the short intro shown on a first visit. You can watch it again any time.</p>
          <div className="you-pod-actions">
            {/* A full page load: the intro is decided when the app starts. */}
            <a href="/?intro=1" className="btn btn-ghost btn-md">
              <Icon name="replay" size={18} />
              <span>Replay the awakening</span>
            </a>
          </div>
          {session.user ? (
            <p className="you-set-hint muted">
              Signed in: your library lives in your account. Signing out returns this browser to an empty guest library; your account keeps everything.
            </p>
          ) : (
            <>
              <p className="you-set-note">
                Resetting wipes this browser&rsquo;s guest library: progress, saved items, journeys, history, interests, stamps and these settings.
              </p>
              <div className="you-pod-actions">
                <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
                  Reset this browser&rsquo;s guest library
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={confirmReset} onClose={closeReset} title="Reset the guest library?" labelledBy="you-reset-title">
        <div className="you-dialog">
          <p>
            Everything My World keeps in this browser is deleted: progress, saved stories and places, journeys, history, interests, passport stamps and
            settings. This can&rsquo;t be undone. To keep it, create an account first — your guest library merges into it.
          </p>
          <div className="you-dialog-actions">
            <Button onClick={closeReset}>Keep my library</Button>
            <Button variant="danger" icon="trash" onClick={resetGuest}>
              Reset library
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
