/**
 * Programme card (series, chapters, campaigns, demonstration series) plus the small
 * shared pieces programme-shaped screens use: the honest status mark and the loop toggle.
 * A card is a poster behind a hairline luminous rim with one mark (its status) and the
 * caption below; hovering it lights the programme's stories in the world.
 */
import { useRef } from 'react';
import { Link } from 'react-router';
import type { Programme, ProgrammeStatus, Reason } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Art, ReasonChips } from '../../ui/Pod.tsx';
import { PROGRAMME_KIND_LABEL, PROGRAMME_STATUS_LABEL, programmeTally, tallyLabel } from './programme-model.ts';
import { useHighlightPreview } from '../watch/seed.ts';
import { useLoop } from './useLoop.ts';
import './programme.css';

export function StatusBadge({ status }: { status: ProgrammeStatus }) {
  return (
    <span className={`badge prog-status prog-status-${status}`}>
      <span className="prog-status-node" aria-hidden="true" />
      {PROGRAMME_STATUS_LABEL[status]}
    </span>
  );
}

export function OriginalBadge() {
  return <span className="badge prog-original">Monumental Original</span>;
}

/** Pause / play for a background loop (WCAG 2.2.2). Rendered only when there is a loop. */
export function LoopToggle({ playing, onToggle, className = '', label = 'background motion' }: { playing: boolean; onToggle: () => void; className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={`icon-btn btn-chrome prog-loop-toggle ${className}`}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      title={playing ? `Pause ${label}` : `Play ${label}`}
      onClick={() => {
        sound.play('tick');
        onToggle();
      }}
    >
      <Icon name={playing ? 'pause' : 'play'} size={18} />
    </button>
  );
}

export function ProgrammeCard({ programme, reasons, compact }: { programme: Programme; reasons?: Reason[]; compact?: boolean }) {
  const cat = useCatalogue();
  const art = cat.artFor(programme.art);
  const vid = useRef<HTMLVideoElement>(null);
  const loop = useLoop(vid, art?.previewSmall ? { small: art.previewSmall, large: art.previewSmall } : null);
  const tally = programmeTally(cat, programme);
  const parent = programme.parent ? cat.get(programme.parent) : undefined;
  const href = cat.href(programme.id);
  const preview = useHighlightPreview(() => cat.videosForProgramme(programme.id).map((v) => v.id));
  const wake = () => {
    loop.wake();
    preview.start();
  };
  const sleep = () => {
    loop.sleep();
    preview.end();
  };

  return (
    <article
      className={`prog-card ${compact ? 'prog-card-compact' : ''}`}
      data-status={programme.status}
      data-original={programme.original || undefined}
      onPointerEnter={wake}
      onPointerLeave={sleep}
      onFocus={wake}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) sleep();
      }}
    >
      <div className="prog-card-art" aria-hidden="true">
        <Art art={programme.art} alt="" />
        {art?.previewSmall ? <video ref={vid} className="prog-card-preview" muted loop playsInline preload="none" tabIndex={-1} data-on={loop.playing || undefined} /> : null}
        <span className="prog-card-rim" />
        <span className="prog-card-mark">
          <StatusBadge status={programme.status} />
        </span>
      </div>
      <div className="prog-card-body">
        <h3 className="prog-card-title">
          <Link to={href} data-cursor="open" data-cursor-label="Programme" onClick={() => sound.play('transition')}>
            {programme.title}
            <span className="sr-only">
              , {PROGRAMME_KIND_LABEL[programme.kind]}, {PROGRAMME_STATUS_LABEL[programme.status]}
            </span>
          </Link>
        </h3>
        <p className="prog-card-meta">
          {programme.original ? 'Monumental Original · ' : ''}
          {PROGRAMME_KIND_LABEL[programme.kind]}
          {parent ? ` · Part of ${cat.label(parent.id)}` : ''}
          {art?.provisional ? ' · Provisional art' : ''}
        </p>
        <p className="prog-card-tagline">{programme.tagline}</p>
        {!compact ? <p className="prog-card-note">{programme.statusNote}</p> : null}
        {reasons?.length ? <ReasonChips reasons={reasons} max={2} /> : null}
        <p className="prog-card-tally">
          <span className="prog-card-tally-node" aria-hidden="true" data-live={tally.playable > 0 || undefined} />
          {tallyLabel(tally)}
        </p>
      </div>
    </article>
  );
}

