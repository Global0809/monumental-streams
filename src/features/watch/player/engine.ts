/**
 * Stream engines. One <video>, three ways in:
 *   native-hls  Safari / iOS: the element plays the HLS playlist itself.
 *   hls.js      Everywhere with Media Source Extensions (loaded on demand).
 *   mp4         Progressive fallback (no MSE, or the viewer asked for the plainest path).
 * Quality choices are only ever the renditions the stream really contains (hls.js levels).
 */
import type HlsType from 'hls.js';
import type { CaptionTrack } from '../../../../shared/types.ts';

export interface PlaybackData {
  hls?: string;
  mp4: string;
  captions: CaptionTrack[];
  chapters?: string;
  thumbnails?: string;
  expiresAt: string;
}

export type EngineKind = 'native-hls' | 'hls.js' | 'mp4';

export interface QualityLevel {
  index: number;
  height: number;
  label: string;
  bitrate: number;
}

export interface FatalInfo {
  /** auth = the stream refused the token (expired / lapsed); src = element could not load the source. */
  kind: 'auth' | 'network' | 'media' | 'src';
  code?: number; // MediaError code when it came from the element
  status?: number; // HTTP status when known
  detail?: string;
}

export interface Engine {
  kind: EngineKind;
  levels(): QualityLevel[];
  /** Selected level: -1 = automatic. */
  selectedLevel(): number;
  /** Level actually playing right now (-1 unknown). */
  playingLevel(): number;
  setLevel(index: number): void;
  /** Begin fetching media from a position (lazy start keeps unwatched pages light). */
  start(at: number): void;
  started(): boolean;
  /** Give the engine one chance to recover from an element error. */
  recoverElementError(): boolean;
  destroy(): void;
}

export interface EngineCallbacks {
  onLevels(): void;
  onFatal(info: FatalInfo): void;
}

/** Seek as soon as the element knows its duration. */
export function seekWhenReady(el: HTMLVideoElement, t: number) {
  if (!(t > 0)) return;
  if (el.readyState >= 1) {
    el.currentTime = t;
    return;
  }
  const go = () => {
    el.currentTime = t;
  };
  el.addEventListener('loadedmetadata', go, { once: true });
}

function elementEngine(el: HTMLVideoElement, src: string, kind: 'native-hls' | 'mp4'): Engine {
  let started = false;
  el.preload = 'metadata';
  el.src = src;
  return {
    kind,
    levels: () => [],
    selectedLevel: () => -1,
    playingLevel: () => -1,
    setLevel: () => undefined,
    start(at) {
      started = true;
      el.preload = 'auto';
      seekWhenReady(el, at);
    },
    started: () => started,
    recoverElementError: () => false,
    destroy() {
      el.removeAttribute('src');
      try {
        el.load();
      } catch {
        /* detached element */
      }
    },
  };
}

export async function attachEngine(el: HTMLVideoElement, data: PlaybackData, cb: EngineCallbacks, opts: { preferMp4?: boolean } = {}): Promise<Engine> {
  if (!opts.preferMp4 && data.hls) {
    const nativeHls = !!el.canPlayType('application/vnd.apple.mpegurl');
    const mse = typeof window !== 'undefined' && 'MediaSource' in window;
    // Safari / iOS (Apple WebKit) play HLS natively and best. Recent Chromium also answers
    // "maybe", but there hls.js gives real rendition choices, so it is preferred when MSE exists.
    const appleWebKit = typeof navigator !== 'undefined' && /apple/i.test(navigator.vendor ?? '');
    if (nativeHls && (appleWebKit || !mse)) return elementEngine(el, data.hls, 'native-hls');
    if (mse) {
      try {
        const Hls = (await import('hls.js')).default;
        if (Hls.isSupported()) return hlsEngine(Hls, el, data.hls, cb);
      } catch {
        /* chunk failed to load: fall through */
      }
    }
    if (nativeHls) return elementEngine(el, data.hls, 'native-hls');
  }
  return elementEngine(el, data.mp4, 'mp4');
}

function hlsEngine(Hls: typeof HlsType, el: HTMLVideoElement, src: string, cb: EngineCallbacks): Engine {
  const hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1, autoStartLoad: false });
  let started = false;
  let destroyed = false;
  let netRecovered = false;
  let mediaRecovered = false;
  let selected = -1;

  hls.on(Hls.Events.MANIFEST_PARSED, () => cb.onLevels());
  hls.on(Hls.Events.LEVEL_SWITCHED, () => cb.onLevels());
  hls.on(Hls.Events.ERROR, (_evt, d) => {
    if (destroyed || !d.fatal) return;
    if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
      const status = d.response?.code;
      if (status === 401 || status === 403) return cb.onFatal({ kind: 'auth', status, detail: d.details });
      if (!netRecovered && started) {
        netRecovered = true;
        hls.startLoad();
        return;
      }
      return cb.onFatal({ kind: 'network', status, detail: d.details });
    }
    if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
      if (!mediaRecovered) {
        mediaRecovered = true;
        hls.recoverMediaError();
        return;
      }
      return cb.onFatal({ kind: 'media', detail: d.details });
    }
    cb.onFatal({ kind: 'media', detail: d.details });
  });
  el.preload = 'metadata';
  hls.attachMedia(el);
  hls.loadSource(src);

  return {
    kind: 'hls.js',
    levels: () =>
      hls.levels
        .map((l, index) => ({ index, height: l.height, bitrate: l.bitrate, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps` }))
        .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate),
    selectedLevel: () => selected,
    playingLevel: () => hls.currentLevel,
    setLevel(index) {
      selected = index;
      hls.nextLevel = index; // -1 = automatic; switches at the next fragment without a rebuffer
      cb.onLevels();
    },
    start(at) {
      if (started) return;
      started = true;
      hls.startLoad(at > 0 ? at : -1);
    },
    started: () => started,
    recoverElementError() {
      if (mediaRecovered) return false;
      mediaRecovered = true;
      hls.recoverMediaError();
      return true;
    },
    destroy() {
      destroyed = true;
      hls.destroy();
    },
  };
}
