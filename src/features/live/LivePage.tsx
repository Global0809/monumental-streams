/**
 * LIVE — honest and still alive. Nothing streams live on Monumental yet, and the page says so
 * first, plainly. Everything below is real and labelled by source:
 *
 *   · Happening now / notes — maintained activity (GET /api/activity), only while in date.
 *   · The schedule — dated availability windows from the catalogue plus dated activity.
 *   · Recently published — publication dates, explicitly "published, not live".
 *   · Announced, not dated — programmes that exist only as announcements.
 *   · What Live will carry — the integration status the server reports (GET /api/config).
 *
 * Modules render only when they hold real data; the orbit and the readouts are computed from
 * the same lists, so they can never disagree with them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { categorySections, type Section } from '../../../shared/sections.ts';
import type { ActivityItem, ExternalAvailability, Programme, Video } from '../../../shared/types.ts';
import { useChapters, jumpTo } from '../../app/chapters.ts';
import { api } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { refreshSession, useSession } from '../../state/session.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Chip } from '../../ui/controls.tsx';
import { Pulse, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, VideoPod } from '../../ui/Pod.tsx';
import {
  bucketActivity,
  buildSchedule,
  dayParts,
  daysUntil,
  feedStatus,
  inSection,
  orbitHorizon,
  publicationDays,
  publishedAgo,
  recentlyPublished,
  SCHEDULE_WORD,
  sectionFacets,
  untilLabel,
  type ScheduleEntry,
} from './model.ts';
import { SignalOrbit } from './SignalOrbit.tsx';
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

const slugOf = (key: string) => `live-w-${key.replace(/[^a-z0-9]+/gi, '-')}`;

export default function LivePage() {
  const cat = useCatalogue();
  const { session, config, status } = useSession();
  const now = useNow();
  const [feed, retryFeed] = useActivity();
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    document.title = 'Live · Monumental Streams';
  }, []);

  // Day-level values only change when the day does; keep memo keys stable within it.
  const dayKey = now.toISOString().slice(0, 13);
  const buckets = useMemo(() => bucketActivity(feed.items, now), [feed.items, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const schedule = useMemo(() => buildSchedule(cat.videos, feed.items, now), [cat, feed.items, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const horizon = useMemo(() => orbitHorizon(schedule, now), [schedule, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentlyPublished(cat.videos, now), [cat, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => publicationDays(recent), [recent]);
  const sections = useMemo(() => categorySections(), []);
  const facets = useMemo(() => sectionFacets(recent, sections), [recent, sections]);
  const announced = useMemo(() => cat.programmes.filter((p) => p.status !== 'available' && !p.parent), [cat]);
  const status_ = feedStatus(config);

  const inParam = params.get('in');
  const filter = facets.find((f) => f.section.id === inParam)?.section ?? null;
  const filtered = filter ? recent.filter((v) => inSection(v, filter)) : recent;
  const visible = showAll ? filtered : filtered.slice(0, RECENT_PAGE);

  const setFilter = (s: Section | null) => {
    setShowAll(false);
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
      ...(announced.length ? [{ id: 'live-announced', label: 'Announced' }] : []),
      { id: 'live-wiring', label: 'When connected' },
    ],
    [buckets.now.length, buckets.notices.length, announced.length],
  );
  useChapters(chapters);

  const pick = (key: string) => {
    const el = document.getElementById(slugOf(key));
    if (!el) return;
    sound.play('transition');
    el.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('h3 a, h3')?.focus({ preventScroll: true });
    setActive(key);
  };

  const clock = now.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const next = schedule[0];
  const orbitLabel = schedule.length
    ? `The next ${horizon} days: ${schedule.map((e) => `${e.title}, ${SCHEDULE_WORD[e.kind].toLowerCase()} on ${dayParts(e.date).long}`).join('; ')}. No live signal.`
    : `The next ${horizon} days: nothing dated yet. No live signal.`;

  return (
    <div className="page live">
      {/* ───────────── The statement ───────────── */}
      <header id="live-top" className="live-hero">
        <div className="wrap live-hero-grid">
          <div className="live-hero-statement">
            <p className="live-clock">
              <span className="live-dot" aria-hidden="true" />
              <span>Live</span>
              <span aria-hidden="true">·</span>
              <time dateTime={now.toISOString()}>{clock}</time>
            </p>
            <h1 className="live-title">
              Nothing is <em>live</em> <span className="live-title-2">right now.</span>
            </h1>
          </div>
          <div className="live-hero-copy">
            <p className="live-lede">
              Live is where broadcasts, premieres and events will appear &mdash; only when they are real and dated. No live source is connected yet, so this page
              shows what is actually changing on Monumental instead
              {buckets.now.length ? `, including ${plural(buckets.now.length, 'maintained event')} happening today` : ''}.
            </p>
            <div className="live-actions">
              {newest ? (
                <ButtonLink to={cat.href(newest.id)} variant="primary" size="lg" icon="play" data-react="magnet" className="live-cta">
                  Watch the newest story
                </ButtonLink>
              ) : null}
              <a
                href="#live-schedule"
                className="btn btn-chrome btn-lg live-cta"
                onClick={(e) => {
                  e.preventDefault();
                  sound.play('transition');
                  jumpTo('live-schedule');
                }}
              >
                <Icon name="time" size={22} />
                <span>See the schedule</span>
              </a>
            </div>

            <dl className="live-readout" aria-label="Live at a glance">
              <div className="live-read is-off">
                <dt>Live broadcasts</dt>
                <dd>
                  <span className="live-read-n">None</span>
                  <span className="live-read-d">{status_.broadcasts.connected ? 'Source connected · nothing on air' : 'No live source connected'}</span>
                </dd>
              </div>
              <div className="live-read is-time">
                <dt>Dated changes ahead</dt>
                <dd>
                  <span className="live-read-n">{feed.phase === 'loading' && !schedule.length ? '…' : schedule.length}</span>
                  <span className="live-read-d">{next ? `Next: ${dayParts(next.date).long}` : 'Nothing dated yet'}</span>
                </dd>
              </div>
              <div className="live-read">
                <dt>Latest publication</dt>
                <dd>
                  <span className="live-read-n">{days[0] ? `${dayParts(days[0].date).day} ${dayParts(days[0].date).month}` : '—'}</span>
                  <span className="live-read-d">{days[0] ? `${plural(days[0].count, 'story', 'stories')} that day · not live` : 'Nothing published yet'}</span>
                </dd>
              </div>
            </dl>
          </div>

          <SignalOrbit
            entries={schedule}
            now={now}
            horizon={horizon}
            active={active}
            onActive={setActive}
            onPick={pick}
            label={orbitLabel}
            coreLine={buckets.now.length ? `${plural(buckets.now.length, 'event')} today · no broadcast` : 'No live signal'}
          />
        </div>
      </header>

      <div className="wrap live-body">
        {/* ───────────── Happening now (maintained, only when present) ───────────── */}
        {buckets.now.length || buckets.notices.length ? (
          <section id="live-now" className="live-section" aria-labelledby="live-now-h" data-reveal>
            <LiveHead id="live-now-h" kicker="Maintained listings · not broadcasts" title={<>Happening <em>now</em></>}>
              Events and notes kept by the Monumental team, shown while they are in date. They are listings, not streams.
            </LiveHead>
            <ul className="live-activity">
              {[...buckets.now, ...buckets.notices].map((a) => (
                <ActivityCard key={a.id} item={a} />
              ))}
            </ul>
          </section>
        ) : null}

        {/* ───────────── The schedule ───────────── */}
        <section id="live-schedule" className="live-section" aria-labelledby="live-schedule-h" data-reveal>
          <LiveHead id="live-schedule-h" kicker="Real dates only" title={<>On the <em>schedule</em></>}>
            Every dated change still ahead: release windows from the catalogue and dated events from the maintained listings. Days are counted from
            today&rsquo;s date &mdash; there are no invented countdowns.
          </LiveHead>
          {feed.phase === 'error' ? (
            <p className="notice live-notice">
              <Icon name="info" size={18} />
              <span>
                The maintained listings couldn&rsquo;t be loaded, so only catalogue dates are shown.{' '}
                <button type="button" className="live-inline-btn" onClick={retryFeed}>
                  Try again
                </button>
              </span>
            </p>
          ) : null}
          {schedule.length ? (
            <ol className="live-windows">
              {schedule.map((e) => (
                <WindowCard key={e.key} entry={e} now={now} active={active === e.key} onActive={setActive} />
              ))}
            </ol>
          ) : feed.phase === 'loading' ? (
            <Pulse label="Reading the schedule" />
          ) : (
            <div className="live-empty">
              <Icon name="time" size={22} />
              <p>
                <b>Nothing is scheduled.</b> When a release window or an event has a real date, it appears here and on the orbit above.
              </p>
            </div>
          )}
        </section>

        {/* ───────────── Recently published ───────────── */}
        <section id="live-recent" className="live-section" aria-labelledby="live-recent-h" data-reveal>
          <LiveHead id="live-recent-h" kicker="Published, not live" title={<>Recently <em>published</em></>}>
            The newest additions to Monumental, by the date they were published here. Nothing in this list is a live broadcast.
          </LiveHead>
          {facets.length > 1 ? (
            <div className="live-filter" role="group" aria-label="Show recently published from">
              <Chip selected={!filter} onToggle={() => setFilter(null)} count={recent.length}>
                Everything
              </Chip>
              {facets.map((f) => (
                <Chip key={f.section.id} selected={filter?.id === f.section.id} onToggle={() => setFilter(filter?.id === f.section.id ? null : f.section)} count={f.count}>
                  {f.section.label}
                </Chip>
              ))}
            </div>
          ) : null}
          <p className="live-filter-state" role="status" aria-live="polite">
            {filter ? `${plural(filtered.length, 'story', 'stories')} in ${filter.label}, newest first` : `${plural(recent.length, 'story', 'stories')}, newest first`}
          </p>
          {visible.length ? (
            <ul className="grid-pods live-recent">
              {visible.map((v) => (
                <li key={v.id}>
                  <VideoPod video={v} footer={<PublishedLine video={v} now={now} />} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="live-empty">
              <Icon name="info" size={22} />
              <p>
                <b>Nothing published yet.</b> New stories appear here the day they are published.
              </p>
            </div>
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
        </section>

        {/* ───────────── Announced, not dated ───────────── */}
        {announced.length ? (
          <section id="live-announced" className="live-section" aria-labelledby="live-announced-h" data-reveal>
            <LiveHead id="live-announced-h" kicker="No dates announced" title={<>On the <em>horizon</em></>}>
              Programmes that exist as announcements only. None has a date yet, so none sits on the schedule.
            </LiveHead>
            <ul className="live-horizon">
              {announced.map((p) => (
                <HorizonCard key={p.id} programme={p} />
              ))}
            </ul>
          </section>
        ) : null}

        {/* ───────────── What Live will carry ───────────── */}
        <section id="live-wiring" className="live-section" aria-labelledby="live-wiring-h" data-reveal>
          <LiveHead id="live-wiring-h" kicker="Reported by the server" title={<>What Live <em>will carry</em></>}>
            Live is built to show four kinds of signal. Here is what is connected today, as the server reports it.
          </LiveHead>
          {!config && status === 'offline' ? (
            <p className="notice live-notice">
              <Icon name="info" size={18} />
              <span>
                The server couldn&rsquo;t be reached, so connection status is unknown.{' '}
                <button type="button" className="live-inline-btn" onClick={() => void refreshSession()}>
                  Try again
                </button>
              </span>
            </p>
          ) : null}
          <ol className="live-wiring">
            <Wire
              state={status_.broadcasts.connected ? 'on' : 'off'}
              title="Live broadcasts and premieres"
              word={status_.broadcasts.connected ? 'Connected' : 'Not connected'}
              detail={status_.broadcasts.detail}
              promise="When a live source is connected, streams appear at the top of this page with a clear live marker and their start time."
            />
            <Wire
              state={status_.activity ? (status_.activity.connected ? 'on' : 'partial') : 'unknown'}
              title="Events and releases"
              word={status_.activity ? (status_.activity.connected ? 'Connected' : 'Maintained file only') : 'Checking…'}
              detail={status_.activity?.detail ?? 'Waiting for the server to report.'}
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
          <p className="live-foot muted">
            Full integration details live on the <Link to="/about#about-integrations">About page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ───────────── Pieces ───────────── */

function LiveHead({ id, kicker, title, children }: { id: string; kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="live-head">
      <p className="kicker">{kicker}</p>
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
      <Icon name="check" size={14} />
      <span>
        Published <time dateTime={video.published}>{dayParts(video.published).long}</time>
        {ago ? ` · ${ago.toLowerCase()}` : ''}
      </span>
    </p>
  );
}

function SaveToggle({ video }: { video: Video }) {
  const lib = useLibrary();
  const ref = useRef<HTMLButtonElement>(null);
  const saved = isSaved(lib, video.id);
  return (
    <Button
      ref={ref}
      variant="quiet"
      icon={saved ? 'saved' : 'save'}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${video.title} from My World` : `Save ${video.title} to My World`}
      onClick={() => {
        const on = libraryActions.toggleSave(video.id);
        sound.play(on ? 'save' : 'unsave');
        if (on) flyToMyWorld(ref.current);
        toast(on ? `Saved “${video.title}” to My World` : `Removed “${video.title}” from My World`, {
          tone: 'success',
          action: { label: 'Undo', run: () => libraryActions.toggleSave(video.id) },
        });
      }}
    >
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}

function WindowCard({ entry, now, active, onActive }: { entry: ScheduleEntry; now: Date; active: boolean; onActive: (k: string | null) => void }) {
  const cat = useCatalogue();
  const { session } = useSession();
  const d = dayParts(entry.date);
  const days = daysUntil(entry.date, now);
  const v = entry.video;
  const href = v ? cat.href(v.id) : null;
  const canWatch = v ? cat.effectiveAccess(v, now) === 'free' || (cat.effectiveAccess(v, now) === 'premium' && session.membership.premium) : false;
  const viewer = v
    ? entry.kind === 'opens-to-everyone'
      ? session.membership.premium
        ? 'Your Premium membership already unlocks it.'
        : `You can watch it free from ${d.long}.`
      : 'Nobody can watch it before this date.'
    : null;
  const ext = entry.activity?.url;

  return (
    <li
      id={slugOf(entry.key)}
      className={`live-window is-${entry.kind} ${active ? 'is-on' : ''}`}
      onPointerEnter={() => onActive(entry.key)}
      onPointerLeave={() => onActive(null)}
      onFocus={() => onActive(entry.key)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && onActive(null)}
    >
      <div className="live-date" aria-hidden="true">
        <span className="live-date-d">{d.day}</span>
        <span className="live-date-m">{d.month}</span>
        <span className="live-date-y">{d.year}</span>
      </div>
      {v ? (
        <div className="live-window-media" data-react="tilt light">
          <Art art={v.art} alt="" />
        </div>
      ) : null}
      <div className="live-window-body">
        <p className="live-window-kind">
          <span className="live-kind-word">{SCHEDULE_WORD[entry.kind]}</span>
          <time dateTime={entry.date}>
            {d.weekday} {d.long}
          </time>
          <span className="live-until">{untilLabel(days)}</span>
        </p>
        <h3 className="live-window-title">
          {href ? <Link to={href}>{entry.title}</Link> : ext ? <a href={ext} target="_blank" rel="noopener noreferrer">{entry.title}</a> : <span tabIndex={-1}>{entry.title}</span>}
        </h3>
        <p className="live-window-what">{entry.what}</p>
        {viewer ? <p className="live-window-viewer">{viewer}</p> : null}
        <p className="live-source">
          Source: {entry.source}
          {v?.availability.note ? ` — ${v.availability.note}` : ''}
          {entry.activity ? ` · verified ${dayParts(entry.activity.verifiedAt).long}` : ''}
        </p>
        {v && href ? (
          <div className="live-window-actions">
            <ButtonLink to={href} variant="chrome" icon={canWatch ? 'play' : 'arrow'}>
              {canWatch ? 'Watch now' : 'See details'}
            </ButtonLink>
            <SaveToggle video={v} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const cat = useCatalogue();
  const place = item.place && cat.get(item.place) ? item.place : null;
  const url = item.url && /^https?:\/\//.test(item.url) ? item.url : null;
  return (
    <li className={`live-act is-${item.kind}`}>
      <p className="live-act-meta">
        <span className="live-act-kind">{item.starts ? (item.kind === 'event' ? 'On today' : 'Out now') : 'Note'}</span>
        {item.starts ? (
          <time dateTime={item.starts}>
            {dayParts(item.starts).long}
            {item.ends && item.ends !== item.starts ? ` – ${dayParts(item.ends).long}` : ''}
          </time>
        ) : null}
        {place ? <Link to={cat.href(place)}>{cat.label(place)}</Link> : null}
      </p>
      <h3 className="live-act-title">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {item.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          item.title
        )}
      </h3>
      <p className="live-act-summary">{item.summary}</p>
      <p className="live-source">
        Source: {item.source} · verified {dayParts(item.verifiedAt).long}
        {item.ends ? ` · listed until ${dayParts(item.ends).long}` : ''}
      </p>
    </li>
  );
}

const PROGRAMME_WORD: Record<Programme['status'], string> = {
  available: 'Available',
  announced: 'Announced',
  'in-development': 'In development',
  planned: 'Planned',
};

function HorizonCard({ programme: p }: { programme: Programme }) {
  const cat = useCatalogue();
  return (
    <li className="live-hz">
      <div className="live-hz-media" data-react="tilt light">
        <Art art={p.art} alt="" />
        <span className="live-hz-status">{PROGRAMME_WORD[p.status]} · no date</span>
      </div>
      <h3 className="live-hz-title">
        <Link to={cat.href(p.id)}>{p.title}</Link>
      </h3>
      <p className="live-hz-note">{p.statusNote}</p>
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
