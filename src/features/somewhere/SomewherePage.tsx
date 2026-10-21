/**
 * TAKE ME SOMEWHERE — the Discovery Instrument, played against the living world.
 *
 * Four rotary knobs (interest, time, where, mood) dial a trip. While you turn them, the world
 * lights the stories GO would draw from. GO plans the trip with the shared journey planner,
 * which fits whole stories into the time window using measured runtimes — and the plan comes
 * forward in the world: the first stop in focus, the other stops around it, joined by light.
 *
 * The URL is the source of truth (/somewhere?interest=&minutes=&where=&mood=&seed=): the knobs
 * are a local "dialled" state that resets to the URL on navigation, GO pushes a new history
 * entry with a fresh seed, and the itinerary is rebuilt deterministically from the URL.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { planJourney, type JourneyPlan } from '../../../shared/journey.ts';
import type { Mood, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { FOOTAGE_LABEL, PROVENANCE_LABEL, plural, runtimeLabel, timecode } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { isTouch } from '../../systems/device.ts';
import { isReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, ReasonChips, useAccessState } from '../../ui/Pod.tsx';
import { announceSave } from '../../ui/save.ts';
import { seedHover, useSeedLitAny } from '../you/world-link.ts';
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
  poolIds,
  poolStats,
  queueHref,
  relaxedLabels,
  whereOptions,
  withOption,
  worldFor,
  type Dial,
} from './logic.ts';
import './somewhere.css';

const CHAPTERS_IDLE = [{ id: 'tms-instrument', label: 'Instrument' }];
const CHAPTERS_PLAN = [
  { id: 'tms-instrument', label: 'Instrument' },
  { id: 'tms-itinerary', label: 'Itinerary' },
];
/** How long the GO well stays "spinning" after a press while the world re-forms. */
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
  const pool = useMemo(() => poolIds(cat, dial, premium), [cat, dial, premium]);
  const anyPlayable = useMemo(() => playableStories(cat).length > 0, [cat]);
  useChapters(plan ? CHAPTERS_PLAN : CHAPTERS_IDLE);

  /* ── The world: the dialled pool lights while you turn; the plan comes forward once planned ── */
  const showPlan = plan !== null && !dirty && plan.items.length > 0;
  const world = useMemo(() => worldFor(showPlan ? plan!.items.map((i) => i.video.id) : null, pool), [showPlan, plan, pool]);
  useArrangement(world.arrangement, world.highlight);

  /* ── GO: push a new seed; the well spins briefly while the world re-forms (not under reduced motion) ── */
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

  const summary = !anyPlayable
    ? 'No stories are playable right now'
    : showPlan
      ? `${budgetLabel(plan!.totalSeconds, plan!.budgetSeconds)} planned across ${plural(plan!.items.length, 'stop')}`
      : stats.count
        ? `${plural(stats.count, 'story', 'stories')} ${stats.count === 1 ? 'matches' : 'match'} exactly · ${runtimeLabel(stats.seconds)} to choose from${stats.locked ? ` · ${stats.locked} more for members` : ''}`
        : `Nothing matches every knob${stats.locked ? ` (${stats.locked} for members)` : ''} — GO widens your choices`;
  const prompt = plan && !dirty ? (plan.items.length ? 'Press again for another route' : 'Nothing fits — try a longer window') : dirty ? 'Settings changed — press GO' : 'Plan a journey';

  return (
    <div className="page tms-page">
      <header className="wrap tms-head">
        <p className="eyebrow">Discovery instrument</p>
        <h1 className="page-title tms-title">
          Take me <em>somewhere</em>
        </h1>
        <p className="lede tms-lede">Turn the knobs and the stories that match light up in the world. Press GO and the instrument fits whole stories into the time you have.</p>
      </header>

      <section id="tms-instrument" className="wrap tms-instrument" aria-labelledby="tms-instrument-title">
        <h2 id="tms-instrument-title" className="sr-only">
          The instrument
        </h2>
        <div className="tms-console" data-dirty={dirty || undefined}>
          <div className="tms-knobs" role="group" aria-label="Journey settings">
            <Knob name="Interest" options={options.interest} value={dial.interest ?? ''} onChange={(v) => setKnob({ interest: v || null })} flag={flagFor('interest')} />
            <Knob name="Time" options={options.minutes} value={String(dial.minutes)} onChange={(v) => setKnob({ minutes: Number(v) })} />
            <Knob name="Where" options={options.where} value={dial.where ?? ''} onChange={(v) => setKnob({ where: v || null })} flag={flagFor('where')} />
            <Knob name="Mood" options={options.mood} value={dial.mood ?? ''} onChange={(v) => setKnob({ mood: (v || null) as Mood | null })} flag={flagFor('mood')} />
          </div>

          <div className="tms-go-well" data-primary={!plan || dirty || undefined} data-spinning={shuffling || undefined}>
            <button type="button" className="tms-go" onClick={() => go()} data-cursor="play" data-cursor-label={plan && !dirty ? 'Spin again' : 'Plan my journey'}>
              <span className="tms-go-word">GO</span>
              <span className="sr-only"> — plan my journey</span>
            </button>
            <p className="tms-go-hint" aria-hidden="true">
              {prompt}
            </p>
          </div>
        </div>
        <p className="tms-readout">
          <span className="tms-readout-dot" aria-hidden="true" />
          {summary}
        </p>
        <p className="tms-footnote">
          Every stop is a whole story you can watch now. If nothing fits a knob exactly, the instrument widens mood first, then interest, then place — and says so.
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
    // absolute link that also works under a sub-path (static hosting: BASE_URL)
    const url = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/somewhere?${dialToSearch(cat, dial, seed)}`, window.location.origin).href;
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
    <section id="tms-itinerary" className="wrap section tms-itinerary" aria-labelledby="tms-itinerary-title">
      <header className="tms-it-head">
        <p className="eyebrow">Your itinerary</p>
        <h2 id="tms-itinerary-title" className="title-story tms-it-title" tabIndex={-1}>
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
                <ButtonLink to={start} variant={dirty ? 'ghost' : 'primary'} size="lg" icon="play" data-cursor="play" data-cursor-label="Watch">
                  Start journey
                </ButtonLink>
              ) : null}
              <Button variant="quiet" icon="dice" onClick={() => onRetry(dial)}>
                Spin again
              </Button>
              <Button variant="quiet" icon={isSaved ? 'saved' : 'save'} aria-pressed={isSaved} onClick={toggleSave} data-cursor="save" data-cursor-label={isSaved ? 'In My World' : 'Save to My World'}>
                {isSaved ? 'Saved journey' : 'Save journey'}
              </Button>
              <Button variant="quiet" icon="share" onClick={share}>
                Share
              </Button>
            </div>
          </div>

          {plan.relaxed.length ? (
            <p className="tms-relaxed">
              <Icon name="info" size={16} />
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
              return <Stop key={video.id} video={video} reasons={reasons} index={i} at={at} runtime={runtime} />;
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

/** One stop: reaching it lights its seed; the world's hovered seed lights the stop. */
function Stop({ video, reasons, index, at, runtime }: { video: Video; reasons: JourneyPlan['items'][number]['reasons']; index: number; at: number; runtime: number }) {
  const cat = useCatalogue();
  const access = useAccessState(video);
  const lit = useSeedLitAny([video.id]);
  const href = cat.href(video.id);
  const footage = video.footage.slice(0, 2).map((f) => FOOTAGE_LABEL[f]);
  return (
    <li className="tms-stop" style={{ '--i': index } as CSSProperties} data-seed={video.id} data-world-lit={lit || undefined} {...seedHover(video.id)}>
      <Link to={href} className="tms-stop-art" tabIndex={-1} aria-hidden="true" data-cursor="play" data-cursor-label="Watch">
        <Art art={video.art} alt="" />
        <span className="tms-stop-num">{index + 1}</span>
      </Link>
      <div className="tms-stop-body">
        <p className="tms-stop-at">
          Stop {index + 1} · from <span className="timecode">{timecode(at)}</span> · {runtimeLabel(runtime)}
        </p>
        <h3 className="tms-stop-title">
          <Link to={href}>{video.title}</Link>
        </h3>
        <p className="tms-stop-meta">
          <span className={access.key === 'free' ? undefined : 'tms-stop-access'}>{access.label}</span>
          {footage.map((f) => (
            <span key={f}>{f}</span>
          ))}
          <span>{PROVENANCE_LABEL[video.provenance]}</span>
        </p>
        <ReasonChips reasons={reasons} max={2} />
      </div>
    </li>
  );
}
