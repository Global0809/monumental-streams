/**
 * World entry experience. A living orb (lazy-loaded canvas) carries a pin for every
 * destination with stories and the catalogue's routes between places; beside it, the same
 * destinations as a list. Pointing at a destination — on the globe or in the list — reveals
 * what is set there (story count, the first stories, its connections) and turns the globe
 * to face it; choosing it opens /world/<slug>. The selection survives a round trip to the
 * World page within the session.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { hubContext, storyCountLabel, worldArcs, worldHubs, type WorldHub } from './home-model.ts';
import type { OrbArc, OrbHub } from './WorldOrb.tsx';

const WorldOrb = lazy(() => import('./WorldOrb.tsx'));

/** The destination last pointed at, kept for the session so Back returns to it. */
let remembered: string | null = null;

export function WorldPreview() {
  const cat = useCatalogue();
  const navigate = useNavigate();
  const hubs = useMemo(() => worldHubs(cat), [cat]);
  const arcs = useMemo(() => worldArcs(cat), [cat]);
  const placed = useMemo(() => cat.videos.filter((v) => v.places.length > 0).length, [cat]);
  const tipRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [sel, setSel] = useState<{ id: string | null; from: 'list' | 'globe' }>(() => {
    const kept = !!remembered && hubs.some((h) => h.place.id === remembered);
    // coming back to a destination the viewer chose: the globe turns to face it again
    return { id: kept ? remembered : (hubs[0]?.place.id ?? null), from: kept ? 'list' : 'globe' };
  });
  const hub = hubs.find((h) => h.place.id === sel.id) ?? hubs[0];
  const max = Math.max(1, ...hubs.map((h) => h.videos.length));

  // the orb (and its land data) loads when the section approaches the viewport
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pick = useCallback((id: string | null, from: 'list' | 'globe') => {
    if (!id) return;
    remembered = id;
    setSel((s) => {
      if (s.id === id && s.from === from) return s;
      if (s.id !== id) sound.play('hover');
      return { id, from };
    });
  }, []);

  const orbHubs: OrbHub[] = useMemo(() => hubs.map((h) => ({ id: h.place.id, coords: h.place.coords, weight: h.videos.length, gateway: h.gateway })), [hubs]);
  const orbArcs: OrbArc[] = useMemo(
    () => arcs.map((a) => ({ from: a.from, to: a.to, ends: hubs.filter((h) => h.routes.includes(a.route)).map((h) => h.place.id) })),
    [arcs, hubs],
  );

  const open = useCallback(
    (id: string) => {
      remembered = id;
      sound.play('transition');
      navigate(cat.href(id));
    },
    [cat, navigate],
  );

  if (!hubs.length || !hub) return null;

  return (
    <section className="home-entry home-world" id="home-world" aria-labelledby="home-world-title" data-reveal>
      <div className="home-entry-head">
        <div>
          <p className="kicker">
            <b>Explore by place</b>
          </p>
          <h2 id="home-world-title" className="home-entry-title">
            World
          </h2>
          <p className="home-entry-lede">A living globe of places and the stories set there. Point at a destination to see what lives there.</p>
        </div>
        <div className="home-entry-aside">
          <p className="home-entry-stats">
            <span>
              <b>{placed}</b> stories placed
            </span>
            <span>
              <b>{hubs.length}</b> destinations
            </span>
            <span>
              <b>{arcs.length}</b> connections
            </span>
          </p>
          <ButtonLink to="/world" variant="quiet" iconAfter="arrow" data-cursor-label="World">
            Open World
          </ButtonLink>
        </div>
      </div>

      <div className="home-world-grid">
        <div className="home-orb" ref={stageRef}>
          <div className="home-orb-placeholder" aria-hidden="true" />
          {near ? (
            <Suspense fallback={null}>
              <WorldOrb
                hubs={orbHubs}
                arcs={orbArcs}
                selected={hub.place.id}
                centreOn={sel.from === 'list' ? sel.id : null}
                onHover={(id) => pick(id, 'globe')}
                onSelect={(id) => pick(id, 'globe')}
                onOpen={open}
                tip={tipRef}
                label={`Globe showing ${hubs.length} destinations with stories and ${arcs.length} connections between places. The list of destinations beside it opens each one.`}
              />
            </Suspense>
          ) : null}
          <div ref={tipRef} className="home-orb-tip" aria-hidden="true">
            <span className="home-orb-tip-in">
              <b>{hub.place.name}</b>
              <span>{storyCountLabel(hub.videos.length, 'No stories yet')}</span>
            </span>
          </div>
          <p className="home-orb-hint" aria-hidden="true">
            <Icon name="globe" size={14} /> Drag to turn · click a light to open
          </p>
        </div>

        <div className="home-world-side">
          <ol className="home-dests" aria-label="Destinations with stories">
            {hubs.map((h) => (
              <li key={h.place.id}>
                <Link
                  to={cat.href(h.place.id)}
                  className="home-dest"
                  data-active={h.place.id === hub.place.id || undefined}
                  aria-current={h.place.id === hub.place.id ? 'true' : undefined}
                  onPointerEnter={(e) => e.pointerType !== 'touch' && pick(h.place.id, 'list')}
                  onFocus={() => pick(h.place.id, 'list')}
                  onClick={() => {
                    remembered = h.place.id;
                    sound.play('transition');
                  }}
                  data-cursor="open"
                  data-cursor-label="World"
                >
                  <span className="home-dest-name">{h.place.name}</span>
                  <span className="home-dest-ctx">{hubContext(cat, h, true)}</span>
                  <span className="home-dest-count">
                    <span className="home-dest-bar" aria-hidden="true">
                      <span style={{ width: `${(h.videos.length / max) * 100}%` }} />
                    </span>
                    {storyCountLabel(h.videos.length, 'No stories yet')}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <DestinationCard hub={hub} />
        </div>
      </div>
    </section>
  );
}

function DestinationCard({ hub }: { hub: WorldHub }) {
  const cat = useCatalogue();
  const stories = hub.videos.slice(0, 3);
  const nearby = hub.nearby.map((p) => p.name);
  return (
    <div className="home-dest-card" key={hub.place.id} data-gateway={hub.gateway || undefined}>
      <p className="home-dest-card-ctx">{hubContext(cat, hub)}</p>
      <h3 className="home-dest-card-name">{hub.place.name}</h3>
      <p className="home-dest-card-count">
        {storyCountLabel(hub.videos.length, 'No stories yet')}
        {hub.playable !== hub.videos.length ? ` · ${hub.playable} to watch now` : ''}
        {hub.routes.length ? ` · ${hub.routes.length} ${hub.routes.length === 1 ? 'connection' : 'connections'}` : ''}
      </p>
      {nearby.length ? <p className="home-dest-card-near">Includes stories nearby in {listWords(nearby)}.</p> : null}
      {stories.length ? (
        <ul className="home-dest-stories" aria-label={`Stories set in and around ${hub.place.name}`}>
          {stories.map((v) => (
            <li key={v.id}>
              <Link to={cat.href(v.id)} onClick={() => sound.play('transition')} data-cursor={cat.isPlayable(v) ? 'play' : 'open'}>
                <span className="home-dest-story-title">{v.title}</span>
                <span className="home-dest-story-meta">{settingLabel(v)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <ButtonLink to={cat.href(hub.place.id)} variant="chrome" iconAfter="arrow" className="home-dest-open" data-cursor-label="World">
        Open {hub.place.name} in World
      </ButtonLink>
    </div>
  );
}

function listWords(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}
