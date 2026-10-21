/**
 * /watch/:slug — the player is the hero: a rounded 16:9 stage at the top; beneath it the
 * story's record: what it is, when it is set versus made versus published, why it
 * matters, where it connects, who made it and under what licence, what comes next and
 * why other stories are connected to it.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Category, Movement, Period, Person, Place, Programme, Theme, Video, VideoKind } from '../../../shared/types.ts';
import { MOOD_LABELS, relatedVideos } from '../../../shared/relations.ts';
import { discoveryWith, searchCatalogue } from '../../../shared/search.ts';
import { useChapters } from '../../app/chapters.ts';
import { dateLabel, FOOTAGE_LABEL, plural, PROVENANCE_LABEL, runtimeLabel, settingLabel, timecode } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { announceSave } from '../../ui/save.ts';
import { AccessBadge, Art, SectionHeader, useAccessState, VideoPod } from '../../ui/Pod.tsx';
import { Player, type PlayerHandle, type UpNext } from './player/Player.tsx';
import { nextInQueue, parseQueue, queuePosition, watchHref } from './player/queue.ts';
import { parseStartParam } from './player/time.ts';
import { useChapterCues } from './player/useVtt.ts';
import './watch.css';

const KIND_LABEL: Record<VideoKind, string> = {
  episode: 'Episode',
  feature: 'Feature',
  short: 'Short',
  teaser: 'Teaser',
  reel: 'Reel',
  'archive-film': 'Archive film',
};

export default function WatchPage() {
  const { slug = '' } = useParams();
  const cat = useCatalogue();
  const video = cat.bySlug('video', slug) as Video | undefined;
  useEffect(() => {
    document.title = `${video ? video.title : 'Not found'} · Monumental Streams`;
  }, [video]);
  if (!video) return <Missing slug={slug} />;
  return <WatchView key={video.id} video={video} />;
}

/* ───────────── Not found ───────────── */

function Missing({ slug }: { slug: string }) {
  const cat = useCatalogue();
  const words = slug.replace(/[-_]+/g, ' ').trim();
  const suggestions = useMemo(() => (words ? searchCatalogue(cat, discoveryWith({ q: words })).results.slice(0, 3) : []), [cat, words]);
  return (
    <div className="page wrap watch-missing">
      <header className="page-head">
        <p className="kicker">Nothing found</p>
        <h1 className="page-title">
          Nothing plays <em>here.</em>
        </h1>
        <p className="page-lede">
          There’s no video at “/watch/{slug}”. The link may be mistyped, or the video may have moved.
        </p>
        <div className="watch-actions">
          <ButtonLink to={words ? `/search?q=${encodeURIComponent(words)}` : '/search'} variant="primary" icon="search">
            Search
          </ButtonLink>
          <ButtonLink to="/" icon="home">
            Back to Home
          </ButtonLink>
        </div>
      </header>
      {suggestions.length ? (
        <section className="section" aria-labelledby="watch-missing-h">
          <SectionHeader kicker="Closest matches" title="Perhaps you meant" id="watch-missing-h" />
          <ul className="grid-pods">
            {suggestions.map((r) => (
              <li key={r.video.id}>
                <VideoPod video={r.video} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ───────────── The page ───────────── */

function WatchView({ video }: { video: Video }) {
  const cat = useCatalogue();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const playerRef = useRef<PlayerHandle>(null);

  const [linkTime] = useState(() => parseStartParam(params.get('t')));
  const [autoplay] = useState(() => (location.state as { autoplay?: boolean } | null)?.autoplay === true);
  useEffect(() => {
    // Autoplay is a one-off hand-over from the previous video; a refresh should not replay it.
    if (autoplay) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const programme = video.programme ? (cat.get(video.programme) as Programme | undefined) : undefined;
  const runtime = cat.runtime(video);
  const info = cat.mediaInfo(video);
  const art = cat.artFor(video.art);
  const chapters = useChapterCues(info?.chapters);

  const queue = useMemo(() => parseQueue(params.get('queue')).filter((s) => !!cat.bySlug('video', s)), [params, cat]);
  const inQueue = queue.includes(video.slug);

  const next: UpNext | null = useMemo(() => {
    if (inQueue) {
      const slug = nextInQueue(queue, video.slug);
      const v = slug ? (cat.bySlug('video', slug) as Video | undefined) : undefined;
      return v ? { video: v, href: watchHref(v.slug, queue), label: `Your journey · ${queuePosition(queue, v.slug) + 1} of ${queue.length}` } : null;
    }
    const n = cat.nextInProgramme(video);
    return n ? { video: n, href: cat.href(n.id), label: programme ? `Next in ${programme.title}` : 'Next' } : null;
  }, [cat, video, queue, inQueue, programme]);

  const related = useMemo(() => relatedVideos(cat, video.id, 10).filter((r) => r.video.id !== next?.video.id), [cat, video.id, next]);
  const picks = useMemo(() => related.filter((r) => cat.isPlayable(r.video)).slice(0, 3).map((r) => r.video), [related, cat]);

  const orderLabel = video.order ? (video.kind === 'episode' ? `${video.season ? `Season ${video.season} · ` : ''}Episode ${video.order}` : `Chapter ${video.order}`) : null;

  const places = video.places.map((id) => cat.get(id) as Place | undefined).filter((p): p is Place => !!p);
  const people = (video.people ?? []).map((p) => ({ person: cat.get(p.person) as Person | undefined, role: p.role })).filter((p): p is { person: Person; role: string } => !!p.person);
  const periodIds = [...new Set([...video.periods, ...(video.setting ? cat.periodsForYears(video.setting.from, video.setting.to).map((p) => p.id) : [])])];
  const periods = periodIds.map((id) => cat.get(id) as Period | undefined).filter((p): p is Period => !!p).sort((a, b) => a.start - b.start);
  const movements = (video.movements ?? []).map((id) => cat.get(id) as Movement | undefined).filter((m): m is Movement => !!m);
  const interests = video.categories.map((id) => cat.get(id) as Category | undefined).filter((c): c is Category => !!c);
  const themes = video.themes.map((id) => cat.get(id) as Theme | undefined).filter((t): t is Theme => !!t);
  const hasLinks = places.length + people.length + periods.length + movements.length + interests.length + themes.length > 0;

  useChapters(
    [
      { id: 'watch-about', label: 'About' },
      hasLinks ? { id: 'watch-links', label: 'Connections' } : null,
      chapters.length > 1 ? { id: 'watch-chapters', label: 'Chapters' } : null,
      { id: 'watch-credits', label: 'Credits' },
      { id: 'watch-next', label: 'Up next' },
      { id: 'watch-related', label: 'Why these are connected' },
    ].filter((c): c is { id: string; label: string } => !!c),
  );

  const paragraphs = video.description.split(/\n{2,}/).filter((p) => p.trim());
  const titleStyle = { '--title-word': longestWordEm(video.title).toFixed(2) } as CSSProperties;

  return (
    <div className="watch-page">
      <div className="watch-stage">
        <Player ref={playerRef} video={video} linkTime={linkTime} next={next} picks={picks} chapters={chapters} autoplay={autoplay} />
      </div>

      <div className="wrap watch-body watch-dim">
        <article className="watch-main" aria-labelledby="watch-title">
          <header className="watch-head">
            <p className="kicker watch-kicker">
              {programme ? (
                <Link to={cat.href(programme.id)} onClick={() => sound.play('transition')}>
                  {programme.title}
                </Link>
              ) : (
                <span>{KIND_LABEL[video.kind]}</span>
              )}
              {orderLabel ? <span className="watch-order">{orderLabel}</span> : null}
              {programme && !(video.kind === 'episode' && orderLabel) ? <span className="watch-kind">{KIND_LABEL[video.kind]}</span> : null}
            </p>
            <h1 id="watch-title" className="watch-title" data-long={video.title.length > 42 || undefined} style={titleStyle}>
              {video.title}
            </h1>
            <p className="watch-summary">{video.summary}</p>
            <div className="watch-meta">
              <AccessBadge video={video} />
              <p className="watch-facts">
                {runtime ? <span className="watch-fact watch-runtime">{runtimeLabel(runtime)}</span> : null}
                {video.footage.length ? <span className="watch-fact">{video.footage.map((f) => FOOTAGE_LABEL[f]).join(', ')}</span> : null}
                <span className="watch-fact watch-prov" data-prov={video.provenance}>
                  {PROVENANCE_LABEL[video.provenance]}
                </span>
                {info && !info.hasAudio ? <span className="watch-fact">Silent</span> : null}
              </p>
            </div>
            <div className="watch-actions">
              <SaveButton video={video} />
              <ButtonLink to={`/synapse/video/${video.slug}`} variant="ghost" icon="synapse" data-cursor-label="Connections">
                Explore connections
              </ButtonLink>
            </div>
          </header>

          <dl className="watch-times" aria-label="Time">
            <div className="watch-time" data-k="set">
              <dt>Set in</dt>
              <dd>{settingLabel(video)}</dd>
            </div>
            <div className="watch-time" data-k="made">
              <dt>Made</dt>
              <dd>{video.made ?? <span className="watch-none">Not listed</span>}</dd>
            </div>
            <div className="watch-time" data-k="pub">
              <dt>Published on Monumental</dt>
              <dd>{dateLabel(video.published)}</dd>
            </div>
          </dl>

          <section id="watch-about" className="watch-section" aria-labelledby="watch-about-h">
            <h2 id="watch-about-h" className="watch-h2">
              About this story
            </h2>
            {video.context ? (
              <aside className="watch-context" aria-label="Viewer context">
                <p className="watch-context-title">
                  <Icon name="info" size={16} strokeWidth={2} /> Context before you watch
                </p>
                <p className="watch-context-text">{video.context}</p>
              </aside>
            ) : null}
            <div className="watch-desc">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {video.moods.length ? (
              <p className="watch-mood">
                <span className="watch-mood-k">Mood</span> {video.moods.map((m) => MOOD_LABELS[m]).join(', ')}
              </p>
            ) : null}
          </section>

          {hasLinks ? (
            <section id="watch-links" className="watch-section" aria-labelledby="watch-links-h">
              <h2 id="watch-links-h" className="watch-h2">
                Where it connects
              </h2>
              <dl className="watch-links">
                {places.length ? (
                  <LinkRow label="Places" tone="iris">
                    {places.map((p) => {
                      const parent = cat.placeAncestors(p.id)[0];
                      return <TagLink key={p.id} to={cat.href(p.id)} label={p.name} note={parent?.name} />;
                    })}
                  </LinkRow>
                ) : null}
                {people.length ? (
                  <LinkRow label="People" tone="pearl">
                    {people.map(({ person, role }) => (
                      <TagLink key={person.id} to={cat.href(person.id)} label={person.name} note={role} />
                    ))}
                  </LinkRow>
                ) : null}
                {periods.length ? (
                  <LinkRow label="Eras" tone="frost">
                    {periods.map((p) => (
                      <TagLink key={p.id} to={cat.href(p.id)} label={p.label} />
                    ))}
                  </LinkRow>
                ) : null}
                {movements.length ? (
                  <LinkRow label="Movements" tone="frost">
                    {movements.map((m) => (
                      <TagLink key={m.id} to={cat.href(m.id)} label={m.name} note={`${m.start}–${m.end ?? 'now'}`} />
                    ))}
                  </LinkRow>
                ) : null}
                {interests.length ? (
                  <LinkRow label="Interests" tone="rose">
                    {interests.map((c) => (
                      <TagLink key={c.id} to={cat.href(c.id)} label={c.name} />
                    ))}
                  </LinkRow>
                ) : null}
                {themes.length ? (
                  <LinkRow label="Themes" tone="lilac">
                    {themes.map((t) => (
                      <TagLink key={t.id} to={cat.href(t.id)} label={t.name} />
                    ))}
                  </LinkRow>
                ) : null}
              </dl>
            </section>
          ) : null}

          {chapters.length > 1 ? (
            <section id="watch-chapters" className="watch-section" aria-labelledby="watch-chapters-h">
              <h2 id="watch-chapters-h" className="watch-h2">
                Chapters
              </h2>
              <ol className="watch-chapters">
                {chapters.map((c, i) => (
                  <li key={`${c.start}-${i}`}>
                    <button
                      type="button"
                      className="watch-chapter"
                      data-cursor="play"
                      data-cursor-label="Play from here"
                      disabled={!cat.isPlayable(video)}
                      onClick={() => playerRef.current?.playFrom(c.start)}
                    >
                      <span className="watch-chapter-n" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="watch-chapter-name">{c.text}</span>
                      <span className="watch-chapter-t">
                        <span className="sr-only">starts at </span>
                        {timecode(c.start)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section id="watch-credits" className="watch-section watch-quiet" aria-labelledby="watch-credits-h">
            <h2 id="watch-credits-h" className="watch-h2 watch-h2-sm">
              Credits &amp; provenance
            </h2>
            <dl className="watch-credits">
              <div>
                <dt>Provenance</dt>
                <dd>
                  {PROVENANCE_LABEL[video.provenance]}
                  {video.provenance !== 'monumental-original' ? <span className="watch-credit-note"> Shown as demonstration media — not a Monumental Original.</span> : null}
                </dd>
              </div>
              <div>
                <dt>Footage</dt>
                <dd>{video.footage.length ? video.footage.map((f) => FOOTAGE_LABEL[f]).join(', ') : <span className="watch-none">No footage published yet</span>}</dd>
              </div>
              {video.credits ? (
                <>
                  <div>
                    <dt>Licence</dt>
                    <dd>{video.credits.licence}</dd>
                  </div>
                  <div>
                    <dt>Attribution</dt>
                    <dd>
                      <p className="watch-attrib">{video.credits.attribution}</p>
                    </dd>
                  </div>
                  {video.credits.sourceUrl ? (
                    <div>
                      <dt>Source</dt>
                      <dd>
                        <a className="watch-source" href={video.credits.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {hostOf(video.credits.sourceUrl)}
                          <Icon name="arrow" size={14} />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <dt>Licence</dt>
                  <dd>
                    <span className="watch-none">No licence or third-party attribution is listed for this item.</span>
                  </dd>
                </div>
              )}
              <div>
                <dt>Media</dt>
                <dd className="watch-media">
                  {info ? (
                    <>
                      <span>{info.renditions.length ? info.renditions.map((r) => r.label).join(' · ') : 'Single file'}</span>
                      <span>{info.captions.length ? info.captions.map((c) => c.label).join(', ') : 'No captions'}</span>
                      {chapters.length > 1 ? <span>{plural(chapters.length, 'chapter')}</span> : null}
                      <span>{info.hasAudio ? 'Audio' : 'No audio track'}</span>
                    </>
                  ) : (
                    <span>No playable media yet</span>
                  )}
                </dd>
              </div>
              {art?.provisional ? (
                <div>
                  <dt>Artwork</dt>
                  <dd>
                    <span className="watch-none">Poster and preview art are provisional, pending approved imagery.</span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </article>

        <aside className="watch-side" aria-label="Up next">
          <section id="watch-next" className="watch-next" aria-labelledby="watch-next-h">
            <h2 id="watch-next-h" className="watch-h2 watch-h2-sm">
              Up next
            </h2>
            {next ? (
              <NextCard next={next} />
            ) : (
              <p className="watch-next-none">
                {inQueue
                  ? 'This is the last stop on your journey.'
                  : programme
                    ? `This is the latest story in ${programme.title}. Follow a connection below to keep going.`
                    : 'Nothing follows this in a sequence. Follow a connection below to keep going.'}
              </p>
            )}
            {inQueue ? <Journey queue={queue} current={video.slug} /> : null}
            {programme ? (
              <ButtonLink to={cat.href(programme.id)} variant="quiet" size="sm" iconAfter="arrow">
                {programme.original ? 'About the programme' : 'The whole series'}
              </ButtonLink>
            ) : null}
          </section>
        </aside>
      </div>

      <section id="watch-related" className="wrap section watch-related watch-dim" aria-labelledby="watch-related-h">
        <SectionHeader
          kicker="Connections"
          title="Why these are connected"
          id="watch-related-h"
          action={
            <ButtonLink to={`/synapse/video/${video.slug}`} variant="ghost" size="sm" icon="synapse">
              All connections
            </ButtonLink>
          }
        >
          Each link below says what it shares with “{video.title}”.
        </SectionHeader>
        {related.length ? (
          <ul className="grid-pods">
            {related.slice(0, 6).map((r) => (
              <li key={r.video.id}>
                <VideoPod video={r.video} reasons={r.reasons} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="synapse" title="No connections yet">
            <p>Nothing else in the catalogue shares a place, era, person or theme with this video yet. As the catalogue grows, connections appear here automatically.</p>
          </EmptyState>
        )}
      </section>
    </div>
  );
}

/* ───────────── Pieces ───────────── */

/**
 * Rough width of the title's longest word in em in the expanded display face (its capitals are very wide).
 * The title's font size is capped so that word always fits the column on one line.
 */
function longestWordEm(title: string) {
  const em = (w: string) => [...w].reduce((s, ch) => s + (/[A-Z]/.test(ch) ? 1.3 : /[a-z0-9]/.test(ch) ? 1.02 : 0.5), 0);
  return Math.max(4, ...title.split(/\s+/).map(em));
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SaveButton({ video }: { video: Video }) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  return (
    <Button
      variant={saved ? 'chrome' : 'ghost'}
      icon={saved ? 'saved' : 'save'}
      aria-pressed={saved}
      data-cursor="save"
      data-cursor-label={saved ? 'In My World' : 'Save to My World'}
      onClick={(e) => {
        const now = libraryActions.toggleSave(video.id);
        announceSave({ saved: now, title: video.title, from: e.currentTarget, undo: () => libraryActions.toggleSave(video.id) });
      }}
    >
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}

function LinkRow({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="watch-link-row" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        <ul className="watch-tags">{Array.isArray(children) ? children.map((c, i) => <li key={i}>{c}</li>) : <li>{children}</li>}</ul>
      </dd>
    </div>
  );
}

function TagLink({ to, label, note }: { to: string; label: string; note?: string }) {
  return (
    <Link to={to} className="watch-tag" onClick={() => sound.play('select')}>
      <span className="watch-tag-node" aria-hidden="true" />
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </Link>
  );
}

function NextCard({ next }: { next: UpNext }) {
  const cat = useCatalogue();
  const access = useAccessState(next.video);
  const runtime = cat.runtime(next.video);
  return (
    <Link to={next.href} className="watch-next-card" data-cursor="play" data-cursor-label="Next" onClick={() => sound.play('transition')}>
      <span className="watch-next-art">
        <Art art={next.video.art} alt="" />
      </span>
      <span className="watch-next-meta">
        <span className="watch-next-label">{next.label}</span>
        <span className="watch-next-title">{next.video.title}</span>
        <span className="watch-next-facts">
          {[runtime ? runtimeLabel(runtime) : null, access.label, settingLabel(next.video)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  );
}

function Journey({ queue, current }: { queue: string[]; current: string }) {
  const cat = useCatalogue();
  const pos = queuePosition(queue, current);
  return (
    <div className="watch-journey">
      <p className="watch-journey-title">
        Your journey · stop {pos + 1} of {queue.length}
      </p>
      <ol>
        {queue.map((slug) => {
          const v = cat.bySlug('video', slug) as Video | undefined;
          if (!v) return null;
          const here = slug === current;
          const rt = cat.runtime(v);
          return (
            <li key={slug} aria-current={here ? 'step' : undefined}>
              {here ? <span className="watch-journey-here">{v.title}</span> : <Link to={watchHref(slug, queue)}>{v.title}</Link>}
              {rt ? <span className="mono">{runtimeLabel(rt)}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
