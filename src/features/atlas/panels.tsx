/**
 * World panels: the intro (no place selected — what the world holds, or what the lens finds),
 * the place panel (side sheet on desktop, bottom sheet on smaller screens) and the "nothing
 * mapped here" state. Everything is derived from the catalogue and seen through the lens.
 */
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Catalogue } from '../../../shared/catalogue.ts';
import { discoveryWith } from '../../../shared/search.ts';
import type { ID, Place, Programme, Route, Video } from '../../../shared/types.ts';
import { discoveryToSearch } from '../../../shared/url-state.ts';
import { jumpTo } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { VideoPod } from '../../ui/Pod.tsx';
import { erasForPlace, filterLabels, matchesVideo, narrowsStories, placeConnections, routeMatches, sectionOf, type PlaceConnection, type PlaceSignal, type WorldFilters } from './filters.ts';
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

function Section({ id, title, children, note, kicker }: { id: string; title: string; children: ReactNode; note?: ReactNode; kicker?: string }) {
  return (
    <section className="atlas-sec" aria-labelledby={id} data-reveal>
      <div className="atlas-sec-head">
        {kicker ? <p className="atlas-sec-kicker">{kicker}</p> : null}
        <h2 id={id} className="atlas-sec-title" tabIndex={-1}>
          {title}
        </h2>
      </div>
      {note ? <p className="atlas-sec-note">{note}</p> : null}
      {children}
    </section>
  );
}

/** Saving launches an orb into My World. Pods save themselves; this sends the orb for them. */
export function flyOnPodSave(e: MouseEvent<HTMLElement>) {
  const btn = (e.target as Element | null)?.closest('.pod-save');
  if (btn && btn.getAttribute('aria-pressed') !== 'true') flyToMyWorld(btn);
}

export function useSavePlace(place: Place | undefined) {
  const lib = useLibrary();
  const saved = !!place && !!lib.savedPlaces[place.id] && !lib.savedPlaces[place.id].removed;
  const toggle = (from?: Element | null) => {
    if (!place) return;
    const now = libraryActions.toggleSavePlace(place.id);
    sound.play(now ? 'save' : 'unsave');
    if (now) flyToMyWorld(from ?? null);
    toast(now ? `Saved ${place.name} to My World` : `Removed ${place.name} from your saved places`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.toggleSavePlace(place.id) },
    });
  };
  return { saved, toggle };
}

function SaveButton({ place, primary }: { place: Place; primary?: boolean }) {
  const { saved, toggle } = useSavePlace(place);
  return (
    <Button
      variant={saved ? 'chrome' : primary ? 'primary' : 'chrome'}
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

/** "Music · 1940s · Free to watch" */
function LensNote({ filters }: { filters: WorldFilters }) {
  const cat = useCatalogue();
  const labels = filterLabels(cat, filters).filter((l) => l.key !== 'storiesOnly');
  if (!labels.length) return null;
  return (
    <span className="atlas-lens-tags">
      {labels.map((l) => (
        <span key={l.key} className="atlas-lens-tag">
          {l.label}
        </span>
      ))}
    </span>
  );
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

/* ───────────── Route cards ───────────── */

export function RouteCard({ route, fromPlace, hrefFor, current, level = 3, dim }: { route: Route; fromPlace: Place; hrefFor: HrefFor; current?: boolean; level?: 3 | 4; dim?: boolean }) {
  const H = level === 4 ? 'h4' : 'h3';
  const cat = useCatalogue();
  const end = otherEnd(cat, route, fromPlace.id);
  const target = cat.get(end.id) as Place | undefined;
  const hot = useHot(target?.id);
  const dir = end.direction === 'outward' ? `Outbound from ${fromPlace.name}` : end.direction === 'inward' ? `Inbound to ${fromPlace.name}` : `Within ${fromPlace.name}`;
  return (
    <article className="atlas-route" data-kind={route.kind} data-dim={dim || undefined} aria-current={current ? 'true' : undefined} {...hot}>
      <p className="atlas-route-kicker">
        <RouteSwatch kind={route.kind} />
        {ROUTE_KIND_LABEL[route.kind]} · {dir}
      </p>
      <H className="atlas-route-title">{route.label}</H>
      <p className="atlas-route-path">
        {cat.label(route.from)} <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> {cat.label(route.to)} · {yearsLabel(route.period.from, route.period.to)}
      </p>
      <p className="atlas-route-sum">{route.summary}</p>
      {target ? (
        current ? (
          <p className="atlas-route-on">
            <span className="atlas-route-on-dot" aria-hidden="true" /> Highlighted on the map
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

/* ───────────── Ranked places (intro results) ───────────── */

function PlaceRow({ place, signal, hrefFor, max, rank }: { place: Place; signal: PlaceSignal; hrefFor: HrefFor; max: number; rank: number }) {
  const cat = useCatalogue();
  const hot = useHot(place.id);
  const parent = cat.placeAncestors(place.id).find((a) => a.kind !== 'county') ?? cat.placeAncestors(place.id)[0];
  const strength = signal.stories ? 0.35 + 0.65 * (signal.stories / max) : 0.18;
  return (
    <li>
      <Link to={hrefFor(place.slug)} className="atlas-result" onClick={() => sound.play('select')} style={{ ['--s' as string]: strength }} data-react="light" {...hot}>
        <span className="atlas-result-rank" aria-hidden="true">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="atlas-result-orb" aria-hidden="true" data-hollow={!signal.stories || undefined} />
        <span className="atlas-result-text">
          <span className="atlas-result-name">{place.name}</span>
          <span className="atlas-result-meta">
            {KIND_LABEL[place.kind]}
            {parent ? ` · ${parent.name}` : ''}
          </span>
        </span>
        <span className="atlas-result-count">
          <span className="sr-only">, </span>
          {signal.stories ? plural(signal.stories, 'story', 'stories') : plural(signal.movements, 'movement')}
        </span>
      </Link>
    </li>
  );
}

/* ───────────── Intro (/world) ───────────── */

export function IntroPanel({ model, filters, signals, hrefFor, listHref }: { model: AtlasModel; filters: WorldFilters; signals: Map<ID, PlaceSignal> | null; hrefFor: HrefFor; listHref: string }) {
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
  const max = Math.max(1, ...ranked.map((r) => r.signal.stories));
  const glowing = ranked.filter((r) => r.signal.stories > 0).length;
  const matches = useMemo(() => (lensed ? sortStories(cat, cat.videos.filter((v) => v.places.length && matchesVideo(cat, v, filters))) : []), [cat, filters, lensed]);

  const scope = gateway ? cat.placeScope(gateway.id) : new Set<string>();
  const routes = useMemo(() => {
    const list = lensed && signals ? cat.routes.filter((r) => routeMatches(cat, r, filters, signals)) : cat.routes;
    return [...list].sort((a, b) => Number(scope.has(b.from) || scope.has(b.to)) - Number(scope.has(a.from) || scope.has(a.to)) || a.period.from - b.period.from).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, filters, signals, lensed, gateway?.id]);
  const expanding = model.nodes.filter((n) => n.place.status === 'expanding' && n.level === 'city');
  const shown = more ? ranked : ranked.slice(0, RESULT_LIMIT);

  return (
    <div className="atlas-intro">
      <p className="kicker atlas-kicker">Discover where it lives</p>
      <h1 className="atlas-ph-title atlas-intro-title">World</h1>
      <p className="atlas-intro-line">Every story is pinned to the places it comes from.</p>
      <p className="atlas-summary">Turn the globe, filter it by what you love or when it happened, and follow the routes that carried people, sounds and ideas between places.</p>
      <dl className="atlas-tally">
        <div>
          <dt>Places with stories</dt>
          <dd>{model.active}</dd>
        </div>
        <div>
          <dt>Still growing</dt>
          <dd>{model.expanding}</dd>
        </div>
        <div>
          <dt>Stories placed</dt>
          <dd>{model.placedStories}</dd>
        </div>
      </dl>
      <div className="atlas-actions">
        {gateway ? (
          <ButtonLink to={hrefFor(gateway.slug)} variant="primary" icon="globe" data-cursor-label={`Enter ${gateway.name}`}>
            Enter through {gateway.name}
          </ButtonLink>
        ) : null}
        <ButtonLink to={listHref} variant="chrome" icon="list">
          Browse every place
        </ButtonLink>
      </div>

      <Section
        id="atlas-sec-results"
        kicker={lensed ? 'Through the lens' : 'Where the stories are'}
        title={lensed ? (glowing ? `${plural(glowing, 'place')} ${glowing === 1 ? 'glows' : 'glow'}` : 'Nothing glows yet') : 'Places by stories'}
        note={
          lensed ? (
            <>
              <LensNote filters={filters} />
              {ranked.length > glowing ? ` ${glowing ? `${ranked.length - glowing} more` : plural(ranked.length, 'place')} with movements alive but no matching stories yet — the hollow rings.` : null}
            </>
          ) : (
            'Ranked by how many stories are set there, including the places inside them.'
          )
        }
      >
        {ranked.length ? (
          <>
            <ol className="atlas-results">
              {shown.map((r, i) => (
                <PlaceRow key={r.place.id} place={r.place} signal={r.signal} hrefFor={hrefFor} max={max} rank={i + 1} />
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

      {lensed && matches.length ? (
        <Section id="atlas-sec-matches" title="Stories that match" note={`${plural(matches.length, 'story', 'stories')} set on the map.`}>
          <ul className="atlas-pods" onClickCapture={flyOnPodSave}>
            {matches.slice(0, STORY_LIMIT).map((v) => (
              <li key={v.id}>
                <VideoPod video={v} size="sm" />
              </li>
            ))}
          </ul>
          <ButtonLink to={searchHref(cat, filters)} variant="chrome" iconAfter="arrow" className="atlas-more">
            Open in search
          </ButtonLink>
        </Section>
      ) : null}

      {routes.length ? (
        <Section id="atlas-sec-routes" title={lensed ? 'Routes alive through the lens' : 'Routes across the world'}>
          <ul className="atlas-intro-routes">
            {routes.map((r) => (
              <IntroRoute key={r.id} route={r} hrefFor={hrefFor} />
            ))}
          </ul>
        </Section>
      ) : null}

      {expanding.length && !lensed ? (
        <Section id="atlas-sec-growing" title="Mapped, still growing" note="These places are on the map so it can grow; they have no stories yet.">
          <ul className="atlas-chips">
            {expanding.map((n) => (
              <li key={n.id}>
                <Link to={hrefFor(n.place.slug)} className="atlas-chip" data-status="expanding">
                  <span className="atlas-chip-node" aria-hidden="true" />
                  {n.place.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function IntroRoute({ route, hrefFor }: { route: Route; hrefFor: HrefFor }) {
  const cat = useCatalogue();
  const to = cat.get(route.to) as Place | undefined;
  const hot = useHot(route.to);
  return (
    <li>
      <Link to={hrefFor(to?.slug ?? null, route.id)} className="atlas-intro-route" onClick={() => sound.play('transition')} {...hot}>
        <RouteSwatch kind={route.kind} />
        <span className="atlas-intro-route-label">{route.label}</span>
        <span className="atlas-intro-route-path">
          {cat.label(route.from)} → {cat.label(route.to)} · {yearsLabel(route.period.from, route.period.to)}
        </span>
      </Link>
    </li>
  );
}

/* ───────────── Unknown slug ───────────── */

export function UnknownPlace({ slug, hrefFor }: { slug: string; hrefFor: HrefFor }) {
  return (
    <div className="atlas-intro">
      <p className="kicker atlas-kicker">World</p>
      <h1 className="atlas-ph-title">Nothing mapped here</h1>
      <p className="atlas-summary">
        There is no place called “{slug}” on the map. It may have been renamed, or it has not been mapped yet.
      </p>
      <div className="atlas-actions">
        <ButtonLink to={hrefFor(null)} variant="primary" icon="globe">
          Back to the whole world
        </ButtonLink>
        <ButtonLink to="/world?view=list" variant="chrome" icon="list">
          Browse every place
        </ButtonLink>
      </div>
    </div>
  );
}

/* ───────────── Place panel ───────────── */

function ConnectionRow({ c, hrefFor }: { c: PlaceConnection; hrefFor: HrefFor }) {
  const cat = useCatalogue();
  const hot = useHot(c.place.id);
  const parent = cat.placeAncestors(c.place.id).find((a) => a.kind === 'country' || a.kind === 'territory' || a.kind === 'state');
  return (
    <li className="atlas-conn" data-kind={c.kind} {...hot}>
      <span className="atlas-conn-vessel" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="40" height="40">
          <circle cx="6" cy="34" r="4" />
          <path d="M6 34 C 10 10, 26 6, 34 6" />
          <circle cx="34" cy="6" r="4" />
        </svg>
      </span>
      <div className="atlas-conn-body">
        <Link to={hrefFor(c.place.slug)} className="atlas-conn-name" onClick={() => sound.play('select')} data-cursor-label={`To ${c.place.name}`}>
          {c.place.name}
          {parent ? <span className="atlas-conn-in"> · {parent.name}</span> : null}
        </Link>
        <ul className="atlas-conn-why" aria-label={`Why ${c.place.name} is connected`}>
          {c.reasons.slice(0, 3).map((r) => (
            <li key={r.via ?? r.label}>{r.label}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function PlacePanel({
  place,
  route,
  routeMissing,
  model,
  hrefFor,
  upClose,
  filters,
  clearLensHref,
}: {
  place: Place;
  route: Route | undefined;
  routeMissing: boolean;
  model: AtlasModel;
  hrefFor: HrefFor;
  upClose: boolean;
  filters: WorldFilters;
  clearLensHref: string;
}) {
  const cat = useCatalogue();
  const [showAll, setShowAll] = useState(false);
  const lensed = narrowsStories(filters);
  const ancestors = useMemo(() => [...cat.placeAncestors(place.id)].reverse(), [cat, place.id]);
  const parent = ancestors[ancestors.length - 1];
  const allStories = useMemo(() => sortStories(cat, cat.videosForPlace(place.id)), [cat, place.id]);
  const matching = useMemo(() => (lensed ? allStories.filter((v) => matchesVideo(cat, v, filters)) : allStories), [cat, allStories, filters, lensed]);
  const stories = lensed && !showAll ? matching : allStories;
  const programmes = useMemo(() => cat.programmesForPlace(place.id), [cat, place.id]);
  const people = useMemo(() => cat.peopleForPlace(place.id), [cat, place.id]);
  const movements = useMemo(() => cat.movementsForPlace(place.id), [cat, place.id]);
  const routes = useMemo(() => [...cat.routesForPlace(place.id)].sort((a, b) => a.period.from - b.period.from), [cat, place.id]);
  const eras = useMemo(() => erasForPlace(cat, place.id), [cat, place.id]);
  // routes have their own cards above, so connected places carry only the other reasons
  const connections = useMemo<PlaceConnection[]>(
    () =>
      placeConnections(cat, place.id, 16)
        .map((c) => {
          const reasons = c.reasons.filter((r) => r.kind !== 'route');
          return { ...c, reasons, kind: reasons[0]?.kind === 'movement' ? ('movement' as const) : ('story' as const) };
        })
        .filter((c) => c.reasons.length)
        .slice(0, 8),
    [cat, place.id],
  );
  const children = useMemo(() => [...cat.placeChildren(place.id)].sort((a, b) => a.name.localeCompare(b.name)), [cat, place.id]);
  const expanding = place.status === 'expanding';
  const signalsHere = { stories: matching.length, connections: routes.length + connections.length };

  const readout: { id: string; n: number; one: string; many: string }[] = [
    { id: 'atlas-sec-stories-h', n: lensed ? matching.length : allStories.length, one: lensed ? 'match' : 'story', many: lensed ? 'matches' : 'stories' },
    { id: 'atlas-sec-eras-h', n: eras.length, one: 'era', many: 'eras' },
    { id: 'atlas-sec-links-h', n: signalsHere.connections, one: 'connection', many: 'connections' },
    { id: 'atlas-sec-movements-h', n: movements.length, one: 'movement', many: 'movements' },
  ];

  return (
    <div className="atlas-place">
      <header className="atlas-ph">
        <nav className="atlas-crumbs" aria-label="Where this is">
          <ol>
            <li>
              <Link to={hrefFor(null)}>World</Link>
            </li>
            {ancestors.map((a) => (
              <li key={a.id}>
                <Link to={hrefFor(a.slug)}>{a.name}</Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="atlas-ph-kick">
          <p className="kicker atlas-kicker">
            {KIND_LABEL[place.kind]}
            {parent ? <span className="atlas-kicker-in"> · {parent.name}</span> : null}
          </p>
          {place.gateway ? <span className="atlas-badge atlas-badge-gateway">Gateway</span> : null}
          {expanding ? <span className="atlas-badge atlas-badge-expanding">Expanding</span> : null}
        </div>
        <h1 className="atlas-ph-title">{place.name}</h1>
        <p className="atlas-coords">
          <span className="sr-only">Coordinates: </span>
          {formatCoords(place.coords)}
        </p>
        <p className="atlas-summary">{place.summary}</p>
        <ul className="atlas-readout" aria-label={`What ${place.name} holds`}>
          {readout.map((r) => (
            <li key={r.id}>
              <button type="button" className="atlas-readout-btn" disabled={!r.n} onClick={() => (sound.play('tick'), jumpTo(r.id))}>
                <span className="atlas-readout-n">{r.n}</span>
                <span className="atlas-readout-l">{r.n === 1 ? r.one : r.many}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="atlas-actions">
          <SaveButton place={place} primary />
          <ButtonLink to={`/passport?stops=${place.slug}`} variant="ghost" icon="passport" data-cursor-label="Passport">
            Start a passport here
          </ButtonLink>
          <ButtonLink to={`/synapse/place/${place.slug}`} variant="ghost" icon="synapse" data-cursor-label="Connections">
            Explore connections
          </ButtonLink>
          {upClose ? (
            <Button variant="quiet" iconAfter="down" onClick={() => jumpTo('atlas-miami')}>
              Miami, up close
            </Button>
          ) : null}
        </div>
      </header>

      {routeMissing ? (
        <p className="notice notice-ember atlas-notice" role="status">
          That route isn’t on the map, so nothing is highlighted.{' '}
          <Link to={hrefFor(place.slug)}>Show {place.name} without it</Link>
        </p>
      ) : null}

      {route ? (
        <section className="atlas-following" aria-labelledby="atlas-sec-following">
          <p className="kicker atlas-kicker">Following a route</p>
          <h2 id="atlas-sec-following" className="sr-only">
            Following {route.label}
          </h2>
          <RouteCard route={route} fromPlace={place} hrefFor={hrefFor} current />
          <Link to={hrefFor(place.slug)} className="atlas-clear">
            <Icon name="close" size={14} /> Clear the route
          </Link>
        </section>
      ) : null}

      <section className="atlas-sec" aria-labelledby="atlas-sec-stories-h">
        <div className="atlas-sec-head">
          <h2 id="atlas-sec-stories-h" className="atlas-sec-title" tabIndex={-1}>
            Stories here
          </h2>
          {allStories.length ? <span className="atlas-sec-count">{lensed && !showAll ? `${matching.length} of ${allStories.length}` : allStories.length}</span> : null}
        </div>
        {lensed && allStories.length ? (
          <p className="atlas-sec-note atlas-lens-note">
            <LensNote filters={filters} />
            {showAll ? 'Showing every story here.' : matching.length ? 'Only stories that match the lens.' : 'None of the stories here match the lens.'}{' '}
            <button type="button" className="atlas-inline-btn" onClick={() => (sound.play('tick'), setShowAll(!showAll))}>
              {showAll ? 'Show matches only' : `Show all ${allStories.length}`}
            </button>
          </p>
        ) : children.length && allStories.length ? (
          <p className="atlas-sec-note">Includes stories set anywhere inside {place.name}.</p>
        ) : null}
        {stories.length ? (
          <>
            <ul className="atlas-pods" onClickCapture={flyOnPodSave}>
              {stories.slice(0, STORY_LIMIT).map((v) => (
                <li key={v.id}>
                  <VideoPod video={v} size="sm" />
                </li>
              ))}
            </ul>
            {stories.length > STORY_LIMIT ? (
              <ButtonLink to={searchHref(cat, lensed && !showAll ? filters : { ...filters, section: null, facet: null, era: null, access: 'all' }, place)} variant="chrome" iconAfter="arrow" className="atlas-more">
                All {plural(stories.length, 'story', 'stories')} in search
              </ButtonLink>
            ) : null}
          </>
        ) : lensed && allStories.length ? (
          <EmptyState icon="filter" title="Nothing here through this lens" actions={<ButtonLink to={clearLensHref}>Clear filters</ButtonLink>}>
            <p>{place.name} has {plural(allStories.length, 'story', 'stories')}, but none match the filters you chose.</p>
          </EmptyState>
        ) : expanding ? (
          <EmptyState icon="globe" tone="plasma" title="No stories here yet" actions={<SaveButton place={place} />}>
            <p>Mapped so the world can grow. Save {place.name} and it will be waiting in My World when stories arrive.</p>
          </EmptyState>
        ) : (
          <EmptyState icon="globe" title="No stories pinned here yet">
            <p>Nothing in the catalogue is set in {place.name} right now. New films join the map as they are added.</p>
          </EmptyState>
        )}
      </section>

      {eras.length ? (
        <Section id="atlas-sec-eras-h" title="Eras present here" note="Stories set then, movements alive and routes travelled. Each opens in the Time Machine.">
          <ul className="atlas-eras">
            {eras.map((e) => (
              <li key={e.period.id}>
                <Link to={`/time-machine/${e.period.slug}`} className="atlas-era" data-active={filters.era === e.period.id || undefined} data-stories={e.stories ? true : undefined} onClick={() => sound.play('transition')} data-cursor-label="Into time">
                  <span className="atlas-era-label">{e.period.label}</span>
                  <span className="atlas-era-meta">{[e.stories ? plural(e.stories, 'story', 'stories') : null, e.movements.length ? plural(e.movements.length, 'movement') : null, e.routes ? plural(e.routes, 'route') : null].filter(Boolean).join(' · ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {routes.length || connections.length ? (
        <Section id="atlas-sec-links-h" kicker="Cultural connections" title={`Where ${place.name} leads`}>
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
          <ul className="atlas-chips">
            {children.map((c) => {
              const n = model.counts.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <ChildChip place={c} n={n} lensed={lensed} hrefFor={hrefFor} />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {programmes.length ? (
        <Section id="atlas-sec-programmes" title="Programmes here">
          <ul className="atlas-rows">
            {programmes.map((p) => (
              <li key={p.id} className="atlas-rowitem">
                <Link to={cat.href(p.id)} className="atlas-rowlink">
                  {p.title}
                </Link>
                <span className="atlas-rowmeta">
                  <span>{PROGRAMME_KIND[p.kind]}</span>
                  {p.original ? <span className="atlas-badge atlas-badge-original">Monumental Original</span> : null}
                  <span className={`badge ${p.status === 'available' ? 'badge-free' : 'badge-planned'}`}>{PROGRAMME_STATUS[p.status]}</span>
                </span>
                <p className="atlas-rownote">{p.statusNote}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {people.length ? (
        <Section id="atlas-sec-people" title="People">
          <ul className="atlas-rows">
            {people.map((p) => (
              <li key={p.id} className="atlas-rowitem">
                <Link to={cat.href(p.id)} className="atlas-rowlink">
                  {p.name}
                </Link>
                <span className="atlas-rowmeta">
                  <span>{p.roles.join(' · ')}</span>
                  {p.provisional ? <span className="badge badge-planned">Provisional profile</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {movements.length ? (
        <Section id="atlas-sec-movements-h" title="Movements">
          <ul className="atlas-rows">
            {movements.map((m) => (
              <li key={m.id} className="atlas-rowitem">
                <Link to={movementHref(cat, m)} className="atlas-rowlink" data-cursor-label="Into time">
                  {m.name}
                </Link>
                <span className="atlas-rowmeta">
                  <span className="atlas-years">{yearsLabel(m.start, m.end)}</span>
                </span>
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

function ChildChip({ place, n, lensed, hrefFor }: { place: Place; n: number; lensed: boolean; hrefFor: HrefFor }) {
  const hot = useHot(place.id);
  return (
    <Link to={hrefFor(place.slug)} className="atlas-chip" data-status={place.status} data-zero={lensed && !n ? true : undefined} onClick={() => sound.play('select')} {...hot}>
      <span className="atlas-chip-node" aria-hidden="true" />
      {place.name}
      <span className="atlas-chip-count">
        <span className="sr-only">, </span>
        {place.status === 'expanding' && !n && !lensed ? 'Expanding' : lensed ? plural(n, 'match', 'matches') : plural(n, 'story', 'stories')}
      </span>
    </Link>
  );
}
