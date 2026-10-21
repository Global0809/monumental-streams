/**
 * The player.
 *
 * One <video> per page. The server grants playback (or explains why not); an engine
 * (native HLS, hls.js or progressive MP4) feeds the element; custom controls sit on top
 * inside an error boundary that falls back to the browser's own controls if they fail.
 * While a programme plays the organism slows its heartbeat, ducks its ambience and
 * suspends every preview loop. Progress, history, completion and passport stamps are
 * written to the personal library as you watch.
 */
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { CaptionTrack, Programme, Video } from '../../../../shared/types.ts';
import { timecode } from '../../../lib/format.ts';
import { useCatalogue } from '../../../state/catalogue.tsx';
import { isSaved, libraryActions, libraryStore, useLibrary, usePrefs } from '../../../state/library.ts';
import { useSession } from '../../../state/session.ts';
import { isTouch } from '../../../systems/device.ts';
import { setProgrammePlaying } from '../../../systems/heartbeat.ts';
import { useReducedMotion } from '../../../systems/motion.ts';
import { suspendPreviews } from '../../../systems/previews.ts';
import { sound } from '../../../systems/sound/engine.ts';
import { Icon } from '../../../ui/Icon.tsx';
import { Pulse, toast } from '../../../ui/feedback.tsx';
import { announceSave } from '../../../ui/save.ts';
import { Controls, trackKey, type ControlsApi, type MediaState } from './Controls.tsx';
import { attachEngine, type Engine, type EngineKind, type FatalInfo, type QualityLevel } from './engine.ts';
import { classifyTarget } from './dom.ts';
import { shortcutFor, shouldHandle, type ShortcutAction } from './keys.ts';
import { EndCard, GateOverlay, PlannedOverlay, PosterOverlay, ProblemOverlay, ShortcutsDialog, type UpNext } from './Overlays.tsx';
import { isComplete, mediaErrorInfo, planStart, reachedStampThreshold, stampMessage } from './resume.ts';
import { chapterStep, clamp, JUMP_STEP, nearestSpeed, percentTime, rateLabel, seekPhrase, stepRate, usableDuration } from './time.ts';
import { usePlaybackSource } from './useSource.ts';
import { useThumbnailCues } from './useVtt.ts';
import { chapterAt, cueLines, type Cue } from './vtt.ts';
import './player.css';

export type { UpNext };

export interface PlayerHandle {
  /** Play from a moment (chapter lists, deep links inside the page). */
  playFrom(t: number): void;
}

export interface PlayerProps {
  video: Video;
  linkTime: number | null;
  next: UpNext | null;
  picks: Video[];
  chapters: Cue[];
  autoplay: boolean;
}

export type Phase = 'poster' | 'active' | 'ended';

/* ───────────── Error boundary around the custom chrome ───────────── */

class ChromeBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ───────────── Capability probes ───────────── */

let volumeOk: boolean | null = null;
function volumeSettable() {
  if (volumeOk === null) {
    try {
      const v = document.createElement('video');
      v.volume = 0.5;
      volumeOk = v.volume === 0.5 && !isTouch();
    } catch {
      volumeOk = false;
    }
  }
  return volumeOk;
}

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSupportsFullscreen?: boolean };

const fsElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null;
const canFullscreen = () =>
  !!(document.fullscreenEnabled || (document as FsDocument).webkitFullscreenEnabled || 'webkitEnterFullscreen' in HTMLVideoElement.prototype);

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({ video, linkTime, next, picks, chapters, autoplay }, ref) {
  const cat = useCatalogue();
  const prefs = usePrefs();
  const { session } = useSession();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const location = useLocation();

  const identityKey = `${session.user?.id ?? 'guest'}:${session.membership.premium ? 1 : 0}`;
  const source = usePlaybackSource(video, identityKey);
  const st = source.state;
  const data = st.status === 'ready' ? st.data : null;
  const ready = !!data;

  const art = cat.artFor(video.art);
  const measured = cat.runtime(video);
  const info = cat.mediaInfo(video);
  const programme = video.programme ? (cat.get(video.programme) as Programme | undefined) : undefined;
  const thumbs = useThumbnailCues(data?.thumbnails ?? info?.thumbnails);
  const tracks: CaptionTrack[] = data?.captions ?? [];

  const rootRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);

  const [plan] = useState(() => planStart({ entry: libraryStore.get().progress[video.id], linkTime, duration: measured }));
  const [phase, setPhaseState] = useState<Phase>('poster');
  const [m, setM] = useState<MediaState>(() => ({
    paused: true,
    ended: false,
    time: plan.at,
    duration: measured ?? 0,
    buffered: [],
    volume: clamp(libraryStore.get().prefs.sound.programme, 0, 1),
    muted: false,
    rate: nearestSpeed(libraryStore.get().prefs.playbackRate),
    waiting: false,
    pip: false,
    fullscreen: false,
  }));
  const patch = useCallback((p: Partial<MediaState>) => setM((s) => ({ ...s, ...p })), []);
  const [engineKind, setEngineKind] = useState<EngineKind | null>(null);
  const [levels, setLevels] = useState<{ list: QualityLevel[]; selected: number; playing: number }>({ list: [], selected: -1, playing: -1 });
  const [mediaError, setMediaError] = useState<{ title: string; detail: string } | null>(null);
  const [fallbackNative, setFallbackNative] = useState(false);
  const [forceMp4, setForceMp4] = useState(false);
  const [boundaryKey, setBoundaryKey] = useState(0);
  const native = prefs.nativeControls || fallbackNative;
  const [openMenu, setOpenMenuState] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [chromeShown, setChromeShownState] = useState(true);
  const [osd, setOsd] = useState<{ text: string; id: number } | null>(null);
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; id: number } | null>(null);
  const [cueText, setCueText] = useState<string[]>([]);
  const [iosFs, setIosFs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const activeTrack = prefs.captions.enabled ? (tracks.find((t) => t.lang === prefs.captions.lang) ?? tracks[0] ?? null) : null;

  /* ── mutable mirrors for event handlers ── */
  const phaseRef = useRef(phase);
  const openMenuRef = useRef(openMenu);
  const chromeShownRef = useRef(chromeShown);
  const nativeRef = useRef(native);
  const scrubbingRef = useRef(false);
  const startedRef = useRef(false); // first 'playing' happened
  const completedRef = useRef(false);
  const stampedRef = useRef(false);
  const lastSaveRef = useRef(0);
  const swappingRef = useRef(false);
  const pendingResumeRef = useRef<{ at: number; play: boolean } | null>(null);
  /** A start requested while the engine was still attaching (hls.js loads on demand). */
  const pendingStartRef = useRef<number | null>(null);
  const refreshesRef = useRef(0);
  const lastRefreshAt = useRef(0);
  const liveOn = useRef(false);
  const autoplayRef = useRef(autoplay);
  nativeRef.current = native;

  const setPhase = useCallback(
    (p: Phase) => {
      phaseRef.current = p;
      setPhaseState(p);
    },
    [],
  );
  const setOpenMenu = useCallback((id: string | null) => {
    openMenuRef.current = id;
    setOpenMenuState(id);
  }, []);

  /* ── organism orchestration ── */
  const setLive = useCallback((on: boolean) => {
    if (liveOn.current === on) return;
    liveOn.current = on;
    setProgrammePlaying(on);
    sound.duck(on);
    suspendPreviews(on);
  }, []);

  /* ── progress ── */
  const persist = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || !startedRef.current) return;
      const dur = usableDuration(el.duration, measured);
      if (!dur) return;
      lastSaveRef.current = Date.now();
      libraryActions.setProgress(video.id, clamp(el.currentTime, 0, dur), dur);
    },
    [video.id, measured],
  );

  /* ── chrome visibility ── */
  const hideTimer = useRef(0);
  const setChromeShown = useCallback((v: boolean) => {
    chromeShownRef.current = v;
    setChromeShownState(v);
  }, []);
  const keyFocusInChrome = () => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (!!chromeRef.current?.contains(a) || !!headRef.current?.contains(a)) && a.matches(':focus-visible');
  };
  const canHide = () => {
    const el = videoRef.current;
    return !!el && !el.paused && phaseRef.current === 'active' && !openMenuRef.current && !scrubbingRef.current && !keyFocusInChrome();
  };
  const poke = useCallback(() => {
    if (!chromeShownRef.current) setChromeShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (canHide()) setChromeShown(false);
    }, 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setChromeShown]);

  const osdSeq = useRef(0);
  const osdTimer = useRef(0);
  const flash = useCallback((text: string) => {
    window.clearTimeout(osdTimer.current);
    setOsd({ text, id: ++osdSeq.current });
    osdTimer.current = window.setTimeout(() => setOsd(null), 1200);
  }, []);

  /* ── transport ── */
  const safePlay = useCallback(
    (el: HTMLVideoElement) => {
      const p = el.play();
      if (p)
        p.catch((err: DOMException) => {
          if (err?.name === 'NotAllowedError') {
            patch({ paused: true });
            if (!startedRef.current) setPhase('poster');
          }
        });
    },
    [patch, setPhase],
  );

  const begin = useCallback(
    (at: number = plan.at) => {
      const el = videoRef.current;
      const eng = engineRef.current;
      if (!el || !eng) {
        // The grant is in but the engine is still attaching: honour the press once it is ready
        // instead of dropping it (the poster's Play is shown as soon as the grant arrives).
        if (el) pendingStartRef.current = at;
        return;
      }
      pendingStartRef.current = null;
      const hadFocus = !!rootRef.current?.contains(document.activeElement);
      setPhase('active');
      setOpenMenu(null);
      if (!eng.started()) eng.start(at);
      else if (Math.abs(el.currentTime - at) > 0.5) el.currentTime = at;
      patch({ time: at });
      safePlay(el);
      poke();
      if (hadFocus) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[data-pl-primary]')?.focus({ preventScroll: true }));
    },
    [plan.at, patch, poke, safePlay, setOpenMenu, setPhase],
  );

  const replay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPhase('active');
    completedRef.current = false;
    el.currentTime = 0;
    safePlay(el);
  }, [safePlay, setPhase]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (phaseRef.current === 'poster' || !engineRef.current?.started()) return begin();
    if (phaseRef.current === 'ended') return replay();
    if (el.paused) safePlay(el);
    else el.pause();
  }, [begin, replay, safePlay]);

  const seekTo = useCallback(
    (t: number) => {
      const el = videoRef.current;
      if (!el) return;
      const dur = usableDuration(el.duration, measured);
      const target = dur ? clamp(t, 0, dur) : Math.max(0, t);
      if (phaseRef.current === 'poster' || !engineRef.current?.started()) return begin(target);
      if (phaseRef.current === 'ended' && target < dur - 0.25) setPhase('active');
      el.currentTime = target;
      patch({ time: target });
      poke();
    },
    [begin, measured, patch, poke, setPhase],
  );
  const seekBy = useCallback((by: number) => seekTo((videoRef.current?.currentTime ?? 0) + by), [seekTo]);

  const volTimer = useRef(0);
  const setVolume = useCallback((v: number) => {
    const el = videoRef.current;
    if (!el) return;
    const nv = clamp(v, 0, 1);
    el.volume = nv;
    el.muted = nv === 0;
    // Mirror it now: the range input is controlled, and waiting for 'volumechange' lets React
    // snap it back to the old value in between, so quick key presses lost steps.
    patch({ volume: nv, muted: nv === 0 });
    window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => {
      const p = libraryStore.get().prefs;
      if (p.sound.programme !== nv) libraryActions.setPrefs({ sound: { ...p.sound, programme: nv } });
    }, 400);
  }, [patch]);
  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.muted || el.volume === 0) {
      el.muted = false;
      if (el.volume === 0) setVolume(0.5);
    } else el.muted = true;
  }, [setVolume]);

  const setRate = useCallback((r: number) => {
    const el = videoRef.current;
    const rate = nearestSpeed(r);
    if (el) {
      el.playbackRate = rate;
      el.defaultPlaybackRate = rate;
    }
    libraryActions.setPrefs({ playbackRate: rate });
  }, []);

  const setCaption = useCallback((t: CaptionTrack | null) => {
    const p = libraryStore.get().prefs;
    libraryActions.setPrefs({ captions: { ...p.captions, enabled: !!t, lang: t?.lang ?? p.captions.lang } });
  }, []);
  const toggleCaptions = useCallback(() => {
    if (!tracks.length) return flash('No captions for this video');
    const p = libraryStore.get().prefs;
    if (p.captions.enabled) {
      setCaption(null);
      flash('Captions off');
    } else {
      const t = tracks.find((x) => x.lang === p.captions.lang) ?? tracks.find((x) => x.default) ?? tracks[0];
      setCaption(t);
      flash(`Captions: ${t.label}`);
    }
  }, [tracks, flash, setCaption]);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current as FsElement | null;
    const el = videoRef.current as IosVideo | null;
    const doc = document as FsDocument;
    if (fsElement()) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
      else doc.webkitExitFullscreen?.();
      return;
    }
    if (!root) return;
    const lockLandscape = () => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (isTouch() && el && el.videoWidth > el.videoHeight) o?.lock?.('landscape').catch(() => undefined);
    };
    if (root.requestFullscreen) {
      root
        .requestFullscreen({ navigationUI: 'hide' })
        .then(lockLandscape)
        .catch(() => el?.webkitEnterFullscreen?.());
    } else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    else el?.webkitEnterFullscreen?.();
  }, []);

  const pipAllowed = typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
  const togglePip = useCallback(() => {
    const el = videoRef.current;
    if (!el || !pipAllowed) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    else if (engineRef.current?.started()) void el.requestPictureInPicture().catch(() => flash('Picture-in-picture isn’t available right now'));
    else flash('Start the video first');
  }, [pipAllowed, flash]);

  const goNext = useCallback(() => {
    if (next) navigate(next.href, { state: { autoplay: true } });
  }, [next, navigate]);

  /** Save toggle from the player (button or S): same flight + toast as everywhere else. */
  const toggleSave = useCallback(
    (from?: Element | null) => {
      const now = libraryActions.toggleSave(video.id);
      announceSave({ saved: now, title: video.title, from: from ?? saveRef.current, undo: () => libraryActions.toggleSave(video.id) });
      return now;
    },
    [video.id, video.title],
  );

  const switchToNative = useCallback(() => {
    libraryActions.setPrefs({ nativeControls: true });
    setOpenMenu(null);
  }, [setOpenMenu]);
  const switchToCustom = useCallback(() => {
    libraryActions.setPrefs({ nativeControls: false });
    setFallbackNative(false);
    setBoundaryKey((k) => k + 1);
  }, []);

  /* ── fatal errors: renew the grant once or twice, then explain ── */
  const handleFatal = (f: FatalInfo) => {
    if (swappingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMediaError({ title: 'You’re offline', detail: 'The video can’t load without a connection. Reconnect, then try again — we’ll resume at the same moment.' });
      setLive(false);
      return;
    }
    const renewable = f.kind === 'auth' || f.kind === 'network' || f.kind === 'src';
    if (renewable && refreshesRef.current < 3) {
      refreshesRef.current += 1;
      lastRefreshAt.current = Date.now();
      void source.refresh();
      return;
    }
    setMediaError(mediaErrorInfo(f.code ?? (f.kind === 'media' ? 3 : f.kind === 'src' ? 4 : 2)));
    setLive(false);
  };
  const handleFatalRef = useRef(handleFatal);
  handleFatalRef.current = handleFatal;

  const retryMedia = useCallback(async () => {
    setRefreshing(true);
    refreshesRef.current = 0;
    setMediaError(null);
    await source.refresh();
    setRefreshing(false);
  }, [source]);

  /* ── engine lifecycle: attach on every fresh grant, resume where we were ── */
  useEffect(() => {
    const el = videoRef.current;
    if (!data || !el) return;
    let cancelled = false;
    const p = libraryStore.get().prefs;
    el.volume = clamp(p.sound.programme, 0, 1);
    el.defaultPlaybackRate = el.playbackRate = nearestSpeed(p.playbackRate);
    const syncLevels = () => {
      const e = engineRef.current;
      if (!cancelled && e) setLevels({ list: e.levels(), selected: e.selectedLevel(), playing: e.playingLevel() });
    };
    attachEngine(el, data, { onLevels: syncLevels, onFatal: (f) => !cancelled && handleFatalRef.current(f) }, { preferMp4: forceMp4 }).then((eng) => {
      if (cancelled) {
        eng.destroy();
        return;
      }
      engineRef.current = eng;
      swappingRef.current = false;
      setEngineKind(eng.kind);
      syncLevels();
      const resume = pendingResumeRef.current;
      pendingResumeRef.current = null;
      if (resume) {
        eng.start(resume.at);
        if (resume.play) safePlay(el);
      } else if (nativeRef.current) {
        eng.start(plan.at);
        setPhase('active');
      } else if (pendingStartRef.current !== null && phaseRef.current === 'poster') {
        autoplayRef.current = false;
        begin(pendingStartRef.current);
      } else if (autoplayRef.current && phaseRef.current === 'poster') {
        autoplayRef.current = false;
        begin(plan.at);
      }
    });
    return () => {
      cancelled = true;
      const eng = engineRef.current;
      if (eng?.started()) {
        persist(el);
        pendingResumeRef.current = { at: el.currentTime, play: !el.paused && !el.ended };
      }
      swappingRef.current = true;
      eng?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, forceMp4]);

  /* ── media element events ── */
  useEffect(() => {
    const el = videoRef.current;
    if (!ready || !el) return;
    let bufTimer = 0;
    const clearWaiting = () => {
      window.clearTimeout(bufTimer);
      setM((s) => (s.waiting ? { ...s, waiting: false } : s));
    };
    const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
    const syncSession = () => {
      if (!ms) return;
      try {
        ms.playbackState = el.paused ? 'paused' : 'playing';
        const d = usableDuration(el.duration, measured);
        if (d && ms.setPositionState) ms.setPositionState({ duration: d, playbackRate: el.playbackRate || 1, position: clamp(el.currentTime, 0, d) });
      } catch {
        /* unsupported */
      }
    };
    const earnStamps = () => {
      const fresh = video.places.filter((p) => libraryActions.stamp(p, video.id));
      if (!fresh.length) return;
      sound.play('stamp');
      toast(stampMessage(fresh.map((id) => cat.label(id))), { tone: 'success', action: { label: 'Open passport', run: () => navigate('/passport') } });
    };

    const on: Record<string, () => void> = {
      play: () => {
        if (swappingRef.current) return;
        patch({ paused: false, ended: false });
        setLive(true);
        if (phaseRef.current === 'ended') setPhase('active');
        poke();
        syncSession();
      },
      playing: () => {
        clearWaiting();
        patch({ paused: false });
        if (!startedRef.current) {
          startedRef.current = true;
          setHasStarted(true);
          lastSaveRef.current = Date.now();
          libraryActions.recordHistory(video.id);
        }
        if (phaseRef.current === 'poster') setPhase('active');
      },
      pause: () => {
        if (swappingRef.current) return;
        clearWaiting();
        patch({ paused: true });
        setLive(false);
        persist(el);
        window.clearTimeout(hideTimer.current);
        setChromeShown(true);
        syncSession();
      },
      waiting: () => {
        window.clearTimeout(bufTimer);
        if (!el.paused) bufTimer = window.setTimeout(() => patch({ waiting: true }), 400);
      },
      stalled: () => {
        if (el.paused || el.readyState >= 3) return;
        window.clearTimeout(bufTimer);
        bufTimer = window.setTimeout(() => patch({ waiting: true }), 400);
      },
      canplay: clearWaiting,
      seeking: () => {
        const d = usableDuration(el.duration, measured);
        patch({ time: el.currentTime });
        if (phaseRef.current === 'ended' && el.currentTime < d - 0.5) setPhase('active');
      },
      seeked: () => {
        clearWaiting();
        persist(el);
        syncSession();
      },
      timeupdate: () => {
        const t = el.currentTime;
        setM((s) => (Math.abs(s.time - t) < 0.05 ? s : { ...s, time: t, waiting: s.waiting && t > s.time ? false : s.waiting }));
        if (swappingRef.current || !startedRef.current) return;
        const d = usableDuration(el.duration, measured);
        if (!el.paused && Date.now() - lastSaveRef.current >= 5000) persist(el);
        if (refreshesRef.current && !el.paused && Date.now() - lastRefreshAt.current > 20_000) refreshesRef.current = 0;
        if (!completedRef.current && isComplete(t, d)) {
          completedRef.current = true;
          libraryActions.markComplete(video.id, d);
        }
        if (!stampedRef.current && !el.paused && reachedStampThreshold(t, d)) {
          stampedRef.current = true;
          earnStamps();
        }
      },
      durationchange: () => {
        patch({ duration: usableDuration(el.duration, measured) });
        syncSession();
      },
      loadedmetadata: () => {
        patch({ duration: usableDuration(el.duration, measured) });
        const r = nearestSpeed(libraryStore.get().prefs.playbackRate);
        if (el.playbackRate !== r) el.playbackRate = r;
      },
      progress: () => {
        const ranges: { start: number; end: number }[] = [];
        for (let i = 0; i < el.buffered.length; i++) ranges.push({ start: el.buffered.start(i), end: el.buffered.end(i) });
        patch({ buffered: ranges });
      },
      volumechange: () => patch({ volume: el.volume, muted: el.muted }),
      ratechange: () => {
        patch({ rate: el.playbackRate });
        syncSession();
      },
      ended: () => {
        clearWaiting();
        patch({ paused: true, ended: true });
        setLive(false);
        const d = usableDuration(el.duration, measured);
        if (d && startedRef.current) {
          completedRef.current = true;
          libraryActions.markComplete(video.id, d);
        }
        setOpenMenu(null);
        setPhase('ended');
        setChromeShown(true);
        syncSession();
      },
      error: () => {
        if (swappingRef.current) return;
        const code = el.error?.code;
        if (!code || code === 1) return;
        if (engineRef.current?.recoverElementError()) return;
        handleFatalRef.current({ kind: code === 3 ? 'media' : 'src', code });
      },
      enterpictureinpicture: () => patch({ pip: true }),
      leavepictureinpicture: () => patch({ pip: false }),
      webkitbeginfullscreen: () => setIosFs(true),
      webkitendfullscreen: () => setIosFs(false),
    };
    for (const [name, fn] of Object.entries(on)) el.addEventListener(name, fn);
    return () => {
      window.clearTimeout(bufTimer);
      for (const [name, fn] of Object.entries(on)) el.removeEventListener(name, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, video.id]);

  /* ── menus size themselves to the chamber ── */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) el.style.setProperty('--pl-height', `${Math.round(h)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── full screen state ── */
  useEffect(() => {
    const onFs = () => {
      const isFs = !!rootRef.current && fsElement() === rootRef.current;
      patch({ fullscreen: isFs });
      if (!isFs) {
        const o = screen.orientation as ScreenOrientation & { unlock?: () => void };
        try {
          o?.unlock?.();
        } catch {
          /* not locked */
        }
      }
      poke();
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, [patch, poke]);

  /* ── save on hide / leave; always release the organism on unmount ── */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) persist(videoRef.current);
    };
    const onHide = () => persist(videoRef.current);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [persist]);
  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(osdTimer.current);
      window.clearTimeout(volTimer.current);
      liveOn.current = true; // force the release below even if already idle
      setLive(false);
      if (document.pictureInPictureElement && document.pictureInPictureElement === videoRef.current) void document.exitPictureInPicture().catch(() => undefined);
    },
    [setLive],
  );

  /* ── captions: TextTrack 'hidden' + cuechange, rendered by us (native: 'showing') ── */
  const activeKey = activeTrack ? trackKey(activeTrack) : null;
  useEffect(() => {
    const el = videoRef.current;
    if (!ready || !el) {
      setCueText([]);
      return;
    }
    let current: TextTrack | null = null;
    const update = () => {
      const cues = current?.activeCues;
      const lines: string[] = [];
      if (cues) for (let i = 0; i < cues.length; i++) lines.push(...cueLines((cues[i] as VTTCue).text ?? ''));
      setCueText((prev) => (prev.length === lines.length && prev.every((l, i) => l === lines[i]) ? prev : lines));
    };
    const apply = () => {
      current?.removeEventListener('cuechange', update);
      current = null;
      const list = el.textTracks;
      for (let i = 0; i < list.length; i++) {
        const tt = list[i];
        const match = !!activeKey && `${tt.language}:${tt.kind}` === activeKey;
        tt.mode = match ? (nativeRef.current || iosFs ? 'showing' : 'hidden') : 'disabled';
        if (match) current = tt;
      }
      current?.addEventListener('cuechange', update);
      update();
    };
    apply();
    const trackEls = Array.from(el.querySelectorAll('track'));
    trackEls.forEach((t) => t.addEventListener('load', update));
    el.textTracks.addEventListener('addtrack', apply);
    return () => {
      current?.removeEventListener('cuechange', update);
      trackEls.forEach((t) => t.removeEventListener('load', update));
      el.textTracks.removeEventListener('addtrack', apply);
    };
  }, [ready, activeKey, native, iosFs, data]);

  /* ── Media Session ── */
  const apiRef = useRef({ togglePlay, seekBy, seekTo, goNext });
  apiRef.current = { togglePlay, seekBy, seekTo, goNext };
  useEffect(() => {
    if (!ready || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: video.title,
        artist: programme?.title ?? 'Monumental Streams',
        album: 'Monumental Streams',
        artwork: art ? [{ src: art.posterSmall, type: 'image/webp' }, { src: art.poster, type: 'image/webp' }] : [],
      });
    } catch {
      /* MediaMetadata unsupported */
    }
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* action unsupported */
      }
    };
    set('play', () => {
      const el = videoRef.current;
      if (el?.paused) apiRef.current.togglePlay();
    });
    set('pause', () => videoRef.current?.pause());
    set('seekbackward', (d) => apiRef.current.seekBy(-(d.seekOffset ?? JUMP_STEP)));
    set('seekforward', (d) => apiRef.current.seekBy(d.seekOffset ?? JUMP_STEP));
    set('seekto', (d) => {
      if (d.seekTime != null) apiRef.current.seekTo(d.seekTime);
    });
    set('stop', () => videoRef.current?.pause());
    set('nexttrack', next ? () => apiRef.current.goNext() : null);
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'stop', 'nexttrack'] as MediaSessionAction[]) set(a, null);
      try {
        ms.metadata = null;
        ms.playbackState = 'none';
      } catch {
        /* ignore */
      }
    };
  }, [ready, video.id, video.title, programme?.title, art, next]);

  /* ── keyboard ── */
  const run = (a: ShortcutAction) => {
    const el = videoRef.current;
    if (a.type === 'help') return setHelp(true);
    if (a.type === 'save') {
      const now = toggleSave();
      flash(now ? 'Saved to My World' : 'Removed from saved');
      return;
    }
    if (a.type === 'next') {
      if (next) goNext();
      else flash('Nothing follows this video');
      return;
    }
    if (!el || !engineRef.current) return;
    const dur = usableDuration(el.duration, measured);
    switch (a.type) {
      case 'toggle':
        togglePlay();
        break;
      case 'seek':
        seekBy(a.by);
        flash(`${seekPhrase(a.by)} · ${timecode(clamp(el.currentTime, 0, dur || Infinity))}`);
        if (isTouch()) setRipple({ side: a.by < 0 ? 'left' : 'right', id: Date.now() });
        break;
      case 'volume': {
        const v = clamp((el.muted ? 0 : el.volume) + a.by, 0, 1);
        setVolume(v);
        flash(`Volume ${Math.round(v * 100)}%`);
        break;
      }
      case 'mute':
        toggleMute();
        flash(el.muted ? 'Muted' : 'Sound on');
        break;
      case 'fullscreen':
        if (canFullscreen()) toggleFullscreen();
        break;
      case 'captions':
        toggleCaptions();
        break;
      case 'pip':
        togglePip();
        break;
      case 'rate': {
        const r = stepRate(el.playbackRate, a.dir);
        setRate(r);
        flash(`Speed ${rateLabel(r)}`);
        break;
      }
      case 'jump':
        seekTo(percentTime(Math.round(a.fraction * 10), dur));
        flash(`${Math.round(a.fraction * 100)}% · ${timecode(percentTime(Math.round(a.fraction * 10), dur))}`);
        break;
      case 'start':
        seekTo(0);
        break;
      case 'end':
        seekTo(dur);
        break;
      case 'chapter': {
        if (chapters.length < 2) {
          flash('No chapters in this video');
          break;
        }
        const t = chapterStep(
          chapters.map((c) => c.start),
          el.currentTime,
          a.dir,
        );
        if (t === null) {
          flash(a.dir > 0 ? 'This is the last chapter' : 'This is the first chapter');
          break;
        }
        seekTo(t);
        flash(`Chapter · ${chapterAt(chapters, t + 0.01)?.text ?? timecode(t)}`);
        break;
      }
    }
  };
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = shortcutFor(e);
      if (!action) return;
      const root = rootRef.current;
      const target = e.target instanceof Element ? e.target : null;
      const kind = classifyTarget(target, videoRef.current, nativeRef.current);
      const inPlayer = !!root && !!target && root.contains(target);
      let visible = false;
      if (root) {
        const r = root.getBoundingClientRect();
        visible = r.bottom > 0 && r.top < window.innerHeight;
      }
      if (!shouldHandle(e.key, kind, inPlayer, visible)) return;
      // Only '?', save and next work before there is something to play.
      if (action.type !== 'help' && action.type !== 'save' && action.type !== 'next' && !engineRef.current) return;
      e.preventDefault();
      runRef.current(action);
      if (inPlayer) poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poke]);

  /* ── imperative handle for the page ── */
  useImperativeHandle(
    ref,
    () => ({
      playFrom(t: number) {
        const el = videoRef.current;
        if (!el || !engineRef.current) return;
        rootRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        rootRef.current?.focus({ preventScroll: true });
        if (phaseRef.current === 'poster' || !engineRef.current.started()) return begin(t);
        seekTo(t);
        if (el.paused) safePlay(el);
      },
    }),
    [begin, seekTo, safePlay, reduced],
  );

  /* ── surface gestures ── */
  const pointerType = useRef<string>('mouse');
  const lastTap = useRef<{ t: number; zone: 'left' | 'center' | 'right' } | null>(null);
  const tapTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);
  const onSurfaceDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerType.current = e.pointerType;
    rootRef.current?.focus({ preventScroll: true });
  };
  const onSurfaceUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    const zone = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : 'center';
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 320 && zone !== 'center' && prev.zone === zone) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = { t: now, zone };
      seekBy(zone === 'left' ? -JUMP_STEP : JUMP_STEP);
      setRipple({ side: zone, id: now });
      return;
    }
    lastTap.current = { t: now, zone };
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      if (chromeShownRef.current && canHide()) {
        window.clearTimeout(hideTimer.current);
        setChromeShown(false);
      } else poke();
    }, 280);
  };
  useEffect(() => {
    if (!ripple) return;
    const id = window.setTimeout(() => setRipple(null), 650);
    return () => window.clearTimeout(id);
  }, [ripple]);

  /* ── render ── */
  const signInHref = `/account?mode=signin&next=${encodeURIComponent(location.pathname + location.search)}`;
  const touch = useMemo(() => isTouch(), []);
  const controlsApi: ControlsApi = {
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    toggleMute,
    setRate,
    setCaption,
    setCaptionSize: (size) => libraryActions.setPrefs({ captions: { ...libraryStore.get().prefs.captions, size } }),
    setLevel: (i) => engineRef.current?.setLevel(i),
    toggleFullscreen,
    togglePip,
    switchToNative,
    setAutoplayNext: (on) => libraryActions.setPrefs({ autoplayNext: on }),
    openHelp: () => setHelp(true),
    onScrub: (active) => {
      scrubbingRef.current = active;
      if (active) setChromeShown(true);
      else poke();
    },
  };

  const showPosterArt = !ready || phase === 'poster' || !!mediaError;
  const custom = ready && !native;
  const idle = custom && phase === 'active' && !chromeShown && !m.paused;

  let stateLayer: ReactNode = null;
  if (st.status === 'loading') stateLayer = <div className="pl-state pl-state-loading"><Pulse label="Preparing the stream" /></div>;
  else if (st.status === 'planned' || st.status === 'unavailable') stateLayer = <PlannedOverlay video={video} programme={programme} serverMessage={st.status === 'unavailable' ? st.message : undefined} />;
  else if (st.status === 'gate') stateLayer = <GateOverlay video={video} signedIn={st.signedIn} message={st.message} signInHref={signInHref} tierName={cat.payload.content.membership.tierName} />;
  else if (st.status === 'missing') stateLayer = <ProblemOverlay title="We couldn’t find this video’s stream" detail={st.message} onRetry={source.retry} />;
  else if (st.status === 'error')
    stateLayer = (
      <ProblemOverlay
        title={st.offline ? 'You’re offline' : 'The stream couldn’t be prepared'}
        detail={st.offline ? 'Reconnect, then try again.' : st.message}
        onRetry={source.retry}
      />
    );

  return (
    <div className="pl-shell" data-phase={phase} data-status={st.status} data-native={native || undefined}>
      <div
        ref={rootRef}
        className="pl"
        tabIndex={-1}
        role="region"
        aria-label={`Video player: ${video.title}`}
        aria-roledescription="video player"
        data-phase={phase}
        data-chrome={chromeShown || !custom ? 'shown' : 'hidden'}
        data-idle={idle || undefined}
        data-paused={m.paused || undefined}
        data-fullscreen={m.fullscreen || undefined}
        data-native-cursor={native || m.fullscreen || undefined}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && custom) poke();
        }}
        onPointerLeave={() => {
          if (!custom) return;
          window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => canHide() && setChromeShown(false), 700);
        }}
        onFocus={() => custom && poke()}
      >
        <div className="pl-stage">
          {art && showPosterArt ? (
            <div className="pl-poster-art" style={{ backgroundImage: `url("${art.lqip}")` }} aria-hidden="true">
              <img src={art.poster} srcSet={`${art.posterSmall} 640w, ${art.poster} 1280w`} sizes="(max-width: 767px) 100vw, 80vw" alt="" decoding="async" />
            </div>
          ) : null}
          {ready ? (
            <video
              ref={videoRef}
              className="pl-video"
              playsInline
              preload="metadata"
              poster={art?.poster}
              controls={native}
              aria-label={native ? video.title : undefined}
              aria-hidden={native ? undefined : true}
              tabIndex={native ? 0 : -1}
              data-hidden={phase === 'poster' && !native ? true : undefined}
            >
              {tracks.map((t) => (
                <track key={trackKey(t)} kind={t.kind} src={t.src} srcLang={t.lang} label={t.label} />
              ))}
            </video>
          ) : null}

          {custom ? (
            <>
              <div
                className="pl-surface"
                data-cursor="play"
                data-cursor-label={m.paused ? 'Play' : 'Pause'}
                onPointerDown={onSurfaceDown}
                onPointerUp={onSurfaceUp}
                onClick={() => {
                  if (pointerType.current === 'mouse' && phase === 'active') togglePlay();
                }}
                onDoubleClick={() => {
                  if (pointerType.current === 'mouse' && phase !== 'poster' && canFullscreen()) toggleFullscreen();
                }}
                aria-hidden="true"
              />
              <div className="pl-captions" data-size={prefs.captions.size} data-lifted={chromeShown || m.paused || undefined} aria-hidden={cueText.length ? undefined : true}>
                {cueText.length && phase !== 'poster' ? (
                  <p className="pl-cue">
                    {cueText.map((l, i) => (
                      <span key={i}>{l}</span>
                    ))}
                  </p>
                ) : null}
              </div>
              {ripple ? (
                <span key={ripple.id} className="pl-ripple" data-side={ripple.side} aria-hidden="true">
                  <Icon name={ripple.side === 'left' ? 'skipBack' : 'skipFwd'} size={22} />
                  <span className="mono">{ripple.side === 'left' ? '−' : '+'}10 s</span>
                </span>
              ) : null}
              {m.waiting && phase === 'active' && !mediaError ? (
                <div className="pl-buffering" role="status">
                  <span className="pl-buffering-ring" aria-hidden="true" />
                  <span className="pl-buffering-label">Buffering…</span>
                </div>
              ) : null}
              {touch && phase === 'active' && m.paused && !m.waiting && !mediaError ? (
                <button type="button" className="pl-center-btn" aria-label={m.paused ? 'Play' : 'Pause'} onClick={togglePlay}>
                  <Icon name={m.paused ? 'play' : 'pause'} size={30} />
                </button>
              ) : null}
            </>
          ) : null}

          {ready && phase === 'poster' && !native && !mediaError ? <PosterOverlay video={video} plan={plan} runtime={measured} hasCaptions={tracks.length > 0} onStart={begin} /> : null}
          {ready && phase === 'ended' && !mediaError ? <EndCard video={video} next={next} picks={picks} autoNext={prefs.autoplayNext && !reduced && !!next && cat.isPlayable(next.video)} onReplay={replay} onNext={goNext} /> : null}
          {mediaError ? (
            <ProblemOverlay
              title={mediaError.title}
              detail={mediaError.detail}
              busy={refreshing}
              onRetry={() => void retryMedia()}
              onNative={
                !forceMp4
                  ? () => {
                      setMediaError(null);
                      refreshesRef.current = 0;
                      setFallbackNative(true);
                      setForceMp4(true);
                    }
                  : undefined
              }
            />
          ) : null}
          {stateLayer}
          <p className="pl-osd mono" role="status" aria-live="polite" data-show={osd ? true : undefined} key={osd?.id ?? 0}>
            {osd?.text ?? ''}
          </p>
        </div>

        <ChromeBoundary
          key={boundaryKey}
          onError={() => {
            setOpenMenu(null);
            setFallbackNative(true);
          }}
        >
          {custom && phase !== 'poster' ? (
            <div ref={headRef} className="pl-head" onFocus={poke}>
              <div className="pl-head-text" aria-hidden="true">
                <p className="pl-head-kicker">{programme?.title ?? 'Now playing'}</p>
                <p className="pl-head-title">{video.title}</p>
              </div>
              <button
                ref={saveRef}
                type="button"
                className="pl-btn pl-save"
                aria-pressed={saved}
                aria-label={saved ? `Remove ${video.title} from saved` : `Save ${video.title}`}
                title={saved ? 'Saved to My World (S)' : 'Save to My World (S)'}
                data-cursor="save"
                data-cursor-label={saved ? 'In My World' : 'Save to My World'}
                onClick={(e) => {
                  toggleSave(e.currentTarget);
                  poke();
                }}
              >
                <Icon name={saved ? 'saved' : 'save'} size={20} />
                <span className="pl-save-label" aria-hidden="true">
                  {saved ? 'Saved' : 'Save'}
                </span>
              </button>
            </div>
          ) : null}
          {custom && phase !== 'poster' ? (
            <div
              ref={chromeRef}
              className="pl-chrome"
              onFocus={poke}
              onPointerDown={poke}
              onBlur={() => {
                if (!chromeRef.current?.contains(document.activeElement)) poke();
              }}
            >
              <Controls
                m={m}
                api={controlsApi}
                videoRef={videoRef}
                chapters={chapters}
                thumbs={thumbs}
                tracks={tracks}
                activeTrack={activeTrack}
                captionSize={prefs.captions.size}
                levels={levels}
                engineKind={engineKind}
                openMenu={openMenu}
                setOpenMenu={(id) => {
                  setOpenMenu(id);
                  if (id) setChromeShown(true);
                  else poke();
                }}
                canPip={pipAllowed}
                canFullscreen={canFullscreen()}
                volumeSettable={volumeSettable()}
                autoplayNext={prefs.autoplayNext}
                title={video.title}
              />
            </div>
          ) : null}
        </ChromeBoundary>
      </div>

      {native && ready ? (
        <div className="pl-native-note">
          <Icon name="info" size={16} />
          <p>{fallbackNative && !prefs.nativeControls ? 'The Monumental controls hit a problem, so your browser’s own player took over.' : 'You’re using your browser’s own player controls.'}</p>
          <button type="button" className="pl-text-btn" onClick={switchToCustom}>
            Use Monumental controls
          </button>
        </div>
      ) : null}

      {video.context && ready && !hasStarted && !mediaError && phase !== 'ended' ? (
        <aside className="pl-context" aria-labelledby="pl-context-title">
          <p className="pl-context-title" id="pl-context-title">
            <Icon name="info" size={16} strokeWidth={2} /> Before you watch
          </p>
          <p className="pl-context-text">{video.context}</p>
        </aside>
      ) : null}

      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
});
