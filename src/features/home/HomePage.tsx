/**
 * Home, in order of weight:
 *   1. the featured opening — the platform statement over the living membrane, with the
 *      featured programme and the view's one gold action;
 *   2. Continue watching for returning viewers, compact and high;
 *   3. the two entry experiences — the World orb and the Time Machine spine — each a working
 *      miniature of its destination;
 *   4. the category band (counts from the shared catalogue, empty ones said honestly);
 *   5. curated rows: picks with their reasons (tunable), because-you-watched, the Open
 *      Archive and the Originals;
 *   6. the discovery tools as secondary tiles;
 *   7. the viewer's own My World summary.
 * Rows with nothing in them are not rendered.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { activeInterests, continueWatching } from '../../../shared/library.ts';
import { becauseYouWatched, recommend } from '../../../shared/recommend.ts';
import { collectionVideos } from '../../../shared/search.ts';
import type { ActivityItem, Collection, ID, ProgressEntry, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { api } from '../../lib/api.ts';
import { dateLabel, plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { libraryActions, useLibrary } from '../../state/library.ts';
import { useSession } from '../../state/session.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink, Chip } from '../../ui/controls.tsx';
import { toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Row, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import { ProgrammeCard } from '../programme/ProgrammeCard.tsx';
import { originalsShelf } from '../programme/programme-model.ts';
import { CategoryBand } from './CategoryBand.tsx';
import { Hero } from './Hero.tsx';
import { MyWorldPanel, Tools } from './Portals.tsx';
import { TimePreview } from './TimePreview.tsx';
import { WorldPreview } from './WorldPreview.tsx';
import { portalLines, portalStats, remainingLabel, spanLabel, yearSpan } from './home-model.ts';
import './home.css';

const collectionRow = (cat: ReturnType<typeof useCatalogue>, id: ID) => {
  const c = cat.get(id) as Collection | undefined;
  return c ? { collection: c, videos: collectionVideos(cat, c) } : null;
};

export default function HomePage() {
  const cat = useCatalogue();
  const library = useLibrary();
  const { session } = useSession();
  const premium = session.membership.premium;
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    document.title = 'Stream the world · Monumental Streams';
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    api<{ items?: ActivityItem[] }>('/api/activity', { signal: ac.signal })
      .then((r) => setActivity(Array.isArray(r.items) ? r.items : []))
      .catch(() => setActivity([]));
    return () => ac.abort();
  }, []);

  const resume = useMemo(
    () =>
      continueWatching(library)
        .map(({ video, entry }) => ({ video: kindOf(video) === 'video' ? (cat.get(video) as Video | undefined) : undefined, entry }))
        .filter((x): x is { video: Video; entry: ProgressEntry } => !!x.video),
    [cat, library],
  );
  const recs = useMemo(() => recommend(cat, { library, premium, limit: 12 }), [cat, library, premium]);
  const because = useMemo(() => becauseYouWatched(cat, library, 8), [cat, library]);
  const archive = useMemo(() => collectionRow(cat, 'collection:open-archive'), [cat]);
  const { originals, campaigns } = useMemo(() => originalsShelf(cat), [cat]);
  const lines = useMemo(() => portalLines(portalStats(cat, library)), [cat, library]);
  const archiveSpan = archive ? spanLabel(yearSpan(archive.videos)) : null;

  const chapters = [
    { id: 'home-hero', label: 'Stream the world' },
    ...(resume.length ? [{ id: 'home-continue', label: 'Continue watching' }] : []),
    { id: 'home-world', label: 'World' },
    { id: 'home-time', label: 'Time Machine' },
    { id: 'home-categories', label: 'Categories' },
    { id: 'home-for-you', label: 'Picked for you' },
    ...(because ? [{ id: 'home-because', label: 'Because you watched' }] : []),
    ...(archive?.videos.length ? [{ id: 'home-archive', label: 'Open Archive' }] : []),
    ...(originals.length + campaigns.length ? [{ id: 'home-originals', label: 'Originals' }] : []),
    { id: 'home-tools', label: 'More ways in' },
    { id: 'home-my-world', label: 'My World' },
    ...(activity.length ? [{ id: 'home-activity', label: 'Happening now' }] : []),
  ];
  useChapters(chapters);

  return (
    <div className="home">
      <Hero returning={resume.length > 0} />

      {resume.length ? (
        <section className="home-continue wrap" id="home-continue" aria-labelledby="home-continue-title">
          <div className="home-continue-head">
            <h2 id="home-continue-title" className="home-continue-title">
              Continue watching
            </h2>
            <Link to="/my-world?tab=continue" className="home-continue-all">
              All in My World
              <Icon name="arrow" size={16} />
            </Link>
          </div>
          <Row label="Continue watching">
            {resume.map(({ video, entry }) => (
              <VideoPod key={video.id} video={video} size="sm" priority footer={<ResumeFooter video={video} entry={entry} />} />
            ))}
          </Row>
        </section>
      ) : null}

      <div className="wrap home-entries">
        <WorldPreview />
        <TimePreview />
      </div>

      <CategoryBand />

      <section className="section wrap" id="home-for-you" aria-labelledby="home-for-you-title" data-reveal>
        <SectionHeader title="Picked for you" id="home-for-you-title">
          Every pick says what connects it to you. Follow what you love and the picks change with you.
        </SectionHeader>
        <Tune />
        {recs.length ? (
          <Row label="Recommended for you">
            {recs.map((r) => (
              <VideoPod key={r.video.id} video={r.video} reasons={r.reasons} />
            ))}
          </Row>
        ) : (
          <p className="muted home-empty-line">Nothing to recommend yet: the catalogue is still being stocked.</p>
        )}
      </section>

      {because ? (
        <section className="section wrap" id="home-because" aria-labelledby="home-because-title" data-reveal>
          <SectionHeader
            kicker="Because you watched"
            title={
              <>
                After “<Link to={cat.href(because.seed.id)}>{because.seed.title}</Link>”
              </>
            }
            id="home-because-title"
          />
          <Row label={`Because you watched ${because.seed.title}`}>
            {because.items.map((r) => (
              <VideoPod key={r.video.id} video={r.video} reasons={r.reasons} />
            ))}
          </Row>
        </section>
      ) : null}

      {archive?.videos.length ? (
        <section className="section wrap" id="home-archive" aria-labelledby="home-archive-title" data-reveal>
          <SectionHeader
            kicker="Public domain"
            title={archive.collection.title}
            id="home-archive-title"
            action={
              <ButtonLink to={cat.href(archive.collection.id)} variant="quiet" iconAfter="arrow" aria-label={`See all of ${archive.collection.title}`}>
                See all
              </ButtonLink>
            }
          >
            {`${plural(archive.videos.length, 'story', 'stories')} from the public record${archiveSpan ? `, set ${archiveSpan}` : ''}. Each is credited with its licence and source.`}
          </SectionHeader>
          <Row label={archive.collection.title}>
            {archive.videos.map((v) => (
              <VideoPod key={v.id} video={v} />
            ))}
          </Row>
        </section>
      ) : null}

      {originals.length + campaigns.length ? (
        <section className="section wrap" id="home-originals" aria-labelledby="home-originals-title" data-reveal>
          <SectionHeader
            kicker="Monumental Originals"
            title="Made here"
            id="home-originals-title"
            action={
              <ButtonLink to="/collection/monumental-originals" variant="quiet" iconAfter="arrow">
                Originals collection
              </ButtonLink>
            }
          >
            Original programmes and the opening artist campaign, each with its status as it stands today.
          </SectionHeader>
          <ul className="prog-card-grid home-originals">
            {[...originals, ...campaigns].map((p) => (
              <li key={p.id}>
                <ProgrammeCard programme={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section wrap" id="home-tools" aria-labelledby="home-tools-title" data-reveal>
        <SectionHeader title="More ways in" id="home-tools-title" />
        <Tools lines={lines} />
      </section>

      <MyWorldPanel />

      {activity.length ? <Activity items={activity} /> : null}
    </div>
  );
}

function ResumeFooter({ video, entry }: { video: Video; entry: ProgressEntry }) {
  const left = remainingLabel(entry);
  const remove = () => {
    libraryActions.clearProgress(video.id);
    sound.play('unsave');
    toast(`Removed “${video.title}” from Continue watching`, {
      tone: 'info',
      action: { label: 'Undo', run: () => libraryActions.setProgress(video.id, entry.pos, entry.dur) },
    });
  };
  return (
    <div className="home-resume">
      {left ? <span className="home-resume-left">{left}</span> : null}
      <button type="button" className="home-resume-remove" onClick={remove} aria-label={`Remove ${video.title} from Continue watching`}>
        <Icon name="close" size={14} />
        <span aria-hidden="true">Remove</span>
      </button>
    </div>
  );
}

function Tune() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const active = new Set(activeInterests(lib));
  const [msg, setMsg] = useState('');
  return (
    <div className="home-tune" role="group" aria-labelledby="home-tune-title">
      <div className="home-tune-head">
        <h3 id="home-tune-title" className="home-tune-title">
          Tune your picks
        </h3>
        <p className="home-tune-sub">{active.size ? `Following ${plural(active.size, 'interest')}.` : 'Pick what you love. Counts show stories in the catalogue today.'}</p>
      </div>
      <ul className="home-tune-chips">
        {cat.categories.map((c) => (
          <li key={c.id}>
            <Chip
              selected={active.has(c.id)}
              count={cat.videosForCategory(c.id).length}
              onToggle={() => {
                const on = libraryActions.toggleInterest(c.id);
                setMsg(on ? `Following ${c.name}. Recommendations updated.` : `Stopped following ${c.name}. Recommendations updated.`);
              }}
            >
              {c.name}
            </Chip>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {msg}
      </p>
    </div>
  );
}

function Activity({ items }: { items: ActivityItem[] }) {
  const cat = useCatalogue();
  return (
    <section className="section wrap" id="home-activity" aria-labelledby="home-activity-title">
      <SectionHeader title="Happening now" id="home-activity-title">
        Maintained, dated information. Each item says who verified it and when.
      </SectionHeader>
      <ul className="home-activity">
        {items.map((a) => (
          <li key={a.id} className="home-activity-item panel">
            <p className="home-activity-meta">
              {a.kind}
              {a.place ? ` · ${cat.label(a.place)}` : ''}
              {a.starts ? ` · ${dateLabel(a.starts)}${a.ends ? ` – ${dateLabel(a.ends)}` : ''}` : ''}
            </p>
            <h3 className="home-activity-title">{a.url ? <a href={a.url}>{a.title}</a> : a.title}</h3>
            <p className="home-activity-summary">{a.summary}</p>
            <p className="home-activity-source">
              Verified {dateLabel(a.verifiedAt)} · {a.source}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
