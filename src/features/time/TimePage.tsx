/**
 * TIME MACHINE — /time-machine and /time-machine/:decade?year=&lens=&interest=&movement=
 *
 * The vertebral clock chooses a decade; the year strand narrows it to one year (only stories
 * whose dates under the lens include that year — setting by its recorded from/to span). Lenses
 * (set in / made in / published) decide which date counts. Beside the instrument, the field
 * notes read the chosen place in time: movements active, places involved (into World), people,
 * and the categories present, which filter the stories. Below: the stories as image cards, the
 * movement span timeline, and the connections through time from roots to today's programmes.
 *
 * Everything lives in the URL: decade and year changes push history (Back walks through time),
 * lens / category / movement replace it; direct links and refresh restore the exact view.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { overlaps } from '../../../shared/catalogue.ts';
import type { Category, FootageType, ID, Movement, Period, Video } from '../../../shared/types.ts';
import { jumpTo, useChapters } from '../../app/chapters.ts';
import { FOOTAGE_LABEL, plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { deviceTier } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Segmented } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { SectionHeader } from '../../ui/Pod.tsx';
import { LENSES, LENS_EXPLAIN, LENS_LABEL, LENS_VERB, decadePhrase, nearestStoried, pickDefaultPeriod, rangeContext, resolveEra, type Lens } from './chrono.ts';
import { EraPanel } from './EraPanel.tsx';
import { Lineage } from './Lineage.tsx';
import { MovementDetail, MovementSpans } from './MovementSpans.tsx';
import { TimeCard } from './TimeCard.tsx';
import {
  categoriesPresent,
  distanceLabel,
  nearestStories,
  nearestYears,
  periodCounts,
  rangePhrase,
  readTimeParams,
  storiesIn,
  storySpan,
  timeHref,
  yearlyCounts,
  yearsOf,
  type TimeRange,
  type TimeState,
} from './timeline.ts';
import { VertebralClock } from './VertebralClock.tsx';
import { YearStrand } from './YearStrand.tsx';
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

/** What a single year means under each lens — the rule stated plainly, never more than the data holds. */
const YEAR_RULE: Record<Lens, (y: number) => string> = {
  setting: (y) => `Stories appear when their recorded historical setting includes ${y}.`,
  made: (y) => `Stories appear when the work was originally made in ${y}.`,
  published: (y) => `Stories appear when they arrived on Monumental Streams in ${y}.`,
};

const CHAPTERS = [
  { id: 'tm-instrument', label: 'Time' },
  { id: 'tm-stories', label: 'Stories' },
  { id: 'tm-movements', label: 'Movements' },
  { id: 'tm-lineage', label: 'Connections' },
];

export default function TimePage() {
  const cat = useCatalogue();
  const { slug } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [tier] = useState(() => deviceTier());
  const [showAll, setShowAll] = useState(false);
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const periods = cat.periods;
  const first = periods[0];
  const last = periods[periods.length - 1];
  const bounds = useMemo<TimeRange>(() => ({ start: first?.start ?? 1900, end: Math.min(last?.end ?? thisYear, thisYear) }), [first, last, thisYear]);

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

  // A bare year ("/time-machine/1942"), a year without a decade, or stale parameters settle on the canonical address.
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
  const years = useMemo(() => (period ? yearsOf(period, thisYear) : []), [period, thisYear]);
  const yearCounts = useMemo(() => (period ? yearlyCounts(cat, lens, period, interest) : new Map<number, number>()), [cat, lens, period, interest]);
  const allYearCounts = useMemo(() => yearlyCounts(cat, lens, bounds, interest), [cat, lens, bounds, interest]);

  useEffect(() => {
    document.title = `${unknown ? 'Beyond the archive' : year != null ? String(year) : period ? `The ${period.label}` : 'Time Machine'} — Time Machine · Monumental Streams`;
  }, [period, year, unknown]);
  useChapters(period && !unknown ? CHAPTERS : []);

  /* ───── moving through time ───── */

  /** Keep the selected movement only where it was alive (or in the "all movements" view). */
  const movementFor = useCallback(
    (r: TimeRange) => (selectedMovement && (showAll || overlaps(selectedMovement.start, selectedMovement.end ?? 9999, r.start, r.end)) ? selectedMovement.slug : null),
    [selectedMovement, showAll],
  );
  const hrefFor = useCallback((p: Period, next: Partial<TimeState> = {}) => timeHref(cat, p, { ...state, year: null, movement: movementFor(p), ...next }), [cat, state, movementFor]);
  const hrefForYear = useCallback(
    (y: number) => {
      const p = periods.find((x) => y >= x.start && y <= x.end);
      return p ? timeHref(cat, p, { ...state, year: y, movement: movementFor({ start: y, end: y }) }) : '/time-machine';
    },
    [cat, periods, state, movementFor],
  );
  const go = useCallback(
    (next: Partial<TimeState>, replace: boolean) => {
      if (period) navigate(timeHref(cat, period, { ...state, ...next }), { replace, preventScrollReset: true });
    },
    [cat, period, state, navigate],
  );

  const commitDecade = useCallback(
    (i: number) => {
      const p = periods[i];
      if (!p || (p === period && !unknown && year == null)) return;
      sound.play('transition');
      navigate(hrefFor(p), { preventScrollReset: true });
    },
    [periods, period, unknown, year, navigate, hrefFor],
  );
  const commitYear = useCallback(
    (y: number | null) => {
      if (y === year || !period) return;
      sound.play('transition');
      go({ year: y, movement: movementFor(y == null ? period : { start: y, end: y }) }, false);
    },
    [year, period, go, movementFor],
  );
  const setLens = (l: Lens) => go({ lens: l }, true);
  const setInterest = (id: ID | null) => go({ interest: id }, true);
  const selectMovement = (m: Movement | null) => go({ movement: m?.slug ?? null }, true);
  const readMovement = (m: Movement) => {
    selectMovement(m);
    window.setTimeout(() => jumpTo('tm-mv-detail'), 80);
  };

  const dialIndex = Math.max(0, periods.indexOf((period ?? unknown?.nearest ?? periods[0]) as Period));
  const eraT = periods.length > 1 ? dialIndex / (periods.length - 1) : 0;
  const defaultView = !slug && !params.has('year');
  const index = period ? periods.indexOf(period) : -1;
  const prev = index > 0 ? periods[index - 1] : undefined;
  const next = index >= 0 && index < periods.length - 1 ? periods[index + 1] : undefined;

  const lede = unknown
    ? `The Time Machine spans the ${first?.label} to the ${last?.label}.`
    : !period
      ? ''
      : defaultView
        ? `Turn the clock to travel from the ${first?.label} to the ${last?.label}, then choose a year. Stories are placed by when they happen, not when they were published. ${(counts[period.id] ?? 0) > 0 ? `Starting in ${decadePhrase(period)}, the decade with the most stories.` : `Starting at the beginning: ${decadePhrase(period)}.`}`
        : year != null
          ? `A single year inside ${decadePhrase(period)}. ${YEAR_RULE[lens](year)}`
          : `${period.start}–${period.end}. Turn the clock to change decade, choose a year to narrow the stories, and pick a lens to see what was set, made or published then.`;

  return (
    <div className="page wrap tm-page" data-tier={tier} style={{ ['--era-t' as string]: eraT.toFixed(3) }}>
      <header className="page-head tm-head">
        <p className="kicker">
          <b>Time Machine</b> · culture through time
        </p>
        <h1 className="page-title tm-title" tabIndex={-1}>
          {unknown ? (
            <>
              This era isn’t in the archive <em>yet</em>
            </>
          ) : year != null ? (
            <>
              The year <em>{year}</em>
            </>
          ) : (
            <>
              The <em>{period?.label}</em>
            </>
          )}
        </h1>
        <p className="page-lede">{lede}</p>
      </header>

      <section id="tm-instrument" className="tm-hero" aria-label="Time controls">
        <div className="tm-instrument">
          <div className="tm-dial-wrap">
            <VertebralClock
              periods={periods}
              value={dialIndex}
              counts={counts}
              movementCounts={movementCounts}
              lensLabel={interestName ? `${LENS_LABEL[lens]} · ${interestName}` : LENS_LABEL[lens]}
              reduced={reduced}
              onCommit={commitDecade}
              describedBy="tm-dial-hint"
              hubLabel={year != null ? String(year) : undefined}
              hubMovements={ctx?.movements.length}
              yearMarks={unknown ? undefined : years.map((y) => ({ year: y, count: yearCounts.get(y) ?? 0, selected: y === year }))}
            />
          </div>
          <p id="tm-dial-hint" className="tm-hint">
            Drag the stylus, tap a decade or use the arrow keys. Brighter vertebrae hold more stories; the chosen one opens into its years.
          </p>

          {period && !unknown ? (
            <>
              <div className="tm-strand">
                <div className="tm-strand-head">
                  <p className="tm-strand-label">
                    <span className="kicker">
                      <b>Year</b>
                    </span>
                    <span className="tm-strand-range">
                      in {decadePhrase(period)} · {year != null ? plural(yearCounts.get(year) ?? 0, 'story', 'stories') + ` in ${year}` : plural(counts[period.id] ?? 0, 'story', 'stories')}
                    </span>
                  </p>
                  <nav className="tm-strand-nav" aria-label="Neighbouring decades">
                    {prev ? (
                      <Link to={hrefFor(prev)} preventScrollReset className="tm-hop" aria-label={`Previous decade, ${prev.label}`} onClick={() => sound.play('transition')}>
                        <Icon name="left" size={16} />
                        <span aria-hidden="true">{prev.label}</span>
                      </Link>
                    ) : null}
                    {next ? (
                      <Link to={hrefFor(next)} preventScrollReset className="tm-hop" aria-label={`Next decade, ${next.label}`} onClick={() => sound.play('transition')}>
                        <span aria-hidden="true">{next.label}</span>
                        <Icon name="right" size={16} />
                      </Link>
                    ) : null}
                  </nav>
                </div>
                <YearStrand years={years} counts={yearCounts} total={counts[period.id] ?? 0} decadeLabel={period.label} value={year} reduced={reduced} onCommit={commitYear} describedBy="tm-strand-hint" />
                <p id="tm-strand-hint" className="tm-hint tm-strand-hint">
                  Choose a year, or drag along the strand. Filaments rise where a year holds stories.
                </p>
              </div>
              <div className="tm-lens">
                <Segmented label="Lens" value={lens} onChange={setLens} options={LENSES.map((l) => ({ value: l, label: `${LENS_LABEL[l]} · ${l === lens ? inView.length : range ? storiesIn(cat, l, range).length : 0}` }))} />
                <p className="tm-lens-explain">{LENS_EXPLAIN}</p>
              </div>
            </>
          ) : null}
        </div>

        <div className="tm-reading">
          {period && ctx && !unknown ? (
            <EraPanel period={period} year={year} lens={lens} ctx={ctx} presence={presence} inView={inView.length} interest={interest} selectedMovement={selectedMovement} onInterest={setInterest} onMovement={readMovement} />
          ) : unknown ? (
            <div className="tm-beyond panel panel-pad" role="status">
              <span className="tm-beyond-glyph" aria-hidden="true">
                <Icon name="time" size={30} />
              </span>
              <h2 className="tm-beyond-title serif">“{unknown.slug}” is beyond the clock’s reach</h2>
              <p>
                The archive covers {first?.label}–{last?.label}, up to {thisYear}.{' '}
                {unknown.nearest ? `The nearest decade it holds is ${decadePhrase(unknown.nearest)}.` : 'That address isn’t a decade or year the Time Machine recognises.'}
              </p>
              <div className="tm-beyond-actions">
                {unknown.nearest ? (
                  <ButtonLink to={timeHref(cat, unknown.nearest, { ...state, year: null })} variant="primary" icon="time">
                    Go to {decadePhrase(unknown.nearest)}
                  </ButtonLink>
                ) : null}
                <ButtonLink to="/time-machine" variant="ghost">
                  Start at the beginning
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {period && ctx && range && !unknown ? (
        <>
          <section id="tm-stories" className="section tm-stories" aria-labelledby="tm-stories-h">
            <SectionHeader id="tm-stories-h" kicker={`Lens · ${LENS_LABEL[lens]}`} title={`${interestName ? `${interestName} stories` : 'Stories'} ${LENS_VERB[lens]} ${phrase}`}>
              <span aria-live="polite" aria-atomic="true">
                {plural(results.length, interestName ? `${interestName.toLowerCase()} story` : 'story', interestName ? `${interestName.toLowerCase()} stories` : 'stories')} {LENS_VERB[lens]} {phrase}.
              </span>{' '}
              Every story shows when it is set, when it was made and when it was published.
            </SectionHeader>

            <ActiveFilters
              year={year}
              lens={lens}
              interestName={interestName}
              onYear={() => commitYear(null)}
              onLens={() => setLens('setting')}
              onInterest={() => setInterest(null)}
              onAll={() => go({ year: null, lens: 'setting', interest: null }, false)}
            />

            {results.length ? (
              <ul className="tm-grid" aria-label={`${results.length} results`}>
                {results.map((v, i) => (
                  <li key={v.id}>
                    <TimeCard video={v} lens={lens} decade={period} year={year} priority={i < 3} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyTime
                period={period}
                periods={periods}
                year={year}
                lens={lens}
                range={range}
                interest={interest}
                interestName={interestName}
                inViewCount={inView.length}
                carriers={presence.find((p) => p.category.id === interest)?.movements ?? []}
                counts={countsByLens}
                allYearCounts={allYearCounts}
                bounds={bounds}
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
                    <dt>
                      <span className={`badge badge-footage badge-f-${f}`}>{FOOTAGE_LABEL[f]}</span>
                    </dt>
                    <dd>{FOOTAGE_MEANING[f]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section id="tm-movements" className="section" aria-labelledby="tm-movements-h" data-reveal>
            <SectionHeader
              id="tm-movements-h"
              kicker="Movements · span timeline"
              title={`Alive in ${phrase}`}
              action={
                <Segmented
                  label="Movements shown"
                  hideLabel
                  value={showAll ? 'all' : 'active'}
                  onChange={(v) => setShowAll(v === 'all')}
                  options={[
                    { value: 'active', label: `Active · ${ctx.movements.length}` },
                    { value: 'all', label: `All · ${cat.movements.length}` },
                  ]}
                />
              }
            >
              Bars span each movement’s real years across {first?.label}–{last?.label}; the frost column is {year != null ? year : decadePhrase(period)}. A left arrow marks roots older than the clock, a right arrow a movement still going.
            </SectionHeader>
            {(() => {
              const list = showAll ? cat.movements : ctx.movements.concat(selectedMovement && !ctx.movements.includes(selectedMovement) ? [selectedMovement] : []);
              return list.length ? (
                <div className="tm-mv-layout">
                  <MovementSpans periods={periods} movements={list} decade={period} range={range} phrase={phrase} selected={selectedMovement} onSelect={selectMovement} />
                  {selectedMovement ? (
                    <MovementDetail movement={selectedMovement} range={range} phrase={phrase} onClose={() => selectMovement(null)} />
                  ) : (
                    <div className="tm-mv tm-mv-empty panel panel-pad">
                      <Icon name="wave" size={22} />
                      <p>Choose a movement to read its dates, facts, places and lineage.</p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState icon="wave" tone="plasma" title={`No movements recorded for ${phrase}`}>
                  <p>Switch to “All” to see every movement on the timeline.</p>
                </EmptyState>
              );
            })()}
          </section>

          <section id="tm-lineage" className="section" aria-labelledby="tm-lineage-h" data-reveal>
            <SectionHeader id="tm-lineage-h" kicker="Connections through time" title={`Roots & echoes of ${phrase}`}>
              From what {phrase} drew on, through the movements alive then, to the movements and the programmes on Monumental that carry it today. Point at or focus any node to light its thread.
            </SectionHeader>
            <Lineage phrase={phrase} label={year != null ? String(year) : period.label} ctx={ctx} />
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ───────────── Active filters: what is narrowing the stories, each removable ───────────── */

function ActiveFilters({ year, lens, interestName, onYear, onLens, onInterest, onAll }: { year: number | null; lens: Lens; interestName: string | null; onYear: () => void; onLens: () => void; onInterest: () => void; onAll: () => void }) {
  const items: { key: string; label: string; remove: string; run: () => void }[] = [];
  if (year != null) items.push({ key: 'year', label: `Year ${year}`, remove: `Clear year ${year}, show the whole decade`, run: onYear });
  if (interestName) items.push({ key: 'interest', label: interestName, remove: `Remove category ${interestName}`, run: onInterest });
  if (lens !== 'setting') items.push({ key: 'lens', label: `Lens: ${LENS_LABEL[lens]}`, remove: `Remove Lens: ${LENS_LABEL[lens]} (back to ${LENS_LABEL.setting})`, run: onLens });
  if (!items.length) return null;
  return (
    <div className="tm-active">
      <span className="tm-active-label">Showing</span>
      <ul aria-label="Active filters">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              className="tm-pill"
              aria-label={it.remove}
              onClick={() => {
                sound.play('unsave');
                it.run();
              }}
            >
              <span>{it.label}</span>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <Button variant="quiet" size="sm" onClick={onAll}>
          Clear all
        </Button>
      ) : null}
    </div>
  );
}

/* ───────────── Graceful emptiness: nearest years or decades, and the real stories closest in time ───────────── */

function EmptyTime({
  period,
  periods,
  year,
  lens,
  range,
  interest,
  interestName,
  inViewCount,
  carriers,
  counts,
  allYearCounts,
  bounds,
  hrefFor,
  hrefForYear,
  setLens,
  clearInterest,
}: {
  period: Period;
  periods: Period[];
  year: number | null;
  lens: Lens;
  range: TimeRange;
  interest: ID | null;
  interestName: string | null;
  inViewCount: number;
  carriers: Movement[];
  counts: Record<Lens, Record<ID, number>>;
  allYearCounts: Map<number, number>;
  bounds: TimeRange;
  hrefFor: (p: Period) => string;
  hrefForYear: (y: number) => string;
  setLens: (l: Lens) => void;
  clearInterest: () => void;
}) {
  const cat = useCatalogue();
  const phrase = rangePhrase(period, year);
  const noun = interestName ? `${interestName.toLowerCase()} stories` : 'stories';
  const nearDecades = year == null ? nearestStoried(periods, counts[lens], periods.indexOf(period)) : {};
  const nearYrs = year != null ? nearestYears(allYearCounts, year, bounds) : {};
  const closest = useMemo(() => nearestStories(cat, lens, range, interest, 3), [cat, lens, range, interest]);
  const otherLens = LENSES.filter((l) => l !== lens)
    .map((l) => ({ l, n: Object.values(counts[l]).reduce((a, b) => a + b, 0) }))
    .filter((x) => x.n > 0)[0];
  const decadeOf = (v: Video): TimeRange => {
    const s = storySpan(v, lens);
    return (s && periods.find((p) => s.start >= p.start && s.start <= p.end)) || period;
  };

  const near =
    year == null
      ? [nearDecades.before, nearDecades.after].filter((x): x is NonNullable<typeof x> => !!x)
      : [];
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
                {nearDecades.before.period.label} · {nearDecades.before.count}
              </ButtonLink>
            ) : null}
            {year == null && nearDecades.after ? (
              <ButtonLink to={hrefFor(nearDecades.after.period)} preventScrollReset iconAfter="right">
                {nearDecades.after.period.label} · {nearDecades.after.count}
              </ButtonLink>
            ) : null}
            {year != null && nearYrs.before ? (
              <ButtonLink to={hrefForYear(nearYrs.before.year)} preventScrollReset icon="left">
                {nearYrs.before.year} · {nearYrs.before.count}
              </ButtonLink>
            ) : null}
            {year != null && nearYrs.after ? (
              <ButtonLink to={hrefForYear(nearYrs.after.year)} preventScrollReset iconAfter="right">
                {nearYrs.after.year} · {nearYrs.after.count}
              </ButtonLink>
            ) : null}
            {interest && inViewCount > 0 ? (
              <Button icon="filter" onClick={clearInterest}>
                Show all {plural(inViewCount, 'story', 'stories')}
              </Button>
            ) : null}
            {!near.length && !nearY.length && !(interest && inViewCount) && otherLens ? (
              <Button icon="time" onClick={() => setLens(otherLens.l)}>
                Try “{LENS_LABEL[otherLens.l]}” · {otherLens.n}
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
          {carriers.length ? `${interestName} is carried in ${phrase} by ${carriers.map((m) => m.name).join(', ')} — see the movements below.` : 'The movements, places and people of this time still map it.'}
        </p>
      </EmptyState>

      {closest.length ? (
        <div className="tm-closest" aria-labelledby="tm-closest-h" role="group">
          <h3 id="tm-closest-h" className="tm-closest-h">
            Closest in time
          </h3>
          <ul className="tm-grid tm-grid-near">
            {closest.map((n) => (
              <li key={n.video.id}>
                <TimeCard video={n.video} lens={lens} decade={decadeOf(n.video)} year={null} note={distanceLabel(n)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
