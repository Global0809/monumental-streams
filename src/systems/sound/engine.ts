/**
 * THE ORGANISM — sonic identity.
 *
 * Everything is synthesised live with WebAudio (no audio files to load):
 *  · Ambience  "respiration": detuned low drones through a breathing filter, a pink-noise
 *              breath, and a soft lub-dub heartbeat locked to the shared heartbeat clock.
 *  · Effects   tendon ticks, glass selects, membrane pops, chimes — short, quiet, throttled.
 *
 * Rules: silent until the viewer explicitly activates sound (a user gesture creates the
 * AudioContext); limited polyphony + per-sound throttling prevent overlap; programme
 * playback ducks ambience to silence and softens effects; hidden tabs suspend the context.
 */
import { createStore } from '../../lib/store.ts';
import { heartbeat } from '../heartbeat.ts';

export type SoundName =
  | 'activate'
  | 'select'
  | 'hover'
  | 'save'
  | 'unsave'
  | 'transition'
  | 'tick'
  | 'error'
  | 'open'
  | 'close'
  | 'stamp';

export interface SoundPrefs {
  enabled: boolean;
  muted: boolean;
  master: number;
  ambience: number;
  effects: number;
  programme: number;
}

export const soundStore = createStore<{ prefs: SoundPrefs; running: boolean; ducked: boolean; supported: boolean }>({
  prefs: { enabled: false, muted: false, master: 0.8, ambience: 0.5, effects: 0.7, programme: 1 },
  running: false,
  ducked: false,
  supported: typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window),
});

const THROTTLE: Partial<Record<SoundName, number>> = { hover: 90, tick: 40 };
const MAX_VOICES = 5;

let ctx: AudioContext | null = null;
let master: GainNode;
let ambBus: GainNode;
let fxBus: GainNode;
let noiseBuf: AudioBuffer | null = null;
let ambienceNodes: AudioNode[] = [];
let voices = 0;
const lastPlayed = new Map<SoundName, number>();
let beatTimer: number | null = null;
let nextBeatAt = 0;

const now = () => ctx!.currentTime;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: 'interactive' });
  master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(ctx.destination);
  ambBus = ctx.createGain();
  fxBus = ctx.createGain();
  ambBus.connect(master);
  fxBus.connect(master);
  ambBus.gain.value = 0;
  // Pink-ish noise buffer, shared by breath, sweeps and stamps.
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
  }
  return ctx;
}

function applyGains(ramp = 0.4) {
  if (!ctx) return;
  const { prefs, ducked } = soundStore.get();
  const on = prefs.enabled && !prefs.muted;
  const t = now();
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(on ? clamp01(prefs.master) : 0, t, ramp / 3);
  ambBus.gain.cancelScheduledValues(t);
  ambBus.gain.setTargetAtTime(on && !ducked ? clamp01(prefs.ambience) * 0.55 : 0, t, ramp);
  fxBus.gain.cancelScheduledValues(t);
  fxBus.gain.setTargetAtTime(on ? clamp01(prefs.effects) * (ducked ? 0.35 : 1) : 0, t, ramp / 3);
}

/* ───────────── Ambience: respiration + heartbeat ───────────── */

function startAmbience() {
  if (!ctx || ambienceNodes.length) return;
  const c = ctx;
  const out = c.createGain();
  out.gain.value = 0.9;
  out.connect(ambBus);

  // Breathing filter over detuned drones (A1, E2, A2)
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  filter.Q.value = 3.5;
  filter.connect(out);
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.075; // ~13s breath
  const lfoGain = c.createGain();
  lfoGain.gain.value = 170;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  const drones: OscillatorNode[] = [];
  for (const [f, type, g, det] of [
    [55, 'sawtooth', 0.11, -6],
    [82.41, 'sawtooth', 0.07, 5],
    [110, 'triangle', 0.08, 0],
    [164.81, 'sine', 0.025, 3],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det;
    const og = c.createGain();
    og.gain.value = g;
    o.connect(og).connect(filter);
    o.start();
    drones.push(o);
  }

  // Breath: band-passed noise swelling with its own slow LFO
  const breath = c.createBufferSource();
  breath.buffer = noiseBuf;
  breath.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 0.8;
  const bg = c.createGain();
  bg.gain.value = 0.0;
  const blfo = c.createOscillator();
  blfo.frequency.value = 0.15;
  const blfoGain = c.createGain();
  blfoGain.gain.value = 0.05;
  blfo.connect(blfoGain).connect(bg.gain);
  breath.connect(bp).connect(bg).connect(out);
  breath.start();
  blfo.start();

  ambienceNodes = [out, filter, lfo, lfoGain, ...drones, breath, bp, bg, blfo, blfoGain];
  nextBeatAt = c.currentTime + 0.5;
  scheduleBeats();
}

function stopAmbience() {
  for (const n of ambienceNodes) {
    try {
      if ('stop' in n) (n as OscillatorNode).stop();
      n.disconnect();
    } catch {
      /* already stopped */
    }
  }
  ambienceNodes = [];
  if (beatTimer !== null) window.clearInterval(beatTimer);
  beatTimer = null;
}

function thump(at: number, strength: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(74, at);
  o.frequency.exponentialRampToValueAtTime(44, at + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.32 * strength, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  o.connect(g).connect(ambBus);
  o.start(at);
  o.stop(at + 0.25);
}

/** Lookahead scheduler: lub-dub at the shared heartbeat tempo. */
function scheduleBeats() {
  if (beatTimer !== null) window.clearInterval(beatTimer);
  beatTimer = window.setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const bpm = heartbeat.get().bpm;
    if (!bpm) return;
    const period = 60 / bpm;
    while (nextBeatAt < ctx.currentTime + 0.2) {
      if (nextBeatAt >= ctx.currentTime) {
        thump(nextBeatAt, 1);
        thump(nextBeatAt + 0.27, 0.55);
      }
      nextBeatAt += period * 2; // a heartbeat every two beats keeps it subliminal
    }
  }, 90);
}

/* ───────────── Effects ───────────── */

function voice(dur: number): boolean {
  if (voices >= MAX_VOICES) return false;
  voices++;
  window.setTimeout(() => voices--, dur * 1000 + 30);
  return true;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; at?: number; attack?: number } = {}) {
  const c = ctx!;
  const t = opts.at ?? now();
  const o = c.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(fxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { type?: BiquadFilterType; from?: number; to?: number; gain?: number; q?: number } = {}) {
  const c = ctx!;
  const t = now();
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.Q.value = opts.q ?? 1.2;
  f.frequency.setValueAtTime(opts.from ?? 800, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.25, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(fxBus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.02);
}

const SOUNDS: Record<SoundName, () => number> = {
  activate: () => {
    const t = now();
    tone(220, 0.9, { type: 'triangle', gain: 0.14, to: 440, attack: 0.05 });
    tone(330, 0.9, { gain: 0.09, at: t + 0.08, attack: 0.08 });
    tone(554.37, 0.8, { gain: 0.06, at: t + 0.16, attack: 0.1 });
    return 1;
  },
  select: () => {
    tone(2200, 0.07, { type: 'triangle', gain: 0.09 });
    noise(0.03, { type: 'highpass', from: 5000, gain: 0.05 });
    return 0.08;
  },
  hover: () => {
    tone(1480, 0.04, { gain: 0.025 });
    return 0.05;
  },
  save: () => {
    const t = now();
    tone(880, 0.45, { gain: 0.08 });
    tone(1318.5, 0.5, { gain: 0.06, at: t + 0.07 });
    return 0.6;
  },
  unsave: () => {
    tone(1318.5, 0.25, { gain: 0.05, to: 660 });
    return 0.3;
  },
  transition: () => {
    noise(0.4, { from: 380, to: 3200, gain: 0.07, q: 2.2 });
    return 0.45;
  },
  tick: () => {
    tone(3100, 0.018, { type: 'square', gain: 0.03 });
    return 0.03;
  },
  error: () => {
    const t = now();
    tone(110, 0.16, { gain: 0.16 });
    tone(98, 0.2, { gain: 0.14, at: t + 0.2 });
    return 0.45;
  },
  open: () => {
    tone(300, 0.12, { gain: 0.08, to: 620 });
    return 0.14;
  },
  close: () => {
    tone(620, 0.12, { gain: 0.07, to: 290 });
    return 0.14;
  },
  stamp: () => {
    noise(0.12, { type: 'lowpass', from: 400, gain: 0.3, q: 0.7 });
    tone(660, 0.6, { gain: 0.06, at: now() + 0.05 });
    return 0.65;
  },
};

/* ───────────── Public API ───────────── */

export const sound = {
  /** Must be called from a user gesture. Creates/resumes the context and starts ambience. */
  async enable() {
    const c = ensureContext();
    if (!c) return false;
    await c.resume().catch(() => undefined);
    soundStore.set((s) => ({ ...s, prefs: { ...s.prefs, enabled: true }, running: c.state === 'running' }));
    startAmbience();
    applyGains(0.8);
    this.play('activate');
    return true;
  },

  async disable() {
    soundStore.set((s) => ({ ...s, prefs: { ...s.prefs, enabled: false } }));
    applyGains(0.15);
    if (ctx) {
      window.setTimeout(() => {
        if (!soundStore.get().prefs.enabled && ctx) {
          stopAmbience();
          void ctx.suspend();
          soundStore.set((s) => ({ ...s, running: false }));
        }
      }, 450);
    }
  },

  play(name: SoundName) {
    const { prefs } = soundStore.get();
    if (!ctx || !prefs.enabled || prefs.muted || ctx.state !== 'running') return;
    const t = performance.now();
    const gap = THROTTLE[name] ?? 50;
    if (t - (lastPlayed.get(name) ?? 0) < gap) return;
    lastPlayed.set(name, t);
    if (!voice(0.4)) return;
    SOUNDS[name]();
  },

  /** Programme playback: ambience to silence, effects softened. */
  duck(on: boolean) {
    soundStore.set((s) => ({ ...s, ducked: on }));
    applyGains(on ? 0.25 : 1.2);
  },

  setPrefs(patch: Partial<SoundPrefs>) {
    soundStore.set((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
    applyGains(0.2);
  },

  /** Restore persisted levels without enabling audio (activation always needs a gesture). */
  hydrate(p: Omit<SoundPrefs, 'enabled'> & { enabled: boolean }) {
    soundStore.set((s) => ({ ...s, prefs: { ...p, enabled: false } }));
  },
};

export function initSound() {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (soundStore.get().prefs.enabled) void ctx.resume();
  });
}
