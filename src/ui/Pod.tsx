/**
 * Specimen pods — how content lives inside the organism. A pod is a glass capsule with a
 * ribbed spine; it wakes (plays its preview loop) on hover or keyboard focus, shows its
 * access state, footage labelling, progress vein, and why it is here (reasons).
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ID, Reason, Video } from '../../shared/types.ts';
import { runtimeLabel, runtimeSpoken, settingLabel, FOOTAGE_LABEL, dateLabel } from '../lib/format.ts';
import { useCatalogue } from '../state/catalogue.tsx';
import { libraryActions, isSaved, useLibrary } from '../state/library.ts';
import { useSession } from '../state/session.ts';
import { isReducedMotion } from '../systems/motion.ts';
import { canPreview, releasePreview, requestPreview } from '../systems/previews.ts';
import { sound } from '../systems/sound/engine.ts';
import { useDragScroll } from './drag-scroll.ts';
import { Icon } from './Icon.tsx';
import { announceSave } from './save.ts';

/* ───────────── Art ───────────── */

export function Art({ art, alt, sizes = 'small', className = '', eager }: { art: ID | undefined; alt?: string; sizes?: 'small' | 'large'; className?: string; eager?: boolean }) {
  const cat = useCatalogue();
  const a = cat.artFor(art);
  const [loaded, setLoaded] = useState(false);
  if (!a) return <div className={`art art-missing ${className}`} aria-hidden="true" />;
  return (
    <div className={`art ${className}`} style={{ backgroundImage: `url("${a.lqip}")` }}>
      <img
        src={sizes === 'large' ? a.poster : a.posterSmall}
        srcSet={`${a.posterSmall} 640w, ${a.poster} 1280w`}
        sizes={sizes === 'large' ? '100vw' : '(max-width: 767px) 80vw, 420px'}
        alt={alt ?? a.alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
      />
      {a.provisional ? <span className="art-provisional mono">Provisional art</span> : null}
    </div>
  );
}

/* ───────────── Badges ───────────── */

export function useAccessState(v: Video) {
  const cat = useCatalogue();
  const { session } = useSession();
  const eff = cat.effectiveAccess(v);
  const premium = session.membership.premium;
  const st = v.availability.status;
  if (eff === 'unavailable') {
    if (st === 'planned') return { key: 'planned', label: 'Planned', locked: true } as const;
    if (st === 'coming-soon') return { key: 'soon', label: v.availability.publicFrom ? `From ${dateLabel(v.availability.publicFrom)}` : 'Coming soon', locked: true } as const;
    return { key: 'unavailable', label: 'Unavailable', locked: true } as const;
  }
  if (st === 'early-access' && eff === 'premium' && v.access === 'free')
    return { key: 'early', label: premium ? 'Early access · unlocked' : 'Early access', locked: !premium } as const;
  if (eff === 'premium') return { key: 'premium', label: premium ? 'Premium · unlocked' : 'Premium', locked: !premium } as const;
  return { key: 'free', label: 'Free', locked: false } as const;
}

export function AccessBadge({ video }: { video: Video }) {
  const s = useAccessState(video);
  return (
    <span className={`badge badge-${s.key}`}>
      {s.key === 'premium' || s.key === 'early' ? <Icon name={s.locked ? 'lock' : 'diamond'} size={11} strokeWidth={2} /> : null}
      {s.label}
    </span>
  );
}

export function FootageBadges({ video, max = 2 }: { video: Video; max?: number }) {
  return (
    <>
      {video.footage.slice(0, max).map((f) => (
        <span key={f} className={`badge badge-footage badge-f-${f}`}>
          {FOOTAGE_LABEL[f]}
        </span>
      ))}
    </>
  );
}

/* ───────────── Reasons ("why is this here") ───────────── */

export function ReasonChips({ reasons, max = 2, linked = true }: { reasons: Reason[]; max?: number; linked?: boolean }) {
  const cat = useCatalogue();
  if (!reasons.length) return null;
  return (
    <ul className="reasons" aria-label="Why this is here">
      {reasons.slice(0, max).map((r, i) => (
        <li key={i} className={`reason reason-${r.kind}`}>
          <span className="reason-node" aria-hidden="true" />
          {linked && r.via ? (
            <Link to={cat.href(r.via)} onClick={() => sound.play('select')}>
              {r.label}
            </Link>
          ) : (
            <span>{r.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Video pod ───────────── */

export function VideoPod({ video, reasons, size = 'md', priority, footer }: { video: Video; reasons?: Reason[]; size?: 'sm' | 'md' | 'lg'; priority?: boolean; footer?: ReactNode }) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const access = useAccessState(video);
  const art = cat.artFor(video.art);
  const runtime = cat.runtime(video);
  const progress = lib.progress[video.id];
  const saved = isSaved(lib, video.id);
  const vidRef = useRef<HTMLVideoElement>(null);
  const href = cat.href(video.id);
  const place = video.places[0] ? cat.label(video.places[0]) : null;
  const pct = progress && !progress.done && progress.dur ? Math.min(100, (progress.pos / progress.dur) * 100) : progress?.done ? 100 : 0;
  const playable = cat.isPlayable(video);
  const cursorLabel = playable ? (access.locked ? 'Preview' : 'Watch') : 'Details';

  const wake = () => {
    const v = vidRef.current;
    if (!v || !art?.previewSmall || !canPreview()) return;
    if (!v.src) v.src = art.previewSmall;
    requestPreview(v);
  };
  const sleep = () => {
    const v = vidRef.current;
    if (v) releasePreview(v);
  };
  useEffect(() => () => sleep(), []);

  const toggleSave = (e: MouseEvent<HTMLButtonElement>) => {
    const now = libraryActions.toggleSave(video.id);
    announceSave({ saved: now, title: video.title, from: e.currentTarget, undo: () => libraryActions.toggleSave(video.id) });
  };

  return (
    <article className={`pod pod-${size}`} data-access={access.key} onPointerEnter={wake} onPointerLeave={sleep} onFocus={wake} onBlur={sleep}>
      <Link to={href} className="pod-specimen" tabIndex={-1} aria-hidden="true" draggable={false} data-cursor="view" data-cursor-label={cursorLabel}>
        <Art art={video.art} eager={priority} />
        {art?.previewSmall ? <video ref={vidRef} className="pod-preview" muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} /> : null}
        <span className="pod-ribs" aria-hidden="true" />
        {runtime ? <span className="pod-runtime mono">{runtimeLabel(runtime)}</span> : null}
        {pct > 0 ? (
          <span className="pod-vein" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </Link>
      <div className="pod-body">
        <div className="pod-badges">
          <AccessBadge video={video} />
          <FootageBadges video={video} max={1} />
        </div>
        <h3 className="pod-title">
          {/* this link's ::after covers the whole card, so it is what the pointer meets: it carries the card cursor */}
          <Link to={href} draggable={false} data-cursor="view" data-cursor-label={cursorLabel} onClick={() => sound.play('transition')}>
            {video.title}
            <span className="sr-only">
              {runtime ? `, ${runtimeSpoken(runtime)}` : ''}, {access.label}
              {progress && !progress.done && progress.pos > 5 ? `, ${Math.round(pct)}% watched` : ''}
            </span>
          </Link>
        </h3>
        <p className="pod-meta mono">
          {place ? <span>{place}</span> : null}
          <span>{settingLabel(video)}</span>
        </p>
        {reasons ? <ReasonChips reasons={reasons} /> : null}
        {footer}
      </div>
      <button type="button" className="pod-save" aria-pressed={saved} aria-label={saved ? `Remove ${video.title} from saved` : `Save ${video.title}`} data-cursor="save" data-cursor-label={saved ? 'Saved' : 'Save to My World'} onClick={toggleSave}>
        <Icon name={saved ? 'saved' : 'save'} size={18} />
      </button>
    </article>
  );
}

/* ───────────── Rows & section headers ───────────── */

export function SectionHeader({ kicker, title, action, id, children }: { kicker?: string; title: ReactNode; action?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <header className="section-head">
      <div>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2 className="section-title serif" id={id}>
          {title}
        </h2>
        {children ? <p className="section-sub muted">{children}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </header>
  );
}

/**
 * Horizontal row of cards. Native scroll + snap; on a desktop mouse the row can also be
 * dragged (with momentum, settling on a card — a drag never opens the card it started on).
 * Arrow keys move focus card to card, Home/End jump to the ends; arrow buttons page it.
 * A thin vein under the row shows where you are in it.
 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [edges, setEdges] = useState({ start: true, end: false, scrollable: false });
  const frame = useRef(0);
  const update = useCallback(() => {
    frame.current = 0;
    const el = ref.current;
    const row = rowRef.current;
    if (!el || !row) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: el.scrollLeft < 8, end: el.scrollLeft >= max - 8, scrollable: max > 8 };
    setEdges((e) => (e.start === next.start && e.end === next.end && e.scrollable === next.scrollable ? e : next));
    row.style.setProperty('--row-thumb', String(max > 0 ? Math.max(0.08, el.clientWidth / el.scrollWidth) : 1));
    row.style.setProperty('--row-pos', String(max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0));
  }, []);
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(update);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [update]);
  useDragScroll(ref, edges.scrollable);

  const behavior = (): ScrollBehavior => (isReducedMotion() ? 'auto' : 'smooth');
  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    sound.play('transition');
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: behavior() });
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if ((e.target as Element).closest('input, textarea, select, [role="slider"], [role="radiogroup"], [role="tablist"], [role="menu"]')) return;
    const items = Array.from(e.currentTarget.children) as HTMLElement[];
    const i = items.findIndex((li) => li.contains(document.activeElement));
    if (i < 0) return;
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : items.length - 1;
    const item = items[Math.max(0, Math.min(items.length - 1, n))];
    if (!item || item === items[i]) return;
    const target = item.querySelector<HTMLElement>('a[href]:not([tabindex="-1"]), button:not([tabindex="-1"]):not(:disabled), [tabindex="0"]');
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: behavior() });
    sound.play('tick');
  };

  return (
    <div ref={rowRef} className="row" data-start={edges.start || undefined} data-end={edges.end || undefined} data-scrollable={edges.scrollable || undefined}>
      <ul
        ref={ref}
        className="row-track"
        aria-label={label}
        aria-describedby={edges.scrollable ? hintId : undefined}
        onScroll={schedule}
        onKeyDown={onKey}
        data-cursor={edges.scrollable ? 'drag' : undefined}
        data-cursor-label={edges.scrollable ? 'Drag' : undefined}
      >
        {Array.isArray(children) ? children.map((c, i) => <li key={i}>{c}</li>) : <li>{children}</li>}
      </ul>
      <p id={hintId} className="sr-only">
        Use the left and right arrow keys to move between items.
      </p>
      <span className="row-vein" aria-hidden="true">
        <span />
      </span>
      <div className="row-nav">
        <button type="button" className="icon-btn btn-chrome" aria-label={`Scroll ${label} back`} disabled={edges.start} onClick={() => page(-1)}>
          <Icon name="left" />
        </button>
        <button type="button" className="icon-btn btn-chrome" aria-label={`Scroll ${label} forward`} disabled={edges.end} onClick={() => page(1)}>
          <Icon name="right" />
        </button>
      </div>
    </div>
  );
}
