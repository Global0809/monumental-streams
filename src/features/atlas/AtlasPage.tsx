/**
 * WORLD — the living globe of places, the stories set there and the routes between them.
 *
 *   /world                     whole globe, centred on the Atlantic, gateway highlighted, intro
 *   /world/:slug               a place: camera flies there, place panel opens
 *   ?route=<id without prefix> highlights a route (and frames it)
 *   ?view=globe|map|list       globe (WebGL, default where capable) · flat SVG map · accessible list
 *   ?cat ?facet ?era ?access ?stories   the lens (filters.ts) — re-lights every view
 *
 * The URL is the only source of truth for selection, route, view and lens, so refresh restores
 * the state, a link shares it and the back button steps through earlier explorations (and
 * lands back on the same place, lens and panel position after watching a story). A session
 * trail of recent places sits above the panel for hopping back.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import type { ID, Place, Route } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { deviceTier, hasWebGL } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Segmented } from '../../ui/controls.tsx';
import { Pulse } from '../../ui/feedback.tsx';
import type { IconName } from '../../ui/Icon.tsx';
import {
  eraDensity,
  facetCounts,
  isFiltering,
  narrowsStories,
  NO_FILTERS,
  parseFilters,
  placedMatches,
  placeSignals,
  pushTrail,
  sectionCounts,
  sectionOf,
  type WorldFilters,
} from './filters.ts';
import { Lens } from './Lens.tsx';
import ListView from './ListView.tsx';
import MapView from './MapView.tsx';
import MiamiUpClose from './MiamiUpClose.tsx';
import { atlasHref, buildAtlasModel, focusFor, gatewayRegion, isWithin, mapFocus, parseView, placeTree, pruneEmpty, withCounts, type AtlasView } from './model.ts';
import { IntroPanel, PlacePanel, UnknownPlace } from './panels.tsx';
import { HotContext, Legend, Trail } from './parts.tsx';
import { buildStageNodes, buildStageRoutes } from './stage.ts';
import './atlas.css';
import './world.css';

const GlobeView = lazy(() => import('./GlobeView.tsx'));

/** Any render error inside the globe falls back to the flat map instead of breaking the page. */
class GlobeBoundary extends Component<{ onError: (msg: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    this.props.onError(err instanceof Error ? err.message : String(err));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const VIEW_OPTIONS: { value: AtlasView; label: string; icon: IconName }[] = [
  { value: 'globe', label: 'Globe', icon: 'globe' },
  { value: 'map', label: 'Map', icon: 'map' },
  { value: 'list', label: 'List', icon: 'list' },
];

/** Angular radius of the land glow around a selection, as a cosine. */
const GLOW_COS: Partial<Record<Place['kind'], number>> = { country: 0.978, 'constituent-country': 0.99, state: 0.993, territory: 0.998 };

/* ───────────── Exploration memory (session) ───────────── */

const TRAIL_KEY = 'ms.world.trail.v1';
const SCROLL_KEY = 'ms.world.panel.v1';

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

export default function AtlasPage() {
  const cat = useCatalogue();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

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

  const [caps] = useState(() => ({ webgl: hasWebGL(), tier: deviceTier() }));
  const [globeError, setGlobeError] = useState<string | null>(null);
  const preferred: AtlasView = caps.webgl && caps.tier !== 'low' ? 'globe' : 'map';
  const requested = viewParam ?? preferred;
  const view: AtlasView = requested === 'globe' && (!caps.webgl || globeError) ? 'map' : requested;
  const fellBack = requested === 'globe' && view !== 'globe';

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

  /* ── The frame fills the viewport below whatever chrome sits above it ── */
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const measure = () => el.style.setProperty('--atlas-offset', `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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

  /* ── Panel position memory: back from a story lands where you were ── */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const saved = readSession<Record<string, number>>(SCROLL_KEY, {})[location.key];
    if (navType === 'POP' && saved) el.scrollTop = saved;
    else if (navType !== 'POP' && !location.state) el.scrollTop = 0;
    // filter changes (state.keepFocus) keep the panel where it is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let frame = 0;
    const save = () => {
      frame = 0;
      const all = readSession<Record<string, number>>(SCROLL_KEY, {});
      all[location.key] = el.scrollTop;
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
      writeSession(SCROLL_KEY, all);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [location.key]);

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
    const stories = placedMatches(cat, filters).length;
    // places glowing at world scale (what the globe and the ranked list show)
    const places = lensModel.nodes.filter((n) => n.level === 'city' && n.count > 0).length;
    return { stories, places };
  }, [cat, filters, lensModel]);
  const tree = useMemo(() => {
    const t = placeTree(cat, lensModel.counts);
    return filters.storiesOnly ? pruneEmpty(t, place?.id ?? null) : t;
  }, [cat, lensModel, filters.storiesOnly, place?.id]);

  /* ── Stage ── */
  const [hot, setHot] = useState<ID | null>(null);
  useEffect(() => setHot(null), [location.key]);
  const scope = useMemo(() => (place ? cat.placeScope(place.id) : null), [cat, place]);
  const stageInput = useMemo(() => ({ place, route, scope, filters, signals, hot }), [place, route, scope, filters, signals, hot]);
  const nodes = useMemo(() => buildStageNodes(model, stageInput), [model, stageInput]);
  const routes = useMemo(() => buildStageRoutes(cat, stageInput), [cat, stageInput]);
  const coordsOf = useCallback((id: ID) => (cat.get(id) as Place | undefined)?.coords, [cat]);

  const ends = useMemo(() => new Set<ID>(route ? [route.from, route.to] : []), [route]);
  const globeNodes = useMemo(() => nodes.filter((n) => n.level === 'city' || n.state === 3 || ends.has(n.id) || n.id === hot), [nodes, ends, hot]);
  const routeGeo = useMemo(() => {
    const a = route && coordsOf(route.from);
    const b = route && coordsOf(route.to);
    return a && b ? { from: a, to: b } : undefined;
  }, [route, coordsOf]);
  const focus = useMemo(() => focusFor(place, routeGeo), [place, routeGeo]);
  const flatFocus = useMemo(() => mapFocus(place, routeGeo), [place, routeGeo]);
  const focusKey = place || routeGeo ? `${place?.id ?? ''}|${route?.id ?? ''}` : 'world';
  const focusPoint = useMemo(() => (place ? { lat: place.coords[0], lon: place.coords[1], cos: GLOW_COS[place.kind] ?? 0.9988 } : null), [place]);

  const onGlobeSelect = useCallback(
    (id: string) => {
      const p = cat.get(id) as Place | undefined;
      if (!p) return;
      sound.play('select');
      const keep = route && (route.from === id || route.to === id) ? route.id : null;
      const next = hrefFor(p.slug, keep);
      if (next === hrefFor(place?.slug ?? null, route?.id ?? null)) return; // already here — no duplicate history entry
      navigate(next);
    },
    [cat, route, place, hrefFor, navigate],
  );
  const nameOf = useCallback((id: string) => cat.label(id), [cat]);
  const onGlobeFail = useCallback((msg: string) => setGlobeError(msg || 'unknown error'), []);

  const changeView = (v: AtlasView) => {
    if (v === view) return;
    navigate(atlasHref(slug ?? null, { route: route?.id ?? null, view: v, filters }), { preventScrollReset: true, state: { keepFocus: true } });
  };
  const options = caps.webgl ? VIEW_OPTIONS : VIEW_OPTIONS.filter((o) => o.value !== 'globe');
  const section = sectionOf(filters.section);
  const nothingLit = lensed && summary.stories === 0 && !nodes.some((n) => n.state === 0 && n.expanding);

  return (
    <HotContext.Provider value={setHot}>
      <div className="atlas" data-view={view} data-lensed={lensed || undefined}>
        <div className="atlas-top" ref={topRef}>
          <Lens
            filters={filters}
            sectionCounts={counts.sections}
            facetCounts={counts.facets}
            density={counts.density}
            allStories={counts.all}
            onChange={setFilters}
          />
          <div className="atlas-body">
            <section className="atlas-stage" data-view={view} aria-label={view === 'list' ? 'Every place in the world' : view === 'map' ? 'Flat map of the world' : 'Globe'}>
              <div className="atlas-toolbar">
                <Segmented label="World view" hideLabel value={view} options={options} onChange={changeView} />
              </div>
              <p className="atlas-sum" aria-live="polite" aria-atomic="true" data-lensed={lensed || undefined}>
                {summary.stories ? (
                  <>
                    <span className="atlas-sum-pulse" aria-hidden="true" />
                    <strong>{summary.places}</strong> {summary.places === 1 ? 'place' : 'places'} · <strong>{summary.stories}</strong> {summary.stories === 1 ? 'story' : 'stories'}
                    {lensed ? <span className="atlas-sum-tail"> match</span> : null}
                  </>
                ) : (
                  'No placed stories match yet'
                )}
              </p>
              {fellBack ? (
                <p className="notice atlas-stage-note" role="status">
                  {globeError ? 'The 3D globe could not start here, so this is the flat map.' : 'This browser can’t draw the 3D globe, so this is the flat map.'} The list view has every place too.
                </p>
              ) : null}
              {view !== 'list' && nothingLit ? (
                <p className="atlas-stage-empty" role="status">
                  <strong>{section ? `No ${section.label.toLowerCase()} stories are on the map yet.` : 'Nothing on the map matches.'}</strong>{' '}
                  {section ? 'Places light up here as soon as those stories join the catalogue.' : 'Try another era or access level.'}
                </p>
              ) : null}
              {view === 'globe' ? (
                <GlobeBoundary onError={onGlobeFail}>
                  <Suspense
                    fallback={
                      <div className="atlas-stage-wait">
                        <Pulse label="Waking the globe" />
                      </div>
                    }
                  >
                    <GlobeView
                      nodes={globeNodes}
                      routes={routes}
                      focus={focus}
                      focusKey={focusKey}
                      focusPoint={focusPoint}
                      autoRotate={!place && !route}
                      reduced={reduced}
                      tier={caps.tier}
                      onSelect={onGlobeSelect}
                      onFail={onGlobeFail}
                      nameOf={nameOf}
                    />
                  </Suspense>
                </GlobeBoundary>
              ) : view === 'map' ? (
                <MapView nodes={nodes} routes={routes} focus={flatFocus} focusKey={focusKey} reduced={reduced} hrefFor={hrefSlug} />
              ) : (
                <ListView tree={tree} selectedId={place?.id ?? null} hrefFor={hrefSlug} lensed={lensed} storiesOnly={filters.storiesOnly} />
              )}
              {view !== 'list' ? (
                <>
                  <Legend lensed={lensed} />
                  <p className="atlas-credit">Land from Natural Earth, public domain</p>
                </>
              ) : null}
            </section>

            <div id="atlas-place" ref={panelRef} className="atlas-panel">
              <span className="atlas-grip" aria-hidden="true" />
              <Trail slugs={trail} current={place?.slug ?? null} hrefFor={hrefFor} onClear={clearTrail} />
              {place ? (
                <PlacePanel
                  key={place.id}
                  place={place}
                  route={route}
                  routeMissing={!!routeParam && !route}
                  model={lensModel}
                  hrefFor={hrefFor}
                  upClose={inRegion}
                  filters={filters}
                  clearLensHref={atlasHref(place.slug, { route: route?.id ?? null, view: viewParam, filters: NO_FILTERS })}
                />
              ) : slug ? (
                <UnknownPlace slug={slug} hrefFor={hrefFor} />
              ) : (
                <IntroPanel model={lensModel} filters={filters} signals={signals} hrefFor={hrefFor} listHref={atlasHref(null, { view: 'list', filters })} />
              )}
            </div>
          </div>
        </div>

        {inRegion && region ? <MiamiUpClose region={region} selectedId={place?.id ?? null} routeId={route?.id ?? null} hrefFor={hrefFor} model={lensModel} /> : null}
      </div>
    </HotContext.Provider>
  );
}
