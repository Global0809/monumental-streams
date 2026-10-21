/**
 * A story as the Time Machine shows it: imagery first, an era stamp on the image for the active
 * lens, a decade ribbon marking where the story's three dates fall, and the three dates spelled
 * out — Set in / Made / Published — so setting is never mistaken for publication. Saving sends an
 * orb of light into My World.
 */
import { useEffect, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { Video } from '../../../shared/types.ts';
import { dateLabel, runtimeLabel, runtimeSpoken, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { canPreview, releasePreview, requestPreview } from '../../systems/previews.ts';
import { flyToMyWorld } from '../../systems/reactive.ts';
import { sound } from '../../systems/sound/engine.ts';
import { toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art, FootageBadges, useAccessState } from '../../ui/Pod.tsx';
import type { Lens } from './chrono.ts';
import { decadeRibbon, type TimeRange } from './timeline.ts';

const STAMP_VERB: Record<Lens, string> = { setting: 'Set', made: 'Made', published: 'Published' };

/** The short date the active lens is about, for the stamp on the image. */
function stampFor(v: Video, lens: Lens): string | null {
  if (lens === 'setting') return v.setting ? settingLabel(v) : null;
  if (lens === 'made') return v.made != null ? String(v.made) : null;
  return dateLabel(v.published);
}

/** "1954–1956" when a setting's label ("c. 1955") hides its span, so a year match is explainable. */
function spanNote(v: Video): string | null {
  if (!v.setting?.label) return null;
  const { from, to } = v.setting;
  const span = from === to ? String(from) : `${from}–${to}`;
  return v.setting.label.includes(span) ? null : span;
}

export function TimeCard({ video, lens, decade, year, note, priority }: { video: Video; lens: Lens; decade: TimeRange; year: number | null; note?: string; priority?: boolean }) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const access = useAccessState(video);
  const art = cat.artFor(video.art);
  const runtime = cat.runtime(video);
  const saved = isSaved(lib, video.id);
  const progress = lib.progress[video.id];
  const pct = progress?.done ? 100 : progress && progress.dur ? Math.min(100, (progress.pos / progress.dur) * 100) : 0;
  const href = cat.href(video.id);
  const playable = cat.isPlayable(video);
  const place = video.places[0] ? cat.label(video.places[0]) : null;
  const vidRef = useRef<HTMLVideoElement>(null);
  const stamp = stampFor(video, lens);
  const span = spanNote(video);
  const ribbon = decadeRibbon(video, decade, year);

  const wake = () => {
    const el = vidRef.current;
    if (!el || !art?.previewSmall || !canPreview()) return;
    if (!el.src) el.src = art.previewSmall;
    requestPreview(el);
  };
  const sleep = () => {
    const el = vidRef.current;
    if (el) releasePreview(el);
  };
  useEffect(() => () => sleep(), []);

  const toggleSave = (e: MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const now = libraryActions.toggleSave(video.id);
    sound.play(now ? 'save' : 'unsave');
    if (now) flyToMyWorld(button);
    toast(now ? `Saved “${video.title}” to My World` : `Removed “${video.title}” from My World`, {
      tone: 'success',
      action: { label: 'Undo', run: () => libraryActions.toggleSave(video.id) },
    });
  };

  return (
    <article className="tc" data-access={access.key} data-saved={saved || undefined} onPointerEnter={wake} onPointerLeave={sleep} onFocus={wake} onBlur={sleep}>
      <Link
        to={href}
        className="tc-media"
        tabIndex={-1}
        aria-hidden="true"
        data-react="tilt light"
        data-cursor={playable ? 'play' : 'open'}
        data-cursor-label={playable ? (access.locked ? 'Preview' : 'Watch') : 'Details'}
      >
        <Art art={video.art} eager={priority} />
        {art?.previewSmall ? <video ref={vidRef} className="tc-preview" muted loop playsInline preload="none" tabIndex={-1} /> : null}
        <span className="tc-scrim" />
        {stamp ? (
          <span className="tc-stamp" data-lens={lens}>
            <span className="tc-stamp-verb">{STAMP_VERB[lens]}</span>
            <span className="tc-stamp-date">{stamp}</span>
          </span>
        ) : null}
        {runtime ? <span className="tc-runtime">{runtimeLabel(runtime)}</span> : null}
        {pct > 0 ? (
          <span className="tc-vein">
            <span style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </Link>

      <div className="tc-body">
        <div className="tc-badges">
          <AccessBadge video={video} />
          <FootageBadges video={video} max={1} />
        </div>
        <h3 className="tc-title">
          <Link to={href} onClick={() => sound.play('transition')}>
            {video.title}
            <span className="sr-only">
              {runtime ? `, ${runtimeSpoken(runtime)}` : ''}, {access.label}
              {progress && !progress.done && progress.pos > 5 ? `, ${Math.round(pct)}% watched` : ''}
            </span>
          </Link>
        </h3>
        {place || note ? (
          <p className="tc-place">
            {place ? <span>{place}</span> : null}
            {note ? <span className="tc-note">{note}</span> : null}
          </p>
        ) : null}

        <div className="tc-ribbon" aria-hidden="true" title={`${decade.start}–${decade.end}`}>
          {ribbon.map((c) => (
            <span key={c.year} data-set={c.set || undefined} data-made={c.made || undefined} data-pub={c.published || undefined} data-sel={c.selected || undefined} />
          ))}
        </div>

        <dl className="tc-dates">
          <div data-on={lens === 'setting' || undefined}>
            <dt>Set in</dt>
            <dd>
              {video.setting ? settingLabel(video) : 'Timeless'}
              {span ? <span className="tc-span"> · {span}</span> : null}
            </dd>
          </div>
          <div data-on={lens === 'made' || undefined}>
            <dt>Made</dt>
            <dd>
              {video.made != null ? video.made : '—'}
              {video.made == null ? <span className="sr-only"> (not recorded)</span> : null}
            </dd>
          </div>
          <div data-on={lens === 'published' || undefined}>
            <dt>Published</dt>
            <dd>{dateLabel(video.published)}</dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        className="tc-save"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${video.title} from My World` : `Save ${video.title} to My World`}
        data-cursor="save"
        onClick={toggleSave}
      >
        <Icon name={saved ? 'saved' : 'save'} size={18} />
      </button>
    </article>
  );
}
