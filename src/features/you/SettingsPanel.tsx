/**
 * My World → Settings. Grouped by what they change: sound, motion and the living world,
 * captions, playback, and this browser. Every control writes to the viewer's preferences
 * immediately (and syncs when signed in); the Shell applies them to the live systems.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Preferences } from '../../../shared/types.ts';
import { useStore } from '../../lib/store.ts';
import { stageStore } from '../../stage/store.ts';
import { libraryActions, usePrefs } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound, soundStore } from '../../systems/sound/engine.ts';
import { Button, Segmented, Slider, Switch } from '../../ui/controls.tsx';
import { Dialog, toast } from '../../ui/feedback.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
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

/** What the living world is actually doing on this device (the stage decides from capability). */
function useWorldQuality() {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => {
      const s = stageStore.get();
      return s.quality === 'off' ? 'off' : s.ready ? s.quality : 'starting';
    },
    () => 'off' as const,
  );
}

const WORLD_NOTE = {
  webgl: 'The living world runs in full 3D on this device.',
  lite: 'The living world runs in a lighter 3D mode on this device: fewer seeds in view and a lower resolution, to keep it smooth.',
  starting: 'The living world is waking up on this device.',
  off: 'This device shows the still world: a designed field drawn without 3D, because WebGL 2 isn’t available here or the device is set to save power or data.',
} as const;

const PREVIEW_NOTES: Record<Preferences['previews'], string> = {
  auto: 'Cards wake on hover or focus, and a single hero loop may play on its own when motion and data-saver settings allow.',
  hover: 'Loops play only while you hover or focus a card. Nothing plays on its own.',
  off: 'No preview loops anywhere — posters only. Saves data and battery.',
};

function Group({ id, icon, title, children }: { id: string; icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="mw-set" aria-labelledby={id}>
      <h3 id={id} className="mw-set-title">
        <Icon name={icon} size={18} /> {title}
      </h3>
      {children}
    </section>
  );
}

export function SettingsPanel() {
  const prefs = usePrefs();
  const { session } = useSession();
  const s = useStore(soundStore);
  const reduced = useReducedMotion();
  const systemReduced = useSystemReducedMotion();
  const world = useWorldQuality();
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

      <div className="mw-settings">
        <Group id="you-set-sound" icon="volume" title="Sound">
          <p className="mw-set-note">
            Website sound is <b>off by default</b> and stays silent until you turn it on. Everything works without it.
          </p>
          <div className="mw-set-row">
            <p className="mw-set-state" role="status" aria-live="polite">
              {!s.supported ? 'Audio is not supported in this browser' : engineOn ? (prefs.sound.muted ? 'Sound on · muted' : 'Sound on') : 'Sound off'}
            </p>
            <Button icon={engineOn ? 'mute' : 'volume'} onClick={toggleSound} busy={busy} disabled={!s.supported} aria-pressed={engineOn}>
              {engineOn ? 'Turn sound off' : 'Turn sound on'}
            </Button>
          </div>
          {wasOnBefore ? <p className="mw-set-hint">Sound was on last time. Browsers need a press before audio can wake, so use the button above.</p> : null}
          <Switch
            checked={prefs.sound.muted}
            onChange={(v) => setSound({ muted: v })}
            label="Mute all website sound"
            description="Keeps your levels but silences ambience and interface effects."
          />
          <Slider label="Master" value={prefs.sound.master} onChange={(v) => setSound({ master: v })} />
          <Slider label="Ambience (respiration)" value={prefs.sound.ambience} onChange={(v) => setSound({ ambience: v })} />
          <Slider label="Interface effects" value={prefs.sound.effects} onChange={(v) => setSound({ effects: v })} />
          <p className="mw-set-hint">Programme volume is set in the player. Ambience falls silent while a programme plays.</p>
        </Group>

        <Group id="you-set-motion" icon="wave" title="Motion and the living world">
          <Segmented
            label="Motion"
            value={prefs.motion}
            onChange={(v) => set({ motion: v })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduce', label: 'Reduce' },
              { value: 'full', label: 'Full' },
            ]}
          />
          <p className="mw-set-note" role="status" aria-live="polite">
            Your device {systemReduced ? 'asks for reduced motion' : 'does not ask for reduced motion'}. Motion is currently <b>{reduced ? 'reduced' : 'full'}</b>
            {prefs.motion === 'system' ? ' (following your device).' : '.'}
          </p>
          <p className="mw-set-hint">
            Reduced motion turns the world&rsquo;s camera moves into cuts, stills its drift and the save flights, and stops preview loops from playing on their own.
          </p>
          <p className="mw-set-world" data-world={world}>
            <span className="mw-dot" aria-hidden="true" />
            <span>{WORLD_NOTE[world]} Search, navigation and playback never depend on it.</span>
          </p>

          <Segmented
            label="Preview loops"
            value={prefs.previews}
            onChange={(v) => set({ previews: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'hover', label: 'On hover only' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="mw-set-note">{PREVIEW_NOTES[prefs.previews]}</p>

          <Segmented
            label="Cursor"
            value={prefs.cursor}
            onChange={(v) => set({ cursor: v })}
            options={[
              { value: 'organic', label: 'Organic' },
              { value: 'native', label: 'Native' },
            ]}
          />
          <p className="mw-set-note">
            {prefs.cursor === 'organic'
              ? 'The living cursor appears with a mouse or trackpad and says what a click will do. Touch screens never show it.'
              : 'Your system pointer is used everywhere.'}
          </p>
        </Group>

        <Group id="you-set-captions" icon="captions" title="Captions">
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
          <div className="mw-captions-sample" data-size={prefs.captions.size} aria-hidden="true">
            <Art art="art:still-tears-of-steel" alt="" className="mw-captions-art" />
            <span className="mw-captions-line">This is how captions will look</span>
          </div>
        </Group>

        <Group id="you-set-playback" icon="settings" title="Playback">
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
        </Group>

        <Group id="you-set-system" icon="replay" title="The awakening and this browser">
          <p className="mw-set-note">The awakening is the short intro shown on a first visit. You can watch it again any time.</p>
          <div className="mw-set-actions">
            {/* A full page load: the intro is decided when the app starts (BASE_URL keeps static hosting working). */}
            <a href={`${import.meta.env.BASE_URL}?intro=1`} className="btn btn-ghost btn-md">
              <Icon name="replay" size={18} />
              <span>Replay the awakening</span>
            </a>
          </div>
          {session.user ? (
            <p className="mw-set-hint">
              Signed in: your library lives in your account. Signing out returns this browser to an empty guest library; your account keeps everything.
            </p>
          ) : (
            <>
              <p className="mw-set-note">
                Resetting wipes this browser&rsquo;s guest library: progress, saved items, journeys, history, interests, stamps and these settings.
              </p>
              <div className="mw-set-actions">
                <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
                  Reset this browser&rsquo;s guest library
                </Button>
              </div>
            </>
          )}
        </Group>
      </div>

      <Dialog open={confirmReset} onClose={closeReset} title="Reset the guest library?" labelledBy="you-reset-title">
        <div className="mw-dialog">
          <p>
            Everything My World keeps in this browser is deleted: progress, saved stories and places, journeys, history, interests, passport stamps and
            settings. This can&rsquo;t be undone. To keep it, create an account first — your guest library merges into it.
          </p>
          <div className="mw-dialog-actions">
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
