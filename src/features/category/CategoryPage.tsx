/**
 * /movies /music /sports /gaming /news /fashion /culture /kids — eight category pages, ONE engine,
 * written as an editorial layer over the category's CHAMBER in the living world: the section's
 * organ fills the scene and draws its stories in as seeds. The organ is the hero; the page
 * paints no scene of its own.
 *
 *   section      read from the pathname (SECTIONS, kind "category")
 *   world        useArrangement({ kind: 'category', section }); the seeds the page is showing
 *                are highlighted (facet / search results), everything else dims
 *   membership   videosForSection: a title is here because its record carries the interest
 *   state        ?facet=&sort=&q=&group= in the URL (shareable, refresh-safe, Back undoes a
 *                filter); typing replaces the URL after a pause, everything else pushes
 *   composition  monumental title → the leading story and its action → the collection with
 *                quiet controls → where and when (World, Time Machine)
 *   presentation section.layout picks one of eight families (results.tsx), told through
 *                composition and type
 *   honesty      a category with no titles gets a designed empty state, never fake titles
 *
 * Switching category (switcher or navigation) re-forms the chamber: the seeds migrate to the
 * new organ; keyboard focus stays on the switcher when it was used.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { SECTIONS, type CategoryLayout, type Section } from '../../../shared/sections.ts';
import type { ID } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { setHighlight, useArrangement } from '../../stage/store.ts';
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
import { ContextSection, EmptyContext, EmptyStatement, LeadStory, NoMatches, Switcher, Toolbar } from './parts.tsx';
import { useWorldEcho } from './world.ts';
import { ArcadeResults, ArenaResults, BroadsheetResults, CinemaResults, MosaicResults, PlayroomResults, RunwayResults, SoundstageResults, type ResultsProps } from './results.tsx';
import './category.css';

const TYPE_DELAY = 250;

/** Family voice: the eyebrow, the lead's label, the collection's heading, the noun for a title. */
const FAMILY: Record<CategoryLayout, { kicker: string; lead: string; collection: string; noun: [string, string] }> = {
  cinema: { kicker: 'Screening room', lead: 'Top of the bill', collection: 'The bill', noun: ['film', 'films'] },
  soundstage: { kicker: 'Soundstage', lead: 'Lead track', collection: 'On the soundstage', noun: ['title', 'titles'] },
  arena: { kicker: 'Arena', lead: 'Main event', collection: 'Fixtures', noun: ['title', 'titles'] },
  arcade: { kicker: 'Arcade', lead: 'Level one', collection: 'Level select', noun: ['title', 'titles'] },
  broadsheet: { kicker: 'The newsroom', lead: 'Lead report', collection: 'This edition', noun: ['report', 'reports'] },
  runway: { kicker: 'Runway', lead: 'First look', collection: 'The lookbook', noun: ['title', 'titles'] },
  'atlas-of-ideas': { kicker: 'Movements and places', lead: 'Lead story', collection: 'The mosaic', noun: ['title', 'titles'] },
  playroom: { kicker: 'Playroom', lead: 'First pick', collection: 'Family-friendly picks', noun: ['title', 'titles'] },
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
  // the lead is the title the collection leads with by default (watchable first)
  const lead = useMemo(() => sortVideos(cat, view.all, defaultSort(section), { section }), [cat, view.all, section]);
  const top = lead.find((v) => cat.isPlayable(v)) ?? lead[0];

  /* ── the world: this category's chamber; what is showing is what is lit ── */
  useArrangement({ kind: 'category', section: section.id });
  const narrowed = !!deferred.facet || deferred.q.trim() !== '';
  const highlight = useMemo<ID[] | null>(() => (narrowed ? view.results.map((v) => v.id) : null), [narrowed, view.results]);
  const highlightKey = highlight === null ? '*' : `[${highlight.join('|')}]`;
  useEffect(() => {
    setHighlight(highlight);
    // keyed by the ids, not the array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey]);
  useWorldEcho(pageRef);

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
          { id: 'cat-context', label: 'Already here' },
        ]
      : [
          { id: 'cat-top', label: section.label },
          { id: 'cat-collection', label: family.collection },
          { id: 'cat-context', label: 'Where and when' },
        ],
  );

  const facts = empty
    ? null
    : [
        plural(stats.titles, family.noun[0], family.noun[1]),
        stats.watchNow === stats.titles ? 'all watchable now' : `${stats.watchNow} watchable now`,
        stats.places ? `set in ${plural(stats.places, 'place')}` : null,
        stats.eras ? `across ${plural(stats.eras, 'era')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const Results = RESULTS[layout];
  const clearQuery = () => update((s) => ({ ...s, q: '' }));
  const clearFacet = () => update((s) => ({ ...s, facet: null }));

  return (
    <div ref={pageRef} className={`catpage fam-${layout} ${empty ? 'is-empty' : ''}`} data-section={section.id} data-hue={section.id}>
      <section className="cat-hero" id="cat-top" aria-labelledby="cat-title">
        <div className="wrap cat-hero-inner">
          <Switcher current={section} />
          <div className="cat-hero-head">
            <p className="eyebrow cat-eyebrow">{family.kicker}</p>
            <h1 id="cat-title" className="title-monument cat-title">
              {section.label}
            </h1>
            <p className="lede cat-tagline">{section.tagline}</p>
            {facts ? <p className="cat-facts">{facts}</p> : null}
          </div>
          <div className="cat-hero-open" aria-hidden="true" />
          {empty ? <EmptyStatement section={section} /> : top ? <LeadStory video={top} label={family.lead} news={layout === 'broadsheet'} /> : null}
        </div>
      </section>

      {empty ? (
        <EmptyContext section={section} />
      ) : (
        <>
          <section className="cat-collection" id="cat-collection" aria-labelledby="cat-collection-title">
            <div className="wrap">
              <header className="cat-collection-head">
                <h2 id="cat-collection-title" className="cat-h2">
                  {family.collection}
                </h2>
                <p className="cat-sub">Every title tagged {membershipLabel(cat, section)}. New ones join the moment they are published.</p>
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
              <div className="cat-results" aria-busy={state !== deferred || undefined}>
                {view.results.length ? (
                  <Results section={section} videos={view.results} group={group} />
                ) : (
                  <NoMatches section={section} q={deferred.q} facet={view.facet} onClearQuery={clearQuery} onClearFacet={clearFacet} />
                )}
              </div>
            </div>
          </section>
          <ContextSection section={section} videos={view.results.length ? view.results : view.all} showConnections={layout !== 'soundstage'} />
        </>
      )}
    </div>
  );
}
