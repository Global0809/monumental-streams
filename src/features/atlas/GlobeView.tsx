/**
 * React shell for the vascular globe. Lazily loaded by the atlas page; three.js itself is a
 * further dynamic import, so neither reaches the main bundle. Any failure (no WebGL, lost
 * context, import error) is reported through onFail and the page falls back to the flat map.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { Tier } from '../../systems/device.ts';
import { Pulse } from '../../ui/feedback.tsx';
import { loadDots } from './data.ts';
import type { EngineFocus, GlobeEngine } from './globeEngine.ts';
import { ATLANTIC, type CameraTarget, type StageNode, type StageRoute } from './model.ts';
import { ZoomControls } from './parts.tsx';

/** The camera survives remounts (e.g. /atlas → /atlas/miami), so every arrival is a fly-to. */
let lastCamera: CameraTarget | null = null;

export interface GlobeViewProps {
  nodes: StageNode[];
  routes: StageRoute[];
  focus: CameraTarget;
  /** Changes whenever the camera should fly to `focus`. */
  focusKey: string;
  focusPoint: EngineFocus | null;
  autoRotate: boolean;
  reduced: boolean;
  tier: Tier;
  onSelect: (id: string) => void;
  onFail: (reason: string) => void;
  nameOf: (id: string) => string;
}

export default function GlobeView(props: GlobeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState('');
  const descId = useId();

  useEffect(() => {
    let alive = true;
    let engine: GlobeEngine | null = null;
    Promise.all([import('./globeEngine.ts'), loadDots()])
      .then(([mod, dots]) => {
        const canvas = canvasRef.current;
        const labels = labelsRef.current;
        if (!alive || !canvas || !labels) return;
        const p = latest.current;
        engine = mod.createGlobe({
          canvas,
          labels,
          dots: dots.points,
          dotSpacing: dots.spacing,
          tier: p.tier === 'low' ? 'mid' : p.tier,
          reduced: p.reduced,
          start: lastCamera ?? ATLANTIC,
          onSelect: (id) => latest.current.onSelect(id),
          onHover: () => {},
          onCentre: (id, explicit) =>
            setLive(
              id
                ? `Centred near ${latest.current.nameOf(id)}. Press Enter to open it.`
                : explicit
                  ? 'No destination at the centre. Turn the globe with the arrow keys, or switch to the list view.'
                  : '',
            ),
          onLost: () => latest.current.onFail('The graphics context was lost.'),
        });
        engineRef.current = engine;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (alive) latest.current.onFail(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      if (engine) {
        lastCamera = engine.camera();
        engine.dispose();
      }
      engineRef.current = null;
    };
  }, []);

  const { nodes, routes, focusPoint, autoRotate, reduced, focus, focusKey } = props;
  useEffect(() => engineRef.current?.setNodes(nodes), [ready, nodes]);
  useEffect(() => engineRef.current?.setRoutes(routes), [ready, routes]);
  useEffect(() => engineRef.current?.setFocusPoint(focusPoint), [ready, focusPoint]);
  useEffect(() => engineRef.current?.setAutoRotate(autoRotate), [ready, autoRotate]);
  useEffect(() => engineRef.current?.setReduced(reduced), [ready, reduced]);
  useEffect(() => {
    if (ready) engineRef.current?.flyTo(latest.current.focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  return (
    <div className="atlas-globe" data-ready={ready}>
      <canvas
        ref={canvasRef}
        className="atlas-canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="interactive globe"
        aria-label="Living Atlas globe"
        aria-describedby={descId}
        data-cursor="drag"
        data-cursor-label="Turn the world"
      />
      <div ref={labelsRef} className="atlas-glabels" aria-hidden="true" />
      <p id={descId} className="sr-only">
        Drag, or use the arrow keys, to turn the globe; plus and minus zoom; Enter opens the destination nearest the centre. Every place is also listed in the list view.
      </p>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {!ready ? (
        <div className="atlas-stage-wait">
          <Pulse label="Growing the globe" />
        </div>
      ) : null}
      <ZoomControls
        onIn={() => engineRef.current?.zoomBy(0.7)}
        onOut={() => engineRef.current?.zoomBy(1.4)}
        onReset={() => engineRef.current?.flyTo(focus)}
        resetLabel={focusKey === 'world' ? 'Back to the whole world' : 'Recentre on the selection'}
      />
    </div>
  );
}
