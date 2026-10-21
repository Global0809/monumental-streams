/**
 * PROGRAMME: a series, chapter, artist campaign or demonstration series.
 *
 * The living world holds the programme in FOCUS: the entry the page offers first (resume, or the
 * first playable) is the seed in front, its episodes ring it on light filaments and are the
 * highlighted seeds (anything merely related recedes). The page is the editorial layer over that
 * world — no header screen of its own: the title, the honest status (what exists today), one
 * gold action; then what it is and who presents it, the route for journey programmes, the
 * episodes in series order (hovering a row lights its seed; a seed under the pointer lights its
 * row), its chapters, its threads and related programmes.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import type { ID, Person, Programme, Video } from '../../../shared/types.ts';
import { connectionsFor } from '../../../shared/relations.ts';
import { useChapters } from '../../app/chapters.ts';
import { FOOTAGE_LABEL, plural, runtimeLabel, settingLabel } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, SectionHeader, useAccessState } from '../../ui/Pod.tsx';
import { announceSave } from '../../ui/save.ts';
import { releaseSeed, seedHover, useSeedLit } from '../watch/seed.ts';
import { ProgrammeCard, StatusBadge } from './ProgrammeCard.tsx';
import { RouteStrip } from './RouteStrip.tsx';
import { entryLabel, episodeGroups, firstPlayable, longestWordEm, PROGRAMME_KIND_LABEL, PROGRAMME_STATUS_LABEL, routeHref, routeStops } from './programme-model.ts';
import './programme.css';

export default function ProgrammePage() {
  const { slug = '' } = useParams();
  const cat = useCatalogue();
  const programme = cat.bySlug('programme', slug) as Programme | undefined;
  useEffect(() => {
    document.title = `${programme ? programme.title : 'Programme not found'} · Monumental Streams`;
  }, [programme]);
  if (!programme) return <MissingProgramme slug={slug} />;
  return <ProgrammeView key={programme.id} programme={programme} />;
}

function MissingProgramme({ slug }: { slug: string }) {
  const cat = useCatalogue();
  useArrangement({ kind: 'quiet' });
  return (
    <div className="page wrap prog-missing">
      <header className="page-head">
        <p className="eyebrow">Programme</p>
        <h1 className="title-monument prog-missing-title">Nothing lives at this address</h1>
      </header>
      <EmptyState
        icon="info"
        title="No programme matches this link"
        actions={
          <>
            <ButtonLink to="/search" variant="primary" icon="search">
              Search the catalogue
            </ButtonLink>
            <ButtonLink to="/" variant="quiet">
              Back to Home
            </ButtonLink>
          </>
        }
      >
        <p>There is no programme called “{slug}”. It may have been renamed. These programmes are in the catalogue:</p>
        <ul className="prog-missing-list">
          {cat.programmes.map((p) => (
            <li key={p.id}>
              <Link to={cat.href(p.id)}>{p.title}</Link>
            </li>
          ))}
        </ul>
      </EmptyState>
    </div>
  );
}

function ProgrammeView({ programme: p }: { programme: Programme }) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const parent = p.parent ? (cat.get(p.parent) as Programme | undefined) : undefined;
  const children = cat.programmeChildren(p.id);
  const groups = useMemo(() => episodeGroups(cat, p), [cat, p]);
  const all = groups.flatMap((g) => g.videos);
  const playableCount = all.filter((v) => cat.isPlayable(v)).length;
  const resume = all.find((v) => {
    const e = lib.progress[v.id];
    return e && !e.done && e.pos > 5 && cat.isPlayable(v);
  });
  const first = firstPlayable(cat, p);
  const presenters = (p.presenters ?? []).map((id) => cat.get(id) as Person | undefined).filter((x): x is Person => !!x);
  const route = routeHref(cat, p);
  const hasRoute = routeStops(cat, p).length > 1;
  const childKey = children.map((c) => c.id).join('|');
  const related = useMemo(
    () =>
      connectionsFor(cat, p.id, { kinds: ['programme'], limit: 4 })
        .map((c) => ({ programme: cat.get(c.target) as Programme | undefined, reasons: c.reasons }))
        .filter((r): r is { programme: Programme; reasons: typeof r.reasons } => !!r.programme && !childKey.split('|').includes(r.programme.id)),
    [cat, p.id, childKey],
  );
  const kind = PROGRAMME_KIND_LABEL[p.kind];
  const lead = resume ?? first;

  /* The world: this programme in focus, its episodes lit (related stories recede). */
  const memberIds = useMemo(() => all.map((v) => v.id), [all]);
  useArrangement(lead ? { kind: 'focus', programme: p.id, video: lead.id } : { kind: 'focus', programme: p.id }, memberIds.length ? memberIds : null);

  useChapters([
    { id: 'prog-overview', label: 'Overview' },
    ...(hasRoute ? [{ id: 'prog-route', label: 'Route' }] : []),
    { id: 'prog-episodes', label: 'In this programme' },
    ...(children.length ? [{ id: 'prog-chapters', label: 'Chapters' }] : []),
    { id: 'prog-threads', label: 'Threads' },
    ...(related.length ? [{ id: 'prog-related', label: 'Related' }] : []),
  ]);

  const cta = resume
    ? { to: cat.href(resume.id), label: `Resume “${resume.title}”` }
    : first
      ? { to: cat.href(first.id), label: first.kind === 'teaser' ? (p.original ? 'Watch the motion teaser' : 'Watch the teaser') : playableCount > 1 ? 'Play from the start' : 'Watch now' }
      : null;

  const threads: { label: string; tone: string; ids: ID[] }[] = [
    { label: 'Interests', tone: 'iris', ids: p.categories },
    { label: 'Themes', tone: 'lilac', ids: p.themes },
    { label: 'Places', tone: 'world', ids: p.places },
    { label: 'Movements', tone: 'frost', ids: p.movements ?? [] },
    { label: 'Periods', tone: 'frost', ids: p.periods },
  ].filter((t) => t.ids.length > 0);

  const titleStyle = { '--title-word': longestWordEm(p.title).toFixed(2) } as CSSProperties;

  return (
    <article className="prog" data-kind={p.kind}>
      <header className="wrap prog-hero" id="prog-overview">
        <div className="prog-hero-copy">
          <p className="eyebrow prog-eyebrow">
            {parent ? (
              <Link to={cat.href(parent.id)} onClick={() => sound.play('transition')}>
                <span className="sr-only">Part of </span>
                {parent.title}
              </Link>
            ) : p.original ? (
              <b>Monumental Original</b>
            ) : null}
            <span className="prog-eyebrow-kind">{kind}</span>
          </p>
          <h1 className="prog-title" data-long={p.title.length > 30 || undefined} style={titleStyle}>
            {p.title}
          </h1>
          <p className="prog-tagline">{p.tagline}</p>
          <div className="prog-now" data-status={p.status} role="note" aria-label="What exists today">
            <p className="prog-now-status">
              <StatusBadge status={p.status} />
              <span className="prog-now-tally">
                {all.length ? `${plural(all.length, 'entry', 'entries')} · ${playableCount} playable now` : 'Nothing published yet'}
              </span>
            </p>
            <p className="prog-now-note">{p.statusNote}</p>
          </div>
          <div className="prog-actions">
            {cta ? (
              <ButtonLink to={cta.to} variant="primary" size="lg" icon="play" data-cursor="play" data-cursor-label="Watch" {...(lead ? seedHover(lead.id) : {})}>
                {cta.label}
              </ButtonLink>
            ) : null}
            {route ? (
              <ButtonLink to={route} variant="ghost" icon="globe" data-cursor-label="World">
                Follow the route
              </ButtonLink>
            ) : null}
            <ButtonLink to={`/synapse/programme/${p.slug}`} variant="quiet" icon="synapse" data-cursor-label="Synapse">
              Connections
            </ButtonLink>
          </div>
        </div>
      </header>

      <section className="wrap prog-about" aria-labelledby="prog-about-title">
        <h2 id="prog-about-title" className="sr-only">
          About {p.title}
        </h2>
        <p className="prog-desc">{p.description}</p>
        {presenters.length ? (
          <div className="prog-presenters">
            <p className="eyebrow" id="prog-presenters-title">
              Presented by
            </p>
            <ul aria-labelledby="prog-presenters-title">
              {presenters.map((person) => (
                <li key={person.id}>
                  <Link to={cat.href(person.id)} className="prog-presenter" data-cursor-label="Connections" onClick={() => sound.play('transition')}>
                    <span className="prog-presenter-name">{person.name}</span>
                    <span className="prog-presenter-role">{person.provisional ? 'Profile awaiting approval' : (person.roles[0] ?? 'Presenter')}</span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {hasRoute ? (
        <section className="section wrap prog-route-section" id="prog-route" aria-labelledby="prog-route-title">
          <SectionHeader
            title="The route"
            id="prog-route-title"
            action={
              route ? (
                <ButtonLink to={route} variant="quiet" iconAfter="arrow">
                  Open in World
                </ButtonLink>
              ) : undefined
            }
          >
            Each stop opens in World; each leg shows the catalogued route.
          </SectionHeader>
          <RouteStrip programme={p} />
        </section>
      ) : null}

      <section className="section wrap" id="prog-episodes" aria-labelledby="prog-episodes-title">
        <SectionHeader title="In this programme" id="prog-episodes-title">
          {all.length ? `In series order. ${plural(all.length, 'entry', 'entries')}, ${playableCount} playable now — each one lit in the world beside you.` : undefined}
        </SectionHeader>
        {groups.length === 0 ? (
          <EmptyState
            icon={p.kind === 'artist-campaign' ? 'wave' : 'time'}
            tone="plasma"
            title="Nothing to play yet"
            actions={
              <>
                {presenters.map((person) => (
                  <ButtonLink key={person.id} to={cat.href(person.id)} icon="synapse">
                    {person.name}’s connections
                  </ButtonLink>
                ))}
                {p.categories[0] ? (
                  <ButtonLink to={`/search?interest=${(cat.get(p.categories[0]) as { slug: string } | undefined)?.slug ?? ''}`} variant="quiet" icon="search">
                    Browse {cat.label(p.categories[0])}
                  </ButtonLink>
                ) : null}
              </>
            }
          >
            <p>No videos have been published for {p.title} yet. When approved material is published it appears here automatically, in series order.</p>
            <p className="prog-empty-note">Status: {PROGRAMME_STATUS_LABEL[p.status]}. The note at the top of this page says what exists today.</p>
          </EmptyState>
        ) : (
          groups.map((g) => {
            const titled = groups.length > 1 || g.chapter;
            return (
              <div className="prog-group" key={g.key}>
                {titled ? (
                  <h3 className="prog-group-title">
                    {g.chapter ? (
                      <>
                        <span className="prog-group-kind">Chapter</span>
                        <Link to={cat.href(g.programme.id)}>{g.programme.title}</Link>
                        <StatusBadge status={g.programme.status} />
                      </>
                    ) : (
                      <span>Season {g.season ?? 1}</span>
                    )}
                  </h3>
                ) : null}
                <ol className="prog-ep-list">
                  {g.videos.map((v) => (
                    <li key={v.id}>
                      <EpisodeRow video={v} level={titled ? 4 : 3} lead={v.id === lead?.id} />
                    </li>
                  ))}
                </ol>
              </div>
            );
          })
        )}
      </section>

      {children.length ? (
        <section className="section wrap" id="prog-chapters" aria-labelledby="prog-chapters-title">
          <SectionHeader title="Chapters" id="prog-chapters-title">
            {plural(children.length, 'chapter')} of {p.title}.
          </SectionHeader>
          <ul className="prog-card-grid">
            {children.map((c) => (
              <li key={c.id}>
                <ProgrammeCard programme={c} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section wrap" id="prog-threads" aria-labelledby="prog-threads-title">
        <SectionHeader
          title="Threads"
          id="prog-threads-title"
          action={
            <ButtonLink to={`/synapse/programme/${p.slug}`} variant="quiet" icon="synapse" data-cursor-label="Synapse">
              See every connection
            </ButtonLink>
          }
        />
        {threads.length ? (
          <dl className="prog-threads">
            {threads.map((t) => (
              <div key={t.label} className="prog-thread" data-tone={t.tone}>
                <dt className="prog-thread-label">{t.label}</dt>
                <dd>
                  <ul>
                    {t.ids.map((id) => (
                      <li key={id}>
                        <Link to={cat.href(id)} className="prog-tag" onClick={() => sound.play('select')}>
                          <span className="prog-tag-node" aria-hidden="true" />
                          <span>{cat.label(id)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted">No interests, themes or places are linked to this programme yet.</p>
        )}
      </section>

      {related.length ? (
        <section className="section wrap" id="prog-related" aria-labelledby="prog-related-title">
          <SectionHeader title="Related programmes" id="prog-related-title" />
          <ul className="prog-card-grid">
            {related.map((r) => (
              <li key={r.programme.id}>
                <ProgrammeCard programme={r.programme} reasons={r.reasons} compact />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

/** One entry in series order. Its seed is in the world's ring: hover lights it, and vice versa. */
function EpisodeRow({ video: v, level, lead }: { video: Video; level: 3 | 4; lead: boolean }) {
  const cat = useCatalogue();
  const lib = useLibrary();
  const access = useAccessState(v);
  const playable = cat.isPlayable(v);
  const runtime = cat.runtime(v);
  const progress = lib.progress[v.id];
  const pct = progress ? (progress.done ? 100 : progress.dur ? Math.min(100, (progress.pos / progress.dur) * 100) : 0) : 0;
  const resumable = !!progress && !progress.done && progress.pos > 5;
  const saved = isSaved(lib, v.id);
  const href = cat.href(v.id);
  const Title = level === 3 ? 'h3' : 'h4';
  const lit = useSeedLit(v.id);
  useEffect(() => () => releaseSeed(v.id), [v.id]);

  const toggleSave = (e: React.MouseEvent<HTMLElement>) => {
    const now = libraryActions.toggleSave(v.id);
    announceSave({ saved: now, title: v.title, from: e.currentTarget, id: v.id, undo: () => libraryActions.toggleSave(v.id) });
  };

  return (
    <article className="prog-ep" data-playable={playable || undefined} data-access={access.key} data-lead={lead || undefined} data-world-lit={lit || undefined} {...seedHover(v.id)}>
      <div className="prog-ep-thumb">
        {playable ? (
          <Link to={href} tabIndex={-1} aria-hidden="true" data-cursor="play" data-cursor-label={access.locked ? 'Preview' : 'Watch'}>
            <Art art={v.art} alt="" />
          </Link>
        ) : (
          <Art art={v.art} alt="" />
        )}
        {access.key !== 'free' ? <span className={`prog-ep-mark prog-ep-mark-${access.key}`}>{access.label}</span> : null}
        {runtime ? <span className="prog-ep-runtime">{runtimeLabel(runtime)}</span> : null}
        {pct > 0 ? (
          <span className="prog-ep-vein" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </div>
      <div className="prog-ep-body">
        <p className="prog-ep-label">{entryLabel(v)}</p>
        <Title className="prog-ep-title">
          {playable ? (
            <Link to={href} onClick={() => sound.play('transition')}>
              {v.title}
            </Link>
          ) : (
            v.title
          )}
        </Title>
        <p className="prog-ep-meta">
          <span>{settingLabel(v)}</span>
          {v.footage.length ? <span>{v.footage.map((f) => FOOTAGE_LABEL[f]).join(', ')}</span> : null}
          {access.key === 'free' ? null : <span className="sr-only">{access.label}</span>}
        </p>
        <p className="prog-ep-summary">{v.summary}</p>
        {!playable ? (
          <p className="prog-ep-status">
            <Icon name="time" size={15} />
            {v.availability.note ?? access.label}
          </p>
        ) : resumable ? (
          <p className="prog-ep-progress">{Math.round(pct)}% watched</p>
        ) : progress?.done ? (
          <p className="prog-ep-progress">Watched</p>
        ) : null}
      </div>
      <div className="prog-ep-actions">
        {playable ? (
          <ButtonLink to={href} variant="ghost" size="sm" icon="play" aria-label={`${resumable ? 'Resume' : 'Watch'} ${v.title}`} data-cursor="play" data-cursor-label="Watch">
            {resumable ? 'Resume' : 'Watch'}
          </ButtonLink>
        ) : (
          <span className="prog-ep-locked">Not yet playable</span>
        )}
        <button type="button" className="icon-btn prog-ep-save" aria-pressed={saved} aria-label={saved ? `Remove ${v.title} from saved` : `Save ${v.title}`} data-cursor="save" onClick={toggleSave}>
          <Icon name={saved ? 'saved' : 'save'} size={18} />
        </button>
      </div>
    </article>
  );
}
