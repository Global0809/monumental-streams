/**
 * THE LIVING ARCHIVE — stage engine (three.js, no React). Loaded only through a dynamic import
 * from Stage.tsx, so three never enters the main bundle.
 *
 * One persistent scene behind every route: the seeds (one per story), the organs, and the
 * furniture each form needs (spine, globe, helix, personal core), lit by the night backdrop.
 * The engine subscribes to the stage store (arrangement, highlight, hovered), motion, the
 * player heartbeat and the library; it re-forms the world whenever the arrangement changes
 * and renders only while something moves (ambient motion capped at 30fps), never while the
 * tab is hidden or once settled behind the player.
 */
import * as THREE from 'three';
import type { Catalogue } from '../../../shared/catalogue.ts';
import { savedIds } from '../../../shared/library.ts';
import type { SectionId } from '../../../shared/sections.ts';
import type { ID } from '../../../shared/types.ts';
import { libraryStore } from '../../state/library.ts';
import { heartbeat } from '../../systems/heartbeat.ts';
import { motionStore } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { GLOBE_RADIUS, layoutFor, type FormLayout, type RouteInfo, type SeedInfo } from '../layouts.ts';
import { layoutContext, placeCoords, routeInfos, seedInfos } from '../model.ts';
import { stageStore, type StageEngineCommands } from '../store.ts';
import { Backdrop } from './backdrop.ts';
import { OrganBay } from './bay.ts';
import { Comets } from './comets.ts';
import { Core } from './core.ts';
import { median, shouldDowngrade } from './damp.ts';
import { Filaments } from './filaments.ts';
import type { FrameCtx, Hit, Piece } from './furniture.ts';
import { Globe } from './globe.ts';
import { Helix } from './helix.ts';
import { Loop, type FrameNeed } from './loop.ts';
import { readPalette, SECTION_HUE } from './palette.ts';
import { attachPointer } from './pointer.ts';
import { CameraRig } from './rig.ts';
import { SeedField } from './seeds.ts';
import { createShared } from './shared.ts';
import { Spine } from './spine.ts';

export type EngineQuality = 'webgl' | 'lite';

export interface EngineOptions {
  /** Element the engine's canvas is appended to (a fixed, full-viewport layer). */
  host: HTMLElement;
  cat: Catalogue;
  quality: EngineQuality;
  /** Antialiasing is fixed at context creation (high tier only). */
  antialias: boolean;
  onActivate(hit: Hit): void;
  onQuality(q: EngineQuality): void;
  onReady(): void;
  onLost(): void;
}

export interface StageEngine {
  commands: StageEngineCommands;
  setCatalogue(cat: Catalogue): void;
  dispose(): void;
}

const FOG: Record<FormLayout['kind'], number> = {
  home: 0.0102,
  world: 0.0055,
  time: 0.0085,
  category: 0.0105,
  focus: 0.0105,
  watch: 0.02,
  personal: 0.0105,
  quiet: 0.012,
};
const GLOW: Record<FormLayout['kind'], number> = { home: 1, world: 0.8, time: 0.7, category: 0.95, focus: 0.85, watch: 0.15, personal: 0.9, quiet: 0.6 };
const DISPOSE_PIECE_AFTER = 6; // seconds hidden

type PieceName = 'spine' | 'globe' | 'helix' | 'core';

export function createStageEngine(o: EngineOptions): StageEngine {
  let quality = o.quality;
  let cat = o.cat;
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
  o.host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: o.antialias, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const palette = readPalette();
  renderer.setClearColor(palette.night, 1);
  const dprCap = () => (quality === 'webgl' ? 2 : 1.25);
  const applyPixelRatio = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
    shared.uPixelRatio.value = renderer.getPixelRatio();
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(palette.night.getHex(), FOG.quiet);
  const shared = createShared(palette.night);
  applyPixelRatio();
  const rig = new CameraRig();
  const camera = rig.camera;
  const view = { w: 1, h: 1 };

  const backdrop = new Backdrop(palette, shared, quality);
  scene.add(backdrop.bg, backdrop.dust);
  const bay = new OrganBay(quality);
  scene.add(bay.group);
  const filaments = new Filaments(palette, shared);
  scene.add(filaments.mesh);
  const comets = new Comets(palette, shared);
  scene.add(comets.group);

  const gl = renderer.getContext() as WebGL2RenderingContext;
  const maxLayers = Math.max(1, Math.min(1024, (gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number) || 256));

  let infos: SeedInfo[] = [];
  let places = new Map<ID, [number, number]>();
  let routes: RouteInfo[] = [];
  let seeds: SeedField;
  const pieces: Partial<Record<PieceName, Piece>> = {};

  const buildSeeds = () => {
    infos = seedInfos(cat);
    places = placeCoords(cat);
    routes = routeInfos(cat, places);
    seeds = new SeedField(infos, cat, { quality, palette, shared, maxLayers, onChange: () => wake() });
    scene.add(seeds.group);
  };
  buildSeeds();

  /* ───────── state ───────── */
  let form: FormLayout = layoutFor({ seeds: infos, arrangement: { kind: 'quiet' }, aspect: 1.6 });
  let clock = 0;
  let ambientT = 0;
  let motionLevel = motionStore.get().reduced ? 0 : 1;
  let fogDensity = FOG.quiet;
  let lastNow = 0;
  let settled = false;
  let primed = false;
  let disposed = false;
  let lost = false;
  let narrow = false;
  const frameSamples: number[] = [];
  let busyStreak = 0;
  let downgraded = quality === 'lite';

  const reduced = () => motionStore.get().reduced;
  const watching = () => heartbeat.get().playing || form.kind === 'watch';
  const ambientAllowed = () => !reduced() && form.energy > 0 && !watching();

  const loop = new Loop(frame, () => !disposed && !lost && !document.hidden && !(watching() && settled));
  function wake() {
    settled = false;
    loop.wake();
  }

  /* ───────── furniture ───────── */
  const make: Record<PieceName, () => Piece> = {
    spine: () => new Spine(palette, shared, quality === 'lite'),
    globe: () => new Globe(cat, palette, shared, quality === 'lite', () => wake()),
    helix: () => new Helix(palette, shared, quality === 'lite'),
    core: () => new Core(palette, shared, quality === 'lite'),
  };
  function piece<T extends Piece>(name: PieceName, want: number): T | undefined {
    let p = pieces[name];
    if (!p && want > 0) {
      try {
        p = make[name]();
        pieces[name] = p;
        scene.add(p.group);
      } catch (err) {
        console.warn(`[stage] ${name} unavailable`, err);
        return undefined;
      }
    }
    if (p) p.presence.target = want;
    return p as T | undefined;
  }

  /* ───────── forms ───────── */
  function computeForm(): FormLayout {
    const s = stageStore.get();
    const input = layoutContext(cat, s.arrangement, { seeds: infos, saved: savedIds(libraryStore.get()), aspect: view.w / view.h, places, routes });
    return layoutFor(input);
  }

  function applyForm(next: FormLayout, opts: { instant: boolean; keepOrbit?: boolean }) {
    form = next;
    const instant = opts.instant;
    seeds.setForm(next, clock, instant);
    bay.setForm(next, clock, instant);
    rig.setShot(next.camera, { instant, orbit: next.orbit, keepOrbit: opts.keepOrbit });
    const f = next.furniture;
    const spine = piece('spine', f.spine);
    const globe = piece<Globe>('globe', f.globe);
    const helix = piece<Helix>('helix', f.helix);
    const core = piece('core', f.core);
    if (instant) for (const p of [spine, globe, helix, core]) p?.presence.snap();
    const st = stageStore.get();
    globe?.setFocus({ place: next.world?.place, route: next.world?.route, scope: next.world?.place ? cat.placeScope(next.world.place) : null });
    globe?.setHovered(st.hoveredPlace);
    helix?.setFocus(next.time?.decade ?? null, next.time?.year ?? null);
    filaments.set(next.filaments);
    backdrop.setTint(next.tint ? SECTION_HUE[next.tint] ?? null : null);
    backdrop.setGlow(next.camera.bias, GLOW[next.kind], next.furniture.haze, next.kind === 'home' ? 1 : 0.4);
    if (instant) {
      fogDensity = FOG[next.kind];
      backdrop.snap();
    }
    scheduleSweep();
    wake();
  }

  /** Free furniture and organs a form no longer uses, even while the loop is idle (e.g. behind the player). */
  let sweepTimer = 0;
  function scheduleSweep() {
    if (sweepTimer) window.clearTimeout(sweepTimer);
    sweepTimer = window.setTimeout(() => {
      sweepTimer = 0;
      if (disposed) return;
      for (const name of Object.keys(pieces) as PieceName[]) {
        const p = pieces[name]!;
        if (p.presence.target === 0 && p.presence.level <= 0.01) {
          p.dispose();
          delete pieces[name];
        }
      }
      bay.sweep();
    }, (DISPOSE_PIECE_AFTER + 2) * 1000);
  }

  /* ───────── frame ───────── */
  const fwd = new THREE.Vector3();
  function frame(now: number): FrameNeed {
    const dtRaw = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    clock += dt;
    const allowAmbient = ambientAllowed();
    const motionTarget = reduced() ? 0 : form.energy > 0 && !watching() ? 1 : 0;
    motionLevel += (motionTarget - motionLevel) * (1 - Math.exp(-2.5 * dt));
    if (Math.abs(motionLevel - motionTarget) < 0.002) motionLevel = motionTarget;
    ambientT += dt * motionLevel;
    shared.uTime.value = ambientT;
    shared.uMotion.value = motionLevel;
    const fogTarget = FOG[form.kind];
    fogDensity += (fogTarget - fogDensity) * (1 - Math.exp(-2 * dt));
    (scene.fog as THREE.FogExp2).density = fogDensity;
    shared.uFogDensity.value = fogDensity;

    let busy = rig.update(dt);
    busy = backdrop.update(dt) || busy;
    busy = Math.abs(motionLevel - motionTarget) > 0 || Math.abs(fogDensity - fogTarget) > 1e-5 || busy;
    const ctx: FrameCtx = { camera, view, form, motion: motionLevel, t: ambientT };
    busy = seeds.update(dt, clock, ambientT, camera, view, motionLevel) || busy;
    for (const name of Object.keys(pieces) as PieceName[]) {
      const p = pieces[name]!;
      busy = p.update(dt, ctx) || busy;
      if (p.presence.target === 0 && p.presence.hiddenFor > DISPOSE_PIECE_AFTER) {
        p.dispose();
        delete pieces[name];
      }
    }
    busy = bay.update(dt, clock, ctx, form.kind === 'category' ? (form.organs[0]?.section ?? null) : null) || busy;
    busy = filaments.update(dt, camera, (id) => seeds.positionOf(id), (id) => seeds.presenceOf(id)) || busy;
    busy = comets.update(dt) || busy;

    renderer.render(scene, camera);
    if (!primed) {
      primed = true;
      seeds.markPrimed();
      o.onReady();
    }

    // frame-time sampling while rendering flat out: downgrade once if consistently slow
    if (!downgraded) {
      if (busy && dtRaw > 0 && dtRaw < 0.5) {
        busyStreak++;
        if (busyStreak > 8) frameSamples.push(dtRaw * 1000);
      } else busyStreak = 0;
      if (frameSamples.length > 90) frameSamples.splice(0, frameSamples.length - 90);
      if (shouldDowngrade(frameSamples)) downgrade(median(frameSamples));
      else if (frameSamples.length >= 60) downgraded = true; // fast enough: stop measuring
    }

    settled = !busy;
    if (busy) return 'busy';
    if (allowAmbient) return 'ambient';
    lastNow = 0;
    return 'idle';
  }

  function downgrade(ms: number) {
    downgraded = true;
    if (quality === 'lite') return;
    quality = 'lite';
    console.info(`[stage] median frame ${ms.toFixed(1)}ms — switching to lite`);
    applyPixelRatio();
    resize();
    backdrop.setLite(true);
    bay.setQuality('lite');
    o.onQuality('lite');
  }

  /* ───────── resize ───────── */
  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    view.w = w;
    view.h = h;
    applyPixelRatio(); // browser zoom changes devicePixelRatio
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    backdrop.setAspect(w / h);
    const n = w / h < 0.9;
    if (n !== narrow) {
      narrow = n;
      if (primed) applyForm(computeForm(), { instant: reduced(), keepOrbit: true });
    }
    wake();
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  /* ───────── subscriptions ───────── */
  let lastArr = '';
  let lastHighlight: ID[] | null = null;
  let lastHovered: ID | null = null;
  let lastHoveredPlace: ID | null = null;
  const syncStore = () => {
    const s = stageStore.get();
    const key = JSON.stringify(s.arrangement);
    if (key !== lastArr) {
      lastArr = key;
      applyForm(computeForm(), { instant: reduced() });
    }
    if (s.highlight !== lastHighlight) {
      lastHighlight = s.highlight;
      seeds.setHighlight(s.highlight);
      wake();
    }
    if (s.hovered !== lastHovered) {
      lastHovered = s.hovered;
      seeds.setHovered(s.hovered);
      wake();
    }
    if (s.hoveredPlace !== lastHoveredPlace) {
      lastHoveredPlace = s.hoveredPlace;
      (pieces.globe as Globe | undefined)?.setHovered(s.hoveredPlace);
      wake();
    }
  };
  let lastSaved = savedIds(libraryStore.get()).join('|');
  const syncLibrary = () => {
    const key = savedIds(libraryStore.get()).join('|');
    if (key === lastSaved) return;
    lastSaved = key;
    if (form.kind === 'personal') applyForm(computeForm(), { instant: reduced(), keepOrbit: true });
  };
  const unsubs = [
    stageStore.subscribe(syncStore),
    libraryStore.subscribe(syncLibrary),
    motionStore.subscribe(() => wake()),
    heartbeat.subscribe(() => wake()),
  ];
  const onVisibility = () => {
    lastNow = 0;
    if (!document.hidden) wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    loop.stop();
    o.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  /* ───────── pointer ───────── */
  let stageHover: Hit | null = null;
  let hoverSoundAt = 0;
  const root = document.documentElement;
  const pickAt = (x: number, y: number): Hit | null => {
    const ctx: FrameCtx = { camera, view, form, motion: motionLevel, t: ambientT };
    const hits: Hit[] = [];
    const globeIn = form.kind === 'world' && !!pieces.globe && pieces.globe.presence.level > 0.5;
    const s = seeds.pick(x, y, camera, globeIn ? { center: new THREE.Vector3(0, 0, 0), radius: GLOBE_RADIUS * pieces.globe!.group.scale.x } : undefined);
    if (s) hits.push({ kind: 'seed', id: s.id, depth: s.depth });
    const g = pieces.globe as Globe | undefined;
    if (g && form.kind === 'world') {
      const h = g.pick(x, y, ctx);
      if (h) hits.push(h);
    }
    const hx = pieces.helix as Helix | undefined;
    if (hx && form.kind === 'time') {
      const h = hx.pick(x, y, ctx);
      if (h) hits.push({ ...h, depth: h.depth + 2 }); // seeds on the strand win over their vertebra
    }
    if (form.kind === 'home' || form.kind === 'category') {
      const h = bay.pick(x, y, ctx);
      if (h) hits.push({ ...h, depth: h.depth + 1.5 });
    }
    hits.sort((a, b) => a.depth - b.depth);
    return hits[0] ?? null;
  };
  const setStageHover = (hit: Hit | null) => {
    const prev = stageHover;
    const same = prev?.kind === hit?.kind && prev?.id === hit?.id;
    if (same) return;
    stageHover = hit;
    if (hit) {
      root.dataset.stageHover = hit.kind;
      const now = performance.now();
      if (now - hoverSoundAt > 120) {
        hoverSoundAt = now;
        sound.play('hover');
      }
    } else delete root.dataset.stageHover;
    // mirror into the store (only clear what the stage itself set)
    stageStore.set((s) => {
      let next = s;
      if (prev?.kind === 'seed' && s.hovered === prev.id && hit?.kind !== 'seed') next = { ...next, hovered: null };
      if (prev?.kind === 'place' && s.hoveredPlace === prev.id && hit?.kind !== 'place') next = { ...next, hoveredPlace: null };
      if (hit?.kind === 'seed' && next.hovered !== hit.id) next = { ...next, hovered: hit.id };
      if (hit?.kind === 'place' && next.hoveredPlace !== hit.id) next = { ...next, hoveredPlace: hit.id };
      return next;
    });
    bay.setHovered(hit?.kind === 'organ' ? (hit.id as SectionId) : null);
    (pieces.helix as Helix | undefined)?.setHovered(hit?.kind === 'decade' ? Number(hit.id) : null);
    wake();
  };
  const detachPointer = attachPointer({
    enabled: () => !disposed && !lost && primed && form.kind !== 'watch',
    pick: pickAt,
    hover: setStageHover,
    activate: (hit) => {
      sound.play('select');
      if (hit.kind === 'seed') seeds.pulse(hit.id);
      wake();
      o.onActivate(hit);
    },
    canDrag: () => rig.canOrbit() && !reduced(),
    dragStart: () => {
      rig.beginDrag();
      root.dataset.stageHover = 'drag';
      wake();
    },
    drag: (dx, dy, dt) => {
      rig.drag(dx, dy, dt);
      wake();
    },
    dragEnd: () => {
      rig.endDrag();
      delete root.dataset.stageHover;
      wake();
    },
  });

  /* ───────── commands ───────── */
  const unproject = (x: number, y: number, depth: number) => {
    const v = new THREE.Vector3((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    camera.getWorldDirection(fwd);
    const k = depth / Math.max(0.05, dir.dot(fwd));
    return camera.position.clone().addScaledVector(dir, k);
  };
  const myWorldPoint = (): { x: number; y: number } => {
    const all = document.querySelectorAll<HTMLElement>('[data-nav="my-world"]:not([hidden])');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < view.h && r.right > 0 && r.left < view.w) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: view.w - 48, y: 40 };
  };
  const commands: StageEngineCommands = {
    flyToCore(id, from) {
      if (disposed || lost) return;
      const core = pieces.core as Core | undefined;
      const coreVisible = form.kind === 'personal' && !!core && core.presence.level > 0.5;
      if (reduced()) {
        seeds.pulse(id);
        core?.receive();
        wake();
        return;
      }
      const seedPos = seeds.positionOf(id);
      const seedScreen = seeds.screenOf(id);
      const start = from
        ? unproject(from.left + from.width / 2, from.top + from.height / 2, 9)
        : seedPos && seedScreen?.visible
          ? seedPos.clone()
          : unproject(view.w / 2, view.h / 2, 12);
      const dest = coreVisible ? null : myWorldPoint();
      const target = () => (coreVisible ? new THREE.Vector3(0, 0, 0) : unproject(dest!.x, dest!.y, 8));
      comets.launch(start, target, {
        up: new THREE.Vector3(0, 1, 0),
        onArrive: () => {
          core?.receive();
          seeds.pulse(id);
        },
      });
      wake();
    },
    pulse(id) {
      if (disposed) return;
      seeds.pulse(id);
      wake();
    },
    project(id) {
      if (disposed || lost) return null;
      return seeds.screenOf(id);
    },
  };

  /* ───────── start ───────── */
  syncStore(); // applies the current arrangement (a migration in from the seed cloud)
  if (import.meta.env.DEV) {
    // QA handle (dev builds only): inspect the live stage from the console / screenshot scripts
    (window as unknown as { __stage?: unknown }).__stage = {
      get form() {
        return form;
      },
      get quality() {
        return quality;
      },
      camera,
      scene,
      renderer,
      pick: pickAt,
      commands,
      store: stageStore,
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, settled, running: loop.running }),
    };
  }

  return {
    commands,
    setCatalogue(next) {
      if (next === cat || next.version === cat.version) {
        cat = next;
        return;
      }
      cat = next;
      seeds.dispose();
      buildSeeds();
      const g = pieces.globe;
      if (g) {
        g.dispose();
        delete pieces.globe;
      }
      seeds.setHighlight(stageStore.get().highlight);
      seeds.setHovered(stageStore.get().hovered);
      applyForm(computeForm(), { instant: reduced(), keepOrbit: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      if (sweepTimer) window.clearTimeout(sweepTimer);
      detachPointer();
      for (const u of unsubs) u();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      delete root.dataset.stageHover;
      if (stageHover) {
        const prev = stageHover;
        stageStore.set((s) => ({
          ...s,
          hovered: prev.kind === 'seed' && s.hovered === prev.id ? null : s.hovered,
          hoveredPlace: prev.kind === 'place' && s.hoveredPlace === prev.id ? null : s.hoveredPlace,
        }));
      }
      seeds.dispose();
      for (const name of Object.keys(pieces) as PieceName[]) pieces[name]!.dispose();
      bay.dispose();
      filaments.dispose();
      comets.dispose();
      backdrop.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
