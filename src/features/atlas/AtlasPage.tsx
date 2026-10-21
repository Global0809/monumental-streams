/**
 * WORLD — an editorial layer over the living globe. The page owns no 3D of its own: it asks
 * the shared stage for the `world` arrangement and steers it.
 *
 *   /world                     the whole globe, Miami glowing as the gateway, intro column
 *   /world/:slug               a place: the camera flies there, the column tells its story
 *   ?route=<id without prefix> a route: its arc lights and the camera frames it
 *   ?view=globe|map|list       the living globe (default where the stage runs) · the flat
 *                              SVG map · the accessible list of every place
 *   ?cat ?facet ?era ?access ?stories   the lens (filters.ts): matching seeds glow on the
 *                              globe (the stage highlight) and every list re-ranks
 *
 * World ⇄ page, both ways:
 *   · selecting a place in the column, the list, the map, search or the URL → the camera
 *     flies there; clicking a place on the globe (placeActivate) → the same URL change
 *   · hovering / focusing a place row lights it on the globe; a place under the pointer on
 *     the globe lights its rows and previews it beside the globe (stageStore.hoveredPlace)
 *   · story cards light their seeds and the reverse (VideoPod); saving sends the seed home
 *
 * The URL is the only source of truth for selection, route, view and lens, so refresh
 * restores the state, a link shares it and the back button steps through earlier
 * explorations; the window scroll is restored when coming back from a story.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import type { ID, Place, Route, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import type { Arrangement } from '../../stage/contract.ts';
import { chooseQuality } from '../../stage/Stage.tsx';
import { setHighlight, stageStore, useArrangement, useStageEvent } from '../../stage/store.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Segmented } from '../../ui/controls.tsx';
import type { IconName } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import {
  eraDensity,
  facetCounts,
  isFiltering,
  matchesVideo,
  narrowsStories,
  NO_FILTERS,
  parseFilters,
  placedMatches,
  placeSignals,
  pushTrail,
  sectionCounts,
  sectionOf,
  type PlaceSignal,
  type WorldFilters,
} from './filters.ts';
import { Lens } from './Lens.tsx';
import ListView from './ListView.tsx';
import MapView from './MapView.tsx';
import MiamiUpClose from './MiamiUpClose.tsx';
import { atlasHref, buildAtlasModel, gatewayRegion, isWithin, KIND_LABEL, mapFocus, parseView, placeTree, pruneEmpty, withCounts, type AtlasModel, type AtlasView } from './model.ts';
import { IntroBody, IntroHead, PlaceBody, PlaceHead, UnknownPlace, usePlaceData } from './panels.tsx';
import { isDomHot, Legend, setHotPlace, Trail, useHoveredPlace } from './parts.tsx';
import { buildStageNodes, buildStageRoutes, type StageInput } from './stage.ts';
import './atlas.css';

const VIEW_OPTIONS: { value: AtlasView; label: string; icon: IconName }[] = [
  { value: 'globe', label: 'Globe', icon: 'globe' },
  { value: 'map', label: 'Map', icon: 'map' },
  { value: 'list', label: 'List', icon: 'list' },
];

/* ───────────── Exploration memory (session) ───────────── */

const TRAIL_KEY = 'ms.world.trail.v1';

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — memory is a convenience */
  }
}

const FILTER_PARAMS = ['cat', 'facet', 'era', 'access', 'stories'];

/**
 * Whether the living globe can carry the World: the same capability decision the stage makes,
 * and false once the stage has run and stopped (lost context, failed engine).
 */
function useGlobeAvailable(): boolean {
  const [capable] = useState(() => chooseQuality() !== 'off');
  const quality = useSyncExternalStore(stageStore.subscribe, () => stageStore.get().quality, () => 'off' as const);
  const [wasOn, setWasOn] = useState(false);
  useEffect(() => {
    if (quality !== 'off') setWasOn(true);
  }, [quality]);
  return capable && !(wasOn && quality === 'off');
}

export default function AtlasPage() {
  const cat = useCatalogue();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const model = useMemo(() => buildAtlasModel(cat), [cat]);
  const region = useMemo(() => gatewayRegion(cat), [cat]);

  /* ── URL → state ── */
  const place = slug ? (cat.bySlug('place', slug) as Place | undefined) : undefined;
  const routeParam = params.get('route');
  const routeEntity = routeParam ? cat.get(`route:${routeParam}`) : undefined;
  const route = routeEntity && kindOf(routeEntity.id) === 'route' ? (routeEntity as Route) : undefined;
  const viewParam = parseView(params.get('view'));
  const filterKey = FILTER_PARAMS.map((k) => params.get(k) ?? '').join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseFilters(params, cat), [cat, filterKey]);
  const lensed = narrowsStories(filters);

  const globeOk = useGlobeAvailable();
  const requested = viewParam ?? (globeOk ? 'globe' : 'map');
  const view: AtlasView = requested === 'globe' && !globeOk ? 'map' : requested;
  const fellBack = viewParam === 'globe' && view !== 'globe';

  const hrefFor = useCallback((s: string | null, r?: string | null) => atlasHref(s, { route: r ?? null, view: viewParam, filters }), [viewParam, filters]);
  const hrefSlug = useCallback((s: string) => hrefFor(s), [hrefFor]);

  const setFilters = useCallback(
    (next: WorldFilters, opts: { replace?: boolean } = {}) => {
      navigate(atlasHref(slug ?? null, { route: route?.id ?? null, view: viewParam, filters: next }), { replace: !!opts.replace, preventScrollReset: true, state: { keepFocus: true } });
    },
    [navigate, slug, route, viewParam],
  );

  useEffect(() => {
    document.title = place ? `${place.name} · World · Monumental Streams` : 'World · Monumental Streams';
  }, [place]);

  /* ── The world: arrangement + highlight ── */
  const arrangement = useMemo<Arrangement>(() => {
    const a: Extract<Arrangement, { kind: 'world' }> = { kind: 'world' };
    if (place) a.place = place.id;
    if (route) a.route = route.id;
    return a;
  }, [place, route]);
  const matches = useMemo(() => (lensed ? placedMatches(cat, filters) : null), [cat, filters, lensed]);
  const highlight = useMemo(() => (matches ? matches.map((v) => v.id) : null), [matches]);
  useArrangement(arrangement);
  // set apart from useArrangement: an empty match ([] — nothing glows) must differ from no lens (null)
  const highlightKey = highlight ? `ids:${highlight.join('|')}` : 'all';
  useEffect(() => {
    setHighlight(highlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey]);

  // a place clicked on the globe opens here, keeping the lens, the view and a route it belongs to
  const onPlaceActivate = useCallback(
    ({ id }: { id: ID }) => {
      const p = cat.get(id) as Place | undefined;
      if (!p || kindOf(id) !== 'place') return;
      const keep = route && (route.from === id || route.to === id) ? route.id : null;
      const next = hrefFor(p.slug, keep);
      if (next === hrefFor(place?.slug ?? null, route?.id ?? null)) return; // already here — no duplicate history entry
      navigate(next);
    },
    [cat, route, place, hrefFor, navigate],
  );
  useStageEvent('placeActivate', onPlaceActivate);

  // what the DOM lit is cleared when the page moves on or closes
  useEffect(() => setHotPlace(null), [location.key]);
  useEffect(() => () => setHotPlace(null), []);

  /* ── Trail: places visited this session ── */
  const [trail, setTrail] = useState<string[]>(() => readSession<string[]>(TRAIL_KEY, []));
  useEffect(() => {
    if (!place) return;
    setTrail((t) => {
      const next = pushTrail(t, place.slug);
      writeSession(TRAIL_KEY, next);
      return next;
    });
  }, [place]);
  const clearTrail = () => {
    sound.play('unsave');
    const keep = place ? [place.slug] : [];
    writeSession(TRAIL_KEY, keep);
    setTrail(keep);
  };

  const inRegion = !!(place && region && isWithin(cat, place.id, region.id));
  useChapters(inRegion ? [{ id: 'atlas-place', label: 'This place' }, { id: 'atlas-miami', label: 'Miami, up close' }] : []);

  /* ── The lens ── */
  const signals = useMemo(() => (isFiltering(filters) ? placeSignals(cat, filters) : null), [cat, filters]);
  const lensModel = useMemo(() => withCounts(model, signals), [model, signals]);
  const counts = useMemo(
    () => ({
      sections: sectionCounts(cat, filters),
      facets: facetCounts(cat, filters),
      density: eraDensity(cat, filters),
      all: placedMatches(cat, { ...filters, section: null, facet: null }).length,
    }),
    [cat, filters],
  );
  const summary = useMemo(() => {
    const stories = matches ? matches.length : placedMatches(cat, filters).length;
    // places glowing at world scale (what the globe and the ranked list show)
    const places = lensModel.nodes.filter((n) => n.level === 'city' && n.count > 0).length;
    return { stories, places };
  }, [cat, filters, matches, lensModel]);
  const tree = useMemo(() => {
    const t = placeTree(cat, lensModel.counts);
    return filters.storiesOnly ? pruneEmpty(t, place?.id ?? null) : t;
  }, [cat, lensModel, filters.storiesOnly, place?.id]);

  const scope = useMemo(() => (place ? cat.placeScope(place.id) : null), [cat, place]);
  const stageInput = useMemo<StageInput>(() => ({ place, route, scope, filters, signals }), [place, route, scope, filters, signals]);
  const coordsOf = useCallback((id: ID) => (cat.get(id) as Place | undefined)?.coords, [cat]);
  const routeGeo = useMemo(() => {
    const a = route && coordsOf(route.from);
    const b = route && coordsOf(route.to);
    return a && b ? { from: a, to: b } : undefined;
  }, [route, coordsOf]);

  const placeData = usePlaceData(place, filters);

  const changeView = (v: AtlasView) => {
    if (v === view) return;
    navigate(atlasHref(slug ?? null, { route: route?.id ?? null, view: v, filters }), { preventScrollReset: true, state: { keepFocus: true } });
  };
  const options = globeOk ? VIEW_OPTIONS : VIEW_OPTIONS.filter((o) => o.value !== 'globe');
  const section = sectionOf(filters.section);
  const nothingLit = lensed && summary.stories === 0;

  return (
    <div className="atlas" data-view={view} data-lensed={lensed || undefined} data-place={place ? '' : undefined}>
      <div className="atlas-grid">
        <div id="atlas-place" className="atlas-col-head">
          <Trail slugs={trail} current={place?.slug ?? null} hrefFor={hrefFor} onClear={clearTrail} />
          {place && placeData ? (
            <PlaceHead place={place} data={placeData} hrefFor={hrefFor} upClose={inRegion} filters={filters} />
          ) : slug ? (
            <UnknownPlace slug={slug} hrefFor={hrefFor} />
          ) : (
            <IntroHead model={model} hrefFor={hrefFor} listHref={atlasHref(null, { view: 'list', filters })} />
          )}
        </div>

        <div className="atlas-col-lens">
          <Lens filters={filters} sectionCounts={counts.sections} facetCounts={counts.facets} density={counts.density} allStories={counts.all} onChange={setFilters} />
        </div>

        <section className="atlas-world" data-view={view} aria-label={view === 'list' ? 'Every place in the world' : view === 'map' ? 'Flat map of the world' : 'The globe'}>
          <div className="atlas-world-frame">
            {fellBack ? (
              <p className="atlas-world-note" role="status">
                The living globe isn’t running in this browser, so this is the flat map. The list has every place too.
              </p>
            ) : null}
            {view !== 'list' && nothingLit ? (
              <p className="atlas-world-note" role="status">
                <strong>{section ? `No ${section.label.toLowerCase()} stories are on the map yet.` : 'Nothing on the map matches.'}</strong>{' '}
                {section ? 'Places light up as soon as those stories join the catalogue.' : 'Try another era or access level.'}
              </p>
            ) : null}
            <p className="atlas-sum" aria-live="polite" aria-atomic="true" data-lensed={lensed || undefined}>
              {summary.stories ? (
                <>
                  <span className="atlas-sum-pulse" aria-hidden="true" />
                  {plural(summary.places, 'place')} · {plural(summary.stories, 'story', 'stories')}
                  {lensed ? ' match' : ''}
                </>
              ) : (
                'No placed stories match yet'
              )}
            </p>
            <div className="atlas-dock">
              <Segmented label="World view" hideLabel value={view} options={options} onChange={changeView} />
              {view !== 'list' ? <Legend lensed={lensed} /> : null}
            </div>
            {view === 'globe' ? <PlacePeek model={lensModel} signals={signals} filters={filters} /> : null}
            <div className="atlas-view">
              {view === 'map' ? (
                <MapStage model={model} input={stageInput} focus={mapFocus(place, routeGeo)} focusKey={place || routeGeo ? `${place?.id ?? ''}|${route?.id ?? ''}` : 'world'} reduced={reduced} hrefFor={hrefSlug} />
              ) : view === 'list' ? (
                <ListView tree={tree} selectedId={place?.id ?? null} hrefFor={hrefSlug} lensed={lensed} storiesOnly={filters.storiesOnly} />
              ) : (
                <div className="atlas-porthole" aria-hidden="true" />
              )}
            </div>
          </div>
        </section>

        <div className="atlas-col-body">
          {place && placeData ? (
            <PlaceBody
              key={place.id}
              place={place}
              data={placeData}
              route={route}
              routeMissing={!!routeParam && !route}
              model={lensModel}
              hrefFor={hrefFor}
              filters={filters}
              clearLensHref={atlasHref(place.slug, { route: route?.id ?? null, view: viewParam, filters: NO_FILTERS })}
            />
          ) : slug ? null : (
            <IntroBody model={lensModel} filters={filters} signals={signals} hrefFor={hrefFor} />
          )}
          {inRegion && region ? <MiamiUpClose region={region} selectedId={place?.id ?? null} routeId={route?.id ?? null} hrefFor={hrefFor} model={lensModel} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────── The flat map, lit by the same hover as the globe ───────────── */

function MapStage({ model, input, focus, focusKey, reduced, hrefFor }: { model: AtlasModel; input: StageInput; focus: { cx: number; cy: number; w: number }; focusKey: string; reduced: boolean; hrefFor: (slug: string) => string }) {
  const cat = useCatalogue();
  const hot = useHoveredPlace();
  const full = useMemo(() => ({ ...input, hot }), [input, hot]);
  const nodes = useMemo(() => buildStageNodes(model, full), [model, full]);
  const routes = useMemo(() => buildStageRoutes(cat, full), [cat, full]);
  return <MapView nodes={nodes} routes={routes} focus={focus} focusKey={focusKey} reduced={reduced} hrefFor={hrefFor} />;
}

/* ───────────── A place under the pointer on the globe, previewed beside it ───────────── */

function PlacePeek({ model, signals, filters }: { model: AtlasModel; signals: Map<ID, PlaceSignal> | null; filters: WorldFilters }) {
  const cat = useCatalogue();
  const id = useHoveredPlace();
  const p = id && !isDomHot(id) && kindOf(id) === 'place' ? (cat.get(id) as Place | undefined) : undefined;
  const lensed = narrowsStories(filters);
  const stories = useMemo<Video[]>(() => {
    if (!p) return [];
    const list = cat.videosForPlace(p.id).filter((v) => !lensed || matchesVideo(cat, v, filters));
    return [...list].sort((a, b) => Number(cat.isPlayable(b)) - Number(cat.isPlayable(a)) || b.published.localeCompare(a.published)).slice(0, 3);
  }, [cat, p, lensed, filters]);
  if (!p) return null;
  const n = signals ? (signals.get(p.id)?.stories ?? 0) : (model.counts.get(p.id) ?? 0);
  const routes = cat.routesForPlace(p.id).length;
  const parent = cat.placeAncestors(p.id).find((a) => a.kind !== 'county');
  return (
    <div className="atlas-peek" aria-hidden="true">
      <p className="atlas-peek-kind">
        {p.gateway ? 'Gateway · ' : ''}
        {KIND_LABEL[p.kind]}
        {parent ? ` · ${parent.name}` : ''}
      </p>
      <p className="atlas-peek-name">{p.name}</p>
      <p className="atlas-peek-meta">
        {n ? plural(n, lensed ? 'match' : 'story', lensed ? 'matches' : 'stories') : p.status === 'expanding' ? 'Mapped, still growing' : lensed ? 'No matches' : 'No stories yet'}
        {routes ? ` · ${plural(routes, 'route')}` : ''}
      </p>
      {stories.length ? (
        <ul className="atlas-peek-art">
          {stories.map((v) => (
            <li key={v.id}>
              <Art art={v.art} alt="" />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="atlas-peek-hint">Click to open</p>
    </div>
  );
}
