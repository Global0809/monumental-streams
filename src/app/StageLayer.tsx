/**
 * The backmost layer of the shell: the living world.
 *
 *   ┌ .la-stage (fixed, behind everything) ───────────────────────────────┐
 *   │  StaticWorld — CSS-only gradient field + vertebral silhouette,      │
 *   │                shown until the 3D stage is ready, and whenever       │
 *   │                stageStore.quality === 'off' (no WebGL, low tier…)   │
 *   │  <Stage/>    — the persistent Three.js world (lazy, src/stage)      │
 *   │  .la-veil    — legibility: darkens the editorial side, dims for     │
 *   │                watching                                             │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * The static world answers the same state the 3D one does: data-arrangement re-forms it
 * (spine, globe, helix tilt, chamber glow, personal core) and data-tint carries the hue of
 * the current or previewed destination.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useStage } from '../stage/store.ts';
import { tintFor } from './arrangement.ts';
import { usePreviewSection } from './world.ts';
import './world.css';

const Stage = lazy(() => import('../stage/Stage.tsx'));

/** A failed stage (chunk error, engine exception) leaves the static world in place. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[stage] the living world could not start; showing the static world', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Mount the 3D stage once the first content has had its turn (idle, or 900ms at most). */
function useDeferredMount(enabled: boolean) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => setGo(true), { timeout: 900 });
      return () => w.cancelIdleCallback?.(h);
    }
    const t = window.setTimeout(() => setGo(true), 300);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return go;
}

export function StaticWorld() {
  return (
    <div className="la-fallback" aria-hidden="true">
      <div className="la-field" />
      <div className="la-tint" />
      <div className="la-globe">
        <span className="la-globe-rim" />
      </div>
      <div className="la-spine">
        <span className="la-spine-processes" />
        <span className="la-spine-column" />
        <span className="la-spine-cord" />
      </div>
      <div className="la-core" />
      <div className="la-seeds" />
    </div>
  );
}

export function StageLayer() {
  const { quality, ready, arrangement } = useStage();
  const preview = usePreviewSection();
  // the stage decides its own quality (tier, WebGL2, ?stage= override); three.js only loads when it can run
  const mount = useDeferredMount(true);
  const tint = preview ?? tintFor(arrangement);
  const live = quality !== 'off' && ready;
  return (
    <div className="la-stage" data-arrangement={arrangement.kind} data-tint={tint ?? undefined} data-preview={preview ? '' : undefined} data-live={live ? '' : undefined}>
      <StaticWorld />
      {mount ? (
        <StageBoundary>
          <Suspense fallback={null}>
            <Stage />
          </Suspense>
        </StageBoundary>
      ) : null}
      <div className="la-veil" aria-hidden="true" />
    </div>
  );
}
