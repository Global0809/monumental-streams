/** Player overlays: poster, premium gate, planned / unavailable, errors, end card, shortcuts. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Programme, Video } from '../../../../shared/types.ts';
import { dateLabel, runtimeLabel, timecode } from '../../../lib/format.ts';
import { useCatalogue } from '../../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../../state/library.ts';
import { sound } from '../../../systems/sound/engine.ts';
import { Icon } from '../../../ui/Icon.tsx';
import { Button, ButtonLink } from '../../../ui/controls.tsx';
import { Dialog } from '../../../ui/feedback.tsx';
import { announceSave } from '../../../ui/save.ts';
import { SHORTCUTS } from './keys.ts';
import type { StartPlan } from './resume.ts';

/* ───────────── Poster (before first play) ───────────── */

export function PosterOverlay({ video, plan, runtime, hasCaptions, onStart }: { video: Video; plan: StartPlan; runtime: number | null; hasCaptions: boolean; onStart: (at: number) => void }) {
  const label = plan.reason === 'resume' ? `Resume from ${timecode(plan.at)}` : plan.reason === 'link' ? `Play from ${timecode(plan.at)}` : 'Play';
  return (
    <div className="pl-poster">
      <div className="pl-poster-body">
        <button
          type="button"
          className="pl-start"
          data-cursor="play"
          data-cursor-label={plan.reason === 'resume' ? 'Resume' : 'Watch'}
          aria-label={`${label}: ${video.title}`}
          onClick={() => onStart(plan.at)}
        >
          <span className="pl-orb" aria-hidden="true">
            <Icon name="play" size={34} />
          </span>
          <span className="pl-start-label">{label}</span>
        </button>
        {runtime || hasCaptions ? (
          <p className="pl-poster-meta">
            {runtime ? <span>{runtimeLabel(runtime)}</span> : null}
            {hasCaptions ? <span>Captions</span> : null}
          </p>
        ) : null}
        {plan.reason !== 'start' ? (
          <button type="button" className="pl-text-btn" onClick={() => onStart(0)}>
            <Icon name="replay" size={16} /> Start over
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── States that replace playback ───────────── */

function SaveForLater({ video }: { video: Video }) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  return (
    <Button
      variant={saved ? 'ghost' : 'primary'}
      icon={saved ? 'saved' : 'save'}
      aria-pressed={saved}
      data-cursor="save"
      data-cursor-label={saved ? 'In My World' : 'Save to My World'}
      onClick={(e) => {
        const now = libraryActions.toggleSave(video.id);
        announceSave({
          saved: now,
          title: video.title,
          from: e.currentTarget,
          message: now ? `Saved “${video.title}” — it will be waiting in My World` : undefined,
          undo: () => libraryActions.toggleSave(video.id),
        });
      }}
    >
      {saved ? 'Saved for later' : 'Save for later'}
    </Button>
  );
}

export function GateOverlay({ video, signedIn, message, signInHref, tierName }: { video: Video; signedIn: boolean; message: string; signInHref: string; tierName: string }) {
  return (
    <div className="pl-state pl-state-gate" role="group" aria-label="Premium">
      <div className="pl-state-card">
        <p className="kicker pl-k-gold">
          <Icon name="lock" size={13} strokeWidth={2} /> {tierName}
        </p>
        <p className="pl-state-title serif">This story is part of Premium.</p>
        <p className="pl-state-text">
          {message} {video.availability.note ? <span className="pl-state-note">{video.availability.note}</span> : null}
        </p>
        {video.availability.status === 'early-access' && video.access === 'free' && video.availability.publicFrom ? (
          <p className="pl-state-fine mono">Early access for members · free for everyone from {dateLabel(video.availability.publicFrom)}</p>
        ) : null}
        <div className="pl-state-actions">
          <ButtonLink to="/membership" variant="aurum" icon="diamond">
            See membership
          </ButtonLink>
          {signedIn ? null : (
            <ButtonLink to={signInHref} variant="ghost" icon="user">
              Sign in
            </ButtonLink>
          )}
        </div>
        <p className="pl-state-fine">{signedIn ? 'This account doesn’t have Premium right now.' : 'Already a member? Sign in and it plays right here.'}</p>
      </div>
    </div>
  );
}

const STATUS_WORD: Record<string, string> = {
  planned: 'Planned',
  'coming-soon': 'Coming soon',
  'early-access': 'Early access',
  unavailable: 'Unavailable',
  available: 'Not playable right now',
};

export function PlannedOverlay({ video, programme, serverMessage }: { video: Video; programme?: Programme; serverMessage?: string }) {
  const cat = useCatalogue();
  const a = video.availability;
  const inDev = a.status === 'planned' && programme?.status === 'in-development';
  const word = inDev ? 'In development' : (STATUS_WORD[a.status] ?? 'Not playable yet');
  const mediaMissing = !!video.media && a.status === 'available';
  return (
    <div className="pl-state pl-state-planned" role="group" aria-label={word}>
      <div className="pl-state-card">
        <p className="kicker pl-k-rose">
          {word}
        </p>
        <p className="pl-state-title serif">{mediaMissing ? 'This stream isn’t ready to play yet.' : 'Not released yet — nothing to play here today.'}</p>
        <p className="pl-state-text">
          {mediaMissing ? `${serverMessage ?? 'The server can’t play this video right now.'} Its stream hasn’t been published to the server yet.` : (a.note ?? programme?.statusNote ?? serverMessage ?? 'This video isn’t available to watch yet.')}
        </p>
        {!mediaMissing && (a.publicFrom || !a.note) ? <p className="pl-state-fine mono">{a.publicFrom ? `Listed for ${dateLabel(a.publicFrom)}` : 'No date is listed.'}</p> : null}
        <div className="pl-state-actions">
          <SaveForLater video={video} />
          {programme ? (
            <ButtonLink to={cat.href(programme.id)} variant="ghost" iconAfter="arrow">
              {programme.title.length > 34 ? 'About the programme' : programme.title}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProblemOverlay({ title, detail, onRetry, onNative, busy }: { title: string; detail: string; onRetry: () => void; onNative?: () => void; busy?: boolean }) {
  return (
    <div className="pl-state pl-state-error" role="alert">
      <div className="pl-state-card">
        <p className="kicker pl-k-danger">
          <Icon name="info" size={13} strokeWidth={2} /> Playback interrupted
        </p>
        <p className="pl-state-title serif">{title}</p>
        <p className="pl-state-text">{detail}</p>
        <div className="pl-state-actions">
          <Button variant="primary" icon="replay" onClick={onRetry} busy={busy}>
            Try again
          </Button>
          {onNative ? (
            <Button variant="ghost" icon="settings" onClick={onNative}>
              Use native player
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────── End card ───────────── */

export interface UpNext {
  video: Video;
  href: string;
  label: string;
}

const COUNTDOWN = 8;

export function EndCard({ video, next, picks, autoNext, onReplay, onNext }: { video: Video; next: UpNext | null; picks: Video[]; autoNext: boolean; onReplay: () => void; onNext: () => void }) {
  const cat = useCatalogue();
  const [left, setLeft] = useState<number | null>(next && autoNext ? COUNTDOWN : null);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      onNextRef.current();
      return;
    }
    const id = window.setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  const nextArt = next ? cat.artFor(next.video.art) : null;
  const counting = left !== null;
  return (
    <div className="pl-end" role="group" aria-label="Finished">
      <div className="pl-end-inner">
        <p className="kicker pl-k-iris">You reached the end</p>
        <p className="pl-end-title serif">{video.title}</p>
        <div className="pl-end-actions">
          <Button variant="ghost" icon="replay" onClick={onReplay}>
            Replay
          </Button>
          {next ? (
            <button type="button" className="pl-next" onClick={onNext} data-cursor="play" data-cursor-label="Next" data-counting={counting || undefined}>
              {nextArt ? <img src={nextArt.posterSmall} alt="" className="pl-next-art" loading="lazy" /> : null}
              <span className="pl-next-body">
                <span className="pl-next-kicker mono">{counting ? `Up next in ${left}` : next.label}</span>
                <span className="pl-next-title">{next.video.title}</span>
              </span>
              <span className="pl-next-ring" aria-hidden="true">
                <svg viewBox="0 0 36 36" width="36" height="36">
                  <circle cx="18" cy="18" r="15.5" className="pl-ring-track" />
                  {counting ? <circle cx="18" cy="18" r="15.5" className="pl-ring-fill" style={{ animationDuration: `${COUNTDOWN}s` }} /> : null}
                </svg>
                <Icon name="next" size={14} />
              </span>
            </button>
          ) : null}
          {counting ? (
            <Button variant="quiet" size="sm" onClick={() => setLeft(null)}>
              Cancel autoplay
            </Button>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {counting && left === COUNTDOWN && next ? `Up next: ${next.video.title}, starting in ${COUNTDOWN} seconds. Use Cancel autoplay to stay here.` : ''}
        </p>
        {picks.length ? (
          <div className="pl-end-picks">
            <p className="pl-end-picks-label">Connected stories</p>
            <ul>
              {picks.map((v) => {
                const a = cat.artFor(v.art);
                return (
                  <li key={v.id}>
                    <Link to={cat.href(v.id)} className="pl-pick" onClick={() => sound.play('transition')}>
                      {a ? <img src={a.posterSmall} alt="" loading="lazy" /> : null}
                      <span>{v.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── Shortcuts ───────────── */

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Player shortcuts" labelledBy="pl-shortcuts-title">
      <p className="pl-keys-intro muted">Letters and numbers work anywhere on this page unless you’re typing. Arrow, Home and End keys steer the player once it has focus.</p>
      <dl className="pl-keys">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="pl-keys-row">
            <dt>
              {s.keys.map((k) => (
                <kbd key={k} className="mono">
                  {k}
                </kbd>
              ))}
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
      <p className="pl-keys-intro muted">On touch screens: tap to show or hide the controls, double-tap the left or right third to skip 10 seconds.</p>
    </Dialog>
  );
}
