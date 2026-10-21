/**
 * Shared building blocks of the category pages — the editorial layer over the category's
 * chamber in the living world (the organ IS the hero; nothing here paints its own scene):
 *
 *   Switcher        the eight categories (exact labels), a gliding underline; switching
 *                   re-forms the chamber and the seeds migrate to the new organ
 *   LeadStory       the leading story with its immediate action; it lights its seed
 *   Toolbar         search-within · facets · sort · grouping, quiet and in sentence case
 *   ContextSection  places (World) and eras (Time Machine) from what is showing; hovering one
 *                   lights the matching seeds in the chamber
 *   EmptyStatement  the honest empty state (no invented titles), plus its real context
 *
 * World linking (both directions) lives in world.ts.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Section, SectionId } from '../../../shared/sections.ts';
import type { ID, Video } from '../../../shared/types.ts';
import { FOOTAGE_LABEL, PROVENANCE_LABEL, dateLabel, plural, runtimeLabel, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, useAccessState } from '../../ui/Pod.tsx';
import { announceSave } from '../../ui/save.ts';
import {
  CAT_SORTS,
  CAT_SORT_LABEL,
  GROUP_LABEL,
  categoryCounts,
  decadeOf,
  eraEnd,
  eraStart,
  interestContext,
  isFilteredState,
  membershipLabel,
  relatedEras,
  relatedPlaces,
  sourceOf,
  type CatSort,
  type CatState,
  type CategoryView,
  type Facet,
  type GroupMode,
} from './engine.ts';
import { endSeedPreview, previewSeeds, seedPointer, useWorldLit } from './world.ts';

/* ───────────── Saving (the seed flies into My World) ───────────── */

export function SaveAction({ video, className = '' }: { video: Video; className?: string }) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const now = libraryActions.toggleSave(video.id);
    announceSave({ saved: now, title: video.title, from: e.currentTarget, id: video.id, undo: () => libraryActions.toggleSave(video.id) });
  };
  return (
    <button
      type="button"
      className={`btn btn-quiet btn-lg cat-save ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${video.title} from saved` : `Save ${video.title}`}
      data-cursor="save"
      data-cursor-label={saved ? 'Saved' : 'Save to My World'}
      onClick={toggle}
    >
      <Icon name={saved ? 'saved' : 'save'} size={20} />
      <span aria-hidden="true">{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}

/* ───────────── News voice: dates and sources first ───────────── */

export function Dateline({ v }: { v: Video }) {
  const cat = useCatalogue();
  const place = v.places[0] ? cat.label(v.places[0]) : null;
  return (
    <p className="dateline">
      {v.made ? (
        <span>
          <b>Filmed</b> {v.made}
        </span>
      ) : null}
      <span>
        <b>Set</b> {settingLabel(v)}
      </span>
      {place ? <span>{place}</span> : null}
      <span>
        <b>Added</b> <time dateTime={v.published}>{dateLabel(v.published)}</time>
      </span>
    </p>
  );
}

export function Source({ v }: { v: Video }) {
  return (
    <p className="src">
      <span className="src-k">Source</span> <span className="src-v">{sourceOf(v, PROVENANCE_LABEL[v.provenance])}</span>
      {v.credits?.licence ? <span className="src-l"> · {v.credits.licence}</span> : null}
    </p>
  );
}

/* ───────────── The leading story ───────────── */

/**
 * The story the collection leads with, and its one gold action. Watch when it plays for this
 * viewer; Open (its page) when it is locked or not yet out. Engaging it lights its seed.
 */
export function LeadStory({ video, label, news }: { video: Video; label: string; news?: boolean }) {
  const cat = useCatalogue();
  const access = useAccessState(video);
  const lit = useWorldLit(video.id);
  const playable = cat.isPlayable(video);
  const href = cat.href(video.id);
  const runtime = cat.runtime(video);
  const canWatch = playable && !access.locked;
  const footage = video.footage[0] ? FOOTAGE_LABEL[video.footage[0]] : null;
  return (
    <article className="cat-lead" data-world-lit={lit || undefined} data-vid={video.id} aria-labelledby="cat-lead-title" {...seedPointer(video.id)}>
      <p className="cat-lead-label">{label}</p>
      <Link to={href} className="cat-lead-art" tabIndex={-1} aria-hidden="true" data-cursor={canWatch ? 'play' : 'open'} data-cursor-label={canWatch ? 'Watch' : 'Details'} onClick={() => sound.play('transition')}>
        <Art art={video.art} alt="" eager />
        {runtime ? <span className="cat-lead-runtime timecode">{runtimeLabel(runtime)}</span> : null}
      </Link>
      <div className="cat-lead-head">
        <h2 id="cat-lead-title" className="title-story cat-lead-title">
          <Link to={href} onClick={() => sound.play('transition')}>
            {video.title}
          </Link>
        </h2>
        {news ? (
          <Dateline v={video} />
        ) : (
          <p className="cat-lead-meta">
            {access.key !== 'free' ? <span className={`cat-mark is-${access.key}`}>{access.label}</span> : null}
            <span>{video.made ? `Made ${video.made}` : settingLabel(video)}</span>
            {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
            {footage ? <span>{footage}</span> : null}
          </p>
        )}
      </div>
      <p className="cat-lead-summary">{video.summary}</p>
      {news ? <Source v={video} /> : null}
      <div className="cat-lead-actions">
        <ButtonLink to={href} variant="primary" size="lg" icon={canWatch ? 'play' : 'arrow'} data-cursor={canWatch ? 'play' : 'open'}>
          {canWatch ? 'Watch' : 'Open'} {video.title}
        </ButtonLink>
        <SaveAction video={video} />
      </div>
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
        it.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], {
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
    list.scrollLeft = Math.max(0, li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2);
    const place = (el: HTMLElement) => {
      const label = (el.querySelector<HTMLElement>('.cat-switch-label') ?? el).getBoundingClientRect();
      const box = list.getBoundingClientRect();
      glide.style.setProperty('--gx', `${label.left - box.left + list.scrollLeft}px`);
      glide.style.setProperty('--gw', `${label.width}px`);
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
        {counts.map(({ section: s, count }) => (
          <li key={s.id}>
            <Link
              to={s.path}
              data-cat={s.id}
              data-hue={s.id}
              className="cat-switch-item"
              aria-current={s.id === current.id ? 'page' : undefined}
              data-empty={count === 0 || undefined}
              viewTransition
              state={{ keepFocus: true, catSwitch: true }}
              onClick={() => sound.play('transition')}
              data-cursor-label={s.label}
            >
              <span className="cat-switch-label">{s.label}</span>{' '}
              <span className="cat-switch-count">
                {count}
                <span className="sr-only"> {count === 1 ? 'title' : 'titles'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ───────────── Toolbar: search · facets · sort · grouping ───────────── */

/** "Group by" as quiet type: a radio group (arrow keys move and choose), the choice underlined. */
function GroupBy({ value, options, onChange }: { value: GroupMode; options: GroupMode[]; onChange: (g: GroupMode) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const choose = (g: GroupMode, focus = false) => {
    sound.play('tick');
    onChange(g);
    if (focus) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.indexOf(value);
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    choose(options[(n + options.length) % options.length], true);
  };
  return (
    <div ref={ref} className="cat-group" role="radiogroup" aria-label="Group by" onKeyDown={onKey}>
      <span className="cat-group-k" aria-hidden="true">
        Group
      </span>
      {options.map((g) => (
        <button key={g} type="button" role="radio" className="cat-facet" aria-checked={g === value} tabIndex={g === value ? 0 : -1} onClick={() => choose(g)}>
          {GROUP_LABEL[g]}
        </button>
      ))}
    </div>
  );
}

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
  const filtered = isFilteredState(state, section);
  const sortLabel = state.sort === 'featured' && q ? 'Best match' : CAT_SORT_LABEL[state.sort];
  const parts = [view.facet ? `in ${view.facet.label}` : null, q ? `matching “${q}”` : null].filter(Boolean);
  const summary = `Showing ${shown} of ${plural(total, 'title')}${parts.length ? ` ${parts.join(', ')}` : ''}, ${sortLabel.toLowerCase()}`;

  // Polite, settled announcement of what changed (not every keystroke).
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounced(summary), 600);
    return () => window.clearTimeout(t);
  }, [summary]);

  const choose = (key: string | null) => {
    sound.play(key === state.facet ? 'unsave' : 'select');
    onFacet(key);
  };

  return (
    <div className="cat-tools" role="search" aria-label={`Filter ${section.label}`}>
      <label className="cat-find" htmlFor={`${id}-q`}>
        <Icon name="search" size={18} />
        <input
          id={`${id}-q`}
          type="search"
          className="cat-find-input"
          aria-label={`Search within ${section.label}`}
          placeholder={`Search ${section.label.toLowerCase()}`}
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
          <button type="button" className="cat-facet" aria-pressed={!state.facet} onClick={() => choose(null)}>
            <span>All</span> <span className="cat-facet-n">{view.searched}</span>
          </button>
          {facets.map((f) => {
            const n = view.facetCounts[f.key] ?? 0;
            const on = state.facet === f.key;
            return (
              <button key={f.key} type="button" className="cat-facet" aria-pressed={on} disabled={!on && n === 0} onClick={() => choose(on ? null : f.key)}>
                <span>{f.label}</span> <span className="cat-facet-n">{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="cat-tools-end">
        {groups.length ? <GroupBy value={group ?? groups[0]} options={groups} onChange={onGroup} /> : null}
        <label className="cat-sort">
          <span className="cat-sort-k" aria-hidden="true">
            Sort
          </span>
          <select value={state.sort} aria-label={`Sort ${section.label}`} onChange={(e) => onSort(e.target.value as CatSort)}>
            {CAT_SORTS.map((s) => (
              <option key={s} value={s}>
                {s === 'featured' && q ? 'Best match' : CAT_SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <Icon name="down" size={14} />
        </label>
      </div>

      <div className="cat-tools-status">
        <p className="cat-showing">
          <span className="cat-showing-n">{shown}</span> of {plural(total, 'title')}
          {parts.length ? <span className="cat-showing-what"> {parts.join(', ')}</span> : null}
          <span className="cat-showing-sort"> · {sortLabel}</span>
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
      <h3 className="cat-nomatch-title">
        No {section.label} titles match{query ? ` “${query}”` : ''}
        {facet ? ` in ${facet.label}` : ''}.
      </h3>
      <p className="cat-nomatch-sub">Loosen the question, or look across the whole catalogue.</p>
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

const shortDecade = (label: string) => label.replace(/^(\d\d)(\d\ds)$/, '’$2');

export function ContextSection({ section, videos, showConnections = true }: { section: Section; videos: Video[]; showConnections?: boolean }) {
  const cat = useCatalogue();
  const places = useMemo(() => relatedPlaces(cat, videos, 10), [cat, videos]);
  const eras = useMemo(() => relatedEras(cat, videos), [cat, videos]);
  const ctx = useMemo(() => interestContext(cat, section, 8), [cat, section]);
  const eraCounts = new Map(eras.map((e) => [e.period.id, e.count]));
  const maxEra = Math.max(1, ...eras.map((e) => e.count));
  const connections = showConnections ? [...ctx.movements.slice(0, 5), ...ctx.people.slice(0, 3)] : [];
  useEffect(() => () => endSeedPreview(), []);

  /** Seeds (among what is showing) set in a place, or in a decade. */
  const inPlace = (id: ID) => {
    const scope = cat.placeScope(id);
    return videos.filter((v) => v.places.some((p) => scope.has(p))).map((v) => v.id);
  };
  const inDecade = (start: number) =>
    videos
      .filter((v) => {
        const a = eraStart(v);
        const b = eraEnd(v);
        return a !== null && b !== null && decadeOf(a) <= start && decadeOf(b) >= start;
      })
      .map((v) => v.id);
  const lights = (ids: () => ID[]) => ({
    onPointerEnter: () => previewSeeds(ids()),
    onPointerLeave: endSeedPreview,
    onFocus: () => previewSeeds(ids()),
    onBlur: endSeedPreview,
  });

  return (
    <section className="cat-ctx" id="cat-context" aria-labelledby="cat-ctx-title">
      <div className="wrap">
        <header className="cat-ctx-head">
          <h2 id="cat-ctx-title" className="cat-h2">
            Where and when
          </h2>
          <p className="cat-sub">Follows the {plural(videos.length, 'title')} showing. Point at a place or an era to find its stories in the chamber.</p>
        </header>

        <div className="cat-ctx-grid">
          <div className="cat-ctx-col">
            <h3 className="cat-h3">
              Places <span className="cat-h3-sub">open in World</span>
            </h3>
            {places.length ? (
              <ul className="cat-places">
                {places.map(({ place, count }) => {
                  const parent = cat.placeAncestors(place.id)[0];
                  return (
                    <li key={place.id}>
                      <Link to={cat.href(place.id)} className="cat-place" onClick={() => sound.play('transition')} {...lights(() => inPlace(place.id))}>
                        <span className="cat-place-name">{place.name}</span>
                        <span className="cat-place-sub">{parent ? parent.name : place.country}</span>
                        <span className="cat-place-n">{plural(count, 'title')}</span>
                        <Icon name="globe" size={16} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cat-none">None of the titles showing is tied to a place.</p>
            )}
          </div>

          <div className="cat-ctx-col">
            <h3 className="cat-h3">
              Eras <span className="cat-h3-sub">open in the Time Machine</span>
            </h3>
            {eras.length ? (
              <ol className="cat-eras" aria-label="Decades with titles">
                {cat.periods.map((p) => {
                  const n = eraCounts.get(p.id) ?? 0;
                  return (
                    <li key={p.id} className={n ? 'is-on' : ''} style={{ '--h': n / maxEra } as CSSProperties} aria-hidden={n ? undefined : true}>
                      {n ? (
                        <Link to={cat.href(p.id)} className="cat-era" onClick={() => sound.play('transition')} {...lights(() => inDecade(p.start))}>
                          <span className="cat-era-bar" aria-hidden="true" />
                          <span className="cat-era-label" aria-hidden="true">
                            {shortDecade(p.label)}
                          </span>
                          <span className="cat-era-n" aria-hidden="true">
                            {n}
                          </span>
                          {/* the spoken name; the short visible marks above are its picture */}
                          <span className="sr-only">
                            {p.label}: {plural(n, 'title')} — open in the Time Machine
                          </span>
                        </Link>
                      ) : (
                        <span className="cat-era is-off">
                          <span className="cat-era-bar" />
                          <span className="cat-era-label">{shortDecade(p.label)}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="cat-none">The titles showing are timeless — studio works not set in a period.</p>
            )}
          </div>

          {connections.length ? (
            <div className="cat-ctx-col">
              <h3 className="cat-h3">
                Connections <span className="cat-h3-sub">tagged {membershipLabel(cat, section)}</span>
              </h3>
              <ul className="cat-links">
                {connections.map((e) => (
                  <li key={e.id}>
                    <Link to={cat.href(e.id)} className="cat-link" onClick={() => sound.play('transition')}>
                      <span className="cat-link-name">{'name' in e ? e.name : ''}</span>
                      <span className="cat-link-sub">{'start' in e ? `Movement · ${e.start}–${e.end ?? 'now'}` : `Person · ${e.roles[0] ?? e.kind}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ───────────── The honest empty state ───────────── */

/** Shown where the leading story would be: what this space is for, and the promise. */
export function EmptyStatement({ section }: { section: Section }) {
  const cat = useCatalogue();
  const tag = membershipLabel(cat, section);
  return (
    <section className="cat-void" id="cat-collection" aria-labelledby="cat-void-title">
      <p className="cat-lead-label">Nothing published yet</p>
      <h2 id="cat-void-title" className="title-story cat-void-title">
        No {section.label} titles are published yet.
      </h2>
      <p className="cat-void-promise">
        <span className="cat-void-label">What this space is for</span> {section.promise}
      </p>
      <p className="cat-void-note">
        This page is built from the catalogue, not a hand-made list. The moment a title tagged {tag} is published it appears here automatically — and the{' '}
        {section.label.toLowerCase()} chamber fills with its seed. Until then we show nothing rather than something invented.
      </p>
      <div className="cat-lead-actions">
        <ButtonLink to="/world" variant="primary" size="lg" icon="globe">
          Explore the World
        </ButtonLink>
        <ButtonLink to="/time-machine" variant="quiet" size="lg" icon="time">
          Open the Time Machine
        </ButtonLink>
      </div>
    </section>
  );
}

/** Real records that already carry the category's interest, and the categories that have titles. */
export function EmptyContext({ section }: { section: Section }) {
  const cat = useCatalogue();
  const ctx = useMemo(() => interestContext(cat, section, 6), [cat, section]);
  const counts = useMemo(() => categoryCounts(cat).filter((c) => c.count > 0 && c.section.id !== section.id), [cat, section]);
  const tag = membershipLabel(cat, section);
  const links: { id: ID; name: string; sub: string; icon?: 'globe' }[] = [
    ...ctx.movements.map((m) => ({ id: m.id, name: m.name, sub: `Movement · ${m.start}–${m.end ?? 'now'}` })),
    ...ctx.places.map((p) => ({ id: p.id, name: p.name, sub: 'Place · open in World', icon: 'globe' as const })),
    ...ctx.people.map((p) => ({ id: p.id, name: p.name, sub: 'Person · Connections' })),
    ...ctx.programmes.map((p) => ({ id: p.id, name: p.title, sub: `Programme · ${p.status.replace('-', ' ')}` })),
  ];
  return (
    <section className="cat-ctx" id="cat-context" aria-labelledby="cat-void-ctx">
      <div className="wrap">
        <header className="cat-ctx-head">
          <h2 id="cat-void-ctx" className="cat-h2">
            Already in the catalogue
          </h2>
          <p className="cat-sub">
            {links.length
              ? `No titles yet, but these records carry the ${tag} tag, so the context is real.`
              : `Nothing in the catalogue carries the ${tag} tag yet. We would rather leave this space empty than point you somewhere unrelated.`}
          </p>
        </header>
        <div className="cat-ctx-grid">
          {links.length ? (
            <div className="cat-ctx-col is-wide">
              <ul className="cat-links">
                {links.map((l) => (
                  <li key={l.id}>
                    <Link to={cat.href(l.id)} className="cat-link" onClick={() => sound.play('transition')}>
                      <span className="cat-link-name">{l.name}</span>
                      <span className="cat-link-sub">{l.sub}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {counts.length ? (
            <div className="cat-ctx-col">
              <h3 className="cat-h3">Categories with titles today</h3>
              <ul className="cat-links">
                {counts.map(({ section: s, count }) => (
                  <li key={s.id}>
                    <Link to={s.path} className="cat-link" data-hue={s.id} viewTransition onClick={() => sound.play('transition')}>
                      <span className="cat-link-name">{s.label}</span>
                      <span className="cat-link-sub">{plural(count, 'title')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Group heading inside a family (artist, scene, place, era): links where the subject lives. */
export function GroupHead({ label, href, note, count, icon }: { label: string; href?: string; note?: string; count: number; icon?: 'globe' | 'time' | 'synapse' | 'user' }) {
  return (
    <header className="grp-head">
      <h3 className="grp-title">
        {href ? (
          <Link to={href} onClick={() => sound.play('transition')}>
            {label}
            {icon ? <Icon name={icon} size={18} /> : <Icon name="arrow" size={16} />}
          </Link>
        ) : (
          label
        )}
      </h3>
      <p className="grp-note">
        {note ? <span>{note}</span> : null}
        <span>{plural(count, 'title')}</span>
      </p>
    </header>
  );
}

