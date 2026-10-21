/**
 * SEARCH (/search, also /catalogue) — real search with combined filters, all held in the URL.
 *
 *   URL → state: discoveryFromParams(useSearchParams)     (refresh-safe, shareable, back/forward)
 *   typing      → results update per keystroke; the URL is replaced after ~250 ms
 *   facets      → pushed to history immediately (Back undoes a filter)
 *
 * searchCatalogue runs on every state change (memoised, deferred while typing). Empty results
 * offer the engine's relaxations ("Remove Documentary → 3 stories") instead of a dead end.
 *
 * The world stays a quiet field and answers the question: the stories that match are the lit
 * seeds (highlight = result ids; nothing lit when nothing matches), every card lights its own
 * seed on hover, and hovering a collection lights that collection's stories.
 *
 * The section line (Movies, Music, Sports …) is a lens over the interest filter, so a section
 * is just ?interest=… in the URL; /search?section=music is accepted as an entry point and
 * rewritten to that canonical form.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Section } from '../../../shared/sections.ts';
import type { EntityKind } from '../../../shared/catalogue.ts';
import { applyRelaxation, collectionVideos, searchCatalogue, SORT_KEYS, SORT_LABELS, type Relaxation, type SearchHit } from '../../../shared/search.ts';
import { discoveryFromParams, discoveryToParams, discoveryToSearch } from '../../../shared/url-state.ts';
import type { Collection, DiscoveryState, ID, SortKey } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button } from '../../ui/controls.tsx';
import { Dialog, EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, Row, VideoPod } from '../../ui/Pod.tsx';
import { useHighlightPreview } from '../watch/seed.ts';
import { FacetPanel } from './FacetPanel.tsx';
import { activeFilters, clearFilters, filterCount, isFiltered, removeFilter } from './facets.ts';
import { activeSection, searchSections, sectionCounts, sectionFromParam, withSection } from './sections.ts';
import './catalogue.css';

const PAGE = 24;
const TYPE_DELAY = 250;
/** A highlight no seed carries: "nothing matches" dims the whole field. */
const NOTHING_LIT = ['none:no-match'];

const KIND_LABEL: Partial<Record<EntityKind, string>> = {
  place: 'Place',
  person: 'Person',
  movement: 'Movement',
  programme: 'Programme',
  period: 'Decade',
  theme: 'Theme',
  interest: 'Interest',
};

function useWide(query: string) {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

export default function CataloguePage() {
  const cat = useCatalogue();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  /** Canonical, readable query string (commas unescaped) built by discoveryToParams. */
  const go = useCallback(
    (next: DiscoveryState, replace: boolean) => {
      const search = discoveryToSearch(next, cat);
      navigate({ search: search ? `?${search}` : '' }, { replace, preventScrollReset: true });
    },
    [cat, navigate],
  );
  const urlState = useMemo(() => discoveryFromParams(params, cat), [params, cat]);
  const urlRef = useRef(urlState);
  urlRef.current = urlState;

  // /search?section=music → the canonical ?interest=music (replace: no extra history entry)
  const sectionParam = params.get('section');
  useEffect(() => {
    if (sectionParam === null) return;
    const s = sectionFromParam(sectionParam);
    go(s ? withSection(urlRef.current, s) : urlRef.current, true);
  }, [sectionParam, go]);

  const [draft, setDraft] = useState(urlState.q);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typing = useRef<number | null>(null);

  // The URL changed from outside (top-bar search, back/forward, a link): adopt its query
  // unless the viewer is mid-word in this field.
  useEffect(() => {
    if (typing.current === null) setDraft(urlState.q);
  }, [urlState.q]);
  useEffect(
    () => () => {
      if (typing.current !== null) window.clearTimeout(typing.current);
    },
    [],
  );

  const state = useMemo<DiscoveryState>(() => ({ ...urlState, q: draft }), [urlState, draft]);
  const deferred = useDeferredValue(state);
  const result = useMemo(() => searchCatalogue(cat, deferred), [cat, deferred]);
  const browse = !isFiltered(deferred);
  const active = activeFilters(cat, state);
  const nFilters = filterCount(state);

  /* The world: a quiet field; the matching stories are the lit seeds. */
  const lit = useMemo<ID[] | null>(() => (browse ? null : result.total ? result.results.map((h) => h.video.id) : NOTHING_LIT), [browse, result]);
  useArrangement({ kind: 'quiet' }, lit);

  const write = useCallback(
    (next: DiscoveryState, replace: boolean) => {
      if (typing.current !== null) {
        window.clearTimeout(typing.current);
        typing.current = null;
      }
      go(next, replace);
    },
    [go],
  );

  /** Facet / chip / sort changes: applied to the live state (including an unsent query) and pushed. */
  const update = useCallback(
    (fn: (s: DiscoveryState) => DiscoveryState) => {
      const next = fn({ ...urlRef.current, q: draftRef.current });
      setDraft(next.q);
      write(next, false);
    },
    [write],
  );
  const onType = (q: string) => {
    setDraft(q);
    if (typing.current !== null) window.clearTimeout(typing.current);
    typing.current = window.setTimeout(() => {
      typing.current = null;
      go({ ...urlRef.current, q }, true);
    }, TYPE_DELAY);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    sound.play('transition');
    write({ ...urlRef.current, q: draft }, true);
  };

  useEffect(() => {
    const q = state.q.trim();
    document.title = `${q ? `“${q}” · ` : ''}Search · Monumental Streams`;
  }, [state.q]);

  // Paging resets whenever the question changes.
  const signature = discoveryToParams(deferred, cat).toString();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [signature]);

  // Polite, settled announcement of the result count (not on every keystroke).
  const summary = `${plural(result.total, 'story', 'stories')}${deferred.q.trim() ? ` for “${deferred.q.trim()}”` : ''}${nFilters ? ` with ${plural(nFilters, 'filter')}` : ''}`;
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounced(summary), 700);
    return () => window.clearTimeout(t);
  }, [summary]);

  const wide = useWide('(min-width: 1100px)');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  useEffect(() => {
    if (wide) setFiltersOpen(false);
  }, [wide]);

  const relax = (r: Relaxation) => {
    sound.play('select');
    update((s) => applyRelaxation(s, r));
  };
  const clearAll = () => update((s) => clearFilters(s));

  const panel = <FacetPanel cat={cat} state={state} facets={result.facets} onChange={update} idPrefix={wide ? 'side' : 'dlg'} />;

  // Section line: counts with every constraint except interests; the lit section matches exactly.
  const sections = useMemo(() => searchSections(), []);
  const section = activeSection(state.interests, sections);
  const withoutInterests = useMemo(() => searchCatalogue(cat, { ...deferred, interests: [] }), [cat, deferred]);
  const counts = useMemo(() => sectionCounts(withoutInterests.results.map((h) => h.video), sections), [withoutInterests, sections]);
  // a lit section scrolled out of the (phone-width) line is brought into view
  const railRef = useRef<HTMLUListElement>(null);
  const sectionId = section?.id ?? null;
  useEffect(() => {
    const list = railRef.current;
    const on = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !on || list.scrollWidth <= list.clientWidth) return;
    const li = on.parentElement as HTMLElement;
    const left = li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }, [sectionId]);

  const chooseSection = (s: Section | null) => {
    sound.play(s ? 'select' : 'unsave');
    update((st) => withSection(st, s && activeSection(st.interests, sections)?.id === s.id ? null : s));
  };

  return (
    <div className="page srch">
      <header className="wrap srch-head">
        <h1 className="srch-title">Search</h1>
        <form className="srch-field" role="search" aria-label="Search the catalogue" onSubmit={submit}>
          <label htmlFor="cat-q" className="sr-only">
            Search stories, people, places and eras
          </label>
          <Icon name="search" size={24} />
          <input
            id="cat-q"
            className="srch-input"
            type="search"
            value={draft}
            onChange={(e) => onType(e.target.value)}
            placeholder="Stories, people, places, eras…"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            data-cursor="text"
          />
          {draft ? (
            <button type="button" className="srch-clear" aria-label="Clear the search" onClick={() => update((s) => ({ ...s, q: '' }))}>
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </form>
        <p className="srch-lede">Filters combine, and the link keeps them. The stories that match light up in the world.</p>
        <div className="srch-sections" role="group" aria-label="Sections">
          <ul ref={railRef} className="srch-sections-list">
            <li>
              <button type="button" className="srch-section" aria-pressed={state.interests.length === 0} onClick={() => chooseSection(null)}>
                <span className="srch-section-name">Everything</span>
                <span className="srch-section-count">{withoutInterests.total}</span>
              </button>
            </li>
            {sections.map((s) => {
              const n = counts[s.id] ?? 0;
              const on = section?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="srch-section"
                    data-hue={s.id}
                    aria-pressed={on}
                    disabled={!on && n === 0}
                    title={!on && n === 0 ? `No ${s.label.toLowerCase()} stories match yet` : undefined}
                    onClick={() => chooseSection(s)}
                  >
                    <span className="srch-section-dot" aria-hidden="true" />
                    <span className="srch-section-name">{s.label}</span>
                    <span className="srch-section-count">
                      {n}
                      <span className="sr-only"> {n === 1 ? 'story' : 'stories'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {section ? (
            <p className="srch-section-note">
              <span>
                Searching <b>{section.label}</b> — {section.tagline}
              </span>
              <Link to={section.path} className="srch-section-go" onClick={() => sound.play('transition')}>
                Open {section.label}
                <Icon name="arrow" size={16} />
              </Link>
            </p>
          ) : state.interests.length ? (
            <p className="srch-section-note">
              <span>Searching a custom mix of interests — see Filters.</span>
            </p>
          ) : null}
        </div>
      </header>

      <div className={`wrap srch-layout ${wide ? 'srch-layout-wide' : ''}`}>
        {wide ? (
          <aside className="srch-side" aria-labelledby="cat-filters-title">
            <div className="srch-side-head">
              <h2 id="cat-filters-title" className="srch-side-title">
                Filters
              </h2>
              {nFilters ? (
                <button type="button" className="srch-text-btn" onClick={clearAll}>
                  Clear filters
                </button>
              ) : null}
            </div>
            {panel}
          </aside>
        ) : null}

        <section className="srch-results" aria-labelledby="cat-results-title">
          <div className="srch-toolbar">
            <div className="srch-toolbar-count">
              <h2 id="cat-results-title" className="srch-results-title">
                {browse ? 'All stories' : 'Results'}
              </h2>
              {/* .cat-count: a stable hook the phone journeys (journeys-mobile.spec.ts) read */}
              <p className="srch-count cat-count" aria-hidden="true">
                <b>{result.total}</b> {result.total === 1 ? 'story' : 'stories'}
              </p>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {announced}
              </p>
            </div>
            <div className="srch-toolbar-tools">
              {!wide ? (
                <Button variant="ghost" icon="filter" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
                  Filters{nFilters ? ` · ${nFilters}` : ''}
                </Button>
              ) : null}
              <div className="srch-sort">
                <label htmlFor="cat-sort" className="srch-sort-label">
                  Sort
                </label>
                <select id="cat-sort" className="input srch-select" value={state.sort} onChange={(e) => update((s) => ({ ...s, sort: e.target.value as SortKey }))}>
                  {SORT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {active.length ? (
            <div className="srch-active" role="group" aria-label="Active filters">
              <ul>
                {active.map((f) => (
                  <li key={`${f.key}:${f.value ?? ''}`}>
                    <button
                      type="button"
                      className={`srch-active-chip srch-tone-${f.tone}`}
                      aria-label={f.removeLabel}
                      onClick={() => {
                        sound.play('unsave');
                        update((s) => removeFilter(s, f));
                      }}
                    >
                      <span>{f.label}</span>
                      <Icon name="close" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="srch-text-btn" onClick={clearAll}>
                Clear all
              </button>
            </div>
          ) : null}

          {result.entities.length ? <Entities entities={result.entities} /> : null}

          {browse ? <QuickStart /> : null}

          {result.total ? (
            <>
              <ul className="grid-pods srch-grid">
                {result.results.slice(0, limit).map((hit, i) => (
                  <li key={hit.video.id}>
                    <VideoPod video={hit.video} priority={i < 3} footer={deferred.q.trim() && hit.matched.length ? <Matched hit={hit} /> : undefined} />
                  </li>
                ))}
              </ul>
              {result.total > limit ? (
                <div className="srch-more">
                  <Button variant="ghost" icon="down" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, result.total - limit)} more of {result.total - limit}
                  </Button>
                </div>
              ) : null}
              {result.relaxations.length ? (
                <div className="srch-widen">
                  <p className="srch-widen-title">Only a few matches. Widen the search:</p>
                  <ul>
                    {result.relaxations.slice(0, 4).map((r) => (
                      <li key={`${r.key}:${r.value ?? ''}`}>
                        <button type="button" className="srch-relax" onClick={() => relax(r)}>
                          {r.label} <span aria-hidden="true">→</span> <b>{plural(r.count, 'story', 'stories')}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : browse ? (
            <EmptyState icon="time" tone="plasma" title="The catalogue is being stocked">
              <p>No stories are in the catalogue right now. Films are added as they are cleared.</p>
            </EmptyState>
          ) : (
            <EmptyState
              icon="search"
              title="Nothing matches all of that"
              actions={
                <>
                  {result.relaxations.slice(0, 4).map((r) => (
                    <button key={`${r.key}:${r.value ?? ''}`} type="button" className="btn btn-ghost btn-md srch-relax-btn" onClick={() => relax(r)}>
                      <span>
                        {r.label} → {plural(r.count, 'story', 'stories')}
                      </span>
                    </button>
                  ))}
                  <Button variant="quiet" icon="replay" onClick={clearAll}>
                    Reset everything
                  </Button>
                </>
              }
            >
              <p>
                {result.relaxations.length
                  ? 'Every filter here narrows the results, and together they leave nothing. Loosen one:'
                  : 'No story matches this search. Try fewer or different words, or reset the filters.'}
              </p>
            </EmptyState>
          )}
        </section>
      </div>

      {!wide ? (
        <Dialog open={filtersOpen} onClose={closeFilters} title="Filters" wide labelledBy="cat-filters-dialog-title">
          <div className="srch-dialog-body">{panel}</div>
          <div className="srch-dialog-foot">
            <Button variant="quiet" onClick={clearAll} disabled={!nFilters}>
              Clear all
            </Button>
            <Button variant="primary" onClick={closeFilters}>
              Show {plural(result.total, 'story', 'stories')}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function Matched({ hit }: { hit: SearchHit }) {
  return (
    <p className="srch-matched">
      <span className="srch-matched-k">Matched</span> {hit.matched.slice(0, 3).join(' · ')}
    </p>
  );
}

function Entities({ entities }: { entities: { id: string; kind: EntityKind; label: string }[] }) {
  const cat = useCatalogue();
  return (
    <nav className="srch-entities" aria-labelledby="cat-entities-title">
      <h3 id="cat-entities-title" className="srch-block-title">
        Places, people and eras
      </h3>
      <ul>
        {entities.map((e) => (
          <li key={e.id}>
            <Link to={cat.href(e.id)} className="srch-entity" data-kind={e.kind} onClick={() => sound.play('transition')}>
              <span className="srch-entity-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <span className="srch-entity-label">{e.label}</span>
              <Icon name="arrow" size={15} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function QuickStart() {
  const cat = useCatalogue();
  const items = useMemo(() => cat.collections.map((c) => ({ c, ids: collectionVideos(cat, c).map((v) => v.id) })), [cat]);
  if (!items.length) return null;
  return (
    <nav className="srch-quick" aria-labelledby="cat-quick-title">
      <h3 id="cat-quick-title" className="srch-block-title">
        Start with a collection
      </h3>
      <Row label="Collections">
        {items.map(({ c, ids }) => (
          <QuickLink key={c.id} collection={c} ids={ids} />
        ))}
      </Row>
    </nav>
  );
}

/** A collection; while hovered or focused its stories are the ones lit in the world. */
function QuickLink({ collection: c, ids }: { collection: Collection; ids: ID[] }) {
  const cat = useCatalogue();
  const preview = useHighlightPreview(() => ids);
  return (
    <Link to={cat.href(c.id)} className="srch-quick-link" draggable={false} data-cursor="view" data-cursor-label="Open" onClick={() => sound.play('transition')} {...preview.handlers}>
      <span className="srch-quick-art">
        <Art art={c.art} alt="" />
      </span>
      <span className="srch-quick-body">
        <span className="srch-quick-title">{c.title}</span>
        <span className="srch-quick-count">{ids.length ? plural(ids.length, 'story', 'stories') : 'No stories yet'}</span>
      </span>
    </Link>
  );
}
