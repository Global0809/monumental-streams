/**
 * Shared building blocks of the category pages: the title card (one component, several
 * shapes), save-to-My-World, the category switcher, the toolbar (search · facets · sort ·
 * grouping), the "where and when" context, the no-match and honest empty states, and the
 * FLIP motion that lets results glide when the collection changes.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Section, SectionId } from '../../../shared/sections.ts';
import type { Video } from '../../../shared/types.ts';
import { plural, runtimeLabel, runtimeSpoken, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { canPreview, releasePreview, requestPreview } from '../../systems/previews.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink, Chip, Segmented } from '../../ui/controls.tsx';
import { toast } from '../../ui/feedback.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { AccessBadge, Art, FootageBadges, useAccessState } from '../../ui/Pod.tsx';
import {
  CAT_SORTS,
  CAT_SORT_LABEL,
  GROUP_LABEL,
  categoryCounts,
  interestContext,
  membershipLabel,
  relatedEras,
  relatedPlaces,
  type CatSort,
  type CatState,
  type CategoryView,
  type Facet,
  type GroupMode,
} from './engine.ts';

/* ───────────── Hot linking (a hero mark ⇄ its card) ───────────── */

/** Light every element that stands for this title (spectrum bar, card, frame) — no re-render. */
export function setHot(root: HTMLElement | null, id: string | null) {
  if (!root) return;
  for (const el of root.querySelectorAll('.is-hot')) el.classList.remove('is-hot');
  if (!id) return;
  for (const el of root.querySelectorAll(`[data-vid="${CSS.escape(id)}"]`)) el.classList.add('is-hot');
}

/* ───────────── Save to My World ───────────── */

export function useSaveToggle(video: Video) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  const toggle = (e: MouseEvent<HTMLElement>) => {
    const from = e.currentTarget;
    const now = libraryActions.toggleSave(video.id);
    sound.play(now ? 'save' : 'unsave');
    if (now) flyToMyWorld(from);
    toast(now ? `Saved “${video.title}” to My World` : `Removed “${video.title}” from My World`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.toggleSave(video.id) },
    });
  };
  return { saved, toggle };
}

export function SaveButton({ video, className = '' }: { video: Video; className?: string }) {
  const { saved, toggle } = useSaveToggle(video);
  return (
    <button
      type="button"
      className={`cc-save ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${video.title} from My World` : `Save ${video.title}`}
      title={saved ? 'Saved to My World' : 'Save to My World'}
      data-cursor="save"
      onClick={toggle}
    >
      <Icon name={saved ? 'saved' : 'save'} size={18} />
    </button>
  );
}

/** Labelled save action for heroes and lead stories. */
export function SaveAction({ video }: { video: Video }) {
  const { saved, toggle } = useSaveToggle(video);
  return (
    <button type="button" className="btn btn-chrome btn-lg cat-save-action" aria-pressed={saved} data-cursor="save" onClick={toggle}>
      <Icon name={saved ? 'saved' : 'save'} size={20} />
      <span>{saved ? 'Saved to My World' : 'Save to My World'}</span>
    </button>
  );
}

/* ───────────── Title card ───────────── */

export type CardShape = 'wide' | 'scope' | 'sleeve' | 'look' | 'cart' | 'tile' | 'mosaic' | 'story';

export function CatCard({
  video,
  shape,
  index,
  eager,
  hotRoot,
  sizes = 'small',
  children,
}: {
  video: Video;
  shape: CardShape;
  index?: number;
  eager?: boolean;
  /** Page root for hot linking between this card and the hero's mark for the same title. */
  hotRoot?: RefObject<HTMLElement | null>;
  sizes?: 'small' | 'large';
  children?: ReactNode;
}) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const access = useAccessState(video);
  const art = cat.artFor(video.art);
  const runtime = cat.runtime(video);
  const href = cat.href(video.id);
  const progress = lib.progress[video.id];
  const pct = progress && !progress.done && progress.dur ? Math.min(100, (progress.pos / progress.dur) * 100) : progress?.done ? 100 : 0;
  const playable = cat.isPlayable(video);
  const place = video.places[0] ? cat.label(video.places[0]) : null;
  const vid = useRef<HTMLVideoElement>(null);

  const wake = () => {
    setHot(hotRoot?.current ?? null, video.id);
    const v = vid.current;
    if (!v || !art?.previewSmall || !canPreview()) return;
    if (!v.getAttribute('src')) v.src = art.previewSmall;
    requestPreview(v);
  };
  const sleep = () => {
    setHot(hotRoot?.current ?? null, null);
    const v = vid.current;
    if (v) releasePreview(v);
  };
  useEffect(
    () => () => {
      const v = vid.current;
      if (v) releasePreview(v);
    },
    [],
  );

  const num = index !== undefined ? String(index + 1).padStart(2, '0') : null;

  return (
    <article className={`cc cc-${shape}`} data-access={access.key} data-vid={video.id} onPointerEnter={wake} onPointerLeave={sleep} onFocus={wake} onBlur={sleep}>
      <Link
        to={href}
        className="cc-media"
        tabIndex={-1}
        aria-hidden="true"
        data-react="tilt light"
        data-cursor={playable ? 'play' : 'open'}
        data-cursor-label={playable ? (access.locked ? 'Preview' : 'Watch') : 'Details'}
        onClick={() => sound.play('transition')}
      >
        <Art art={video.art} eager={eager} sizes={sizes} />
        {art?.previewSmall ? <video ref={vid} className="cc-preview" muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} /> : null}
        <span className="cc-sheen" aria-hidden="true" />
        {num && (shape === 'look' || shape === 'cart') ? <span className="cc-num" aria-hidden="true">{num}</span> : null}
        {runtime ? <span className="cc-runtime">{runtimeLabel(runtime)}</span> : null}
        {pct > 0 ? (
          <span className="cc-vein" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </Link>
      <div className="cc-body">
        <div className="cc-badges">
          <AccessBadge video={video} />
          <FootageBadges video={video} max={1} />
        </div>
        <h3 className="cc-title">
          <Link to={href} onClick={() => sound.play('transition')}>
            {video.title}
            <span className="sr-only">
              {runtime ? `, ${runtimeSpoken(runtime)}` : ''}, {access.label}
              {progress && !progress.done && progress.pos > 5 ? `, ${Math.round(pct)}% watched` : ''}
            </span>
          </Link>
        </h3>
        <p className="cc-meta">
          {place ? <span>{place}</span> : null}
          <span>{settingLabel(video)}</span>
        </p>
        {children}
      </div>
      <SaveButton video={video} />
    </article>
  );
}

/* ───────────── FLIP: results glide when the collection changes ───────────── */

/**
 * Items marked [data-flip="key"] inside the container glide from where they were to where
 * they are; newcomers rise in. Running animations are cancelled first, so a new change
 * interrupts cleanly mid-flight.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, signature: string) {
  const prev = useRef<Map<string, { x: number; y: number }> | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    for (const it of items) for (const a of it.getAnimations()) a.cancel();
    const base = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    for (const it of items) {
      const r = it.getBoundingClientRect();
      next.set(it.dataset.flip!, { x: r.left - base.left, y: r.top - base.top });
    }
    const before = prev.current;
    prev.current = next;
    if (!before || isReducedMotion()) return;
    let fresh = 0;
    for (const it of items) {
      const key = it.dataset.flip!;
      const now = next.get(key)!;
      const was = before.get(key);
      if (was) {
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
          it.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      } else {
        it.animate([{ opacity: 0, transform: 'translateY(18px) scale(0.97)' }, { opacity: 1, transform: 'none' }], {
          duration: 520,
          delay: Math.min(fresh++, 8) * 40,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        });
      }
    }
  }, [ref, signature]);
}

/* ───────────── Category switcher ───────────── */

/** The category this browser tab showed last, so the next one can glide from it. */
let lastCategory: SectionId | null = null;

export function Switcher({ current }: { current: Section }) {
  const cat = useCatalogue();
  const counts = useMemo(() => categoryCounts(cat), [cat]);
  const listRef = useRef<HTMLUListElement>(null);
  const glideRef = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const glide = glideRef.current;
    if (!list || !glide) return;
    const to = list.querySelector<HTMLElement>(`[data-cat="${current.id}"]`);
    const from = lastCategory && lastCategory !== current.id ? list.querySelector<HTMLElement>(`[data-cat="${lastCategory}"]`) : null;
    lastCategory = current.id;
    if (!to) return;
    // keep the current category in view inside the strip (never scrolls the page)
    const li = to.parentElement!;
    const target = li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2;
    list.scrollLeft = Math.max(0, target);
    const place = (el: HTMLElement) => {
      const p = el.parentElement!;
      glide.style.setProperty('--gx', `${p.offsetLeft}px`);
      glide.style.setProperty('--gw', `${p.offsetWidth}px`);
    };
    if (from && !isReducedMotion()) {
      glide.style.transition = 'none';
      place(from);
      void glide.offsetWidth;
      glide.style.transition = '';
      requestAnimationFrame(() => place(to));
    } else place(to);
    const onResize = () => place(to);
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(onResize).catch(() => undefined);
    return () => window.removeEventListener('resize', onResize);
  }, [current.id]);

  return (
    <nav className="cat-switch" aria-label="Categories">
      <ul ref={listRef} className="cat-switch-list">
        <li ref={glideRef} className="cat-switch-glide" aria-hidden="true" />
        {counts.map(({ section: s, count }) => {
          const on = s.id === current.id;
          return (
            <li key={s.id}>
              <Link
                to={s.path}
                data-cat={s.id}
                className="cat-switch-item"
                aria-current={on ? 'page' : undefined}
                data-empty={count === 0 || undefined}
                viewTransition
                state={{ keepFocus: true, catSwitch: true }}
                onClick={() => sound.play('transition')}
                data-cursor-label={s.label}
              >
                <Icon name={s.icon as IconName} size={17} />
                <span className="cat-switch-label">{s.label}</span>{' '}
                <span className="cat-switch-count">
                  {count}
                  <span className="sr-only"> {count === 1 ? 'title' : 'titles'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ───────────── Live counts ───────────── */

export function StatLine({ items }: { items: { n: number | string; label: string; tone?: 'frost' | 'gold' | 'iris' }[] }) {
  return (
    <dl className="cat-stats">
      {items.map((it) => (
        <div key={it.label} className={`cat-stat ${it.tone ? `is-${it.tone}` : ''}`}>
          <dt>{it.label}</dt>
          <dd>{it.n}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────── Toolbar: search · facets · sort · grouping ───────────── */

export function Toolbar({
  section,
  state,
  draft,
  facets,
  view,
  groups,
  group,
  onType,
  onClearQuery,
  onFacet,
  onSort,
  onGroup,
  onClearAll,
}: {
  section: Section;
  state: CatState;
  draft: string;
  facets: Facet[];
  view: CategoryView;
  groups: GroupMode[];
  group: GroupMode | null;
  onType: (q: string) => void;
  onClearQuery: () => void;
  onFacet: (key: string | null) => void;
  onSort: (s: CatSort) => void;
  onGroup: (g: GroupMode) => void;
  onClearAll: () => void;
}) {
  const id = useId();
  const total = view.all.length;
  const shown = view.results.length;
  const q = state.q.trim();
  const filtered = !!state.facet || !!q;
  const parts = [view.facet?.label, q ? `“${q}”` : null].filter(Boolean);
  const summary = `Showing ${shown} of ${plural(total, 'title')}${parts.length ? ` · ${parts.join(' · ')}` : ''} · ${CAT_SORT_LABEL[state.sort]}`;

  // Polite, settled announcement of what changed (not every keystroke).
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounced(summary), 600);
    return () => window.clearTimeout(t);
  }, [summary]);

  return (
    <div className="cat-tools" role="search" aria-label={`Filter ${section.label}`}>
      <div className="cat-tools-row">
        <label className="cat-find" htmlFor={`${id}-q`}>
          <Icon name="search" size={18} />
          <input
            id={`${id}-q`}
            type="search"
            className="cat-find-input"
            aria-label={`Search within ${section.label}`}
            placeholder={`Search ${section.label}`}
            value={draft}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && draft) {
                e.preventDefault();
                onClearQuery();
              }
            }}
          />
          {draft ? (
            <button type="button" className="cat-find-clear" aria-label="Clear search" onClick={onClearQuery}>
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </label>

        {facets.length ? (
          <div className="cat-facets" role="group" aria-label={`${section.label} filters`}>
            <Chip selected={!state.facet} onToggle={() => onFacet(null)} count={view.searched}>
              All
            </Chip>
            {facets.map((f) => {
              const n = view.facetCounts[f.key] ?? 0;
              const on = state.facet === f.key;
              return (
                <Chip key={f.key} selected={on} count={n} disabled={!on && n === 0} onToggle={() => onFacet(on ? null : f.key)}>
                  {f.label}
                </Chip>
              );
            })}
          </div>
        ) : null}

        <div className="cat-tools-end">
          {groups.length ? (
            <Segmented label="Group by" hideLabel value={group ?? groups[0]} options={groups.map((g) => ({ value: g, label: GROUP_LABEL[g] }))} onChange={onGroup} />
          ) : null}
          <label className="cat-sort">
            <span className="sr-only">Sort {section.label}</span>
            <Icon name="filter" size={16} />
            <select value={state.sort} onChange={(e) => onSort(e.target.value as CatSort)}>
              {CAT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {s === 'featured' && q ? 'Best match' : CAT_SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <Icon name="down" size={14} />
          </label>
        </div>
      </div>

      <div className="cat-tools-status">
        <p className="cat-showing">
          <span className="cat-showing-n">{shown}</span>
          <span>
            {' '}
            of {plural(total, 'title')}
          </span>
          {view.facet ? (
            <button type="button" className="cat-pill" onClick={() => onFacet(null)} aria-label={`Remove filter ${view.facet.label}`}>
              {view.facet.label}
              <Icon name="close" size={13} />
            </button>
          ) : null}
          {q ? (
            <button type="button" className="cat-pill" onClick={onClearQuery} aria-label={`Clear search ${q}`}>
              “{q}”
              <Icon name="close" size={13} />
            </button>
          ) : null}
          <span className="cat-showing-sort">{state.sort === 'featured' && q ? 'Best match' : CAT_SORT_LABEL[state.sort]}</span>
        </p>
        {filtered ? (
          <button type="button" className="btn btn-quiet btn-sm cat-clear" onClick={onClearAll}>
            <Icon name="replay" size={16} />
            <span>Show all {section.label}</span>
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announced}
      </p>
    </div>
  );
}

/* ───────────── No matches inside a category ───────────── */

export function NoMatches({ section, q, facet, onClearQuery, onClearFacet }: { section: Section; q: string; facet: Facet | null; onClearQuery: () => void; onClearFacet: () => void }) {
  const query = q.trim();
  return (
    <div className="cat-nomatch" role="status">
      <span className="cat-nomatch-orb" aria-hidden="true" />
      <h3 className="cat-nomatch-title">
        No {section.label} titles match{query ? ` “${query}”` : ''}
        {facet ? ` in ${facet.label}` : ''}.
      </h3>
      <p className="muted">Loosen the question — or look across the whole catalogue.</p>
      <div className="cat-nomatch-actions">
        {facet ? (
          <button type="button" className="btn btn-chrome" onClick={onClearFacet}>
            Remove {facet.label}
          </button>
        ) : null}
        {query ? (
          <button type="button" className="btn btn-chrome" onClick={onClearQuery}>
            Clear “{query}”
          </button>
        ) : null}
        {query ? (
          <Link className="btn btn-quiet" to={`/search?q=${encodeURIComponent(query)}`} onClick={() => sound.play('transition')}>
            <Icon name="search" size={18} />
            <span>Search everything for “{query}”</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── Where and when (World + Time Machine) ───────────── */

export function ContextSection({ section, videos, showConnections = true }: { section: Section; videos: Video[]; showConnections?: boolean }) {
  const cat = useCatalogue();
  const places = useMemo(() => relatedPlaces(cat, videos, 10), [cat, videos]);
  const eras = useMemo(() => relatedEras(cat, videos), [cat, videos]);
  const ctx = useMemo(() => interestContext(cat, section, 8), [cat, section]);
  const maxPlace = Math.max(1, ...places.map((p) => p.count));
  const eraCounts = new Map(eras.map((e) => [e.period.id, e.count]));
  const maxEra = Math.max(1, ...eras.map((e) => e.count));
  const connections = showConnections ? [...ctx.movements.slice(0, 6), ...ctx.people.slice(0, 3)] : [];

  return (
    <section className="cat-ctx wrap" id="cat-context" aria-labelledby="cat-ctx-title">
      <header className="cat-ctx-head">
        <h2 id="cat-ctx-title" className="cat-h2">
          Where and when
        </h2>
        <p className="cat-ctx-sub">
          Drawn from the {plural(videos.length, 'title')} showing — change a filter above and these follow. Open any of them in World or the Time Machine.
        </p>
      </header>

      <div className="cat-ctx-grid">
        <div className="cat-ctx-block cat-ctx-places">
          <h3 className="cat-h3">
            <Icon name="globe" size={18} /> Places <span className="cat-h3-sub">in World</span>
          </h3>
          {places.length ? (
            <ul className="cat-places">
              {places.map(({ place, count }) => {
                const parent = cat.placeAncestors(place.id)[0];
                return (
                  <li key={place.id}>
                    <Link to={cat.href(place.id)} className="cat-place" data-react="magnet" style={{ '--w': count / maxPlace } as CSSProperties} onClick={() => sound.play('transition')}>
                      <span className="cat-place-orb" aria-hidden="true" />
                      <span className="cat-place-name">{place.name}</span>
                      <span className="cat-place-sub">{parent ? parent.name : place.country}</span>
                      <span className="cat-place-n">{plural(count, 'title')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted cat-ctx-none">None of the titles showing is tied to a place.</p>
          )}
        </div>

        <div className="cat-ctx-block cat-ctx-eras">
          <h3 className="cat-h3">
            <Icon name="time" size={18} /> Eras <span className="cat-h3-sub">in the Time Machine</span>
          </h3>
          {eras.length ? (
            <ol className="cat-eras" aria-label="Decades with titles">
              {cat.periods.map((p) => {
                const n = eraCounts.get(p.id) ?? 0;
                return (
                  <li key={p.id} className={n ? 'is-on' : ''} style={{ '--h': n / maxEra } as CSSProperties} aria-hidden={n ? undefined : true}>
                    {n ? (
                      <Link to={cat.href(p.id)} className="cat-era" onClick={() => sound.play('transition')}>
                        <span className="cat-era-bar" aria-hidden="true" />
                        <span className="cat-era-n" aria-hidden="true">
                          {n}
                        </span>
                        <span className="cat-era-label" aria-hidden="true">
                          {p.label.replace(/^(\d\d)(\d\ds)$/, '’$2')}
                        </span>
                        {/* the spoken name; the short visible marks above are its picture */}
                        <span className="sr-only">
                          {p.label}: {plural(n, 'title')} — open in the Time Machine
                        </span>
                      </Link>
                    ) : (
                      <span className="cat-era is-off">
                        <span className="cat-era-bar" />
                        <span className="cat-era-label">{p.label.replace(/^(\d\d)(\d\ds)$/, '’$2')}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted cat-ctx-none">The titles showing are timeless — studio works not set in a period.</p>
          )}
        </div>
      </div>

      {connections.length ? (
        <div className="cat-ctx-block cat-ctx-conn">
          <h3 className="cat-h3">
            <Icon name="synapse" size={18} /> Connections <span className="cat-h3-sub">movements and people tagged {membershipLabel(cat, section)}</span>
          </h3>
          <ul className="cat-conn">
            {connections.map((e) => (
              <li key={e.id}>
                <Link to={cat.href(e.id)} className="cat-conn-link" onClick={() => sound.play('transition')}>
                  <span className="cat-conn-name">{'name' in e ? e.name : ''}</span>
                  <span className="cat-conn-sub">{'start' in e ? `Movement · ${e.start}–${e.end ?? 'now'}` : `Person · ${e.roles[0] ?? e.kind}`}</span>
                  <Icon name="arrow" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────── The honest empty state ───────────── */

export function EmptyCategory({ section }: { section: Section }) {
  const cat = useCatalogue();
  const ctx = useMemo(() => interestContext(cat, section, 6), [cat, section]);
  const counts = useMemo(() => categoryCounts(cat).filter((c) => c.count > 0 && c.section.id !== section.id), [cat, section]);
  const tag = membershipLabel(cat, section);
  const anyContext = ctx.movements.length + ctx.people.length + ctx.places.length + ctx.programmes.length > 0;

  return (
    <section className="cat-void wrap" id="cat-collection" aria-labelledby="cat-void-title">
      <div className="cat-void-core">
        <div className="cat-void-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
          <b>0</b>
        </div>
        <div className="cat-void-copy">
          <p className="kicker">Nothing published yet</p>
          <h2 id="cat-void-title" className="cat-void-title">
            No {section.label} titles are published yet.
          </h2>
          <p className="cat-void-promise">
            <span className="cat-void-label">What this space is for</span>
            {section.promise}
          </p>
          <div className="cat-void-guarantee">
            <span className="cat-void-pulse" aria-hidden="true" />
            <p>
              This page is built from the catalogue, not from a hand-made list. The moment a title tagged <strong>{tag}</strong> is published, it appears here automatically — with its
              places, eras and connections — and everywhere else it belongs. Until then we show nothing rather than something invented.
            </p>
          </div>
          <div className="cat-void-actions">
            <ButtonLink to="/world" variant="primary" size="lg" icon="globe">
              Explore the World
            </ButtonLink>
            <ButtonLink to="/time-machine" variant="chrome" size="lg" icon="time">
              Open the Time Machine
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="cat-void-related">
        <h3 className="cat-h3">
          <Icon name="synapse" size={18} /> Already in the catalogue
        </h3>
        {anyContext ? (
          <>
            <p className="cat-void-note">No titles yet — but these records carry the {tag} tag, so the context is real.</p>
            <ul className="cat-conn">
              {ctx.movements.map((m) => (
                <li key={m.id}>
                  <Link to={cat.href(m.id)} className="cat-conn-link" onClick={() => sound.play('transition')}>
                    <span className="cat-conn-name">{m.name}</span>
                    <span className="cat-conn-sub">Movement · {m.start}–{m.end ?? 'now'} · Connections</span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
              {ctx.places.map((p) => (
                <li key={p.id}>
                  <Link to={cat.href(p.id)} className="cat-conn-link" onClick={() => sound.play('transition')}>
                    <span className="cat-conn-name">{p.name}</span>
                    <span className="cat-conn-sub">Place · open in World</span>
                    <Icon name="globe" size={16} />
                  </Link>
                </li>
              ))}
              {ctx.people.map((p) => (
                <li key={p.id}>
                  <Link to={cat.href(p.id)} className="cat-conn-link" onClick={() => sound.play('transition')}>
                    <span className="cat-conn-name">{p.name}</span>
                    <span className="cat-conn-sub">Person · Connections</span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
              {ctx.programmes.map((p) => (
                <li key={p.id}>
                  <Link to={cat.href(p.id)} className="cat-conn-link" onClick={() => sound.play('transition')}>
                    <span className="cat-conn-name">{p.title}</span>
                    <span className="cat-conn-sub">Programme · {p.status.replace('-', ' ')}</span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="cat-void-note">
            Nothing in the catalogue carries the {tag} tag yet — no movements, people or places either. We would rather leave this space empty than point you somewhere unrelated.
          </p>
        )}
        {counts.length ? (
          <div className="cat-void-elsewhere">
            <p className="cat-void-label">Categories with titles today</p>
            <ul>
              {counts.map(({ section: s, count }) => (
                <li key={s.id}>
                  <Link to={s.path} className="cat-pill cat-pill-link" viewTransition onClick={() => sound.play('transition')}>
                    <Icon name={s.icon as IconName} size={15} />
                    {s.label}
                    <span className="cat-pill-n">{count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ───────────── Loop pause control for hero art ───────────── */

export function LoopButton({ playing, onToggle, label }: { playing: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className="icon-btn btn-chrome cat-loop"
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      title={playing ? `Pause ${label}` : `Play ${label}`}
      onClick={() => {
        sound.play('tick');
        onToggle();
      }}
    >
      <Icon name={playing ? 'pause' : 'play'} size={18} />
    </button>
  );
}
