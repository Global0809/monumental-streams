/**
 * PROGRAMME: a series, chapter, artist campaign or demonstration series. A cinematic header
 * leads with the honest status (what exists today); then what it is and who presents it, the
 * route for journey programmes, what is in it as image rows (series order, access, footage
 * labelling, progress), its chapters and its connections.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router';
import type { ID, Person, Programme, Video } from '../../../shared/types.ts';
import { connectionsFor } from '../../../shared/relations.ts';
import { useChapters } from '../../app/chapters.ts';
import { runtimeLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { isSaved, libraryActions, useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art, FootageBadges, SectionHeader, useAccessState } from '../../ui/Pod.tsx';
import { LoopToggle, OriginalBadge, ProgrammeCard, StatusBadge } from './ProgrammeCard.tsx';
import { RouteStrip } from './RouteStrip.tsx';
import { entryLabel, episodeGroups, firstPlayable, PROGRAMME_KIND_LABEL, PROGRAMME_STATUS_LABEL, routeHref, routeStops } from './programme-model.ts';
import { useLoop } from './useLoop.ts';
import './programme.css';
import { announceSave } from '../../ui/save.ts';

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
  return (
    <div className="page wrap">
      <header className="page-head">
        <p className="kicker">Programme</p>
        <h1 className="page-title">Nothing lives at this address</h1>
      </header>
      <EmptyState
        icon="info"
        title="No programme matches this link"
        actions={
          <>
            <ButtonLink to="/catalogue" variant="primary" icon="search">
              Search the catalogue
            </ButtonLink>
            <ButtonLink to="/">Back to Stream</ButtonLink>
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
  const art = cat.artFor(p.art);
  const vid = useRef<HTMLVideoElement>(null);
  const loop = useLoop(vid, art?.preview || art?.previewSmall ? { large: art.preview, small: art.previewSmall } : null, { autoplay: true });

  const parent = p.parent ? (cat.get(p.parent) as Programme | undefined) : undefined;
  const children = cat.programmeChildren(p.id);
  const groups = useMemo(() => episodeGroups(cat, p), [cat, p]);
  const all = groups.flatMap((g) => g.videos);
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

  const chapters = [
    { id: 'prog-overview', label: 'Overview' },
    ...(hasRoute ? [{ id: 'prog-route', label: 'Route' }] : []),
    { id: 'prog-episodes', label: 'In this programme' },
    ...(children.length ? [{ id: 'prog-chapters', label: 'Chapters' }] : []),
    { id: 'prog-threads', label: 'Threads' },
    ...(related.length ? [{ id: 'prog-related', label: 'Related' }] : []),
  ];
  useChapters(chapters);

  const cta = resume
    ? { to: cat.href(resume.id), label: `Resume “${resume.title}”` }
    : first
      ? { to: cat.href(first.id), label: first.kind === 'teaser' ? (p.original ? 'Watch the motion teaser' : 'Watch the teaser') : all.filter((v) => cat.isPlayable(v)).length > 1 ? 'Play from the start' : 'Watch now' }
      : null;

  const threads: { label: string; ids: ID[] }[] = [
    { label: 'Interests', ids: p.categories },
    { label: 'Themes', ids: p.themes },
    { label: 'Places', ids: p.places },
    { label: 'Movements', ids: p.movements ?? [] },
    { label: 'Periods', ids: p.periods },
  ].filter((t) => t.ids.length > 0);

  return (
    <article className="prog" data-kind={p.kind}>
      <header
        className="prog-hero"
        id="prog-overview"
        data-playing={loop.playing || undefined}
        onPointerEnter={loop.wake}
        onPointerLeave={loop.sleep}
        onFocus={loop.wake}
        onBlur={loop.sleep}
      >
        <div className="prog-hero-ambient" aria-hidden="true">
          <Art art={p.art} alt="" sizes="large" eager />
        </div>
        <div className="wrap prog-hero-inner">
          <div className="prog-hero-copy">
            <nav className="prog-crumbs" aria-label="Breadcrumb">
              <ol>
                <li>
                  <Link to="/catalogue">Catalogue</Link>
                </li>
                {parent ? (
                  <li>
                    <Link to={cat.href(parent.id)}>{parent.title}</Link>
                  </li>
                ) : null}
                <li aria-current="page">{kind}</li>
              </ol>
            </nav>
            <div className="prog-hero-badges">
              <StatusBadge status={p.status} />
              {p.original ? <OriginalBadge /> : null}
            </div>
            <h1 className="prog-title" data-long={p.title.length > 34 || undefined}>
              <span>{p.title}</span>
            </h1>
            <p className="prog-tagline">{p.tagline}</p>
            <div className="prog-status-panel" data-status={p.status} role="note" aria-label="What exists today">
              <Icon name="info" size={20} />
              <div>
                <p className="prog-status-label">
                  Status: <b>{PROGRAMME_STATUS_LABEL[p.status]}</b>
                </p>
                <p className="prog-status-note">{p.statusNote}</p>
              </div>
            </div>
            <div className="prog-actions">
              {cta ? (
                <ButtonLink to={cta.to} variant="primary" size="lg" icon="play" data-cursor="play" data-cursor-label="Watch">
                  {cta.label}
                </ButtonLink>
              ) : null}
              {route ? (
                <ButtonLink to={route} variant="chrome" size="lg" icon="globe" data-cursor-label="Atlas">
                  Follow the route
                </ButtonLink>
              ) : null}
              <ButtonLink to={`/synapse/programme/${p.slug}`} variant="ghost" size="lg" icon="synapse" data-cursor-label="Synapse">
                Connections
              </ButtonLink>
            </div>
          </div>
          <div className="prog-hero-screen">
            <Art art={p.art} alt="" sizes="large" eager />
            {art?.preview || art?.previewSmall ? <video ref={vid} className="prog-hero-video" muted loop playsInline preload="none" tabIndex={-1} aria-hidden="true" /> : null}
            {art?.preview || art?.previewSmall ? <LoopToggle playing={loop.playing} onToggle={loop.toggle} className="prog-hero-toggle" label="header motion" /> : null}
          </div>
          {art?.provisional ? <p className="prog-art-note">Header art is a provisional studio motion concept</p> : null}
        </div>
      </header>

      <div className="wrap prog-about">
        <p className="prog-desc">{p.description}</p>
        {presenters.length ? (
          <div className="prog-presenters">
            <h2 className="prog-presenters-title" id="prog-presenters-title">
              Presented by
            </h2>
            <ul aria-labelledby="prog-presenters-title">
              {presenters.map((person) => (
                <li key={person.id}>
                  <Link to={cat.href(person.id)} className="prog-presenter" data-cursor-label="Connections" onClick={() => sound.play('transition')}>
                    <span className="prog-presenter-mark" aria-hidden="true">
                      {person.name.slice(0, 1)}
                    </span>
                    <span>
                      <span className="prog-presenter-name">{person.name}</span>
                      <span className="prog-presenter-role">{person.provisional ? 'Profile awaiting approval' : (person.roles[0] ?? 'Presenter')}</span>
                    </span>
                    <Icon name="arrow" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {hasRoute ? (
        <section className="section wrap prog-route-section" id="prog-route" aria-labelledby="prog-route-title">
          <SectionHeader
            title="The route"
            id="prog-route-title"
            action={
              route ? (
                <ButtonLink to={route} variant="quiet" iconAfter="arrow">
                  Open in the atlas
                </ButtonLink>
              ) : undefined
            }
          >
            Each stop opens the Living Atlas; each leg shows the catalogued route.
          </SectionHeader>
          <RouteStrip programme={p} />
        </section>
      ) : null}

      <section className="section wrap" id="prog-episodes" aria-labelledby="prog-episodes-title">
        <SectionHeader kicker="Series order" title="In this programme" id="prog-episodes-title">
          {all.length ? `${all.length} ${all.length === 1 ? 'entry' : 'entries'} · ${all.filter((v) => cat.isPlayable(v)).length} playable now` : undefined}
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
                  <ButtonLink to={`/catalogue?interest=${(cat.get(p.categories[0]) as { slug: string } | undefined)?.slug ?? ''}`} icon="search">
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
                  {g.videos.map((v, i) => (
                    <li key={v.id}>
                      <EpisodeRow video={v} index={i} level={titled ? 4 : 3} primary={v.id === (resume ?? first)?.id} />
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
          <SectionHeader kicker={`${children.length} ${children.length === 1 ? 'chapter' : 'chapters'}`} title="Chapters" id="prog-chapters-title" />
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
        <SectionHeader kicker="Connected through" title="Threads" id="prog-threads-title" />
        {threads.length ? (
          <dl className="prog-threads">
            {threads.map((t) => (
              <div key={t.label} className="prog-thread">
                <dt className="prog-thread-label">{t.label}</dt>
                <dd>
                  <ul>
                    {t.ids.map((id) => (
                      <li key={id}>
                        <Link to={cat.href(id)} className="prog-tag" data-kind={id.slice(0, id.indexOf(':'))} onClick={() => sound.play('select')}>
                          <span className="prog-tag-node" aria-hidden="true" />
                          {cat.label(id)}
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
        <p className="prog-threads-more">
          <ButtonLink to={`/synapse/programme/${p.slug}`} variant="chrome" icon="synapse" data-cursor-label="Synapse">
            See every connection
          </ButtonLink>
        </p>
      </section>

      {related.length ? (
        <section className="section wrap" id="prog-related" aria-labelledby="prog-related-title">
          <SectionHeader kicker="Why these" title="Related programmes" id="prog-related-title" />
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

function EpisodeRow({ video: v, index, level, primary }: { video: Video; index: number; level: 3 | 4; primary: boolean }) {
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

  const toggleSave = (e: React.MouseEvent<HTMLElement>) => {
    const now = libraryActions.toggleSave(v.id);
    announceSave({ saved: now, title: v.title, from: e.currentTarget, undo: () => libraryActions.toggleSave(v.id) });
  };

  return (
    <article className="prog-ep" data-playable={playable || undefined} data-access={access.key}>
      <div className="prog-ep-thumb">
        {playable ? (
          <Link to={href} tabIndex={-1} aria-hidden="true" data-cursor="play" data-cursor-label={access.locked ? 'Preview' : 'Watch'}>
            <Art art={v.art} alt="" />
          </Link>
        ) : (
          <Art art={v.art} alt="" />
        )}
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
        <div className="prog-ep-badges">
          <AccessBadge video={v} />
          <FootageBadges video={v} max={4} />
        </div>
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
          <ButtonLink to={href} variant={primary ? 'primary' : 'chrome'} size="sm" icon="play" aria-label={`${resumable ? 'Resume' : 'Watch'} ${v.title}`} data-cursor="play" data-cursor-label="Watch">
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
