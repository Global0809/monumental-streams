/**
 * World — the editorial column beside the globe. Each state has a HEAD (title, one primary
 * action, supporting facts) and a BODY (the content that matters), so the page can place the
 * lens and the world controls between them on small screens and beside them on large ones.
 *
 *   /world          IntroHead + IntroBody   what the world holds, or what the lens finds
 *   /world/:place   PlaceHead + PlaceBody   stories here, routes, eras, people, movements
 *   unknown slug    UnknownPlace            honest "nothing mapped here"
 *
 * Every row that names a place lights that place on the globe (useHot) and lights up itself
 * when the globe points at it; every story is a seed card (VideoPod) linked the same way.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Catalogue } from '../../../shared/catalogue.ts';
import { discoveryWith } from '../../../shared/search.ts';
import type { ID, Movement, Person, Place, Programme, Route, Video } from '../../../shared/types.ts';
import { discoveryToSearch } from '../../../shared/url-state.ts';
import { jumpTo } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { VideoPod } from '../../ui/Pod.tsx';
import { announceSave } from '../../ui/save.ts';
import { erasForPlace, filterLabels, matchesVideo, narrowsStories, placeConnections, routeMatches, sectionOf, type PlaceConnection, type PlaceEra, type PlaceSignal, type WorldFilters } from './filters.ts';
import { formatCoords, KIND_LABEL, movementHref, otherEnd, ROUTE_KIND_LABEL, yearsLabel, type AtlasModel } from './model.ts';
import { RouteSwatch, useHot, type HrefFor } from './parts.tsx';

export type { HrefFor } from './parts.tsx';

const PROGRAMME_KIND: Record<Programme['kind'], string> = {
  'original-series': 'Original series',
  'original-chapter': 'Original chapter',
  'artist-campaign': 'Artist campaign',
  'demonstration-series': 'Demonstration series',
  collection: 'Collection',
};

const PROGRAMME_STATUS: Record<Programme['status'], string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

const STORY_LIMIT = 4;
const RESULT_LIMIT = 8;

/** Font size for a monumental place name: fitted to its longest word (see .atlas-title). */
const fitOf = (name: string) => Math.max(5, ...name.split(/\s+/).map((w) => w.length));

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="atlas-sec" aria-labelledby={id}>
      <h2 id={id} className="atlas-h2" tabIndex={-1}>
        {title}
      </h2>
      {note ? <p className="atlas-note">{note}</p> : null}
      {children}
    </section>
  );
}

export function useSavePlace(place: Place | undefined) {
  const lib = useLibrary();
  const saved = !!place && !!lib.savedPlaces[place.id] && !lib.savedPlaces[place.id].removed;
  const toggle = (from?: Element | null) => {
    if (!place) return;
    const now = libraryActions.toggleSavePlace(place.id);
    announceSave({
      saved: now,
      title: place.name,
      from,
      quoted: false,
      message: now ? undefined : `Removed ${place.name} from your saved places`,
      undo: () => libraryActions.toggleSavePlace(place.id),
    });
  };
  return { saved, toggle };
}

function SaveButton({ place, primary }: { place: Place; primary?: boolean }) {
  const { saved, toggle } = useSavePlace(place);
  return (
    <Button
      variant={saved ? 'aurum' : primary ? 'primary' : 'ghost'}
      icon={saved ? 'saved' : 'save'}
      aria-pressed={saved}
      onClick={(e) => toggle(e.currentTarget)}
      data-cursor="save"
      data-cursor-label={saved ? 'Unsave' : 'Save'}
    >
      {saved ? 'Saved place' : 'Save place'}
    </Button>
  );
}

function sortStories(cat: Catalogue, list: Video[]): Video[] {
  return [...list].sort((a, b) => Number(cat.isPlayable(b)) - Number(cat.isPlayable(a)) || b.published.localeCompare(a.published));
}

/** The story a place leads with: free to watch first, then anything playable. */
function leadStory(cat: Catalogue, list: Video[]): Video | undefined {
  return list.find((v) => cat.isPlayable(v) && cat.effectiveAccess(v) === 'free') ?? list.find((v) => cat.isPlayable(v));
}

/** "Music · 1940s · Free to watch" */
function lensText(cat: Catalogue, filters: WorldFilters): string {
  return filterLabels(cat, filters)
    .filter((l) => l.key !== 'storiesOnly')
    .map((l) => l.label)
    .join(' · ');
}

/** The catalogue (search) with the same lens applied, for "see every match". */
function searchHref(cat: Catalogue, filters: WorldFilters, place?: Place): string {
  const s = sectionOf(filters.section);
  const state = discoveryWith({
    interests: filters.facet ? [filters.facet] : (s?.interests ?? []),
    periods: filters.era ? [filters.era] : [],
    access: filters.access,
    places: place ? [place.id] : [],
  });
  return `/catalogue?${discoveryToSearch(state, cat)}`;
}

function StoryGrid({ stories }: { stories: Video[] }) {
  return (
    <ul className="atlas-pods">
      {stories.map((v) => (
        <li key={v.id}>
          <VideoPod video={v} size="sm" />
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Routes ───────────── */

export function RouteCard({ route, fromPlace, hrefFor, current, level = 3, dim }: { route: Route; fromPlace: Place; hrefFor: HrefFor; current?: boolean; level?: 3 | 4; dim?: boolean }) {
  const H = level === 4 ? 'h4' : 'h3';
  const cat = useCatalogue();
  const end = otherEnd(cat, route, fromPlace.id);
  const target = cat.get(end.id) as Place | undefined;
  const hot = useHot(target?.id);
  const dir = end.direction === 'outward' ? `from ${fromPlace.name}` : end.direction === 'inward' ? `into ${fromPlace.name}` : `within ${fromPlace.name}`;
  return (
    <article className="atlas-route" data-kind={route.kind} data-dim={dim || undefined} aria-current={current ? 'true' : undefined} {...hot}>
      <p className="atlas-route-kicker">
        <RouteSwatch kind={route.kind} />
        {ROUTE_KIND_LABEL[route.kind]} {dir} · {yearsLabel(route.period.from, route.period.to)}
      </p>
      <H className="atlas-route-title">{route.label}</H>
      <p className="atlas-route-path">
        {cat.label(route.from)} <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> {cat.label(route.to)}
      </p>
      <p className="atlas-route-sum">{route.summary}</p>
      {target ? (
        current ? (
          <p className="atlas-route-on">
            <span className="atlas-route-on-dot" aria-hidden="true" /> Lit on the globe
          </p>
        ) : (
          <Link to={hrefFor(target.slug, route.id)} className="atlas-route-go" onClick={() => sound.play('transition')} data-cursor-label={`To ${target.name}`}>
            Follow the route <span aria-hidden="true">→</span> {target.name}
          </Link>
        )
      ) : null}
    </article>
  );
}

function IntroRoute({ route, hrefFor }: { route: Route; hrefFor: HrefFor }) {
  const cat = useCatalogue();
  const to = cat.get(route.to) as Place | undefined;
  const hot = useHot(route.to);
  return (
    <li>
      <Link to={hrefFor(to?.slug ?? null, route.id)} className="atlas-line" data-kind={route.kind} onClick={() => sound.play('transition')} {...hot}>
        <RouteSwatch kind={route.kind} />
        <span className="atlas-line-main">{route.label}</span>
        <span className="atlas-line-meta">
          {cat.label(route.from)} → {cat.label(route.to)} · {yearsLabel(route.period.from, route.period.to)}
        </span>
      </Link>
    </li>
  );
}

/* ───────────── Ranked places (intro) ───────────── */

function PlaceRow({ place, signal, hrefFor, rank }: { place: Place; signal: PlaceSignal; hrefFor: HrefFor; rank: number }) {
  const cat = useCatalogue();
  const hot = useHot(place.id);
  const parent = cat.placeAncestors(place.id).find((a) => a.kind !== 'county') ?? cat.placeAncestors(place.id)[0];
  return (
    <li>
      <Link to={hrefFor(place.slug)} className="atlas-rank" onClick={() => sound.play('select')} data-hollow={!signal.stories || undefined} data-gateway={place.gateway || undefined} {...hot}>
        <span className="atlas-rank-n" aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="atlas-rank-name">{place.name}</span>
        <span className="atlas-rank-meta">
          <span className="sr-only">, </span>
          {KIND_LABEL[place.kind]}
          {parent ? ` · ${parent.name}` : ''}
        </span>
        <span className="atlas-rank-count">
          <span className="sr-only">, </span>
          {signal.stories ? plural(signal.stories, 'story', 'stories') : plural(signal.movements, 'movement')}
        </span>
      </Link>
    </li>
  );
}

/* ───────────── Intro (/world) ───────────── */

export function IntroHead({ model, hrefFor, listHref }: { model: AtlasModel; hrefFor: HrefFor; listHref: string }) {
  const gateway = model.gateway;
  const cities = model.nodes.filter((n) => n.level === 'city');
  const holding = cities.filter((n) => n.count > 0).length;
  const growing = cities.filter((n) => n.expanding && n.count === 0).length;
  return (
    <header className="atlas-head">
      <p className="eyebrow atlas-kicker">Discover where it lives</p>
      <h1 className="title-monument atlas-title" style={{ ['--fit' as string]: 5 }}>
        World
      </h1>
      <p className="lede atlas-lede">Every story is pinned to the places it comes from. Turn the globe, look through a lens, follow the routes that carried people, sounds and ideas.</p>
      <div className="atlas-actions">
        {gateway ? (
          <ButtonLink to={hrefFor(gateway.slug)} variant="primary" size="lg" icon="globe" data-cursor-label={`Enter ${gateway.name}`}>
            Enter through {gateway.name}
          </ButtonLink>
        ) : null}
        <Link to={listHref} className="atlas-textlink">
          Browse every place <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="atlas-facts-line">
        {plural(model.placedStories, 'story', 'stories')} pinned to {plural(holding, 'place')} · {growing} more mapped and growing
      </p>
    </header>
  );
}

export function IntroBody({ model, filters, signals, hrefFor }: { model: AtlasModel; filters: WorldFilters; signals: Map<ID, PlaceSignal> | null; hrefFor: HrefFor }) {
  const cat = useCatalogue();
  const [more, setMore] = useState(false);
  const gateway = model.gateway;
  const lensed = narrowsStories(filters);
  const section = sectionOf(filters.section);

  const ranked = useMemo(() => {
    const rows = model.nodes
      .filter((n) => n.level === 'city')
      .map((n) => ({ place: n.place, signal: signals?.get(n.id) ?? { stories: n.count, movements: 0 } }))
      .filter((r) => r.signal.stories > 0 || (lensed && r.signal.movements > 0));
    return rows.sort((a, b) => b.signal.stories - a.signal.stories || b.signal.movements - a.signal.movements || a.place.name.localeCompare(b.place.name));
  }, [model, signals, lensed]);
  const glowing = ranked.filter((r) => r.signal.stories > 0).length;
  const stories = useMemo(() => sortStories(cat, cat.videos.filter((v) => v.places.length && (!lensed || matchesVideo(cat, v, filters)))), [cat, filters, lensed]);

  const scope = gateway ? cat.placeScope(gateway.id) : new Set<string>();
  const routes = useMemo(() => {
    const list = lensed && signals ? cat.routes.filter((r) => routeMatches(cat, r, filters, signals)) : cat.routes;
    return [...list].sort((a, b) => Number(scope.has(b.from) || scope.has(b.to)) - Number(scope.has(a.from) || scope.has(a.to)) || a.period.from - b.period.from).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, filters, signals, lensed, gateway?.id]);
  const expanding = model.nodes.filter((n) => n.place.status === 'expanding' && n.level === 'city');
  const shown = more ? ranked : ranked.slice(0, RESULT_LIMIT);
  const lens = lensText(cat, filters);

  return (
    <div className="atlas-body">
      <Section
        id="atlas-sec-results"
        title={lensed ? (glowing ? `${plural(glowing, 'place')} ${glowing === 1 ? 'glows' : 'glow'}` : 'Nothing glows yet') : 'Where the stories are'}
        note={
          lensed ? (
            <>
              <span className="atlas-lens-now">{lens}</span>
              {ranked.length > glowing ? ` · ${glowing ? `${ranked.length - glowing} more` : plural(ranked.length, 'place')} with movements alive but no matching stories yet` : null}
            </>
          ) : (
            'Ranked by the stories set there, including the places inside them.'
          )
        }
      >
        {ranked.length ? (
          <>
            <ol className="atlas-ranks">
              {shown.map((r, i) => (
                <PlaceRow key={r.place.id} place={r.place} signal={r.signal} hrefFor={hrefFor} rank={i + 1} />
              ))}
            </ol>
            {ranked.length > RESULT_LIMIT ? (
              <Button variant="quiet" iconAfter={more ? 'up' : 'down'} onClick={() => setMore(!more)} aria-expanded={more}>
                {more ? 'Show fewer places' : `Show all ${ranked.length} places`}
              </Button>
            ) : null}
          </>
        ) : (
          <EmptyState icon="globe" tone="plasma" title={section ? `No ${section.label.toLowerCase()} stories on the map yet` : 'No placed stories match'}>
            <p>{section ? `${section.promise} Stories appear here — and light their places — as soon as they join the catalogue.` : 'Try another era, or widen the access filter.'}</p>
          </EmptyState>
        )}
      </Section>

      {stories.length ? (
        <Section id="atlas-sec-matches" title={lensed ? 'Stories that match' : 'Stories on the map'} note={lensed ? `${plural(stories.length, 'story', 'stories')} set on the map — each one glows on the globe.` : null}>
          <StoryGrid stories={stories.slice(0, STORY_LIMIT)} />
          <Link to={searchHref(cat, filters)} className="atlas-textlink atlas-more">
            {lensed ? `All ${plural(stories.length, 'match', 'matches')} in search` : 'Open every placed story in search'} <span aria-hidden="true">→</span>
          </Link>
        </Section>
      ) : null}

      {routes.length ? (
        <Section id="atlas-sec-routes" title={lensed ? 'Routes alive through the lens' : 'Routes across the world'} note="Following one lights its arc on the globe.">
          <ul className="atlas-lines">
            {routes.map((r) => (
              <IntroRoute key={r.id} route={r} hrefFor={hrefFor} />
            ))}
          </ul>
        </Section>
      ) : null}

      {expanding.length && !lensed ? (
        <Section id="atlas-sec-growing" title="Mapped, still growing" note="On the map so it can grow — no stories set here yet.">
          <ul className="atlas-inline">
            {expanding.map((n) => (
              <li key={n.id}>
                <GrowingLink place={n.place} to={hrefFor(n.place.slug)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function GrowingLink({ place, to }: { place: Place; to: string }) {
  const hot = useHot(place.id);
  return (
    <Link to={to} className="atlas-inline-link" data-status="expanding" {...hot}>
      {place.name}
    </Link>
  );
}

/* ───────────── Unknown slug ───────────── */

export function UnknownPlace({ slug, hrefFor }: { slug: string; hrefFor: HrefFor }) {
  return (
    <header className="atlas-head">
      <p className="eyebrow atlas-kicker">World</p>
      <h1 className="title-monument atlas-title" style={{ ['--fit' as string]: 9 }}>
        Nothing mapped here
      </h1>
      <p className="lede atlas-lede">There is no place called “{slug}” on the map. It may have been renamed, or it has not been mapped yet.</p>
      <div className="atlas-actions">
        <ButtonLink to={hrefFor(null)} variant="primary" icon="globe">
          Back to the whole world
        </ButtonLink>
        <Link to="/world?view=list" className="atlas-textlink">
          Browse every place <span aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}

/* ───────────── A place ───────────── */

export interface PlaceData {
  ancestors: Place[];
  allStories: Video[];
  matching: Video[];
  programmes: Programme[];
  people: Person[];
  movements: Movement[];
  routes: Route[];
  eras: PlaceEra[];
  connections: PlaceConnection[];
  children: Place[];
}

export function usePlaceData(place: Place | undefined, filters: WorldFilters): PlaceData | null {
  const cat = useCatalogue();
  const lensed = narrowsStories(filters);
  const id = place?.id;
  const base = useMemo(() => {
    if (!id) return null;
    const allStories = sortStories(cat, cat.videosForPlace(id));
    // routes have their own rows, so connected places carry only the other reasons
    const connections = placeConnections(cat, id, 16)
      .map((c) => {
        const reasons = c.reasons.filter((r) => r.kind !== 'route');
        return { ...c, reasons, kind: reasons[0]?.kind === 'movement' ? ('movement' as const) : ('story' as const) };
      })
      .filter((c) => c.reasons.length)
      .slice(0, 8);
    return {
      ancestors: [...cat.placeAncestors(id)].reverse(),
      allStories,
      programmes: cat.programmesForPlace(id),
      people: cat.peopleForPlace(id),
      movements: cat.movementsForPlace(id),
      routes: [...cat.routesForPlace(id)].sort((a, b) => a.period.from - b.period.from),
      eras: erasForPlace(cat, id),
      connections,
      children: [...cat.placeChildren(id)].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [cat, id]);
  return useMemo(() => (base ? { ...base, matching: lensed ? base.allStories.filter((v) => matchesVideo(cat, v, filters)) : base.allStories } : null), [base, cat, filters, lensed]);
}

export function PlaceHead({ place, data, hrefFor, upClose, filters }: { place: Place; data: PlaceData; hrefFor: HrefFor; upClose: boolean; filters: WorldFilters }) {
  const cat = useCatalogue();
  const lensed = narrowsStories(filters);
  const parent = data.ancestors[data.ancestors.length - 1];
  const lead = leadStory(cat, data.matching) ?? (lensed ? undefined : leadStory(cat, data.allStories));
  const kicker = [place.gateway ? 'Gateway' : null, KIND_LABEL[place.kind], parent?.name, place.status === 'expanding' ? 'Expanding' : null].filter(Boolean).join(' · ');
  const readout: { id: string; n: number; one: string; many: string }[] = [
    { id: 'atlas-sec-stories-h', n: data.matching.length, one: lensed ? 'match' : 'story', many: lensed ? 'matches' : 'stories' },
    { id: 'atlas-sec-eras-h', n: data.eras.length, one: 'era', many: 'eras' },
    { id: 'atlas-sec-links-h', n: data.routes.length + data.connections.length, one: 'connection', many: 'connections' },
    { id: 'atlas-sec-movements-h', n: data.movements.length, one: 'movement', many: 'movements' },
  ];

  return (
    <header className="atlas-head atlas-place">
      <nav className="atlas-crumbs" aria-label="Where this is">
        <ol>
          <li>
            <Link to={hrefFor(null)}>World</Link>
          </li>
          {data.ancestors.map((a) => (
            <li key={a.id}>
              <Link to={hrefFor(a.slug)}>{a.name}</Link>
            </li>
          ))}
        </ol>
      </nav>
      <p className="eyebrow atlas-kicker">{kicker}</p>
      <h1 className="title-monument atlas-title" style={{ ['--fit' as string]: fitOf(place.name) }}>
        {place.name}
      </h1>
      <p className="atlas-coords">
        <span className="sr-only">Coordinates: </span>
        {formatCoords(place.coords)}
      </p>
      <p className="lede atlas-lede">{place.summary}</p>
      <div className="atlas-actions">
        {lead ? (
          <ButtonLink to={cat.href(lead.id)} variant="primary" size="lg" icon="play" className="atlas-play" data-cursor="play" data-cursor-label="Watch">
            Watch {lead.title}
          </ButtonLink>
        ) : null}
        <SaveButton place={place} primary={!lead} />
      </div>
      <ul className="atlas-readout" aria-label={`What ${place.name} holds`}>
        {readout.map((r) => (
          <li key={r.id}>
            <button type="button" className="atlas-readout-btn" disabled={!r.n} onClick={() => (sound.play('tick'), jumpTo(r.id))}>
              <span className="atlas-readout-n">{r.n}</span> {r.n === 1 ? r.one : r.many}
            </button>
          </li>
        ))}
      </ul>
      <p className="atlas-also">
        <Link to={`/passport?stops=${place.slug}`} className="atlas-textlink" data-cursor-label="Passport">
          <Icon name="passport" size={16} /> Start a passport here
        </Link>
        <Link to={`/synapse/place/${place.slug}`} className="atlas-textlink" data-cursor-label="Connections">
          <Icon name="synapse" size={16} /> Explore connections
        </Link>
        {upClose ? (
          <button type="button" className="atlas-textlink" onClick={() => (sound.play('transition'), jumpTo('atlas-miami'))}>
            Miami, up close
            <Icon name="down" size={16} />
          </button>
        ) : null}
      </p>
    </header>
  );
}

function ConnectionRow({ c, hrefFor }: { c: PlaceConnection; hrefFor: HrefFor }) {
  const cat = useCatalogue();
  const hot = useHot(c.place.id);
  const parent = cat.placeAncestors(c.place.id).find((a) => a.kind === 'country' || a.kind === 'territory' || a.kind === 'state');
  return (
    <li className="atlas-conn" data-kind={c.kind} {...hot}>
      <Link to={hrefFor(c.place.slug)} className="atlas-conn-name" onClick={() => sound.play('select')} data-cursor-label={`To ${c.place.name}`}>
        {c.place.name}
        {parent ? <span className="atlas-conn-in"> · {parent.name}</span> : null}
      </Link>
      <ul className="atlas-conn-why" aria-label={`Why ${c.place.name} is connected`}>
        {c.reasons.slice(0, 3).map((r) => (
          <li key={r.via ?? r.label}>{r.label}</li>
        ))}
      </ul>
    </li>
  );
}

function ChildLink({ place, n, lensed, hrefFor }: { place: Place; n: number; lensed: boolean; hrefFor: HrefFor }) {
  const hot = useHot(place.id);
  return (
    <Link to={hrefFor(place.slug)} className="atlas-inline-link" data-status={place.status} data-zero={lensed && !n ? true : undefined} onClick={() => sound.play('select')} {...hot}>
      {place.name}
      <span className="atlas-inline-n">
        <span className="sr-only">, </span>
        {place.status === 'expanding' && !n && !lensed ? 'expanding' : lensed ? plural(n, 'match', 'matches') : plural(n, 'story', 'stories')}
      </span>
    </Link>
  );
}

export function PlaceBody({
  place,
  data,
  route,
  routeMissing,
  model,
  hrefFor,
  filters,
  clearLensHref,
}: {
  place: Place;
  data: PlaceData;
  route: Route | undefined;
  routeMissing: boolean;
  model: AtlasModel;
  hrefFor: HrefFor;
  filters: WorldFilters;
  clearLensHref: string;
}) {
  const cat = useCatalogue();
  const [showAll, setShowAll] = useState(false);
  const lensed = narrowsStories(filters);
  const { allStories, matching, eras, routes, connections, children, programmes, people, movements } = data;
  const stories = lensed && !showAll ? matching : allStories;
  const expanding = place.status === 'expanding';
  const lens = lensText(cat, filters);

  return (
    <div className="atlas-body">
      {routeMissing ? (
        <p className="notice notice-ember atlas-notice" role="status">
          That route isn’t on the map, so nothing is lit.{' '}
          <Link to={hrefFor(place.slug)}>Show {place.name} without it</Link>
        </p>
      ) : null}

      {route ? (
        <section className="atlas-following" aria-labelledby="atlas-sec-following">
          <h2 id="atlas-sec-following" className="sr-only">
            Following {route.label}
          </h2>
          <RouteCard route={route} fromPlace={place} hrefFor={hrefFor} current />
          <Link to={hrefFor(place.slug)} className="atlas-textlink atlas-clear">
            <Icon name="close" size={14} /> Clear the route
          </Link>
        </section>
      ) : null}

      <section className="atlas-sec" aria-labelledby="atlas-sec-stories-h">
        <h2 id="atlas-sec-stories-h" className="atlas-h2" tabIndex={-1}>
          Stories here
          {allStories.length ? <span className="atlas-h2-n">{lensed && !showAll ? `${matching.length} of ${allStories.length}` : allStories.length}</span> : null}
        </h2>
        {lensed && allStories.length ? (
          <p className="atlas-note">
            <span className="atlas-lens-now">{lens}</span> · {showAll ? 'Showing every story here.' : matching.length ? 'Only stories that match the lens.' : 'None of the stories here match the lens.'}{' '}
            <button type="button" className="atlas-inline-btn" onClick={() => (sound.play('tick'), setShowAll(!showAll))}>
              {showAll ? 'Show matches only' : `Show all ${allStories.length}`}
            </button>
          </p>
        ) : children.length && allStories.length ? (
          <p className="atlas-note">Includes stories set anywhere inside {place.name}.</p>
        ) : null}
        {stories.length ? (
          <>
            <StoryGrid stories={stories.slice(0, STORY_LIMIT)} />
            {stories.length > STORY_LIMIT ? (
              <Link to={searchHref(cat, lensed && !showAll ? filters : { ...filters, section: null, facet: null, era: null, access: 'all' }, place)} className="atlas-textlink atlas-more">
                All {plural(stories.length, 'story', 'stories')} in search <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </>
        ) : lensed && allStories.length ? (
          <EmptyState icon="filter" title="Nothing here through this lens" actions={<ButtonLink to={clearLensHref}>Clear filters</ButtonLink>}>
            <p>
              {place.name} has {plural(allStories.length, 'story', 'stories')}, but none match the filters you chose.
            </p>
          </EmptyState>
        ) : expanding ? (
          <EmptyState icon="globe" tone="plasma" title="No stories here yet">
            <p>Mapped so the world can grow. Save {place.name} and it will be waiting in My World when stories arrive.</p>
          </EmptyState>
        ) : (
          <EmptyState icon="globe" title="No stories pinned here yet">
            <p>Nothing in the catalogue is set in {place.name} right now. New films join the map as they are added.</p>
          </EmptyState>
        )}
      </section>

      {eras.length ? (
        <Section id="atlas-sec-eras-h" title="Eras present here" note="Stories set then, movements alive and routes travelled. Each decade opens in the Time Machine.">
          <ul className="atlas-eras">
            {eras.map((e) => (
              <li key={e.period.id}>
                <Link
                  to={`/time-machine/${e.period.slug}`}
                  className="atlas-era"
                  data-active={filters.era === e.period.id || undefined}
                  data-stories={e.stories ? true : undefined}
                  onClick={() => sound.play('transition')}
                  data-cursor-label="Into time"
                >
                  <span className="atlas-era-label">{e.period.label}</span>
                  <span className="atlas-era-meta">{[e.stories ? plural(e.stories, 'story', 'stories') : null, e.movements.length ? plural(e.movements.length, 'movement') : null, e.routes ? plural(e.routes, 'route') : null].filter(Boolean).join(' · ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {routes.length || connections.length ? (
        <Section id="atlas-sec-links-h" title={`Where ${place.name} leads`}>
          {routes.length ? (
            <>
              <h3 className="atlas-sub">Routes</h3>
              <ul className="atlas-routes">
                {routes.map((r) => (
                  <li key={r.id}>
                    <RouteCard route={r} fromPlace={place} hrefFor={hrefFor} current={route?.id === r.id} level={4} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {connections.length ? (
            <>
              <h3 className="atlas-sub">Connected places</h3>
              <ul className="atlas-conns">
                {connections.map((c) => (
                  <ConnectionRow key={c.place.id} c={c} hrefFor={hrefFor} />
                ))}
              </ul>
            </>
          ) : null}
        </Section>
      ) : null}

      {children.length ? (
        <Section id="atlas-sec-inside" title={`Inside ${place.name}`}>
          <ul className="atlas-inline">
            {children.map((c) => (
              <li key={c.id}>
                <ChildLink place={c} n={model.counts.get(c.id) ?? 0} lensed={lensed} hrefFor={hrefFor} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {programmes.length ? (
        <Section id="atlas-sec-programmes" title="Programmes here">
          <ul className="atlas-rows">
            {programmes.map((p) => (
              <li key={p.id} className="atlas-row">
                <Link to={cat.href(p.id)} className="atlas-row-link">
                  {p.title}
                </Link>
                <p className="atlas-row-meta">
                  {PROGRAMME_KIND[p.kind]}
                  {p.original ? ' · Monumental Original' : ''} · <span data-status={p.status}>{PROGRAMME_STATUS[p.status]}</span>
                </p>
                <p className="atlas-row-note">{p.statusNote}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {people.length ? (
        <Section id="atlas-sec-people" title="People">
          <ul className="atlas-rows atlas-rows-2">
            {people.map((p) => (
              <li key={p.id} className="atlas-row">
                <Link to={cat.href(p.id)} className="atlas-row-link">
                  {p.name}
                </Link>
                <p className="atlas-row-meta">
                  {p.roles.join(' · ')}
                  {p.provisional ? ' · Provisional profile' : ''}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {movements.length ? (
        <Section id="atlas-sec-movements-h" title="Movements">
          <ul className="atlas-rows atlas-rows-2">
            {movements.map((m) => (
              <li key={m.id} className="atlas-row">
                <Link to={movementHref(cat, m)} className="atlas-row-link" data-cursor-label="Into time">
                  {m.name}
                </Link>
                <p className="atlas-row-meta atlas-years">{yearsLabel(m.start, m.end)}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {place.facts?.length ? (
        <Section id="atlas-sec-facts" title="Facts">
          <dl className="atlas-facts">
            {place.facts.map((f) => (
              <div key={f.label} className="atlas-fact">
                <dt>{f.label}</dt>
                <dd>
                  {f.value}
                  {f.source ? <span className="atlas-fact-src">Source: {f.source}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </div>
  );
}
