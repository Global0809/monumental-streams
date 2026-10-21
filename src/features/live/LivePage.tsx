/**
 * LIVE — honest, and an editorial layer over the Live chamber in the living world: the Live
 * organ sits there dormant (signal red only as an outline), because nothing streams live on
 * Monumental yet. The page says so first, plainly. Everything below is real and labelled by
 * where it comes from:
 *
 *   · Happening now / notes — maintained activity (GET /api/activity), only while in date.
 *   · The schedule — dated availability windows from the catalogue plus dated activity.
 *   · Recently published — publication dates, explicitly "published, not live".
 *   · On the horizon — programmes that exist only as announcements (no dates).
 *   · What Live will carry — the integration status the server reports (GET /api/config).
 *
 * The world answers: pointing at a dated story or a publication lights its seed; the section
 * filter on "recently published" leaves only those seeds alight. Modules render only when
 * they hold real data.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { categorySections, type Section } from '../../../shared/sections.ts';
import type { ActivityItem, ExternalAvailability, ID, Programme, Video } from '../../../shared/types.ts';
import { useChapters, jumpTo } from '../../app/chapters.ts';
import { api } from '../../lib/api.ts';
import { plural, runtimeLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { refreshSession, useSession } from '../../state/session.ts';
import { setHighlight, useArrangement } from '../../stage/store.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { Pulse } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, VideoPod } from '../../ui/Pod.tsx';
import { announceSave } from '../../ui/save.ts';
import { seedPointer, useWorldEcho, useWorldLit } from '../category/world.ts';
import {
  bucketActivity,
  buildSchedule,
  dayParts,
  daysUntil,
  feedStatus,
  inSection,
  publicationDays,
  publishedAgo,
  recentlyPublished,
  SCHEDULE_WORD,
  sectionFacets,
  untilLabel,
  type ScheduleEntry,
} from './model.ts';
import './live.css';

type Feed = { phase: 'loading' | 'ready' | 'error'; items: ActivityItem[]; external: ExternalAvailability[] };

const RECENT_PAGE = 8;

/** The wall clock, refreshed every 30 s (the page talks about "now"). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function useActivity(): [Feed, () => void] {
  const [feed, setFeed] = useState<Feed>({ phase: 'loading', items: [], external: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setFeed((f) => ({ ...f, phase: 'loading' }));
    api<{ items?: ActivityItem[]; external?: ExternalAvailability[] }>('/api/activity', { signal: ctl.signal })
      .then((r) => setFeed({ phase: 'ready', items: r.items ?? [], external: r.external ?? [] }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setFeed({ phase: 'error', items: [], external: [] });
      });
    return () => ctl.abort();
  }, [attempt]);
  return [feed, useCallback(() => setAttempt((n) => n + 1), [])];
}

export default function LivePage() {
  const cat = useCatalogue();
  const { session, config, status } = useSession();
  const now = useNow();
  const [feed, retryFeed] = useActivity();
  const [params, setParams] = useSearchParams();
  const [showAll, setShowAll] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Live · Monumental Streams';
  }, []);

  // Day-level values only change when the day does; keep memo keys stable within it.
  const dayKey = now.toISOString().slice(0, 13);
  const buckets = useMemo(() => bucketActivity(feed.items, now), [feed.items, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const schedule = useMemo(() => buildSchedule(cat.videos, feed.items, now), [cat, feed.items, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentlyPublished(cat.videos, now), [cat, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => publicationDays(recent), [recent]);
  const sections = useMemo(() => categorySections(), []);
  const facets = useMemo(() => sectionFacets(recent, sections), [recent, sections]);
  const announced = useMemo(() => cat.programmes.filter((p) => p.status !== 'available' && !p.parent), [cat]);
  const wiring = feedStatus(config);

  const inParam = params.get('in');
  const filter = facets.find((f) => f.section.id === inParam)?.section ?? null;
  const filtered = useMemo(() => (filter ? recent.filter((v) => inSection(v, filter)) : recent), [filter, recent]);
  const visible = showAll ? filtered : filtered.slice(0, RECENT_PAGE);

  /* ── the world: the Live chamber, its organ dormant; a section filter leaves only its seeds alight ── */
  useArrangement({ kind: 'category', section: 'live' });
  const highlightKey = filter ? filter.id : '*';
  useEffect(() => {
    setHighlight(filter ? filtered.map((v) => v.id) : null);
    // keyed by the filter (the list only changes with the day)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, filtered.length]);
  useWorldEcho(root);

  const setFilter = (s: Section | null) => {
    setShowAll(false);
    sound.play(s ? 'select' : 'unsave');
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (s) n.set('in', s.id);
        else n.delete('in');
        return n;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const premium = session.membership.premium;
  const newest = recent.find((v) => {
    const a = cat.effectiveAccess(v, now);
    return a === 'free' || (a === 'premium' && premium);
  });

  const chapters = useMemo(
    () => [
      { id: 'live-top', label: 'Now' },
      ...(buckets.now.length || buckets.notices.length ? [{ id: 'live-now', label: 'Happening now' }] : []),
      { id: 'live-schedule', label: 'Schedule' },
      { id: 'live-recent', label: 'Recently published' },
      ...(announced.length ? [{ id: 'live-announced', label: 'On the horizon' }] : []),
      { id: 'live-wiring', label: 'When connected' },
    ],
    [buckets.now.length, buckets.notices.length, announced.length],
  );
  useChapters(chapters);

  const clock = now.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const next = schedule[0];
  const latest = days[0];

  return (
    <div className="live" ref={root}>
      {/* ───────────── The statement ───────────── */}
      <section id="live-top" className="live-hero" aria-labelledby="live-title">
        <div className="wrap live-hero-inner">
          <p className="eyebrow live-eyebrow">
            <span className="live-dot" aria-hidden="true" />
            <span>Live</span>
            <span aria-hidden="true">·</span>
            <time dateTime={now.toISOString()}>{clock}</time>
          </p>
          <h1 id="live-title" className="title-monument live-title">
            Nothing is <em>live</em> right now.
          </h1>
          <div className="live-hero-open" aria-hidden="true" />
          <div className="live-hero-foot">
            <p className="lede live-lede">
              Broadcasts, premieres and events appear here only when they are real and dated.{' '}
              <span className="live-lede-more">
                No live source is connected yet, so this is what is actually changing on Monumental
                {buckets.now.length ? `, including ${plural(buckets.now.length, 'maintained event')} today` : ''}.
              </span>
            </p>
            <div className="live-actions">
              {newest ? (
                <ButtonLink to={cat.href(newest.id)} variant="primary" size="lg" icon="play" className="live-cta" {...seedPointer(newest.id)}>
                  Watch the newest story
                </ButtonLink>
              ) : null}
              <a
                href="#live-schedule"
                className="btn btn-quiet btn-lg live-cta"
                onClick={(e) => {
                  e.preventDefault();
                  sound.play('transition');
                  jumpTo('live-schedule');
                }}
              >
                <Icon name="time" size={20} />
                <span>See the schedule</span>
              </a>
            </div>
            {newest ? (
              <p className="live-newest">
                Newest: <b>{newest.title}</b>, published {dayParts(newest.published).long} — not live.
              </p>
            ) : null}
  
            <dl className="live-glance" aria-label="Live at a glance">
              <div className="is-off">
                <dt>Live broadcasts</dt>
                <dd>
                  <b>None</b> {wiring.broadcasts.connected ? 'Source connected · nothing on air' : 'No live source connected'}
                </dd>
              </div>
              <div>
                <dt>Dated changes ahead</dt>
                <dd>
                  <b>{feed.phase === 'loading' && !schedule.length ? '…' : schedule.length}</b> {next ? `Next ${dayParts(next.date).long}` : 'Nothing dated yet'}
                </dd>
              </div>
              <div>
                <dt>Latest publication</dt>
                <dd>
                  <b>{latest ? `${dayParts(latest.date).day} ${dayParts(latest.date).month}` : '—'}</b>{' '}
                  {latest ? `${plural(latest.count, 'story', 'stories')} that day, not live` : 'Nothing published yet'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="live-body">
        {/* ───────────── Happening now (maintained, only when present) ───────────── */}
        {buckets.now.length || buckets.notices.length ? (
          <section id="live-now" className="live-section" aria-labelledby="live-now-h">
            <div className="wrap">
              <LiveHead id="live-now-h" kicker="Maintained listings · not broadcasts" title={<>Happening now</>}>
                Events and notes kept by the Monumental team, shown while they are in date. They are listings, not streams.
              </LiveHead>
              <ul className="live-rows">
                {[...buckets.now, ...buckets.notices].map((a) => (
                  <ActivityRow key={a.id} item={a} />
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── The schedule ───────────── */}
        <section id="live-schedule" className="live-section" aria-labelledby="live-schedule-h">
          <div className="wrap">
            <LiveHead id="live-schedule-h" kicker="Real dates only" title={<>On the schedule</>}>
              Release windows from the catalogue and dated events from the maintained listings. Days are counted from today — no invented countdowns.
            </LiveHead>
            {feed.phase === 'error' ? (
              <p className="notice live-notice">
                <Icon name="info" size={18} />
                <span>
                  The maintained listings couldn’t be loaded, so only catalogue dates are shown.{' '}
                  <button type="button" className="live-inline-btn" onClick={retryFeed}>
                    Try again
                  </button>
                </span>
              </p>
            ) : null}
            {schedule.length ? (
              <ol className="live-rows live-windows">
                {schedule.map((e) => (
                  <WindowRow key={e.key} entry={e} now={now} />
                ))}
              </ol>
            ) : feed.phase === 'loading' ? (
              <Pulse label="Reading the schedule" />
            ) : (
              <p className="live-empty">
                <b>Nothing is scheduled.</b> When a release window or an event has a real date, it appears here.
              </p>
            )}
          </div>
        </section>

        {/* ───────────── Recently published ───────────── */}
        <section id="live-recent" className="live-section" aria-labelledby="live-recent-h">
          <div className="wrap">
            <LiveHead id="live-recent-h" kicker="Published, not live" title={<>Recently published</>}>
              The newest additions to Monumental, by the date they were published here.
            </LiveHead>
            {facets.length > 1 ? (
              <div className="live-filter" role="group" aria-label="Show recently published from">
                <button type="button" className="live-facet" aria-pressed={!filter} onClick={() => setFilter(null)}>
                  <span>Everything</span> <span className="live-facet-n">{recent.length}</span>
                </button>
                {facets.map((f) => {
                  const on = filter?.id === f.section.id;
                  return (
                    <button key={f.section.id} type="button" className="live-facet" data-hue={f.section.id} aria-pressed={on} onClick={() => setFilter(on ? null : f.section)}>
                      <span>{f.section.label}</span> <span className="live-facet-n">{f.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="live-filter-state" role="status" aria-live="polite">
              {filter ? `${plural(filtered.length, 'story', 'stories')} in ${filter.label}, newest first` : `${plural(recent.length, 'story', 'stories')}, newest first`}
            </p>
            {visible.length ? (
              <ul className="live-recent">
                {visible.map((v, i) => (
                  <li key={v.id}>
                    <VideoPod video={v} priority={i < 2} footer={<PublishedLine video={v} now={now} />} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="live-empty">
                <b>Nothing published yet.</b> New stories appear here the day they are published.
              </p>
            )}
            {filtered.length > RECENT_PAGE ? (
              <div className="live-more">
                <Button variant="chrome" icon={showAll ? 'up' : 'down'} onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                  {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                </Button>
                <ButtonLink to="/catalogue?sort=newest" variant="quiet" iconAfter="arrow">
                  Open in search
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </section>

        {/* ───────────── Announced, not dated ───────────── */}
        {announced.length ? (
          <section id="live-announced" className="live-section" aria-labelledby="live-announced-h">
            <div className="wrap">
              <LiveHead id="live-announced-h" kicker="No dates announced" title={<>On the horizon</>}>
                Programmes that exist as announcements only. None has a date yet, so none sits on the schedule.
              </LiveHead>
              <ul className="live-horizon">
                {announced.map((p) => (
                  <HorizonItem key={p.id} programme={p} />
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ───────────── What Live will carry ───────────── */}
        <section id="live-wiring" className="live-section" aria-labelledby="live-wiring-h">
          <div className="wrap">
            <LiveHead id="live-wiring-h" kicker="Reported by the server" title={<>What Live will carry</>}>
              Four kinds of signal, and what is connected today as the server reports it.
            </LiveHead>
            {!config && status === 'offline' ? (
              <p className="notice live-notice">
                <Icon name="info" size={18} />
                <span>
                  The server couldn’t be reached, so connection status is unknown.{' '}
                  <button type="button" className="live-inline-btn" onClick={() => void refreshSession()}>
                    Try again
                  </button>
                </span>
              </p>
            ) : null}
            <ol className="live-wiring">
              <Wire
                state={wiring.broadcasts.connected ? 'on' : 'off'}
                title="Live broadcasts and premieres"
                word={wiring.broadcasts.connected ? 'Connected' : 'Not connected'}
                detail={wiring.broadcasts.detail}
                promise="When a live source is connected, streams appear at the top of this page with a clear live marker and their start time."
              />
              <Wire
                state={wiring.activity ? (wiring.activity.connected ? 'on' : 'partial') : 'unknown'}
                title="Events and releases"
                word={wiring.activity ? (wiring.activity.connected ? 'Connected' : 'Maintained file only') : 'Checking…'}
                detail={wiring.activity?.detail ?? 'Waiting for the server to report.'}
                promise={`Maintained listings appear under “Happening now” and on the schedule while they are in date (${plural(feed.items.length, 'listing')} in date right now).`}
              />
              <Wire
                state="on"
                title="Release windows"
                word="Working now"
                detail={`Read from catalogue availability dates · ${plural(schedule.filter((e) => e.video).length, 'dated window')} ahead.`}
                promise="Early-access items opening to everyone and dated premieres join the schedule automatically."
              />
              <Wire
                state="on"
                title="New on Monumental"
                word="Working now"
                detail={`Read from publication dates · ${plural(recent.length, 'story', 'stories')} published.`}
                promise="Every new story appears in “Recently published” the day it goes up, labelled as published, not live."
              />
            </ol>
            <p className="live-foot">
              Full integration details live on the <Link to="/about#about-integrations">About page</Link>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ───────────── Pieces ───────────── */

function LiveHead({ id, kicker, title, children }: { id: string; kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="live-head">
      <p className="eyebrow">{kicker}</p>
      <h2 id={id} className="live-h2">
        {title}
      </h2>
      {children ? <p className="live-sub">{children}</p> : null}
    </header>
  );
}

function PublishedLine({ video, now }: { video: Video; now: Date }) {
  const ago = publishedAgo(video.published, now);
  return (
    <p className="live-pub">
      Published <time dateTime={video.published}>{dayParts(video.published).long}</time>
      {ago ? ` · ${ago.toLowerCase()}` : ''}
    </p>
  );
}

function SaveToggle({ video }: { video: Video }) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const on = libraryActions.toggleSave(video.id);
    announceSave({ saved: on, title: video.title, from: e.currentTarget, id: video.id, undo: () => libraryActions.toggleSave(video.id), message: on ? undefined : `Removed “${video.title}” from My World` });
  };
  return (
    <button
      type="button"
      className="btn btn-quiet btn-md live-save"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${video.title} from My World` : `Save ${video.title} to My World`}
      data-cursor="save"
      data-cursor-label={saved ? 'Saved' : 'Save to My World'}
      onClick={toggle}
    >
      <Icon name={saved ? 'saved' : 'save'} size={18} />
      <span aria-hidden="true">{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}

/** A dated change on the schedule; pointing at it lights its story's seed. */
function WindowRow({ entry, now }: { entry: ScheduleEntry; now: Date }) {
  const cat = useCatalogue();
  const { session } = useSession();
  const d = dayParts(entry.date);
  const days = daysUntil(entry.date, now);
  const v = entry.video;
  const lit = useWorldLit(v?.id);
  const href = v ? cat.href(v.id) : null;
  const access = v ? cat.effectiveAccess(v, now) : null;
  const canWatch = !!v && (access === 'free' || (access === 'premium' && session.membership.premium));
  const runtime = v ? cat.runtime(v) : null;
  const viewer = v
    ? entry.kind === 'opens-to-everyone'
      ? session.membership.premium
        ? 'Your Premium membership already unlocks it.'
        : `You can watch it free from ${d.long}.`
      : 'Nobody can watch it before this date.'
    : null;
  const ext = entry.activity?.url && /^https?:\/\//.test(entry.activity.url) ? entry.activity.url : null;
  const pointer = v ? seedPointer(v.id) : {};

  return (
    <li className={`live-row live-window is-${entry.kind}`} data-world-lit={lit || undefined} {...pointer}>
      <p className="live-date" aria-hidden="true">
        <span className="live-date-d">{d.day}</span>
        <span className="live-date-m">
          {d.month} {d.year}
        </span>
      </p>
      <div className="live-row-body">
        <p className="live-row-kind">
          <span className="live-kind-word">{SCHEDULE_WORD[entry.kind]}</span>
          <time dateTime={entry.date}>
            {d.weekday} {d.long}
          </time>
          <span className="live-until">{untilLabel(days)}</span>
        </p>
        <h3 className="live-row-title live-window-title">
          {href ? (
            <Link to={href} onClick={() => sound.play('transition')}>
              {entry.title}
            </Link>
          ) : ext ? (
            <a href={ext} target="_blank" rel="noopener noreferrer">
              {entry.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            entry.title
          )}
        </h3>
        <p className="live-row-what">{entry.what}</p>
        {viewer ? <p className="live-row-viewer">{viewer}</p> : null}
        <p className="live-source">
          Source: {entry.source}
          {v?.availability.note ? ` — ${v.availability.note}` : ''}
          {entry.activity ? ` · verified ${dayParts(entry.activity.verifiedAt).long}` : ''}
        </p>
        {v && href ? (
          <div className="live-row-actions">
            <ButtonLink to={href} variant="chrome" icon={canWatch ? 'play' : 'arrow'}>
              {canWatch ? 'Watch now' : 'See details'}
            </ButtonLink>
            <SaveToggle video={v} />
          </div>
        ) : null}
      </div>
      {v ? (
        <Link to={href!} className="live-row-art" tabIndex={-1} aria-hidden="true" data-cursor={canWatch ? 'play' : 'open'} data-cursor-label={canWatch ? 'Watch' : 'Details'}>
          <Art art={v.art} alt="" />
          {runtime ? <span className="live-row-runtime timecode">{runtimeLabel(runtime)}</span> : null}
        </Link>
      ) : null}
    </li>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const cat = useCatalogue();
  const place = item.place && cat.get(item.place) ? item.place : null;
  const url = item.url && /^https?:\/\//.test(item.url) ? item.url : null;
  const start = item.starts ? dayParts(item.starts) : null;
  return (
    <li className={`live-row live-act is-${item.kind}`}>
      <p className="live-date" aria-hidden="true">
        {start ? (
          <>
            <span className="live-date-d">{start.day}</span>
            <span className="live-date-m">
              {start.month} {start.year}
            </span>
          </>
        ) : (
          <span className="live-date-m">Note</span>
        )}
      </p>
      <div className="live-row-body">
        <p className="live-row-kind">
          <span className="live-kind-word">{item.starts ? (item.kind === 'event' ? 'On today' : 'Out now') : 'Note'}</span>
          {item.starts ? (
            <time dateTime={item.starts}>
              {dayParts(item.starts).long}
              {item.ends && item.ends !== item.starts ? ` – ${dayParts(item.ends).long}` : ''}
            </time>
          ) : null}
          {place ? <Link to={cat.href(place)}>{cat.label(place)}</Link> : null}
        </p>
        <h3 className="live-row-title">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              {item.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            item.title
          )}
        </h3>
        <p className="live-row-what">{item.summary}</p>
        <p className="live-source">
          Source: {item.source} · verified {dayParts(item.verifiedAt).long}
          {item.ends ? ` · listed until ${dayParts(item.ends).long}` : ''}
        </p>
      </div>
    </li>
  );
}

const PROGRAMME_WORD: Record<Programme['status'], string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

function HorizonItem({ programme: p }: { programme: Programme }) {
  const cat = useCatalogue();
  // an announced programme may already have a planned story: pointing at it lights that seed
  const first = useMemo<ID | undefined>(() => cat.videosForProgramme(p.id)[0]?.id, [cat, p.id]);
  const lit = useWorldLit(first);
  return (
    <li className="live-hz" data-world-lit={lit || undefined} {...(first ? seedPointer(first) : {})}>
      <Link to={cat.href(p.id)} className="live-hz-art" tabIndex={-1} aria-hidden="true">
        <Art art={p.art} alt="" />
      </Link>
      <div className="live-hz-body">
        <p className="live-hz-status">{PROGRAMME_WORD[p.status]} · no date</p>
        <h3 className="live-hz-title">
          <Link to={cat.href(p.id)} onClick={() => sound.play('transition')}>
            {p.title}
          </Link>
        </h3>
        {p.statusNote ? <p className="live-hz-note">{p.statusNote}</p> : null}
      </div>
    </li>
  );
}

function Wire({ state, title, word, detail, promise }: { state: 'on' | 'off' | 'partial' | 'unknown'; title: string; word: string; detail: string; promise: string }) {
  return (
    <li className={`live-wire is-${state}`}>
      <span className="live-wire-node" aria-hidden="true" />
      <div className="live-wire-body">
        <div className="live-wire-row">
          <h3 className="live-wire-title">{title}</h3>
          <span className="live-wire-word">{word}</span>
        </div>
        <p className="live-wire-detail">{detail}</p>
        <p className="live-wire-promise">{promise}</p>
      </div>
    </li>
  );
}
