/**
 * THE LIVING ARCHIVE — persistent stage layer (lazy-loadable).
 *
 * Mount once inside the router + CatalogueProvider (the shell does this):
 *   const Stage = lazy(() => import('../stage/Stage.tsx'));
 *   <Suspense fallback={null}><Stage /></Suspense>
 *
 * Renders a fixed, full-viewport canvas layer behind the app (pointer-events: none — the
 * engine listens on window and never blocks the DOM). Capability decides the quality:
 *   high tier + WebGL2 → 'webgl'   mid tier → 'lite' (half density, DPR ≤ 1.25)
 *   low tier / no WebGL2 / context lost / engine failure → 'off' (renders nothing; the shell
 *   shows its designed static world). `?stage=off|lite|webgl` overrides for QA.
 * The engine and three.js load through a dynamic import. Stage clicks first go to the pages
 * (emitStage); when no page handles one, the default is to follow the matching link.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { sectionById, type SectionId } from '../../shared/sections.ts';
import { useCatalogue } from '../state/catalogue.tsx';
import { deviceTier, hasWebGL } from '../systems/device.ts';
import { isReducedMotion } from '../systems/motion.ts';
import { attachEngine, emitStage, stageStore } from './store.ts';
import type { StageEngine } from './engine/index.ts';
import type { Hit } from './engine/furniture.ts';

type Quality = 'webgl' | 'lite' | 'off';

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Capability → quality (exported for the shell's own decisions and for tests). */
export function chooseQuality(): Quality {
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(window.location.search).get('stage');
  } catch {
    /* ignore */
  }
  if (forced === 'off') return 'off';
  if (!hasWebGL() || !hasWebGL2()) return 'off'; // three.js needs WebGL2
  if (forced === 'webgl' || forced === 'lite') return forced;
  const tier = deviceTier();
  return tier === 'high' ? 'webgl' : tier === 'mid' ? 'lite' : 'off';
}

const setQualityInStore = (quality: Quality, ready = false) => stageStore.set((s) => (s.quality === quality && s.ready === ready ? s : { ...s, quality, ready }));

export default function Stage() {
  const cat = useCatalogue();
  const navigate = useNavigate();
  const [quality, setQuality] = useState<Quality>(() => chooseQuality());
  const [visible, setVisible] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<StageEngine | null>(null);
  // latest values for callbacks created once per engine
  const catRef = useRef(cat);
  catRef.current = cat;
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const tierRef = useRef<'webgl' | 'lite'>(quality === 'webgl' ? 'webgl' : 'lite');

  useEffect(() => {
    if (quality === 'off') {
      setQualityInStore('off');
      return;
    }
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    setQualityInStore(quality, false);
    const antialias = tierRef.current === 'webgl' && quality === 'webgl';

    const onActivate = (hit: Hit) => {
      const c = catRef.current;
      const go = (to: string) => navRef.current(to);
      switch (hit.kind) {
        case 'seed':
          if (!emitStage('seedActivate', { id: hit.id }) && c.get(hit.id)) go(c.href(hit.id));
          break;
        case 'place':
          if (!emitStage('placeActivate', { id: hit.id }) && c.get(hit.id)) go(c.href(hit.id));
          break;
        case 'decade': {
          const decade = Number(hit.id);
          if (!emitStage('decadeActivate', { decade })) {
            const p = c.periods.find((x) => x.start === decade);
            go(p ? c.href(p.id) : '/time-machine');
          }
          break;
        }
        case 'organ': {
          const section = hit.id as SectionId;
          if (!emitStage('organActivate', { section })) go(sectionById(section).path);
          break;
        }
      }
    };

    import('./engine/index.ts')
      .then(({ createStageEngine }) => {
        if (cancelled) return;
        try {
          const e = createStageEngine({
            host: el,
            cat: catRef.current,
            quality,
            antialias,
            onActivate,
            onQuality: (q) => setQualityInStore(q, stageStore.get().ready),
            onReady: () => {
              setQualityInStore(stageStore.get().quality === 'off' ? quality : stageStore.get().quality, true);
              setVisible(true);
            },
            onLost: () => setQuality('off'),
          });
          engine.current = e;
          attachEngine(e.commands);
        } catch (err) {
          console.warn('[stage] WebGL stage unavailable; showing the static world', err);
          setQuality('off');
        }
      })
      .catch((err) => {
        console.warn('[stage] the stage engine failed to load', err);
        if (!cancelled) setQuality('off');
      });

    return () => {
      cancelled = true;
      attachEngine(null);
      engine.current?.dispose();
      engine.current = null;
      setVisible(false);
      stageStore.set((s) => ({ ...s, ready: false }));
    };
  }, [quality]);

  useEffect(() => {
    engine.current?.setCatalogue(cat);
  }, [cat]);

  if (quality === 'off') return null;
  return (
    <div
      ref={host}
      className="stage-layer"
      aria-hidden="true"
      data-quality={quality}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transition: isReducedMotion() ? 'none' : 'opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    />
  );
}
