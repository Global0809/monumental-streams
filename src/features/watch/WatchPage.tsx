/**
 * /watch/:slug — a story, and the place it is watched.
 *
 * The living world holds the story in FOCUS: its seed in front, the stories it connects to in a
 * ring around it, joined by light filaments (useArrangement → focus, ring = Up next + related).
 * The page is an editorial layer over that world:
 *
 *   poster   (before playback, desktop) — the frame sits where the seed is, on the open side of
 *            the world, with the story's title, one meta line and its context on the editorial
 *            side. The world's filaments run out from behind the frame to the related seeds.
 *   theatre  (once playback has started) — the frame takes the stage (FLIP, a cut under reduced
 *            motion) while the shell turns the world to `watch`: it dims and its motion stops.
 *
 * Below: what the story is, where it connects, its chapters, the record (set in / made /
 * published, provenance, licence), Up next and the related stories as seed cards — hovering
 * any of them lights its seed and filament in the world, and a seed under the pointer in the
 * world lights its card.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Category, Movement, Period, Person, Place, Programme, Theme, Video, VideoKind } from '../../../shared/types.ts';
import { MOOD_LABELS, relatedVideos } from '../../../shared/relations.ts';
import { discoveryWith, searchCatalogue } from '../../../shared/search.ts';
import { useChapters } from '../../app/chapters.ts';
import { dateLabel, FOOTAGE_LABEL, plural, PROVENANCE_LABEL, runtimeLabel, settingLabel, timecode } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { announceSave } from '../../ui/save.ts';
import { Art, SectionHeader, useAccessState, VideoPod } from '../../ui/Pod.tsx';
import { entryLabel, longestWordEm } from '../programme/programme-model.ts';
import { Player, type Phase, type PlayerHandle, type UpNext } from './player/Player.tsx';
import { nextInQueue, parseQueue, queuePosition, watchHref } from './player/queue.ts';
import { parseStartParam } from './player/time.ts';
import { useChapterCues } from './player/useVtt.ts';
import { releaseSeed, seedHover, useSeedLit } from './seed.ts';
import './watch.css';

const KIND_LABEL: Record<VideoKind, string> = {
  episode: 'Episode',
  feature: 'Feature',
  short: 'Short',
  teaser: 'Teaser',
  reel: 'Reel',
  'archive-film': 'Archive film',
};

/** Related stories shown as seed cards (and placed in the world's ring). */
const RELATED_SHOWN = 6;
/** Theatre / poster composition only applies where the editorial side has room (the index is on screen). */
const WIDE = '(min-width: 1180px)';

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
  useArrangement({ kind: 'quiet' }, suggestions.length ? suggestions.map((r) => r.video.id) : null);
  return (
    <div className="page wrap story-missing">
      <header className="page-head">
        <p className="eyebrow">Nothing found</p>
        <h1 className="title-monument">
          Nothing plays <em>here.</em>
        </h1>
        <p className="lede">There’s no video at “/watch/{slug}”. The link may be mistyped, or the video may have moved.</p>
        <div className="story-actions">
          <ButtonLink to={words ? `/search?q=${encodeURIComponent(words)}` : '/search'} variant="primary" icon="search">
            Search
          </ButtonLink>
          <ButtonLink to="/" variant="quiet" icon="home">
            Back to Home
          </ButtonLink>
        </div>
      </header>
      {suggestions.length ? (
        <section className="section" aria-labelledby="watch-missing-h">
          <SectionHeader title="Perhaps you meant" id="watch-missing-h" />
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

function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

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
  const info = cat.mediaInfo(video);
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
  const shown = related.slice(0, RELATED_SHOWN);
  const picks = useMemo(() => related.filter((r) => cat.isPlayable(r.video)).slice(0, 3).map((r) => r.video), [related, cat]);

  /* The world: this story in focus; Up next and the related stories shown below in its ring. */
  const ring = useMemo(() => [...new Set([...(next ? [next.video.id] : []), ...shown.map((r) => r.video.id)])], [next, shown]);
  useArrangement({ kind: 'focus', video: video.id, related: ring });

  /* Poster → theatre once playback has started (desktop composition only). */
  const wide = useMedia(WIDE);
  const reduced = useReducedMotion();
  const [theatre, setTheatre] = useState(false);
  const theatreRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const firstRect = useRef<DOMRect | null>(null);
  const onPhase = useCallback((phase: Phase) => {
    if (phase === 'poster' || theatreRef.current) return;
    theatreRef.current = true;
    firstRect.current = frameRef.current?.getBoundingClientRect() ?? null;
    setTheatre(true);
  }, []);
  useLayoutEffect(() => {
    const first = firstRect.current;
    firstRect.current = null;
    const el = frameRef.current;
    if (!theatre || !first || !el || !wide || reduced || typeof el.animate !== 'function') return;
    const last = el.getBoundingClientRect();
    if (last.top < 0 || last.bottom > window.innerHeight + 2) {
      // e.g. a chapter played from further down: bring the frame into view, without a flight
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const s = first.width / Math.max(1, last.width);
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(s - 1) < 0.01) return;
    const ease = 'cubic-bezier(0.45, 0.05, 0.15, 1)';
    el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 950, easing: ease });
    headRef.current?.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 260, easing: ease, fill: 'backwards' });
  }, [theatre, wide, reduced]);

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

  return (
    <div className="story" data-mode={theatre ? 'theatre' : 'poster'}>
      <section className="story-hero" aria-labelledby="watch-title">
        <div className="story-frame" ref={frameRef}>
          <Player ref={playerRef} video={video} linkTime={linkTime} next={next} picks={picks} chapters={chapters} autoplay={autoplay} onPhase={onPhase} />
        </div>
        <StoryHead ref={headRef} video={video} programme={programme} />
      </section>

      <div className="wrap story-body story-dim">
        <article className="story-main" aria-labelledby="watch-about-h">
          <section id="watch-about" className="story-section" aria-labelledby="watch-about-h">
            <h2 id="watch-about-h" className="story-h2">
              About this story
            </h2>
            <div className="story-desc">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {video.moods.length ? (
              <p className="story-mood">
                <span className="story-mood-k">Mood</span> {video.moods.map((m) => MOOD_LABELS[m]).join(', ')}
              </p>
            ) : null}
          </section>

          {hasLinks ? (
            <section id="watch-links" className="story-section" aria-labelledby="watch-links-h">
              <h2 id="watch-links-h" className="story-h2">
                Where it connects
              </h2>
              <dl className="story-links">
                {places.length ? (
                  <LinkRow label="Places" tone="world">
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
                  <LinkRow label="Interests" tone="iris">
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
            <section id="watch-chapters" className="story-section" aria-labelledby="watch-chapters-h">
              <h2 id="watch-chapters-h" className="story-h2">
                Chapters
              </h2>
              <ol className="story-chapters">
                {chapters.map((c, i) => (
                  <li key={`${c.start}-${i}`}>
                    <button
                      type="button"
                      className="story-chapter"
                      data-cursor="play"
                      data-cursor-label="Play from here"
                      disabled={!cat.isPlayable(video)}
                      onClick={() => playerRef.current?.playFrom(c.start)}
                    >
                      <span className="story-chapter-n" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="story-chapter-name">{c.text}</span>
                      <span className="story-chapter-t timecode">
                        <span className="sr-only">starts at </span>
                        {timecode(c.start)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <Credits video={video} chapterCount={chapters.length} />
        </article>

        <aside className="story-side" aria-label="Up next">
          <section id="watch-next" className="story-next" aria-labelledby="watch-next-h">
            <h2 id="watch-next-h" className="story-h2 story-h2-sm">
              Up next
            </h2>
            {next ? (
              <NextCard next={next} />
            ) : (
              <p className="story-next-none">
                {inQueue
                  ? 'This is the last stop on your journey.'
                  : programme
                    ? `This is the latest story in ${programme.title}. Follow a connection below to keep going.`
                    : 'Nothing follows this in a sequence. Follow a connection below to keep going.'}
              </p>
            )}
            {inQueue ? <Journey queue={queue} current={video.slug} /> : null}
            {programme ? (
              <ButtonLink to={cat.href(programme.id)} variant="quiet" size="sm" iconAfter="arrow" className="story-next-prog">
                {programme.original ? 'About the programme' : 'The whole series'}
              </ButtonLink>
            ) : null}
          </section>
        </aside>
      </div>

      <section id="watch-related" className="wrap story-related story-dim" aria-labelledby="watch-related-h">
        <SectionHeader
          title="Why these are connected"
          id="watch-related-h"
          action={
            <ButtonLink to={`/synapse/video/${video.slug}`} variant="quiet" size="sm" icon="synapse">
              All connections
            </ButtonLink>
          }
        >
          Each story says what it shares with “{video.title}”. In the world, each one is joined to this story by a filament.
        </SectionHeader>
        {shown.length ? (
          <ul className="grid-pods story-related-grid">
            {shown.map((r) => (
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

/* ───────────── The head: one eyebrow, the title, one meta line, context, actions ───────────── */

function StoryHead({ ref, video, programme }: { ref: Ref<HTMLElement>; video: Video; programme?: Programme }) {
  const cat = useCatalogue();
  const access = useAccessState(video);
  const runtime = cat.runtime(video);
  const info = cat.mediaInfo(video);
  const place = video.places[0] ? cat.label(video.places[0]) : null;
  const season = video.kind === 'episode' && video.season ? `Season ${video.season} · ` : '';
  const entry = programme ? `${season}${entryLabel(video)}` : null;
  const titleStyle = { '--title-word': longestWordEm(video.title).toFixed(2) } as CSSProperties;
  return (
    <header className="story-head" ref={ref}>
      <p className="eyebrow story-eyebrow">
        {programme ? (
          <>
            <Link to={cat.href(programme.id)} onClick={() => sound.play('transition')}>
              {programme.title}
            </Link>
            {entry ? <span className="story-entry">{entry}</span> : null}
          </>
        ) : (
          <span>{KIND_LABEL[video.kind]}</span>
        )}
      </p>
      <h1 id="watch-title" className="story-title" data-long={video.title.length > 34 || undefined} style={titleStyle}>
        {video.title}
      </h1>
      <p className="story-meta">
        {access.key !== 'free' ? (
          <span className="story-fact story-access" data-access={access.key}>
            {access.key === 'premium' || access.key === 'early' ? <Icon name={access.locked ? 'lock' : 'diamond'} size={12} strokeWidth={2} /> : null}
            {access.label}
          </span>
        ) : null}
        <span className="story-fact story-set">
          <span className="sr-only">Set in </span>
          {video.setting ? settingLabel(video) : 'Timeless'}
        </span>
        {place ? <span className="story-fact">{place}</span> : null}
        {runtime ? <span className="story-fact">{runtimeLabel(runtime)}</span> : null}
        {video.footage.length ? <span className="story-fact">{video.footage.map((f) => FOOTAGE_LABEL[f]).join(', ')}</span> : null}
        <span className="story-fact story-prov" data-prov={video.provenance}>
          {PROVENANCE_LABEL[video.provenance]}
        </span>
        {info && !info.hasAudio ? <span className="story-fact">Silent</span> : null}
      </p>
      <p className="story-summary">{video.summary}</p>
      {video.context ? (
        <aside className="story-context" aria-label="Viewer context">
          <p className="story-context-title">
            <Icon name="info" size={15} strokeWidth={2} /> Context before you watch
          </p>
          <p className="story-context-text">{video.context}</p>
        </aside>
      ) : null}
      <div className="story-actions">
        <SaveButton video={video} />
        <ButtonLink to={`/synapse/video/${video.slug}`} variant="quiet" icon="synapse" data-cursor-label="Connections">
          Explore connections
        </ButtonLink>
      </div>
    </header>
  );
}

function SaveButton({ video }: { video: Video }) {
  const lib = useLibrary();
  const saved = isSaved(lib, video.id);
  return (
    <Button
      variant="ghost"
      className="story-save"
      icon={saved ? 'saved' : 'save'}
      aria-pressed={saved}
      data-cursor="save"
      data-cursor-label={saved ? 'In My World' : 'Save to My World'}
      onClick={(e) => {
        const now = libraryActions.toggleSave(video.id);
        announceSave({ saved: now, title: video.title, from: e.currentTarget, id: video.id, undo: () => libraryActions.toggleSave(video.id) });
      }}
    >
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}

/* ───────────── Connections, credits ───────────── */

function LinkRow({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="story-link-row" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        <ul className="story-tags">{Array.isArray(children) ? children.map((c, i) => <li key={i}>{c}</li>) : <li>{children}</li>}</ul>
      </dd>
    </div>
  );
}

function TagLink({ to, label, note }: { to: string; label: string; note?: string }) {
  return (
    <Link to={to} className="story-tag" onClick={() => sound.play('select')}>
      <span className="story-tag-node" aria-hidden="true" />
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </Link>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Credits({ video, chapterCount }: { video: Video; chapterCount: number }) {
  const cat = useCatalogue();
  const info = cat.mediaInfo(video);
  const art = cat.artFor(video.art);
  return (
    <section id="watch-credits" className="story-section story-quiet" aria-labelledby="watch-credits-h">
      <h2 id="watch-credits-h" className="story-h2 story-h2-sm">
        Credits &amp; record
      </h2>
      <dl className="story-record" aria-label="Time">
        <div data-k="set">
          <dt>Set in</dt>
          <dd>{settingLabel(video)}</dd>
        </div>
        <div data-k="made">
          <dt>Made</dt>
          <dd>{video.made ?? <span className="story-none">Not listed</span>}</dd>
        </div>
        <div data-k="pub">
          <dt>Published on Monumental</dt>
          <dd>{dateLabel(video.published)}</dd>
        </div>
      </dl>
      <dl className="story-credits">
        <div>
          <dt>Provenance</dt>
          <dd>
            {PROVENANCE_LABEL[video.provenance]}
            {video.provenance !== 'monumental-original' ? <span className="story-credit-note"> Shown as demonstration media — not a Monumental Original.</span> : null}
          </dd>
        </div>
        <div>
          <dt>Footage</dt>
          <dd>{video.footage.length ? video.footage.map((f) => FOOTAGE_LABEL[f]).join(', ') : <span className="story-none">No footage published yet</span>}</dd>
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
                <p className="story-attrib">{video.credits.attribution}</p>
              </dd>
            </div>
            {video.credits.sourceUrl ? (
              <div>
                <dt>Source</dt>
                <dd>
                  <a className="story-source" href={video.credits.sourceUrl} target="_blank" rel="noopener noreferrer">
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
              <span className="story-none">No licence or third-party attribution is listed for this item.</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Media</dt>
          <dd className="story-media">
            {info ? (
              <>
                <span>{info.renditions.length ? info.renditions.map((r) => r.label).join(' · ') : 'Single file'}</span>
                <span>{info.captions.length ? info.captions.map((c) => c.label).join(', ') : 'No captions'}</span>
                {chapterCount > 1 ? <span>{plural(chapterCount, 'chapter')}</span> : null}
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
              <span className="story-none">Poster and preview art are provisional, pending approved imagery.</span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/* ───────────── Up next ───────────── */

function NextCard({ next }: { next: UpNext }) {
  const cat = useCatalogue();
  const access = useAccessState(next.video);
  const runtime = cat.runtime(next.video);
  const lit = useSeedLit(next.video.id);
  const id = next.video.id;
  useEffect(() => () => releaseSeed(id), [id]);
  return (
    <Link
      to={next.href}
      className="story-next-card"
      data-world-lit={lit || undefined}
      data-cursor="play"
      data-cursor-label="Next"
      onClick={() => sound.play('transition')}
      {...seedHover(id)}
    >
      <span className="story-next-art">
        <Art art={next.video.art} alt="" />
        {runtime ? <span className="story-next-runtime timecode">{runtimeLabel(runtime)}</span> : null}
      </span>
      <span className="story-next-meta">
        <span className="story-next-label">{next.label}</span>
        <span className="story-next-title">{next.video.title}</span>
        <span className="story-next-facts">{[access.key !== 'free' ? access.label : null, settingLabel(next.video)].filter(Boolean).join(' · ')}</span>
      </span>
    </Link>
  );
}

function Journey({ queue, current }: { queue: string[]; current: string }) {
  const cat = useCatalogue();
  const pos = queuePosition(queue, current);
  return (
    <div className="story-journey">
      <p className="story-journey-title">
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
              {here ? <span className="story-journey-here">{v.title}</span> : <Link to={watchHref(slug, queue)}>{v.title}</Link>}
              {rt ? <span className="timecode">{runtimeLabel(rt)}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
