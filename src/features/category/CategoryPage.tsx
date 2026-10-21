/**
 * /movies /music /sports /gaming /news /fashion /culture /kids — eight category pages, ONE engine.
 *
 *   section      read from the pathname (SECTIONS, kind "category")
 *   membership   videosForSection: a title is here because its record carries the interest
 *   state        ?facet=&sort=&q=&group= in the URL (shareable, refresh-safe, Back undoes a
 *                filter); typing replaces the URL after a pause, everything else pushes
 *   presentation section.layout picks one of eight families (heroes.tsx + results.tsx)
 *   context      places (World) and eras (Time Machine) follow whatever is showing
 *   honesty      a category with no titles gets a designed empty state, never fake titles
 *
 * Switching category (switcher or navigation) glides the switcher highlight from the last
 * category, cross-fades the page and lets the new collection rise in; keyboard focus stays on
 * the switcher when it was used.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { SECTIONS, type CategoryLayout, type Section } from '../../../shared/sections.ts';
import { useChapters } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import {
  catStateFromParams,
  catStateToSearch,
  categoryStats,
  defaultSort,
  groupModes,
  membershipLabel,
  sectionFacets,
  sortVideos,
  viewCategory,
  type CatSort,
  type CatState,
  type GroupMode,
} from './engine.ts';
import { CinemaScreen, Constellation, HeroFrame, LightBoard, Masthead, PrimaryWatch, Runway, Spectrum, Stadium, ToyBox, Wire } from './heroes.tsx';
import { ContextSection, EmptyCategory, NoMatches, Toolbar } from './parts.tsx';
import { ArcadeResults, ArenaResults, BroadsheetResults, CinemaResults, MosaicResults, PlayroomResults, RunwayResults, SoundstageResults, type ResultsProps } from './results.tsx';
import './category.css';

const TYPE_DELAY = 250;

/** Family voice: the hero's eyebrow, the collection's heading, the noun for a title. */
const FAMILY: Record<CategoryLayout, { kicker: string; collection: string; noun: [string, string]; filled: string; empty: string }> = {
  cinema: { kicker: 'Screening room', collection: 'The bill', noun: ['film', 'films'], filled: '', empty: '' },
  soundstage: {
    kicker: 'Soundstage',
    collection: 'On the soundstage',
    noun: ['title', 'titles'],
    filled: 'One cluster of bars per title — wider runs longer. Hollow clusters are planned, not yet watchable.',
    empty: 'No titles yet — the soundstage is silent.',
  },
  arena: { kicker: 'Arena', collection: 'Fixtures', noun: ['title', 'titles'], filled: 'Every runner on the track is a title in Sports.', empty: 'No titles yet — the track is empty.' },
  arcade: { kicker: 'Arcade', collection: 'Level select', noun: ['title', 'titles'], filled: 'Every lit cell on the board is a title in Gaming.', empty: 'No titles yet — no cell on the board is lit.' },
  broadsheet: { kicker: 'The newsroom', collection: 'This edition', noun: ['report', 'reports'], filled: '', empty: '' },
  runway: { kicker: 'Runway', collection: 'The lookbook', noun: ['title', 'titles'], filled: 'Every light along the runway is a title in Fashion.', empty: 'No titles yet — the runway is dark.' },
  'atlas-of-ideas': {
    kicker: 'Movements and places',
    collection: 'The mosaic',
    noun: ['title', 'titles'],
    filled: 'The places these titles live in, joined by real routes and journeys. Select one to open it in World.',
    empty: 'No titles yet — no places to join.',
  },
  playroom: { kicker: 'Playroom', collection: 'Family-friendly picks', noun: ['title', 'titles'], filled: 'Every shape is a family-friendly title.', empty: 'No titles yet — the toy box is empty.' },
};

const RESULTS: Record<CategoryLayout, (p: ResultsProps) => ReactNode> = {
  cinema: CinemaResults,
  soundstage: SoundstageResults,
  arena: ArenaResults,
  arcade: ArcadeResults,
  broadsheet: BroadsheetResults,
  runway: RunwayResults,
  'atlas-of-ideas': MosaicResults,
  playroom: PlayroomResults,
};

export default function CategoryPage() {
  const { pathname } = useLocation();
  const section = SECTIONS.find((s) => s.kind === 'category' && s.path === `/${pathname.split('/')[1]}`);
  if (!section || !section.layout) {
    return (
      <div className="page wrap">
        <h1 className="page-title">Category</h1>
        <EmptyState icon="info" title="This category does not exist" actions={<ButtonLink to="/">Back to Home</ButtonLink>} />
      </div>
    );
  }
  return <CategoryBody key={section.id} section={section} />;
}

function CategoryBody({ section }: { section: Section }) {
  const cat = useCatalogue();
  const layout = section.layout!;
  const family = FAMILY[layout];
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pageRef = useRef<HTMLDivElement>(null);

  const facets = useMemo(() => sectionFacets(cat, section), [cat, section]);
  const urlState = useMemo(() => catStateFromParams(params, section, facets), [params, section, facets]);
  const urlRef = useRef(urlState);
  urlRef.current = urlState;

  /* ── search typing: live results, URL replaced after a pause ── */
  const [draft, setDraft] = useState(urlState.q);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typing = useRef<number | null>(null);
  useEffect(() => {
    if (typing.current === null) setDraft(urlState.q);
  }, [urlState.q]);
  useEffect(
    () => () => {
      if (typing.current !== null) window.clearTimeout(typing.current);
    },
    [],
  );

  const go = useCallback(
    (next: CatState, replace: boolean) => {
      const search = catStateToSearch(next, section);
      navigate({ search: search ? `?${search}` : '' }, { replace, preventScrollReset: true, state: { keepFocus: true } });
    },
    [navigate, section],
  );
  const write = useCallback(
    (next: CatState, replace: boolean) => {
      if (typing.current !== null) {
        window.clearTimeout(typing.current);
        typing.current = null;
      }
      go(next, replace);
    },
    [go],
  );
  const update = useCallback(
    (fn: (s: CatState) => CatState) => {
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

  const state = useMemo<CatState>(() => ({ ...urlState, q: draft }), [urlState, draft]);
  const deferred = useDeferredValue(state);
  const view = useMemo(() => viewCategory(cat, section, deferred), [cat, section, deferred]);
  const stats = useMemo(() => categoryStats(cat, view.all), [cat, view.all]);
  const modes = groupModes(section);
  const group: GroupMode = urlState.group ?? modes[0] ?? 'all';
  const empty = view.all.length === 0;
  // the hero's one action leads with the same title the collection leads with by default
  const lead = useMemo(() => sortVideos(cat, view.all, defaultSort(section), { section }), [cat, view.all, section]);
  const top = lead.find((v) => cat.isPlayable(v)) ?? lead[0];

  useEffect(() => {
    document.title = `${section.label} · Monumental Streams`;
  }, [section.label]);

  // Arriving from the in-page switcher: keep the keyboard where the viewer was acting.
  useEffect(() => {
    if ((location.state as { catSwitch?: boolean } | null)?.catSwitch) {
      pageRef.current?.querySelector<HTMLElement>('.cat-switch-item[aria-current="page"]')?.focus({ preventScroll: true });
    }
    // only on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useChapters(
    empty
      ? [
          { id: 'cat-top', label: section.label },
          { id: 'cat-collection', label: 'Nothing yet' },
        ]
      : [
          { id: 'cat-top', label: section.label },
          { id: 'cat-collection', label: family.collection },
          { id: 'cat-context', label: 'Where and when' },
        ],
  );

  const heroStats = [
    { n: stats.titles, label: stats.titles === 1 ? family.noun[0] : family.noun[1], tone: 'gold' as const },
    { n: stats.watchNow, label: 'watch now', tone: 'iris' as const },
    { n: stats.places, label: stats.places === 1 ? 'place' : 'places' },
    { n: stats.eras, label: stats.eras === 1 ? 'era' : 'eras', tone: 'frost' as const },
  ];
  const caption = empty ? family.empty : family.filled;

  const hero = (() => {
    const common = { section, kicker: family.kicker, stats: heroStats, className: `is-${layout}` };
    switch (layout) {
      case 'cinema':
        return <HeroFrame {...common} viz={view.all.length ? <CinemaScreen films={view.all} pageRef={pageRef} /> : undefined} />;
      case 'soundstage':
        return (
          <HeroFrame {...common} viz={<Spectrum videos={view.all} pageRef={pageRef} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'arena':
        return (
          <HeroFrame {...common} viz={<Stadium videos={view.all} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'arcade':
        return (
          <HeroFrame {...common} viz={<LightBoard videos={view.all} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'broadsheet':
        return (
          <HeroFrame {...common} before={<Masthead count={view.all.length} />} viz={<Wire videos={view.all} />}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'runway':
        return (
          <HeroFrame {...common} viz={<Runway videos={view.all} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'atlas-of-ideas':
        return (
          <HeroFrame {...common} viz={<Constellation videos={view.all} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
      case 'playroom':
        return (
          <HeroFrame {...common} viz={<ToyBox videos={view.all} />} vizLabel={caption}>
            {top ? <PrimaryWatch video={top} /> : null}
          </HeroFrame>
        );
    }
  })();

  const Results = RESULTS[layout];
  const clearQuery = () => update((s) => ({ ...s, q: '' }));
  const clearFacet = () => update((s) => ({ ...s, facet: null }));

  return (
    <div ref={pageRef} className={`catpage fam-${layout} ${empty ? 'is-empty' : ''}`} data-section={section.id}>
      {hero}
      {empty ? (
        <EmptyCategory section={section} />
      ) : (
        <>
          <section className="cat-collection" id="cat-collection" aria-labelledby="cat-collection-title">
            <div className="wrap">
              <header className="cat-collection-head">
                <h2 id="cat-collection-title" className="cat-h2">
                  {family.collection}
                </h2>
                <p className="cat-collection-sub">
                  Every title tagged {membershipLabel(cat, section)} — {plural(view.all.length, family.noun[0], family.noun[1])} today. New ones join automatically when they are published.
                </p>
              </header>
              <Toolbar
                section={section}
                state={state}
                draft={draft}
                facets={facets}
                view={view}
                groups={modes}
                group={group}
                onType={onType}
                onClearQuery={clearQuery}
                onFacet={(facet) => update((s) => ({ ...s, facet }))}
                onSort={(sort: CatSort) => update((s) => ({ ...s, sort }))}
                onGroup={(g) => update((s) => ({ ...s, group: g }))}
                onClearAll={() => update((s) => ({ ...s, q: '', facet: null, sort: defaultSort(section) }))}
              />
            </div>
            <div className="wrap cat-results" aria-busy={state !== deferred || undefined}>
              {view.results.length ? (
                <Results section={section} videos={view.results} group={group} pageRef={pageRef} />
              ) : (
                <NoMatches section={section} q={deferred.q} facet={view.facet} onClearQuery={clearQuery} onClearFacet={clearFacet} />
              )}
            </div>
          </section>
          <ContextSection section={section} videos={view.results.length ? view.results : view.all} showConnections={layout !== 'soundstage'} />
        </>
      )}
    </div>
  );
}
