/**
 * The opening. A full-bleed living membrane (the studio loop) behind the platform statement,
 * with live counts of what the catalogue holds today, and the featured programme docked in a
 * glass capsule: WAVEMAKERS, its honest status, its route, and the one gold action of the view
 * (watch the teaser). Saving the teaser launches an orb into My World.
 *
 * Under a fine pointer the membrane answers: a pool of light follows the pointer and the
 * loop drifts a few pixels against it. Touch, reduced motion and low-graphics devices get the
 * still composition. The loop autoplays only when canAutoplay() allows and always has a
 * visible pause.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Programme, Video } from '../../../shared/types.ts';
import { FOOTAGE_LABEL, runtimeLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { deviceTier, finePointer } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { LoopToggle, OriginalBadge, StatusBadge } from '../programme/ProgrammeCard.tsx';
import { routeStops } from '../programme/programme-model.ts';
import { useLoop } from '../programme/useLoop.ts';
import { platformStats, splitTitle } from './home-model.ts';

const HERO_ART = 'art:living-membrane';
const FEATURE_ID = 'programme:wavemakers-pr-ny-london';
const TEASER_ID = 'video:wavemakers-teaser';

/** Pointer-following light and parallax on the hero membrane (fine pointers, full motion only). */
function useMembrane(ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !finePointer() || deviceTier() === 'low') return;
    let frame = 0;
    let x = 0.5;
    let y = 0.5;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--hx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--hy', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--dx', (x - 0.5).toFixed(3));
      el.style.setProperty('--dy', (y - 0.5).toFixed(3));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const r = el.getBoundingClientRect();
      x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      el.dataset.lit = '';
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      delete el.dataset.lit;
    };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      for (const p of ['--hx', '--hy', '--dx', '--dy']) el.style.removeProperty(p);
      delete el.dataset.lit;
    };
  }, [ref, reduced]);
}

export function Hero({ returning }: { returning?: boolean }) {
  const cat = useCatalogue();
  const art = cat.artFor(HERO_ART);
  const heroRef = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const hasLoop = !!(art?.preview || art?.previewSmall);
  const loop = useLoop(vid, hasLoop ? { large: art?.preview, small: art?.previewSmall } : null, { autoplay: true });
  const stats = useMemo(() => platformStats(cat), [cat]);
  useMembrane(heroRef);

  return (
    <header ref={heroRef} className={`home-hero ${returning ? 'home-hero-returning' : ''}`} id="home-hero" data-playing={loop.playing || undefined}>
      <div className="home-hero-stage" aria-hidden="true">
        <div className="home-hero-art">
          <Art art={HERO_ART} alt="" sizes="large" eager />
          {hasLoop ? <video ref={vid} className="home-hero-video" muted loop playsInline preload="none" tabIndex={-1} /> : null}
        </div>
        <div className="home-hero-lens" />
      </div>

      <div className="wrap home-hero-inner">
        <div className="home-hero-copy">
          <h1 className="home-brand">
            <span className="sr-only">Monumental Streams: </span>
            <span className="home-brand-line">Stream</span> <span className="home-brand-line">the world.</span>
          </h1>
          <p className="home-brand-lede">Films, music and the public record — placed on a living globe and a timeline you can travel.</p>
          <ul className="home-hero-stats" aria-label="In the catalogue today">
            <li>
              <b>{stats.stories}</b> {stats.stories === 1 ? 'story' : 'stories'}
            </li>
            <li>
              <b>{stats.places}</b> {stats.places === 1 ? 'place' : 'places'}
            </li>
            <li>
              <b>{stats.decades}</b> {stats.decades === 1 ? 'decade' : 'decades'}
            </li>
          </ul>
        </div>
        <FeatureCapsule />
      </div>

      {hasLoop ? <LoopToggle playing={loop.playing} onToggle={loop.toggle} className="home-hero-toggle" label="hero motion" /> : null}
    </header>
  );
}

/** The featured programme, docked in the hero. Falls back to the catalogue when it is absent. */
function FeatureCapsule() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const programme = cat.get(FEATURE_ID) as Programme | undefined;
  const series = programme?.parent ? (cat.get(programme.parent) as Programme | undefined) : undefined;
  const teaser = cat.get(TEASER_ID) as Video | undefined;
  const artId = programme?.art ?? teaser?.art;
  const art = cat.artFor(artId);
  const vid = useRef<HTMLVideoElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const hasLoop = !!art?.previewSmall;
  const loop = useLoop(vid, hasLoop ? { small: art?.previewSmall, large: art?.previewSmall } : null);

  if (!programme) {
    return (
      <div className="home-feature home-feature-plain">
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

  const toggleSave = () => {
    if (!teaser) return;
    const now = libraryActions.toggleSave(teaser.id);
    sound.play(now ? 'save' : 'unsave');
    if (now) flyToMyWorld(saveRef.current);
    toast(now ? `Saved “${teaser.title}” to My World` : `Removed “${teaser.title}” from My World`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.toggleSave(teaser.id) },
    });
  };

  return (
    <div
      className="home-feature"
      role="group"
      aria-labelledby="home-feature-title"
      data-on={loop.playing || undefined}
      onPointerEnter={loop.wake}
      onPointerLeave={loop.sleep}
      onFocus={loop.wake}
      onBlur={loop.sleep}
    >
      <Link to={href} className="home-feature-art" tabIndex={-1} aria-hidden="true" data-cursor="open" data-cursor-label="Programme" onClick={() => sound.play('transition')}>
        <Art art={artId} alt="" />
        {hasLoop ? <video ref={vid} className="home-feature-preview" muted loop playsInline preload="none" tabIndex={-1} /> : null}
      </Link>
      <div className="home-feature-body">
        <p className="home-feature-kicker">
          <span className="home-feature-spark" aria-hidden="true" />
          Featured {programme.original ? 'original' : 'programme'}
        </p>
        <h2 id="home-feature-title" className="home-feature-title">
          <Link to={href} onClick={() => sound.play('transition')}>
            {lead ? <span className="home-feature-lead">{lead}</span> : null}
            <span className="home-feature-name">{series?.title ?? programme.title}</span>
            {rest ? <span className="home-feature-sub">{rest}</span> : null}
          </Link>
        </h2>
        <div className="home-feature-badges">
          <StatusBadge status={programme.status} />
          {programme.original ? <OriginalBadge /> : null}
        </div>
        {stops.length > 1 ? (
          <ol className="home-feature-route" aria-label={`Route: ${stops.map((s) => s.name).join(' to ')}`}>
            {stops.map((s) => (
              <li key={s.id}>
                <Link to={cat.href(s.id)} onClick={() => sound.play('transition')} data-cursor-label="World">
                  {s.name}
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="home-feature-actions">
          {teaser && playable ? (
            <ButtonLink to={cat.href(teaser.id)} variant="primary" size="lg" icon="play" data-cursor="play" data-cursor-label="Watch" data-react="magnet">
              Watch the {series?.title ?? 'programme'} teaser
            </ButtonLink>
          ) : (
            <ButtonLink to={href} variant="primary" size="lg" iconAfter="arrow" data-cursor="open">
              Discover {series?.title ?? programme.title}
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
      </div>
    </div>
  );
}
