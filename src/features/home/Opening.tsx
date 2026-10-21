/**
 * The opening of Home: the platform's line and the featured chapter, set as an editorial
 * column over the living world. There is no hero picture: the world IS the picture. The
 * featured story's seed floats nearest the camera (arrangement `home` with `featured`), a
 * small tag names it in the world, and the copy and the seed answer each other — pointing at
 * the chapter lights its seed, pointing at the seed lights the chapter. The view's one gold
 * action watches the teaser; saving it sends the seed flying into My World.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from 'react';
import { Link } from 'react-router';
import type { ID, Programme, Video } from '../../../shared/types.ts';
import { FOOTAGE_LABEL, runtimeLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { setHovered, stageCommands, stageStore } from '../../stage/store.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { announceSave } from '../../ui/save.ts';
import { PROGRAMME_STATUS_LABEL, routeStops } from '../programme/programme-model.ts';
import { splitTitle } from './home-model.ts';
import { useHoveredSeed } from './light.ts';

export const FEATURE_ID = 'programme:wavemakers-pr-ny-london';
export const TEASER_ID = 'video:wavemakers-teaser';

export function Opening() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    // the seed's tag belongs to the first screen: it shows while most of the opening is in view
    const io = new IntersectionObserver(
      ([en]) => setInView(en.isIntersecting && en.intersectionRect.height >= 0.7 * Math.min(window.innerHeight, en.boundingClientRect.height)),
      { threshold: [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <header ref={ref} className="home-open" id="home-hero">
      <div className="wrap home-open-inner">
        <h1 className="title-monument home-open-title">
          <span className="sr-only">Monumental Streams: </span>
          <span className="home-open-line">Stream</span> <span className="home-open-line">the world.</span>
        </h1>
        <p className="lede home-open-lede">Films, music and the public record, placed on a living globe and a timeline you can travel.</p>
        <Feature />
      </div>
      <SeedTag id={TEASER_ID} active={inView} />
    </header>
  );
}

/** The featured chapter: its honest status, its route, the gold action and the save. */
function Feature() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const programme = cat.get(FEATURE_ID) as Programme | undefined;
  const series = programme?.parent ? (cat.get(programme.parent) as Programme | undefined) : undefined;
  const teaser = cat.get(TEASER_ID) as Video | undefined;
  const saveRef = useRef<HTMLButtonElement>(null);
  const lit = useHoveredSeed() === TEASER_ID && !!teaser;

  if (!programme) {
    return (
      <div className="home-feature">
        <ButtonLink to="/catalogue" variant="primary" size="lg" icon="search">
          Explore the catalogue
        </ButtonLink>
      </div>
    );
  }

  const href = cat.href(programme.id);
  const stops = routeStops(cat, programme);
  const playable = teaser ? cat.isPlayable(teaser) : false;
  const runtime = teaser ? cat.runtime(teaser) : null;
  const saved = teaser ? isSaved(lib, teaser.id) : false;
  const [lead, rest] = splitTitle(programme.title, series?.title);
  const name = series?.title ?? programme.title;

  const reach = () => {
    if (teaser) setHovered(teaser.id);
  };
  const release = () => {
    if (stageStore.get().hovered === TEASER_ID) setHovered(null);
  };
  const toggleSave = () => {
    if (!teaser) return;
    const now = libraryActions.toggleSave(teaser.id);
    announceSave({ saved: now, title: teaser.title, from: saveRef.current, id: teaser.id, undo: () => libraryActions.toggleSave(teaser.id) });
  };

  return (
    <section
      className="home-feature"
      aria-labelledby="home-feature-title"
      data-lit={lit || undefined}
      onPointerEnter={reach}
      onPointerLeave={release}
      onFocus={reach}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release();
      }}
    >
      <p className="eyebrow home-feature-eyebrow">
        <span className="home-feature-spark" aria-hidden="true" />
        Featured {programme.original ? 'original' : 'programme'}
      </p>
      <h2 id="home-feature-title" className="home-feature-title">
        <Link to={href} data-cursor="open" data-cursor-label="Programme" onClick={() => sound.play('transition')}>
          {lead ? <span className="home-feature-lead">{lead} </span> : null}
          <span className="home-feature-name">{name}</span>
          {rest ? <span className="home-feature-sub"> {rest}</span> : null}
        </Link>
      </h2>
      <p className="home-feature-state">
        <span className="home-feature-status" data-status={programme.status}>
          <span className="home-feature-node" aria-hidden="true" />
          {PROGRAMME_STATUS_LABEL[programme.status]}
        </span>
        {stops.length > 1 ? (
          <span className="home-feature-route">
            <span className="sr-only">Route: </span>
            {stops.map((s, i) => (
              <span key={s.id} className="home-feature-stop">
                {i > 0 ? (
                  <span className="home-feature-to" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <Link to={cat.href(s.id)} data-cursor-label="World" onClick={() => sound.play('transition')}>
                  {s.name}
                </Link>
                {i > 0 && i < stops.length - 1 ? <span className="sr-only">, then</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </p>
      <div className="home-feature-actions">
        {teaser && playable ? (
          <ButtonLink to={cat.href(teaser.id)} variant="primary" size="lg" icon="play" aria-describedby="home-feature-title" data-cursor="play" data-cursor-label="Watch">
            Watch the teaser
          </ButtonLink>
        ) : (
          <ButtonLink to={href} variant="primary" size="lg" iconAfter="arrow" data-cursor="open">
            Discover {name}
          </ButtonLink>
        )}
        {teaser ? (
          <button
            ref={saveRef}
            type="button"
            className="btn btn-chrome btn-lg home-feature-save"
            aria-pressed={saved}
            data-cursor="save"
            data-cursor-label={saved ? 'Saved' : 'Save'}
            onClick={toggleSave}
          >
            <Icon name={saved ? 'saved' : 'save'} size={20} />
            <span>{saved ? 'Saved to My World' : 'Save teaser'}</span>
          </button>
        ) : null}
      </div>
      {teaser ? (
        <p className="home-feature-fine">
          Teaser{runtime ? ` · ${runtimeLabel(runtime)}` : ''} · {teaser.footage.map((f) => FOOTAGE_LABEL[f]).join(', ') || 'footage type not stated'}
          {teaser.footage.length === 1 && teaser.footage[0] === 'illustrative' ? '. A motion concept, not footage from the programme.' : ''}
        </p>
      ) : null}
    </section>
  );
}

/**
 * A hairline tag anchored to a seed in the world, naming it where it floats. Purely visual
 * (the chapter above is the accessible version); it follows the seed only while the opening
 * is in view and the 3D world is running, and is absent without WebGL.
 */
function SeedTag({ id, active }: { id: ID; active: boolean }) {
  const cat = useCatalogue();
  const el = useRef<HTMLSpanElement>(null);
  const running = useSyncExternalStore(
    stageStore.subscribe,
    () => stageStore.get().quality !== 'off' && stageStore.get().ready,
    () => false,
  );
  const lit = useHoveredSeed() === id;
  const video = cat.get(id) as Video | undefined;

  useEffect(() => {
    const node = el.current;
    const text = node?.querySelector<HTMLElement>('.home-seedtag-text');
    const hero = node?.closest('.home-open');
    if (!node || !text || !hero || !running || !active) {
      if (node) delete node.dataset.on;
      return;
    }
    // the tag never sits on the copy: it hides wherever it would overlap the title or chapter
    type Box = { l: number; r: number; t: number; b: number };
    let blocks: Box[] = [];
    const copy = Array.from(hero.querySelectorAll<HTMLElement>('.home-open-title, .home-open-lede, .home-feature > *'));
    const measure = () => {
      blocks = copy.map((b) => {
        const r = b.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top + window.scrollY, b: r.bottom + window.scrollY };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero);
    for (const b of copy) ro.observe(b);
    const overlaps = (r: DOMRect) => blocks.some((b) => r.left < b.r && r.right > b.l && r.top + window.scrollY < b.b + 8 && r.bottom + window.scrollY > b.t - 8);

    let raf = 0;
    const tick = () => {
      const p = stageCommands.project(id);
      let show = false;
      if (p && p.visible && p.x > 0 && p.y > 0 && p.x < window.innerWidth && p.y < window.innerHeight) {
        node.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
        const r = text.getBoundingClientRect();
        show = r.bottom < window.innerHeight && !overlaps(r);
      }
      if (show) node.dataset.on = '';
      else delete node.dataset.on;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      delete node.dataset.on;
    };
  }, [id, running, active]);

  if (!video) return null;
  const runtime = cat.runtime(video);
  return (
    <span ref={el} className="home-seedtag" aria-hidden="true" data-lit={lit || undefined}>
      <span className="home-seedtag-leader" />
      <span className="home-seedtag-text">
        <span className="home-seedtag-name">Teaser</span>
        {runtime ? <span className="timecode">{runtimeLabel(runtime)}</span> : null}
      </span>
    </span>
  );
}
