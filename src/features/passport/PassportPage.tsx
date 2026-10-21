/**
 * CULTURE PASSPORT — journeys through places, stamped as you watch.
 *
 * The URL is the journey (/passport?stops=slug,slug&title=…; no stops = the first ready-made
 * journey). A booklet shows the route schematic on the left page and one ink stamp per stop on
 * the right. A stop is stamped when the viewer has a passport stamp for it or for any place
 * inside it (the player stamps every place of a video once 60% has been watched).
 * Ready-made journeys are derived from the catalogue; viewers can build, rename, reorder,
 * save and share their own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { activeJourneys } from '../../../shared/library.ts';
import type { ID, Journey, Place, Video } from '../../../shared/types.ts';
import { jumpTo, useChapters } from '../../app/chapters.ts';
import { FOOTAGE_LABEL, dateLabel, plural, runtimeLabel, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { isTouch } from '../../systems/device.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, IconButton } from '../../ui/controls.tsx';
import { EmptyState, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art, SectionHeader } from '../../ui/Pod.tsx';
import { StudioLoop } from '../somewhere/StudioLoop.tsx';
import {
  MAX_STOPS,
  MAX_TITLE,
  READY_GROUP_LABEL,
  derivedTitle,
  journeyId,
  parsePassport,
  passportSearch,
  placeTrail,
  readyJourneys,
  routeKm,
  sameStops,
  stampCount,
  stampFor,
  storiesFor,
  type ReadyGroup,
  type ReadyJourney,
  type StampInfo,
} from './logic.ts';
import { PlaceCombobox } from './PlaceCombobox.tsx';
import { RouteSchematic } from './RouteSchematic.tsx';
import { SealDefs, Stamp } from './Stamp.tsx';
import './passport.css';

const CHAPTERS = [
  { id: 'pp-booklet', label: 'Passport' },
  { id: 'pp-stops', label: 'Stops' },
  { id: 'pp-journeys', label: 'Ready-made' },
  { id: 'pp-build', label: 'Build' },
  { id: 'pp-saved', label: 'Saved' },
];
const STORIES_PER_STOP = 4;

const shortDate = (at: number) => dateLabel(new Date(at).toISOString());

export default function PassportPage() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const location = useLocation();
  const navigate = useNavigate();
  useChapters(CHAPTERS);

  useEffect(() => {
    document.title = 'Culture Passport · Monumental Streams';
  }, []);

  /* ── The open journey, from the URL ── */
  const ready = useMemo(() => readyJourneys(cat), [cat]);
  const parsed = useMemo(() => parsePassport(new URLSearchParams(location.search), cat), [location.search, cat]);
  const fallback: ReadyJourney | undefined = ready[0];
  const stops = useMemo(() => parsed.stops ?? fallback?.stops ?? [], [parsed.stops, fallback]);
  /** The title the URL (or the default journey) names; null = derived from the stops. */
  const explicitTitle = parsed.title ?? (parsed.stops === null ? (fallback?.title ?? null) : null);
  const title = explicitTitle ?? derivedTitle(cat, stops);
  const places = useMemo(() => stops.map((id) => cat.get(id) as Place | undefined).filter((p): p is Place => !!p), [stops, cat]);

  const saved = useMemo(() => activeJourneys(lib).filter((j) => j.kind === 'passport'), [lib]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (saved.find((j) => j.id === editingId) ?? null) : null;
  const exact = saved.find((j) => sameStops(j.stops, stops) && j.title === title) ?? null;
  const matchedReady = ready.find((r) => sameStops(r.stops, stops) && r.title === title) ?? null;
  const kicker = matchedReady?.kicker ?? (exact || editing ? 'Saved journey' : 'Your journey');

  /* ── Stamps ── */
  const stampMap = useMemo(() => new Map<ID, StampInfo | null>(stops.map((s) => [s, stampFor(cat, lib.stamps, s)])), [cat, lib.stamps, stops]);
  const stampedSet = useMemo(() => new Set(stops.filter((s) => stampMap.get(s))), [stops, stampMap]);
  const complete = stops.length > 0 && stampedSet.size === stops.length;
  const contentKey = journeyId(stops, title);
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (complete && celebrated.current !== contentKey) {
      celebrated.current = contentKey;
      sound.play('stamp');
    }
  }, [complete, contentKey]);
  const totalStamps = Object.keys(lib.stamps).length;

  /* ── Editing (always through the URL) ── */
  const write = (nextStops: ID[], nextTitle: string | null) => navigate({ search: `?${passportSearch(cat, nextStops, nextTitle)}` }, { replace: true });
  const comboRef = useRef<HTMLInputElement>(null);
  const btns = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    if (key === 'combo') return comboRef.current?.focus();
    const [id, dir] = key.split('|');
    const el = btns.current.get(key);
    const alt = btns.current.get(`${id}|${dir === 'up' ? 'down' : 'up'}`);
    (el && !el.disabled ? el : alt && !alt.disabled ? alt : comboRef.current)?.focus();
  }, [stops]);

  const add = (p: Place) => {
    if (stops.includes(p.id)) return toast(`${p.name} is already on this journey`);
    if (stops.length >= MAX_STOPS) return toast(`A journey holds up to ${MAX_STOPS} stops`, { tone: 'error' });
    sound.play('select');
    write([...stops, p.id], explicitTitle);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    pendingFocus.current = `${stops[i]}|${dir < 0 ? 'up' : 'down'}`;
    write(next, explicitTitle);
  };
  const remove = (i: number) => {
    const before = stops;
    const name = cat.label(stops[i]);
    const neighbour = stops[i + 1] ?? stops[i - 1];
    pendingFocus.current = neighbour ? `${neighbour}|remove` : 'combo';
    write(stops.filter((_, k) => k !== i), explicitTitle);
    sound.play('unsave');
    toast(`Removed ${name} from this journey`, { action: { label: 'Undo', run: () => write(before, explicitTitle) } });
  };

  /* ── Title (local draft so the field can be cleared while typing) ── */
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setDraft(title);
  }, [title]);

  /* ── Save / share / open ── */
  const save = (from?: Element | null) => {
    const before = editing;
    const id = before ? before.id : journeyId(stops, title);
    libraryActions.saveJourney({ id, title, kind: 'passport', stops });
    setEditingId(id);
    sound.play('save');
    flyToMyWorld(from ?? null);
    toast(before ? `Saved changes to “${title}”` : `Saved “${title}” to My World`, {
      tone: 'success',
      action: {
        label: 'Undo',
        run: () => (before ? libraryActions.saveJourney({ id: before.id, title: before.title, kind: 'passport', stops: before.stops }) : libraryActions.removeJourney(id)),
      },
    });
  };
  const unsave = (j: Journey) => {
    libraryActions.removeJourney(j.id);
    sound.play('unsave');
    if (editingId === j.id) setEditingId(null);
    toast(`Removed “${j.title}” from saved journeys`, {
      action: { label: 'Undo', run: () => libraryActions.saveJourney({ id: j.id, title: j.title, kind: 'passport', stops: j.stops }) },
    });
  };
  const share = async () => {
    const url = `${window.location.origin}/passport?${passportSearch(cat, stops, title)}`;
    if (isTouch() && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — it opens this journey with its stops in order', { tone: 'success' });
    } catch {
      toast(`Copy this link: ${url}`, { ms: 10000 });
    }
  };
  const openHref = (s: ID[], t: string) => `/passport?${passportSearch(cat, s, t)}`;
  const onOpen = (savedId: string | null) => {
    sound.play('transition');
    setEditingId(savedId);
    requestAnimationFrame(() => jumpTo('pp-booklet'));
  };
  const startBlank = () => {
    setEditingId(null);
    navigate({ search: '?stops=' });
    requestAnimationFrame(() => {
      document.getElementById('pp-build')?.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      comboRef.current?.focus({ preventScroll: true });
    });
  };

  const exclude = useMemo(() => new Set(stops), [stops]);
  const km = routeKm(places);
  const groups = (Object.keys(READY_GROUP_LABEL) as ReadyGroup[]).map((g) => ({ g, list: ready.filter((r) => r.group === g) })).filter((x) => x.list.length);

  const actions = (
    <>
      <Button variant={exact ? 'ghost' : 'primary'} icon={exact ? 'saved' : 'save'} aria-pressed={!!exact} onClick={(e) => (exact ? unsave(exact) : save(e.currentTarget))} data-cursor="save">
        {exact ? 'Saved' : editing ? 'Save changes' : 'Save journey'}
      </Button>
      <Button variant="chrome" icon="share" onClick={share} disabled={!stops.length}>
        Share
      </Button>
    </>
  );

  return (
    <div className="page wrap pp-page">
      <SealDefs />
      <header className="pp-head">
        <div className="pp-head-text">
          <nav className="pp-crumbs" aria-label="Breadcrumb">
            <Link to="/world">World</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Culture Passport</span>
          </nav>
          <p className="kicker">
            Stamped so far · <b>{plural(totalStamps, 'place')}</b>
          </p>
          <h1 className="page-title">
            Culture <em>Passport</em>
          </h1>
          <p className="page-lede">Journeys through places. Watch at least 60% of a story set at a stop and that place is stamped into your passport.</p>
        </div>
        <StudioLoop art="art:culture-passport" caption="Studio loop" className="pp-head-loop" />
      </header>

      {/* ── The booklet ── */}
      <section id="pp-booklet" className="pp-booklet-wrap" aria-labelledby="pp-journey-title">
        <div className="pp-booklet">
          <div className="pp-page pp-page-map">
            <p className="kicker pp-page-kicker">{kicker}</p>
            <h2 id="pp-journey-title" className="pp-journey-title">
              {title}
            </h2>
            <RouteSchematic places={places} stamped={stampedSet} title={title} />
            <p className="pp-map-foot">
              {plural(places.length, 'stop')}
              {places.length > 1 ? ` · about ${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-GB')} km stop to stop` : ''}
            </p>
          </div>
          <div className="pp-spine" aria-hidden="true" />
          <div className="pp-page pp-page-stamps">
            <h3 className="pp-stamps-title">Trail stamps</h3>
            <div className="pp-progress">
              <p className="pp-progress-label" aria-live="polite">
                <span className="pp-progress-n">{stampedSet.size}</span> of {plural(stops.length, 'stamp')}
              </p>
              <div className="pp-progress-track" aria-hidden="true">
                {stops.map((s) => (
                  <span key={s} data-on={stampedSet.has(s) || undefined} />
                ))}
              </div>
            </div>
            {complete ? (
              <div className="pp-complete" role="status">
                <Icon name="passport" size={26} />
                <p>
                  <strong>Journey complete.</strong> Every stop on “{title}” is stamped.
                </p>
              </div>
            ) : null}
            {places.length ? (
              <ol className="pp-stamps">
                {places.map((p, i) => {
                  const st = stampMap.get(p.id) ?? null;
                  const stories = cat.videosForPlace(p.id, true);
                  const status = st ? `Stamped ${shortDate(st.at)}` : stories.some((v) => cat.isPlayable(v)) ? 'Not yet stamped' : stories.length ? 'Stories planned' : 'No stories yet';
                  return <Stamp key={p.id} place={p} index={i} stamp={st} status={status} />;
                })}
              </ol>
            ) : (
              <p className="pp-stamps-empty">No stops yet — add your first one below.</p>
            )}
          </div>
        </div>
        <div className="pp-actions">
          {actions}
          <Button variant="quiet" icon="list" onClick={() => jumpTo('pp-build')}>
            Edit stops
          </Button>
          <Button variant="quiet" icon="plus" onClick={startBlank}>
            New blank journey
          </Button>
        </div>
      </section>

      {/* ── Stops and their stories ── */}
      <section id="pp-stops" className="section" aria-labelledby="pp-stops-title">
        <SectionHeader kicker="Watch to stamp" title="Stops and stories" id="pp-stops-title">
          Stories set at each stop, including places inside it. Stamps are kept in My World on this device, or in your account when signed in.
        </SectionHeader>
        {places.length ? (
          <ol className="pp-stoplist">
            {places.map((p, i) => (
              <StopCard key={p.id} place={p} index={i} stamp={stampMap.get(p.id) ?? null} />
            ))}
          </ol>
        ) : (
          <EmptyState icon="passport" title="This journey has no stops yet" actions={<Button variant="primary" icon="plus" onClick={() => jumpTo('pp-build')}>Add a stop</Button>}>
            <p>Pick places below and their stories will appear here.</p>
          </EmptyState>
        )}
      </section>

      {/* ── Ready-made journeys ── */}
      <section id="pp-journeys" className="section" aria-labelledby="pp-journeys-title">
        <SectionHeader title="Ready-made journeys" id="pp-journeys-title">
          Routes from programmes, the launch gateway, cultural routes and the archive films — each with its stamp progress.
        </SectionHeader>
        {groups.length ? (
          groups.map(({ g, list }) => (
            <div key={g} className="pp-group">
              <h3 className="pp-group-title">{READY_GROUP_LABEL[g]}</h3>
              <ul className="pp-jcards">
                {list.map((r) => {
                  const current = sameStops(r.stops, stops) && r.title === title;
                  const n = stampCount(cat, lib.stamps, r.stops);
                  const cover = journeyCover(cat, r);
                  return (
                    <li key={r.key} className="pp-jcard" data-current={current || undefined}>
                      <div className="pp-jcard-art" aria-hidden="true">
                        {cover ? <Art art={cover} alt="" /> : null}
                        <span className="pp-jcard-count" data-done={(n > 0 && n === r.stops.length) || undefined}>
                          {n} of {plural(r.stops.length, 'stamp')}
                        </span>
                      </div>
                      <p className="pp-jcard-meta">{r.kicker}</p>
                      <h4 className="pp-jcard-title">{r.title}</h4>
                      <p className="pp-jcard-path">{pathLabel(cat.label, r.stops)}</p>
                      <p className="pp-jcard-sum">{r.summary}</p>
                      {r.note ? (
                        <p className="pp-jcard-note">
                          <Icon name="info" size={14} />
                          <span>{r.note}</span>
                        </p>
                      ) : null}
                      <div className="pp-jcard-foot">
                        <span className="sr-only">
                          {n} of {plural(r.stops.length, 'stamp')}
                        </span>
                        {current ? (
                          <span className="badge badge-free" aria-current="true">
                            In your passport
                          </span>
                        ) : (
                          <ButtonLink to={openHref(r.stops, r.title)} size="sm" variant="chrome" iconAfter="arrow" onClick={() => onOpen(null)}>
                            Open journey
                          </ButtonLink>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <EmptyState icon="map" title="No ready-made journeys yet">
            <p>They appear here as programmes, routes and archive films are added to the catalogue.</p>
          </EmptyState>
        )}
      </section>

      {/* ── Build your own ── */}
      <section id="pp-build" className="section" aria-labelledby="pp-build-title">
        <SectionHeader kicker="Edit this journey" title="Build your own" id="pp-build-title">
          Changes redraw the passport above and update its link straight away.
        </SectionHeader>
        <div className="pp-build">
          <div className="pp-build-form panel panel-pad">
            <div className="field">
              <label htmlFor="pp-title-input">Journey title</label>
              <input
                ref={titleRef}
                id="pp-title-input"
                className="input"
                type="text"
                maxLength={MAX_TITLE}
                value={draft}
                data-native-cursor=""
                onChange={(e) => {
                  setDraft(e.target.value);
                  const t = e.target.value.trim();
                  if (t) write(stops, t);
                }}
                onBlur={() => setDraft(title)}
              />
            </div>
            <PlaceCombobox
              ref={comboRef}
              exclude={exclude}
              onPick={add}
              disabled={stops.length >= MAX_STOPS}
              hint={stops.length >= MAX_STOPS ? `This journey is full (${MAX_STOPS} stops).` : `${stops.length} of ${MAX_STOPS} stops used.`}
            />
            <div className="pp-build-actions">{actions}</div>
          </div>
          <div className="pp-build-list">
            <h3 className="pp-build-sub" id="pp-order-title">
              Stops in order
            </h3>
            {places.length ? (
              <ol className="pp-edit" aria-labelledby="pp-order-title">
                {places.map((p, i) => (
                  <li key={p.id} className="pp-edit-row">
                    <span className="pp-edit-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="pp-edit-name">
                      <strong>{p.name}</strong>
                      <small>{placeTrail(cat, p)}</small>
                    </span>
                    <span className="pp-edit-btns">
                      <IconButton ref={(el) => void btns.current.set(`${p.id}|up`, el)} icon="up" size="sm" label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                      <IconButton ref={(el) => void btns.current.set(`${p.id}|down`, el)} icon="down" size="sm" label={`Move ${p.name} down`} disabled={i === places.length - 1} onClick={() => move(i, 1)} />
                      <IconButton ref={(el) => void btns.current.set(`${p.id}|remove`, el)} icon="close" size="sm" label={`Remove ${p.name}`} onClick={() => remove(i)} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon="passport" title="No stops yet">
                <p>Search for a place to start this journey.</p>
              </EmptyState>
            )}
            <p className="sr-only" aria-live="polite">
              {plural(stops.length, 'stop')} on this journey
            </p>
          </div>
        </div>
      </section>

      {/* ── Saved journeys ── */}
      <section id="pp-saved" className="section" aria-labelledby="pp-saved-title">
        <SectionHeader kicker="My World" title="Saved journeys" id="pp-saved-title" />
        {saved.length ? (
          <ul className="pp-saved-list">
            {saved.map((j) => {
              const n = stampCount(cat, lib.stamps, j.stops);
              const current = sameStops(j.stops, stops) && j.title === title;
              return (
                <li key={j.id} className="pp-saved" data-current={current || undefined}>
                  <div className="pp-saved-text">
                    <h3 className="pp-saved-title">{j.title}</h3>
                    <p className="pp-saved-meta">
                      {plural(j.stops.length, 'stop')} · {n} stamped · saved {shortDate(j.at)}
                    </p>
                  </div>
                  <div className="pp-saved-act">
                    {current ? (
                      <span className="badge badge-free">Open</span>
                    ) : (
                      <ButtonLink to={openHref(j.stops, j.title)} size="sm" variant="chrome" onClick={() => onOpen(j.id)}>
                        Open
                      </ButtonLink>
                    )}
                    <IconButton icon="trash" size="sm" label={`Remove saved journey ${j.title}`} onClick={() => unsave(j)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="save" title="No saved journeys yet">
            <p>Save any journey above to keep it — and its stamp progress — in My World.</p>
          </EmptyState>
        )}
      </section>
    </div>
  );
}

function pathLabel(label: (id: ID) => string, stops: ID[]): string {
  const names = stops.map(label);
  return names.length > 5 ? `${names.slice(0, 4).join(' → ')} → … +${names.length - 4} more` : names.join(' → ');
}

/** The image a ready-made journey leads with: its programme's art, else the first story set along the route. */
function journeyCover(cat: ReturnType<typeof useCatalogue>, r: ReadyJourney): ID | undefined {
  const programme = r.group === 'programme' ? cat.programmes.find((p) => `programme-${p.slug}` === r.key) : undefined;
  if (programme?.art) return programme.art;
  for (const stop of r.stops) {
    const story = storiesFor(cat, stop)[0];
    if (story?.art) return story.art;
  }
  return undefined;
}

/* ───────────── One stop with its stories ───────────── */

function StopCard({ place, index, stamp }: { place: Place; index: number; stamp: StampInfo | null }) {
  const cat = useCatalogue();
  const stories = useMemo(() => storiesFor(cat, place.id), [cat, place.id]);
  const playable = stories.filter((v) => cat.isPlayable(v));
  const via = stamp && stamp.place !== place.id ? cat.label(stamp.place) : null;
  const status = stamp
    ? `Stamped ${shortDate(stamp.at)}${via ? ` via ${via}` : ''}`
    : playable.length
      ? 'Watch a story here to stamp'
      : stories.length
        ? 'Stories planned — nothing to watch yet'
        : 'No stories yet';

  return (
    <li className="pp-stop" data-on={stamp ? '' : undefined}>
      <header className="pp-stop-head">
        <span className="pp-stop-num" aria-hidden="true">
          {index + 1}
        </span>
        <div className="pp-stop-id">
          <h3 className="pp-stop-name">
            <span className="sr-only">Stop {index + 1}: </span>
            <Link to={cat.href(place.id)}>{place.name}</Link>
          </h3>
          <p className="pp-stop-trail">{placeTrail(cat, place)}</p>
        </div>
        <p className="pp-stop-status" data-on={stamp ? '' : undefined}>
          {stamp ? <Icon name="check" size={14} /> : null}
          {status}
        </p>
      </header>
      {stories.length ? (
        <ul className="pp-stories">
          {stories.slice(0, STORIES_PER_STOP).map((v) => (
            <StoryRow key={v.id} video={v} stampedBy={stamp?.video === v.id} stopStamped={!!stamp} />
          ))}
        </ul>
      ) : (
        <p className="pp-stop-empty">
          {place.status === 'expanding' ? 'This place is mapped so the World can grow; no stories are set here yet.' : 'No stories are set here yet.'}
        </p>
      )}
      {stories.length > STORIES_PER_STOP ? (
        <Link className="pp-stop-more" to={cat.href(place.id)}>
          All {stories.length} stories in {place.name} <Icon name="arrow" size={14} />
        </Link>
      ) : null}
    </li>
  );
}

function StoryRow({ video, stampedBy, stopStamped }: { video: Video; stampedBy: boolean; stopStamped: boolean }) {
  const cat = useCatalogue();
  const href = cat.href(video.id);
  const runtime = cat.runtime(video);
  const playable = cat.isPlayable(video);
  const meta = [runtime ? runtimeLabel(runtime) : null, settingLabel(video), video.footage[0] ? FOOTAGE_LABEL[video.footage[0]] : null].filter(Boolean).join(' · ');
  const verb = stopStamped ? 'Watch' : 'Watch to stamp';
  return (
    <li className="pp-story">
      <Link to={href} className="pp-story-art" tabIndex={-1} aria-hidden="true" data-cursor={playable ? 'play' : 'open'} data-cursor-label={playable ? 'Watch' : 'Details'}>
        <Art art={video.art} alt="" />
      </Link>
      <div className="pp-story-body">
        <Link to={href} className="pp-story-title">
          {video.title}
        </Link>
        <p className="pp-story-meta">{meta}</p>
        <p className="pp-story-badges">
          <AccessBadge video={video} />
          {stampedBy ? (
            <span className="pp-story-stamped">
              <Icon name="check" size={13} /> Stamped this stop
            </span>
          ) : null}
        </p>
      </div>
      {playable && !stampedBy ? (
        <ButtonLink to={href} size="sm" variant={stopStamped ? 'quiet' : 'chrome'} icon="play" className="pp-story-go" aria-label={`${verb}: ${video.title}`} data-cursor="play" data-cursor-label="Watch">
          {verb}
        </ButtonLink>
      ) : null}
    </li>
  );
}
