/**
 * Time Machine entry experience: a spine of thirteen decades, each vertebra as tall as the
 * number of stories set in it. Dragging along the spine, clicking a vertebra or using the
 * arrow keys changes the decade, and the preview below changes with it — the decade's
 * context, the stories set then, the places they happen and the movements alive. "Open the
 * Time Machine" carries the chosen decade to /time-machine/<decade>. The choice is kept for
 * the session, so coming back finds the same decade.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { VideoPod } from '../../ui/Pod.tsx';
import { decadePreview, decadeStops, liveliestDecade, stopAt, storyCountLabel } from './home-model.ts';

let remembered: string | null = null;

export function TimePreview() {
  const cat = useCatalogue();
  const stops = useMemo(() => decadeStops(cat), [cat]);
  const [index, setIndex] = useState(() => {
    const kept = remembered ? stops.findIndex((s) => s.period.id === remembered) : -1;
    if (kept >= 0) return kept;
    const best = liveliestDecade(stops);
    return best ? stops.indexOf(best) : 0;
  });
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const stop = stops[Math.min(index, stops.length - 1)];
  const preview = useMemo(() => (stop ? decadePreview(cat, stop.period.id) : null), [cat, stop]);
  const max = Math.max(1, ...stops.map((s) => s.count));
  const withStories = stops.filter((s) => s.count > 0).length;

  if (!stop || !preview) return null;
  const label = stop.period.label;

  const choose = (i: number) => {
    const next = Math.max(0, Math.min(stops.length - 1, i));
    if (next === index) return;
    remembered = stops[next].period.id;
    sound.play('tick');
    setIndex(next);
  };

  const fromPointer = (e: ReactPointerEvent) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    choose(stopAt((e.clientX - r.left) / r.width, stops.length));
  };

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 };
    if (e.key in step) choose(index + step[e.key]);
    else if (e.key === 'Home') choose(0);
    else if (e.key === 'End') choose(stops.length - 1);
    else return;
    e.preventDefault();
  };

  const { videos, movements, places, period } = preview;

  return (
    <section className="home-entry home-time" id="home-time" aria-labelledby="home-time-title" data-reveal>
      <div className="home-entry-head">
        <div>
          <p className="kicker">
            <b>Travel by decade</b>
          </p>
          <h2 id="home-time-title" className="home-entry-title">
            Time Machine
          </h2>
          <p className="home-entry-lede">Every story is placed by when it happens, not when it was made. Drag along the spine to change the decade.</p>
        </div>
        <div className="home-entry-aside">
          <p className="home-entry-stats">
            <span>
              <b>{withStories}</b> of {stops.length} decades hold stories
            </span>
          </p>
        </div>
      </div>

      <div
        ref={trackRef}
        className="home-spine"
        role="slider"
        tabIndex={0}
        aria-label="Decade"
        aria-valuemin={0}
        aria-valuemax={stops.length - 1}
        aria-valuenow={index}
        aria-valuetext={`${label}, ${storyCountLabel(stop.count, 'no stories yet')}`}
        aria-controls="home-time-preview"
        style={{ '--n': stops.length, '--i': index } as CSSProperties}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragging.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* best-effort */
          }
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <span className="home-spine-cord" aria-hidden="true" />
        <span className="home-spine-lens" aria-hidden="true">
          <span>{label}</span>
        </span>
        {stops.map((s, i) => (
          <span
            key={s.period.id}
            className="home-vert"
            data-on={i === index || undefined}
            data-empty={s.count === 0 || undefined}
            data-edge={i === 0 || i === stops.length - 1 || undefined}
            style={{ '--h': s.count / max } as CSSProperties}
            aria-hidden="true"
          >
            <span className="home-vert-body" />
            <span className="home-vert-label">{s.period.label}</span>
          </span>
        ))}
      </div>

      <div className="home-time-preview" id="home-time-preview" key={period.id}>
        <div className="home-time-copy">
          <h3 className="home-time-decade">
            The <span>{label}</span>
          </h3>
          <p className="home-time-summary">{period.summary}</p>
          <dl className="home-time-stats">
            <div>
              <dt>Stories set then</dt>
              <dd>{videos.length}</dd>
            </div>
            <div>
              <dt>Movements alive</dt>
              <dd>{movements.length}</dd>
            </div>
            <div>
              <dt>Places</dt>
              <dd>{places.length}</dd>
            </div>
          </dl>
          {places.length || movements.length ? (
            <div className="home-time-links">
              {places.length ? (
                <ul aria-label={`Places with stories set in the ${label}`}>
                  {places.slice(0, 4).map((p) => (
                    <li key={p.id}>
                      <Link to={cat.href(p.id)} className="home-time-chip home-time-chip-place" onClick={() => sound.play('transition')} data-cursor-label="World">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {movements.length ? (
                <ul aria-label={`Movements alive in the ${label}`}>
                  {movements.slice(0, 4).map((m) => (
                    <li key={m.id}>
                      <Link to={cat.href(m.id)} className="home-time-chip" onClick={() => sound.play('transition')} data-cursor-label="Connections">
                        {m.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <ButtonLink to={cat.href(period.id)} variant="chrome" icon="time" className="home-time-open" data-cursor-label="Time Machine">
            Open the Time Machine in the {label}
          </ButtonLink>
        </div>

        <div className="home-time-stories">
          {videos.length ? (
            <ul className="home-time-grid" aria-label={`Stories set in the ${label}`}>
              {videos.slice(0, 3).map((v) => (
                <li key={v.id}>
                  <VideoPod video={v} size="sm" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="home-time-empty">
              <p className="home-time-empty-title">No stories are set in the {label} yet.</p>
              <p>
                {movements.length
                  ? `The decade is mapped: ${movements.length === 1 ? 'one movement was' : `${movements.length} movements were`} alive then, with places and people to explore in the Time Machine.`
                  : 'The decade is mapped so new stories can be placed here as they are added.'}
              </p>
            </div>
          )}
          {videos.length > 3 ? (
            <p className="home-time-more">
              {videos.length - 3} more in the Time Machine
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
