/**
 * TIME MACHINE — /time-machine and /time-machine/:decade?year=&lens=&interest=&movement=
 *
 * The instrument is the living world: the stage's `time` helix (one vertebra per decade, seeds
 * along it by year). This page is the editorial layer over it — a monumental place in time, the
 * story to start with, and a precise DOM time control (decade + year scrubbers, lens) that drives
 * useArrangement({ kind: 'time', decade, year, lens }) and lights the seeds whose dates match.
 * Scrubbing previews in the world (the camera travels along the spine) and commits to the URL;
 * clicking a vertebra in the world (decadeActivate) travels there too.
 *
 * Below the fold: the stories (Set in / Made / Published kept apart on every card), the time in
 * context (movements alive, places → World, people), and its roots and echoes. A time with few
 * or no stories still shows its context, offers the nearest years or decades that hold stories,
 * and lights the stories closest in time.
 *
 * Everything lives in the URL: decade and year changes push history (Back walks through time),
 * lens / category / movement replace it; direct links and refresh restore the exact view.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { overlaps } from '../../../shared/catalogue.ts';
import type { Category, FootageType, ID, Movement, Period, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { FOOTAGE_LABEL, dateLabel, plural, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import type { Arrangement } from '../../stage/contract.ts';
import { setHovered, stageStore, useArrangement, useStageEvent } from '../../stage/store.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Chip } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, VideoPod, useAccessState } from '../../ui/Pod.tsx';
import { LENSES, LENS_LABEL, LENS_VERB, decadePhrase, dialValueText, nearestStoried, pickDefaultPeriod, rangeContext, resolveEra, type Lens } from './chrono.ts';
import { Lineage } from './Lineage.tsx';
import { TimeContext } from './TimeContext.tsx';
import { TimeControl, type Stop } from './TimeControl.tsx';
import {
  categoriesPresent,
  distanceLabel,
  nearestStories,
  nearestYears,
  periodCounts,
  rangePhrase,
  readTimeParams,
  storiesIn,
  timeHref,
  yearlyCounts,
  yearsOf,
  type NearStory,
  type TimeRange,
  type TimeState,
} from './timeline.ts';
import './time.css';

const FOOTAGE_MEANING: Record<FootageType, string> = {
  archive: 'Genuine historical footage, filmed at the time.',
  illustrative: 'Motion design or artwork depicting ideas, not events.',
  fiction: 'Narrative fiction — staged and scripted.',
  reconstruction: 'A staged re-creation of past events.',
  commentary: 'Presenter, interview or talking-head material.',
  contemporary: 'Present-day documentary footage.',
};
const FOOTAGE_ORDER: FootageType[] = ['archive', 'illustrative', 'fiction', 'reconstruction', 'commentary', 'contemporary'];

/** What a lens means, in one line under the control. */
const LENS_CAPTION: Record<Lens, string> = {
  setting: 'Placed by when each story takes place.',
  made: 'Placed by when the footage was originally made.',
  published: 'Placed by when each story arrived on Monumental Streams.',
};

const CHAPTERS = [
  { id: 'tm-time', label: 'Time' },
  { id: 'tm-stories', label: 'Stories' },
  { id: 'tm-context', label: 'Context' },
  { id: 'tm-lineage', label: 'Roots & echoes' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** True while the world has this seed under the pointer (or the DOM lit it). */
function useSeedLit(id: ID | undefined) {
  return useSyncExternalStore(
    stageStore.subscribe,
    () => !!id && stageStore.get().hovered === id,
    () => false,
  );
}

export default function TimePage() {
  const cat = useCatalogue();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<{
    period: Period;
    year: number | null;
  } | null>(null);
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const periods = cat.periods;
  const first = periods[0];
  const last = periods[periods.length - 1];
  const bounds = useMemo<TimeRange>(
    () => ({
      start: first?.start ?? 1900,
      end: Math.min(last?.end ?? thisYear, thisYear),
    }),
    [first, last, thisYear],
  );

  /* ───── where we are ───── */

  const base = useMemo(() => readTimeParams(params, cat), [params, cat]);
  const { lens, interest } = base;
  const interestName = interest ? cat.label(interest) : null;

  const countsByLens = useMemo(() => Object.fromEntries(LENSES.map((l) => [l, periodCounts(cat, l, interest)])) as Record<Lens, Record<ID, number>>, [cat, interest]);
  const counts = countsByLens[lens];
  const movementCounts = useMemo(() => Object.fromEntries(periods.map((p) => [p.id, cat.movementsForPeriod(p.id).length])) as Record<ID, number>, [cat, periods]);

  const era = useMemo(() => (slug ? resolveEra(cat, slug, thisYear) : null), [cat, slug, thisYear]);
  const unknown = era?.kind === 'unknown' ? era : null;
  const paramYear = base.year != null && base.year <= thisYear ? base.year : null;
  const period: Period | undefined = era
    ? era.kind === 'known'
      ? era.period
      : undefined
    : ((paramYear != null ? periods.find((p) => paramYear >= p.start && paramYear <= p.end) : undefined) ?? pickDefaultPeriod(periods, counts));
  const year = !period ? null : era?.kind === 'known' && era.year != null ? era.year : paramYear != null && paramYear >= period.start && paramYear <= period.end ? paramYear : null;
  const range = useMemo<TimeRange | null>(() => (period ? (year != null ? { start: year, end: year } : { start: period.start, end: period.end }) : null), [period, year]);
  const state: TimeState = useMemo(() => ({ year, lens, interest, movement: base.movement }), [year, lens, interest, base.movement]);
  const selectedMovement = base.movement ? (cat.bySlug('movement', base.movement) as Movement | undefined) : undefined;
  const phrase = period ? rangePhrase(period, year) : '';

  // A bare year ("/time-machine/1942"), a year without a decade, ?cat= or stale parameters settle on the canonical address.
  useEffect(() => {
    if (!period || unknown) return;
    if (!slug && !params.has('year')) return;
    const canonical = timeHref(cat, period, state);
    if (canonical !== location.pathname + location.search) navigate(canonical, { replace: true, preventScrollReset: true });
  }, [cat, period, unknown, slug, params, state, location.pathname, location.search, navigate]);

  /* ───── what it holds ───── */

  const inView = useMemo(() => (range ? storiesIn(cat, lens, range) : []), [cat, lens, range]);
  const results = useMemo(() => (interest ? inView.filter((v) => v.categories.includes(interest)) : inView), [inView, interest]);
  const ctx = useMemo(() => (range ? rangeContext(cat, range, inView) : null), [cat, range, inView]);
  const presence = useMemo(() => {
    if (!ctx) return [];
    const list = categoriesPresent(cat, inView, ctx.movements);
    if (interest && !list.some((p) => p.category.id === interest)) {
      const c = cat.get(interest) as Category | undefined;
      if (c) list.push({ category: c, count: 0, movements: [] });
    }
    return list;
  }, [cat, ctx, inView, interest]);
  const closest = useMemo(() => (range && !results.length ? nearestStories(cat, lens, range, interest, 3) : []), [cat, lens, range, interest, results.length]);
  const years = useMemo(() => (period ? yearsOf(period, thisYear) : []), [period, thisYear]);
  const yearCounts = useMemo(() => (period ? yearlyCounts(cat, lens, period, interest) : new Map<number, number>()), [cat, lens, period, interest]);

  useEffect(() => {
    document.title = `${unknown ? 'Beyond the archive' : year != null ? String(year) : period ? `The ${period.label}` : 'Time Machine'} — Time Machine · Monumental Streams`;
  }, [period, year, unknown]);
  useChapters(period && !unknown ? CHAPTERS : []);

  /* ───── the world: the helix travels to the place in time (or the place being scrubbed to) ───── */

  const shown = preview ?? (period && !unknown ? { period, year } : null);
  const shownRange = useMemo<TimeRange | null>(() => (shown ? (shown.year != null ? { start: shown.year, end: shown.year } : { start: shown.period.start, end: shown.period.end }) : null), [shown]);
  const arrangement: Arrangement = shown
    ? {
        kind: 'time',
        decade: shown.period.start,
        ...(shown.year != null ? { year: shown.year } : {}),
        ...(lens !== 'setting' ? { lens } : {}),
      }
    : { kind: 'time', ...(lens !== 'setting' ? { lens } : {}) };
  const highlight = useMemo(() => {
    if (!shownRange) return null;
    const lit = preview ? storiesIn(cat, lens, shownRange, interest) : results;
    if (lit.length) return lit.map((v) => v.id);
    // a time without stories lights the ones closest to it, so the eye finds where stories are
    return (preview ? nearestStories(cat, lens, shownRange, interest, 3) : closest).map((n) => n.video.id);
  }, [cat, lens, interest, shownRange, preview, results, closest]);
  useArrangement(arrangement, highlight);

  /* ───── moving through time ───── */

  /** Keep the selected movement only where it was alive (or in the "all movements" view). */
  const movementFor = useCallback(
    (r: TimeRange) => (selectedMovement && (showAll || overlaps(selectedMovement.start, selectedMovement.end ?? 9999, r.start, r.end)) ? selectedMovement.slug : null),
    [selectedMovement, showAll],
  );
  const hrefFor = useCallback(
    (p: Period, next: Partial<TimeState> = {}) =>
      timeHref(cat, p, {
        ...state,
        year: null,
        movement: movementFor(p),
        ...next,
      }),
    [cat, state, movementFor],
  );
  const hrefForYear = useCallback(
    (y: number) => {
      const p = periods.find((x) => y >= x.start && y <= x.end);
      return p
        ? timeHref(cat, p, {
            ...state,
            year: y,
            movement: movementFor({ start: y, end: y }),
          })
        : '/time-machine';
    },
    [cat, periods, state, movementFor],
  );
  const go = useCallback(
    (next: Partial<TimeState>, replace: boolean) => {
      if (period)
        navigate(timeHref(cat, period, { ...state, ...next }), {
          replace,
          preventScrollReset: true,
        });
    },
    [cat, period, state, navigate],
  );

  const travelTo = useCallback(
    (p: Period | undefined) => {
      if (!p) return;
      sound.play('transition');
      navigate(hrefFor(p), { preventScrollReset: true });
    },
    [navigate, hrefFor],
  );
  // clicking a vertebra of the helix in the world travels there, keeping lens and category
  useStageEvent(
    'decadeActivate',
    useCallback(({ decade }: { decade: number }) => travelTo(periods.find((p) => p.start === decade)), [periods, travelTo]),
  );

  const commitYear = useCallback(
    (y: number | null) => {
      if (y === year || !period) return;
      sound.play('transition');
      go(
        {
          year: y,
          movement: movementFor(y == null ? period : { start: y, end: y }),
        },
        false,
      );
    },
    [year, period, go, movementFor],
  );
  const setLens = (l: Lens) => go({ lens: l }, true);
  const setInterest = (id: ID | null) => go({ interest: id }, true);
  const selectMovement = (m: Movement | null) => {
    go({ movement: m?.slug ?? null }, true);
    if (!m) return;
    window.setTimeout(() => {
      const el = document.getElementById('tm-mv-title');
      el?.focus({ preventScroll: true });
      el?.closest('article')?.scrollIntoView({
        block: 'nearest',
        behavior: reduced ? 'auto' : 'smooth',
      });
    }, 80);
  };

  /* ───── the control's scales ───── */

  const dialIndex = Math.max(0, periods.indexOf((period ?? unknown?.nearest ?? periods[0]) as Period));
  const maxDecade = Math.max(1, ...periods.map((p) => counts[p.id] ?? 0));
  const decadeStops: Stop[] = periods.map((p, i) => ({
    key: p.slug,
    long: p.label,
    short: `’${p.label.slice(2)}`,
    weight: (counts[p.id] ?? 0) / maxDecade,
    empty: !(counts[p.id] ?? 0),
    major: i % 3 === 0,
  }));
  const maxYear = Math.max(1, ...years.map((y) => yearCounts.get(y) ?? 0));
  const yearStops: Stop[] = [
    { key: 'all', long: 'All', short: 'All', weight: 1, major: true },
    ...years.map((y) => ({
      key: String(y),
      long: String(y),
      short: `’${String(y).slice(2)}`,
      weight: (yearCounts.get(y) ?? 0) / maxYear,
      empty: !(yearCounts.get(y) ?? 0),
      major: y % 5 === 0,
    })),
  ];
  const decadeTotal = period ? (counts[period.id] ?? 0) : 0;
  const decadeControl = {
    stops: decadeStops,
    value: dialIndex,
    valueText: (i: number) => {
      const p = periods[i];
      return p ? dialValueText(p, counts[p.id] ?? 0, movementCounts[p.id] ?? 0) : '';
    },
    onPreview: (i: number | null) => setPreview(i == null || !periods[i] ? null : { period: periods[i], year: null }),
    onCommit: (i: number) => travelTo(periods[i]),
    commitSame: !!unknown,
  };
  const yearControl =
    period && !unknown
      ? {
          stops: yearStops,
          value: year == null ? 0 : Math.max(0, years.indexOf(year) + 1),
          valueText: (i: number) => (i === 0 ? `Whole ${period.label} — ${plural(decadeTotal, 'story', 'stories')}` : `${years[i - 1]} — ${plural(yearCounts.get(years[i - 1]) ?? 0, 'story', 'stories')}`),
          onPreview: (i: number | null) => setPreview(i == null ? null : { period, year: i === 0 ? null : (years[i - 1] ?? null) }),
          onCommit: (i: number) => commitYear(i === 0 ? null : (years[i - 1] ?? null)),
        }
      : undefined;

  /* ───── the story to start with ───── */

  const lead: { video: Video; near?: NearStory } | null = results.length ? { video: results.find((v) => cat.isPlayable(v)) ?? results[0] } : closest[0] ? { video: closest[0].video, near: closest[0] } : null;

  return (
    <div className="page wrap tm-page">
      <section id="tm-time" className="tm-hero" aria-labelledby="tm-h1">
        <div className="tm-hero-text">
          <p className="eyebrow">
            <b>Time Machine</b>
          </p>
          {unknown ? (
            <h1 id="tm-h1" className="title-monument tm-title" data-long="" tabIndex={-1}>
              This era isn’t in the archive yet
            </h1>
          ) : (
            <h1 id="tm-h1" className="title-monument tm-title" tabIndex={-1}>
              <span className="tm-title-pre">{year != null ? 'The year' : 'The'}</span> <span className="tm-title-main">{year != null ? year : period?.label}</span>
            </h1>
          )}
          {unknown ? (
            <p className="lede tm-lede">
              The archive covers {first ? decadePhrase(first) : ''} to {last ? decadePhrase(last) : ''}, up to {thisYear}.{' '}
              {unknown.nearest ? `The nearest decade it holds is ${decadePhrase(unknown.nearest)}.` : `“${unknown.slug}” isn’t a decade or year the Time Machine recognises.`}
            </p>
          ) : period ? (
            <p className="lede tm-lede">{period.summary}</p>
          ) : null}

          {unknown ? (
            <div className="tm-actions" role="status">
              {unknown.nearest ? (
                <ButtonLink to={timeHref(cat, unknown.nearest, { ...state, year: null })} variant="primary" icon="time">
                  Go to {decadePhrase(unknown.nearest)}
                </ButtonLink>
              ) : null}
              <ButtonLink to="/time-machine" variant="quiet">
                Start at the beginning
              </ButtonLink>
            </div>
          ) : lead && period ? (
            <Lead video={lead.video} near={lead.near} lens={lens} />
          ) : null}
        </div>
        <TimeControl decade={decadeControl} year={yearControl} lens={unknown ? undefined : lens} onLens={setLens} reduced={reduced} caption={LENS_CAPTION[lens]} />
      </section>

      {period && ctx && range && !unknown ? (
        <>
          <section id="tm-stories" className="tm-section" aria-labelledby="tm-stories-h">
            <header className="tm-section-head">
              <h2 id="tm-stories-h" className="tm-h2">
                {interestName ? `${interestName} stories` : 'Stories'} {LENS_VERB[lens]} {phrase}
              </h2>
              <p className="tm-sub">
                <span aria-live="polite" aria-atomic="true">
                  {plural(results.length, interestName ? `${interestName.toLowerCase()} story` : 'story', interestName ? `${interestName.toLowerCase()} stories` : 'stories')} {LENS_VERB[lens]} {phrase}.
                </span>
                {year != null ? (
                  <button type="button" className="tm-inline" onClick={() => commitYear(null)}>
                    Show the whole {period.label}
                  </button>
                ) : null}
              </p>
              {presence.length ? (
                <div className="tm-cats" role="group" aria-label="Categories present">
                  <Chip selected={!interest} onToggle={() => setInterest(null)} count={inView.length} tone="plasma">
                    All
                  </Chip>
                  {presence.map((p) => (
                    <span key={p.category.id} className="tm-cat" data-quiet={p.count === 0 || undefined}>
                      <Chip selected={interest === p.category.id} onToggle={() => setInterest(interest === p.category.id ? null : p.category.id)} count={p.count} tone="plasma">
                        {p.category.name}
                        {p.count === 0 ? <span className="sr-only"> (carried by {plural(p.movements.length, 'movement')}, no stories yet)</span> : null}
                      </Chip>
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            {results.length ? (
              <ul className="tm-grid" aria-label={plural(results.length, 'story', 'stories')}>
                {results.map((v, i) => (
                  <li key={v.id}>
                    <VideoPod video={v} priority={i < 3} footer={<Dates video={v} lens={lens} />} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyTime
                period={period}
                periods={periods}
                year={year}
                lens={lens}
                interest={interest}
                interestName={interestName}
                inViewCount={inView.length}
                carriers={presence.find((p) => p.category.id === interest)?.movements ?? []}
                counts={countsByLens}
                bounds={bounds}
                closest={closest}
                hrefFor={hrefFor}
                hrefForYear={hrefForYear}
                setLens={setLens}
                clearInterest={() => setInterest(null)}
              />
            )}

            <details className="tm-legend">
              <summary>
                <Icon name="info" size={16} /> What the footage labels mean
              </summary>
              <dl>
                {FOOTAGE_ORDER.map((f) => (
                  <div key={f} data-present={results.some((v) => v.footage.includes(f)) || undefined}>
                    <dt>{FOOTAGE_LABEL[f]}</dt>
                    <dd>{FOOTAGE_MEANING[f]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section id="tm-context" className="tm-section" aria-labelledby="tm-context-h">
            <header className="tm-section-head">
              <h2 id="tm-context-h" className="tm-h2">
                {cap(phrase)} in context
              </h2>
              <p className="tm-sub">What was alive, where it happened and who carried it — even where the archive holds no story yet.</p>
            </header>
            <TimeContext periods={periods} range={range} phrase={phrase} ctx={ctx} selected={selectedMovement} showAll={showAll} onShowAll={setShowAll} onSelect={selectMovement} />
          </section>

          <section id="tm-lineage" className="tm-section" aria-labelledby="tm-lineage-h">
            <header className="tm-section-head">
              <h2 id="tm-lineage-h" className="tm-h2">
                Roots &amp; echoes of {phrase}
              </h2>
              <p className="tm-sub">From what {phrase} drew on, through the movements alive then, to what carries it on Monumental today. Point at or focus any node to light its thread.</p>
            </header>
            <Lineage phrase={phrase} label={year != null ? String(year) : period.label} ctx={ctx} />
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ───────────── The story to start with: lights its seed, one gold action ───────────── */

function Lead({ video: v, near, lens }: { video: Video; near?: NearStory; lens: Lens }) {
  const cat = useCatalogue();
  const access = useAccessState(v);
  const lit = useSeedLit(v.id);
  const href = cat.href(v.id);
  const playable = cat.isPlayable(v);
  const place = v.places[0] ? cat.label(v.places[0]) : null;
  const when = lens === 'setting' ? (v.setting?.label ? settingLabel(v) : `Set ${settingLabel(v)}`) : lens === 'made' ? `Made ${v.made ?? '—'}` : `Published ${dateLabel(v.published)}`;
  const reach = () => setHovered(v.id);
  const release = () => {
    if (stageStore.get().hovered === v.id) setHovered(null);
  };
  useEffect(() => () => release(), [v.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tm-lead" data-seed={v.id} data-world-lit={lit || undefined} onPointerEnter={reach} onPointerLeave={release} onFocus={reach} onBlur={release}>
      <Link
        to={href}
        className="tm-lead-art"
        tabIndex={-1}
        aria-hidden="true"
        draggable={false}
        data-cursor={playable ? 'play' : 'view'}
        data-cursor-label={playable ? (access.locked ? 'Preview' : 'Watch') : 'Details'}
        onClick={() => sound.play('transition')}
      >
        <Art art={v.art} eager alt="" />
      </Link>
      <div className="tm-lead-text">
        <p className="tm-lead-note">{near ? `Closest in time · ${distanceLabel(near)}` : [when, place].filter(Boolean).join(' · ')}</p>
        <p className="tm-lead-title">{v.title}</p>
        <div className="tm-lead-actions">
          {playable ? (
            <ButtonLink to={href} variant="primary" icon="play" aria-label={`${access.locked ? 'Preview' : 'Watch'} ${v.title}`} data-cursor="play" data-cursor-label={access.locked ? 'Preview' : 'Watch'}>
              {access.locked ? 'Preview' : 'Watch'}
            </ButtonLink>
          ) : (
            <ButtonLink to={href} variant="ghost" icon="info" aria-label={`Details for ${v.title}`}>
              Details
            </ButtonLink>
          )}
          {access.key !== 'free' ? <span className="tm-lead-mark">{access.label}</span> : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────── The three dates, kept apart ───────────── */

function Dates({ video: v, lens }: { video: Video; lens: Lens }) {
  return (
    <dl className="tm-dates">
      <div data-on={lens === 'setting' || undefined}>
        <dt>Set in</dt>
        <dd>{v.setting ? settingLabel(v) : 'Timeless'}</dd>
      </div>
      <div data-on={lens === 'made' || undefined}>
        <dt>Made</dt>
        <dd>
          {v.made != null ? v.made : '—'}
          {v.made == null ? <span className="sr-only"> (not recorded)</span> : null}
        </dd>
      </div>
      <div data-on={lens === 'published' || undefined}>
        <dt>Published</dt>
        <dd>{dateLabel(v.published)}</dd>
      </div>
    </dl>
  );
}

/* ───────────── Graceful emptiness: nearest years or decades, and the real stories closest in time ───────────── */

function EmptyTime({
  period,
  periods,
  year,
  lens,
  interest,
  interestName,
  inViewCount,
  carriers,
  counts,
  bounds,
  closest,
  hrefFor,
  hrefForYear,
  setLens,
  clearInterest,
}: {
  period: Period;
  periods: Period[];
  year: number | null;
  lens: Lens;
  interest: ID | null;
  interestName: string | null;
  inViewCount: number;
  carriers: Movement[];
  counts: Record<Lens, Record<ID, number>>;
  bounds: TimeRange;
  closest: NearStory[];
  hrefFor: (p: Period) => string;
  hrefForYear: (y: number) => string;
  setLens: (l: Lens) => void;
  clearInterest: () => void;
}) {
  const cat = useCatalogue();
  const phrase = rangePhrase(period, year);
  const noun = interestName ? `${interestName.toLowerCase()} stories` : 'stories';
  const allYearCounts = useMemo(() => (year != null ? yearlyCounts(cat, lens, bounds, interest) : null), [cat, lens, bounds, interest, year]);
  const nearDecades = year == null ? nearestStoried(periods, counts[lens], periods.indexOf(period)) : {};
  const nearYrs = year != null && allYearCounts ? nearestYears(allYearCounts, year, bounds) : {};
  const otherLens = LENSES.filter((l) => l !== lens)
    .map((l) => ({ l, n: Object.values(counts[l]).reduce((a, b) => a + b, 0) }))
    .filter((x) => x.n > 0)[0];

  const near = year == null ? [nearDecades.before, nearDecades.after].filter((x): x is NonNullable<typeof x> => !!x) : [];
  const nearY = year != null ? [nearYrs.before, nearYrs.after].filter((x): x is NonNullable<typeof x> => !!x) : [];

  return (
    <div className="tm-empty">
      <EmptyState
        icon="time"
        tone="plasma"
        title={`No ${noun} ${LENS_VERB[lens]} ${phrase} yet`}
        actions={
          <>
            {year == null && nearDecades.before ? (
              <ButtonLink to={hrefFor(nearDecades.before.period)} preventScrollReset icon="left">
                {nearDecades.before.period.label} · {plural(nearDecades.before.count, 'story', 'stories')}
              </ButtonLink>
            ) : null}
            {year == null && nearDecades.after ? (
              <ButtonLink to={hrefFor(nearDecades.after.period)} preventScrollReset iconAfter="right">
                {nearDecades.after.period.label} · {plural(nearDecades.after.count, 'story', 'stories')}
              </ButtonLink>
            ) : null}
            {year != null && nearYrs.before ? (
              <ButtonLink to={hrefForYear(nearYrs.before.year)} preventScrollReset icon="left">
                {nearYrs.before.year} · {plural(nearYrs.before.count, 'story', 'stories')}
              </ButtonLink>
            ) : null}
            {year != null && nearYrs.after ? (
              <ButtonLink to={hrefForYear(nearYrs.after.year)} preventScrollReset iconAfter="right">
                {nearYrs.after.year} · {plural(nearYrs.after.count, 'story', 'stories')}
              </ButtonLink>
            ) : null}
            {interest && inViewCount > 0 ? (
              <Button icon="filter" onClick={clearInterest}>
                Show all {plural(inViewCount, 'story', 'stories')}
              </Button>
            ) : null}
            {!near.length && !nearY.length && !(interest && inViewCount) && otherLens ? (
              <Button icon="time" onClick={() => setLens(otherLens.l)}>
                Try “{LENS_LABEL[otherLens.l]}”
              </Button>
            ) : null}
          </>
        }
      >
        <p>
          {near.length
            ? `The nearest ${near.length > 1 ? 'decades' : 'decade'} with ${noun} ${near.length > 1 ? 'are' : 'is'} ${near.map((x) => `${decadePhrase(x.period)} (${x.count})`).join(' and ')}.`
            : nearY.length
              ? `The nearest ${nearY.length > 1 ? 'years' : 'year'} with ${noun} ${nearY.length > 1 ? 'are' : 'is'} ${nearY.map((x) => `${x.year} (${x.count})`).join(' and ')}.`
              : `Nothing in the archive is dated this way${interestName ? ` in ${interestName}` : ''} yet.`}{' '}
          {carriers.length
            ? `${interestName} is carried in ${phrase} by ${carriers.map((m) => m.name).join(', ')} — see the context below.`
            : 'The movements, places and people of this time still map it — see the context below.'}
        </p>
      </EmptyState>

      {closest.length ? (
        <div className="tm-closest" role="group" aria-labelledby="tm-closest-h">
          <h3 id="tm-closest-h" className="tm-h3">
            Closest in time
          </h3>
          <ul className="tm-grid">
            {closest.map((n) => (
              <li key={n.video.id}>
                <VideoPod
                  video={n.video}
                  footer={
                    <>
                      <Dates video={n.video} lens={lens} />
                      <p className="tm-closest-note">{distanceLabel(n)}</p>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
