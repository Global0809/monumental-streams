/**
 * TAKE ME SOMEWHERE — the Discovery Instrument.
 *
 * Four rotary knobs (interest, time, where, mood) dial a trip; GO plans it with the shared
 * journey planner, which fits whole stories into the time window using measured runtimes.
 * The URL is the source of truth (/somewhere?interest=&minutes=&where=&mood=&seed=): the
 * knobs are a local "dialled" state that resets to the URL on navigation, GO pushes a new
 * history entry with a fresh seed, and the itinerary is rebuilt deterministically from the URL.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { planJourney, type JourneyPlan } from '../../../shared/journey.ts';
import type { Mood } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { PROVENANCE_LABEL, plural, runtimeLabel, timecode } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { isTouch } from '../../systems/device.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState, toast } from '../../ui/feedback.tsx';
import { announceSave } from '../../ui/save.ts';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art, FootageBadges, ReasonChips } from '../../ui/Pod.tsx';
import { Knob } from './Knob.tsx';
import {
  budgetLabel,
  dialEquals,
  dialFromParams,
  dialToSearch,
  interestOptions,
  journeyKey,
  journeyParams,
  journeyTitle,
  minuteOptions,
  moodOptions,
  newSeed,
  playableStories,
  poolStats,
  queueHref,
  relaxedLabels,
  whereOptions,
  withOption,
  type Dial,
} from './logic.ts';
import { StudioLoop } from './StudioLoop.tsx';
import './somewhere.css';

const CHAPTERS_IDLE = [{ id: 'tms-instrument', label: 'Instrument' }];
const CHAPTERS_PLAN = [
  { id: 'tms-instrument', label: 'Instrument' },
  { id: 'tms-itinerary', label: 'Itinerary' },
];
/** How long the preview shimmers after GO while the new route settles in. */
const SHUFFLE_MS = 620;

export default function SomewherePage() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const { session } = useSession();
  const premium = session.membership.premium;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Take Me Somewhere · Monumental Streams';
  }, []);

  /* ── URL state (committed) and dialled state (local) ── */
  const committed = useMemo(() => dialFromParams(new URLSearchParams(location.search), cat), [location.search, cat]);
  const [dial, setDial] = useState<Dial>(committed.dial);
  useEffect(() => setDial(committed.dial), [committed]);

  const options = useMemo(() => {
    const c = committed.dial;
    return {
      interest: withOption(interestOptions(cat), c.interest ?? '', c.interest ? cat.label(c.interest) : ''),
      minutes: minuteOptions(),
      where: withOption(whereOptions(cat), c.where ?? '', c.where ? cat.label(c.where) : ''),
      mood: moodOptions(),
    };
  }, [cat, committed]);

  const plan = useMemo<JourneyPlan | null>(() => {
    if (committed.seed === null) return null;
    const c = committed.dial;
    return planJourney(cat, { interest: c.interest ?? undefined, minutes: c.minutes, where: c.where ?? undefined, mood: c.mood ?? undefined, seed: committed.seed, premium });
  }, [cat, committed, premium]);

  const dirty = plan !== null && !dialEquals(dial, committed.dial);
  const stats = useMemo(() => poolStats(cat, dial, premium), [cat, dial, premium]);
  const anyPlayable = useMemo(() => playableStories(cat).length > 0, [cat]);
  useChapters(plan ? CHAPTERS_PLAN : CHAPTERS_IDLE);

  /* ── GO: push a new seed; the preview shimmers softly while the route settles (not under reduced motion) ── */
  const [shuffling, setShuffling] = useState(false);
  const timer = useRef<number | null>(null);
  const reveal = useRef(false);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const startShuffle = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (isReducedMotion()) return setShuffling(false);
    setShuffling(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setShuffling(false);
    }, SHUFFLE_MS);
  };

  const go = (next: Dial = dial) => {
    sound.play('transition');
    startShuffle();
    reveal.current = true;
    navigate({ search: `?${dialToSearch(cat, next, newSeed(committed.seed))}` });
  };

  // After GO, bring the itinerary into view when it starts below the fold (phones).
  useEffect(() => {
    if (!reveal.current || !plan) return;
    reveal.current = false;
    const section = document.getElementById('tms-itinerary');
    if (!section || section.getBoundingClientRect().top < window.innerHeight * 0.8) return;
    section.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('tms-itinerary-title')?.focus({ preventScroll: true });
  }, [plan]);

  const setKnob = (patch: Partial<Dial>) => setDial((d) => ({ ...d, ...patch }));
  const flagFor = (key: 'interest' | 'where' | 'mood') => (plan && !dirty && plan.items.length && plan.relaxed.includes(key) ? 'Widened to fill your time' : undefined);

  /* ── The preview: what is dialled, and what GO would (or did) plan ── */
  const labelOf = (list: { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? '';
  const tags = [
    labelOf(options.where, dial.where ?? '') || 'Anywhere',
    dial.interest ? labelOf(options.interest, dial.interest) : 'Any interest',
    `${dial.minutes} min`,
    dial.mood ? labelOf(options.mood, dial.mood) : 'Any mood',
  ];
  const showPlanOnScreen = plan && !dirty && !shuffling;
  const summary = !anyPlayable
    ? 'No stories are playable right now'
    : showPlanOnScreen && plan.items.length
      ? `${budgetLabel(plan.totalSeconds, plan.budgetSeconds)} planned across ${plural(plan.items.length, 'stop')}`
      : stats.count
        ? `${plural(stats.count, 'story', 'stories')} ${stats.count === 1 ? 'matches' : 'match'} exactly · ${runtimeLabel(stats.seconds)} to choose from${stats.locked ? ` · ${stats.locked} more for members` : ''}`
        : `Nothing matches every knob${stats.locked ? ` (${stats.locked} for members)` : ''} — GO widens your choices`;

  return (
    <div className="page wrap tms-page">
      <header className="tms-head">
        <div className="tms-head-text">
          <p className="kicker">Discovery instrument</p>
          <h1 className="page-title">
            Take me <em>somewhere</em>
          </h1>
          <p className="page-lede">Turn the knobs, press GO, and the instrument fits whole stories into the time you have — then tells you why each one is there.</p>
        </div>
        <StudioLoop art="art:take-me-somewhere" caption="Studio loop" className="tms-head-loop" />
      </header>

      <section id="tms-instrument" className="tms-instrument" aria-labelledby="tms-instrument-title">
        <h2 id="tms-instrument-title" className="sr-only">
          The instrument
        </h2>
        <div className="tms-console" data-dirty={dirty || undefined}>
          <div className="tms-screen">
            <p className="tms-screen-tags" aria-hidden="true">
              {tags.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </p>
            <div className="tms-screen-body" aria-hidden="true">
              {shuffling ? (
                <ul className="tms-screen-list" data-shuffle="">
                  {[0, 1, 2].map((i) => (
                    <li key={i} style={{ '--i': i } as CSSProperties}>
                      <span className="tms-shimmer" />
                    </li>
                  ))}
                </ul>
              ) : showPlanOnScreen && plan.items.length ? (
                <ul className="tms-screen-list">
                  {plan.items.slice(0, 3).map(({ video }, i) => (
                    <li key={video.id} style={{ '--i': i } as CSSProperties}>
                      <span className="tms-screen-n">{i + 1}</span>
                      <span className="tms-screen-title">{video.title}</span>
                      <span className="tms-screen-time">{timecode(cat.runtime(video) ?? 0)}</span>
                    </li>
                  ))}
                  {plan.items.length > 3 ? <li className="tms-screen-more">and {plural(plan.items.length - 3, 'more stop')}</li> : null}
                </ul>
              ) : (
                <p className="tms-screen-prompt">
                  {showPlanOnScreen ? 'Nothing fits — try a longer window' : dirty ? 'Settings changed — press GO' : 'Dial a trip, then press GO'}
                </p>
              )}
            </div>
            <p className="tms-screen-foot">{summary}</p>
          </div>

          <div className="tms-knobs" role="group" aria-label="Journey settings">
            <Knob name="Interest" options={options.interest} value={dial.interest ?? ''} onChange={(v) => setKnob({ interest: v || null })} flag={flagFor('interest')} />
            <Knob name="Time" options={options.minutes} value={String(dial.minutes)} onChange={(v) => setKnob({ minutes: Number(v) })} />
            <Knob name="Where" options={options.where} value={dial.where ?? ''} onChange={(v) => setKnob({ where: v || null })} flag={flagFor('where')} />
            <Knob name="Mood" options={options.mood} value={dial.mood ?? ''} onChange={(v) => setKnob({ mood: (v || null) as Mood | null })} flag={flagFor('mood')} />
          </div>

          <div className="tms-go-well" data-primary={!plan || dirty || undefined}>
            <button type="button" className="tms-go" onClick={() => go()} data-cursor="play" data-cursor-label={plan && !dirty ? "Spin again" : "Plan my journey"}>
              <span className="tms-go-word">GO</span>
              <span className="sr-only"> — plan my journey</span>
            </button>
            <p className="tms-go-hint" aria-hidden="true">
              {plan && !dirty ? 'Press again for another route' : 'Plan a journey'}
            </p>
          </div>
        </div>
        <p className="tms-footnote">
          <Icon name="info" size={16} />
          <span>
            Every stop is a whole story you can watch now. If nothing fits a knob exactly, the instrument widens mood first, then interest, then place — and says so.
          </span>
        </p>
        <p className="sr-only" aria-live="polite">
          {plan ? `${plural(plan.items.length, 'stop')} planned. ${plan.explanation}` : ''}
        </p>
      </section>

      {plan && committed.seed !== null ? <Itinerary plan={plan} dial={committed.dial} seed={committed.seed} dirty={dirty} saved={lib.journeys} onRetry={go} /> : null}
    </div>
  );
}

/* ───────────── Itinerary ───────────── */

function Itinerary({ plan, dial, seed, dirty, saved, onRetry }: { plan: JourneyPlan; dial: Dial; seed: number; dirty: boolean; saved: ReturnType<typeof useLibrary>['journeys']; onRetry: (d: Dial) => void }) {
  const cat = useCatalogue();
  const id = journeyKey(cat, dial, seed);
  const title = journeyTitle(cat, dial);
  const isSaved = !!saved[id] && !saved[id].removed;
  const videos = plan.items.map((i) => i.video);
  const start = queueHref(videos);

  const save = () =>
    libraryActions.saveJourney({ id, title, kind: 'somewhere', stops: videos.map((v) => v.id), params: journeyParams(cat, dial, seed) });
  const toggleSave = (e: MouseEvent<HTMLButtonElement>) => {
    if (isSaved) {
      libraryActions.removeJourney(id);
      announceSave({ saved: false, title, message: 'Journey removed from My World', undo: save });
    } else {
      save();
      announceSave({ saved: true, title, from: e.currentTarget, undo: () => libraryActions.removeJourney(id) });
    }
  };
  const share = async () => {
    const url = `${window.location.origin}/somewhere?${dialToSearch(cat, dial, seed)}`;
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
      toast('Link copied — it rebuilds this exact journey', { tone: 'success' });
    } catch {
      toast(`Copy this link: ${url}`, { ms: 10000 });
    }
  };

  let offset = 0;
  const budget = Math.max(1, plan.budgetSeconds);

  return (
    <section id="tms-itinerary" className="section tms-itinerary" aria-labelledby="tms-itinerary-title">
      <header className="tms-it-head">
        <p className="kicker">Your itinerary</p>
        <h2 id="tms-itinerary-title" className="section-title" tabIndex={-1}>
          {plan.items.length ? title : 'No journey this time'}
        </h2>
        <p className="tms-explain">{plan.explanation}</p>
      </header>

      {dirty ? (
        <p className="notice tms-dirty">
          <Icon name="info" size={18} />
          <span>You’ve turned the knobs since this plan. These stops still match the link; press GO to plan with your new settings.</span>
        </p>
      ) : null}

      {plan.items.length ? (
        <>
          <div className="tms-summary">
            <div className="tms-meter">
              <p className="tms-meter-label">
                <span className="tms-meter-total">{timecode(plan.totalSeconds)}</span>
                <span className="mono"> of {timecode(plan.budgetSeconds)}</span>
                <span className="mono tms-meter-spare"> · {timecode(Math.max(0, plan.budgetSeconds - plan.totalSeconds))} to spare</span>
              </p>
              <div className="tms-meter-track" aria-hidden="true">
                {plan.items.map(({ video }) => (
                  <span key={video.id} style={{ width: `${((cat.runtime(video) ?? 0) / budget) * 100}%` }} />
                ))}
              </div>
            </div>
            <div className="tms-actions">
              {start ? (
                <ButtonLink to={start} variant="primary" size="lg" icon="play" data-cursor="play" data-cursor-label="Watch">
                  Start journey
                </ButtonLink>
              ) : null}
              <Button variant="chrome" icon="dice" onClick={() => onRetry(dial)}>
                Spin again
              </Button>
              <Button variant="chrome" icon={isSaved ? 'saved' : 'save'} aria-pressed={isSaved} onClick={toggleSave} data-cursor="save" data-cursor-label={isSaved ? 'In My World' : 'Save to My World'}>
                {isSaved ? 'Saved journey' : 'Save journey'}
              </Button>
              <Button variant="quiet" icon="share" onClick={share}>
                Share
              </Button>
            </div>
          </div>

          {plan.relaxed.length ? (
            <p className="notice tms-relaxed">
              <Icon name="info" size={18} />
              <span>
                Not enough matched every knob, so the instrument widened your {relaxedLabels(cat, dial, plan.relaxed).join(' and ')} to fill the time.
              </span>
            </p>
          ) : null}

          <ol className="tms-stops">
            {plan.items.map(({ video, reasons }, i) => {
              const runtime = cat.runtime(video) ?? 0;
              const at = offset;
              offset += runtime;
              const href = cat.href(video.id);
              return (
                <li key={video.id} className="tms-stop" style={{ '--i': i } as CSSProperties}>
                  <Link to={href} className="tms-stop-art" tabIndex={-1} aria-hidden="true" data-cursor="play" data-cursor-label="Watch">
                    <Art art={video.art} alt="" />
                    <span className="tms-stop-num">{i + 1}</span>
                  </Link>
                  <div className="tms-stop-body">
                    <p className="tms-stop-at">
                      Stop {i + 1} · from <span className="tms-tc">{timecode(at)}</span> · {runtimeLabel(runtime)}
                    </p>
                    <h3 className="tms-stop-title">
                      <Link to={href}>{video.title}</Link>
                    </h3>
                    <p className="tms-stop-badges">
                      <AccessBadge video={video} />
                      <FootageBadges video={video} max={2} />
                      <span className="tms-stop-prov">{PROVENANCE_LABEL[video.provenance]}</span>
                    </p>
                    <ReasonChips reasons={reasons} max={3} />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <EmptyState
          icon="time"
          title="Nothing fits that window yet"
          actions={
            <>
              {dial.minutes < 90 ? (
                <Button variant="primary" icon="time" onClick={() => onRetry({ ...dial, minutes: 90 })}>
                  Try 90 minutes
                </Button>
              ) : null}
              <ButtonLink to="/search" variant="ghost" icon="search">
                Search everything
              </ButtonLink>
            </>
          }
        >
          <p>{plan.explanation}</p>
        </EmptyState>
      )}
    </section>
  );
}
