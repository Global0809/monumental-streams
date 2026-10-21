/**
 * CONNECTIONS — /synapse/:kind/:slug (kind ∈ video, programme, place, period, movement,
 * person, interest, theme; routes too). Also the person, movement, theme and interest page.
 *
 * Hero: the entity (kind, name, summary, key facts, honesty notes, one way onward) beside its
 * neural web. Then the always-rendered text alternative, "Why these are connected", grouped
 * by kind; then the stories in this web.
 */
import { useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import type { Entity, EntityKind } from '../../../shared/catalogue.ts';
import { connectionsFor, relatedVideos } from '../../../shared/relations.ts';
import type { ID, Movement, Period, Person, Place, Programme, Reason, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { PROVENANCE_LABEL, plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useReducedMotion } from '../../systems/motion.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art, FootageBadges, ReasonChips, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import { KIND_LABEL, KIND_PLURAL, PROGRAMME_STATUS, entityHeader, resolveEntity, synapseHref, type EntityHeader, type SynKind } from './entity.ts';
import { KIND_ORDER } from './layout.ts';
import { NeuralGraph } from './NeuralGraph.tsx';
import './synapse.css';

/** Strongest links shown per kind; weaker ones wait behind a disclosure. */
const GROUP_CAP = 6;

const CHAPTERS = [
  { id: 'syn-web', label: 'The web' },
  { id: 'syn-why', label: 'Why connected' },
  { id: 'syn-stories', label: 'Stories' },
];

export default function SynapsePage() {
  const cat = useCatalogue();
  const { kind = '', slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const reduced = useReducedMotion();
  const depth: 1 | 2 = params.get('depth') === '2' ? 2 : 1;
  const resolved = useMemo(() => resolveEntity(cat, kind, slug), [cat, kind, slug]);
  const id = resolved?.entity.id;

  useEffect(() => {
    document.title = id ? `${cat.label(id)} — Connections · Monumental Streams` : 'Connections · Monumental Streams';
  }, [cat, id]);
  useChapters(resolved?.canonical ? CHAPTERS : []);

  const header = useMemo(() => (resolved ? entityHeader(cat, resolved.entity, resolved.kind) : null), [cat, resolved]);

  if (resolved && !resolved.canonical) return <Navigate to={`${synapseHref(cat, resolved.entity.id)}${location.search}`} replace />;
  if (!resolved || !header || !id) return <Unknown slug={slug} />;

  const setDepth = (d: 1 | 2) => {
    const q = new URLSearchParams(params);
    if (d === 2) q.set('depth', '2');
    else q.delete('depth');
    setParams(q, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="page wrap syn-page">
      <NeuralGraph centreId={id} centreArt={header.art} depth={depth} onDepth={setDepth} reduced={reduced} lead={<Lead header={header} kind={resolved.kind} entity={resolved.entity} />} details={<Details header={header} />} />
      <WhyConnected id={id} />
      <StoriesInWeb id={id} kind={resolved.kind} />
    </div>
  );
}

/* ───────────── Entity header ───────────── */

function Lead({ header: h, kind, entity }: { header: EntityHeader; kind: SynKind; entity: Entity }) {
  const video = kind === 'video' ? (entity as Video) : null;
  return (
    <header className="syn-head">
      <nav className="syn-crumbs" aria-label="Breadcrumb">
        <Link to="/world">World</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Connections</span>
      </nav>
      {h.art ? (
        <div className="syn-head-art">
          <Art art={h.art} sizes="small" eager alt="" />
        </div>
      ) : null}
      <p className="kicker syn-kicker">
        <span className="syn-dot" data-kind={kind} aria-hidden="true" />
        <b>Connections</b> · {h.kindLabel}
      </p>
      <h1 className="page-title syn-title" data-long={h.title.length > 28 || undefined}>
        {h.title}
      </h1>
      {h.lede ? <p className="syn-lede">{h.lede}</p> : null}
      {video ? (
        <div className="syn-badges">
          <AccessBadge video={video} />
          <FootageBadges video={video} max={3} />
          <span className="badge">{PROVENANCE_LABEL[video.provenance]}</span>
        </div>
      ) : null}
      {h.notices.map((n, i) => (
        <p key={i} className="notice">
          <Icon name="info" size={16} />
          <span>{n}</span>
        </p>
      ))}
      {h.primary || h.secondary.length ? (
        <div className="syn-actions">
          {h.primary ? (
            <ButtonLink to={h.primary.to} variant="primary" icon={h.primary.icon} aria-label={h.primary.aria} data-cursor={h.primary.icon === 'play' ? 'play' : 'open'} data-cursor-label={h.primary.label}>
              {h.primary.label}
            </ButtonLink>
          ) : null}
          {h.secondary.map((a) => (
            <ButtonLink key={a.to} to={a.to} variant="ghost" icon={a.icon}>
              {a.label}
            </ButtonLink>
          ))}
          {h.primary?.note ? <p className="syn-action-note">Plays: {h.primary.note}</p> : null}
        </div>
      ) : null}
    </header>
  );
}

function Details({ header: h }: { header: EntityHeader }) {
  if (!h.facts.length && !(h.body && h.body !== h.lede)) return null;
  return (
    <div className="syn-details">
      <h2 className="kicker syn-details-title">Key facts</h2>
      {h.body && h.body !== h.lede ? (
        <div className="syn-body">
          {h.body.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}
      {h.facts.length ? (
        <dl className="syn-facts">
          {h.facts.map((f, i) => (
            <div key={i}>
              <dt>{f.label}</dt>
              <dd>
                {f.items.map((it, k) => (
                  <span key={k} className="syn-fact-item">
                    {it.to ? <Link to={it.to}>{it.text}</Link> : it.text}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/* ───────────── Text alternative: why these are connected ───────────── */

function metaFor(cat: ReturnType<typeof useCatalogue>, id: ID, kind: EntityKind): string {
  const e = cat.get(id);
  if (!e) return KIND_LABEL[kind];
  switch (kind) {
    case 'place': {
      const p = e as Place;
      const parent = p.parent ? cat.label(p.parent) : null;
      return parent ? `${p.kind.replace('-', ' ')} · ${parent}` : p.kind.replace('-', ' ');
    }
    case 'movement': {
      const m = e as Movement;
      return m.end === null ? `${m.start}–present` : `${m.start}–${m.end}`;
    }
    case 'period': {
      const p = e as Period;
      return `${p.start}–${p.end}`;
    }
    case 'person':
      return (e as Person).roles[0] ?? 'Person';
    case 'programme': {
      const g = e as Programme;
      return `${PROGRAMME_STATUS[g.status]}${g.original ? ' · Monumental Original' : ''}`;
    }
    case 'video': {
      const v = e as Video;
      return PROVENANCE_LABEL[v.provenance];
    }
    default:
      return KIND_LABEL[kind];
  }
}

function WhyConnected({ id }: { id: ID }) {
  const cat = useCatalogue();
  const conns = useMemo(() => connectionsFor(cat, id, { limit: 48 }), [cat, id]);
  const groups = useMemo(() => {
    const by = new Map<EntityKind, typeof conns>();
    for (const c of conns) {
      const k = cat.get(c.target) ? (c.target.slice(0, c.target.indexOf(':')) as EntityKind) : null;
      if (!k) continue;
      const list = by.get(k) ?? [];
      list.push(c);
      by.set(k, list);
    }
    return KIND_ORDER.filter((k) => by.has(k)).map((k) => ({ kind: k, items: by.get(k)! }));
  }, [cat, conns]);
  const max = Math.max(1, ...conns.map((c) => c.weight));
  return (
    <section id="syn-why" className="section" aria-labelledby="syn-why-h">
      <SectionHeader id="syn-why-h" kicker="Every link, in words" title="Why these are connected">
        {conns.length ? `${plural(conns.length, 'connection')} across ${plural(groups.length, 'kind')}, strongest first. Each lists the reasons the archive links them.` : 'Nothing in the archive links here yet.'}
      </SectionHeader>
      {groups.length ? (
        <div className="syn-groups">
          {groups.map((g) => {
            const item = (c: (typeof g.items)[number]) => {
              const entityHref = cat.href(c.target);
              const synHref = synapseHref(cat, c.target);
              const label = cat.label(c.target);
              return (
                <li key={c.target} className="syn-link">
                  <div className="syn-link-head">
                    <Link to={entityHref} className="syn-link-name" data-cursor={g.kind === 'video' ? 'play' : 'open'}>
                      {label}
                    </Link>
                    {synHref !== entityHref ? (
                      <Link to={synHref} className="syn-link-syn" aria-label={`Connections for ${label}`} title="Open its connections" data-cursor-label="Connections">
                        <Icon name="synapse" size={16} />
                      </Link>
                    ) : null}
                  </div>
                  <p className="syn-link-meta">
                    <span>{metaFor(cat, c.target, g.kind)}</span>
                    <span className="syn-strength" aria-hidden="true">
                      <span style={{ width: `${Math.max(8, (c.weight / max) * 100)}%` }} />
                    </span>
                  </p>
                  <ReasonChips reasons={c.reasons as Reason[]} max={3} />
                </li>
              );
            };
            const head = g.items.slice(0, GROUP_CAP);
            const rest = g.items.slice(GROUP_CAP);
            return (
              <div key={g.kind} className="syn-group" data-kind={g.kind}>
                <h3 className="syn-group-title">
                  <span className="syn-dot" data-kind={g.kind} aria-hidden="true" />
                  {KIND_PLURAL[g.kind]}
                  <span className="syn-group-count">{g.items.length}</span>
                </h3>
                <ul className="syn-links">{head.map(item)}</ul>
                {rest.length ? (
                  <details className="syn-more">
                    <summary>
                      <Icon name="plus" size={16} /> {rest.length} weaker {rest.length === 1 ? 'link' : 'links'}
                    </summary>
                    <ul className="syn-links">{rest.map(item)}</ul>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/* ───────────── Stories in this web ───────────── */

function StoriesInWeb({ id, kind }: { id: ID; kind: SynKind }) {
  const cat = useCatalogue();
  const items = useMemo(() => {
    if (kind === 'video') return relatedVideos(cat, id, 12).map((r) => ({ video: r.video, reasons: r.reasons }));
    return connectionsFor(cat, id, { kinds: ['video'], limit: 12 })
      .map((c) => ({ video: cat.get(c.target) as Video | undefined, reasons: c.reasons }))
      .filter((x): x is { video: Video; reasons: Reason[] } => !!x.video);
  }, [cat, id, kind]);
  return (
    <section id="syn-stories" className="section" aria-labelledby="syn-stories-h">
      <SectionHeader id="syn-stories-h" kicker="Watch the web" title="Stories in this web">
        {items.length ? `${plural(items.length, 'story', 'stories')} connected to ${cat.label(id)}, each with the reason it is here.` : undefined}
      </SectionHeader>
      {items.length ? (
        <ul className="grid-pods">
          {items.map(({ video, reasons }) => (
            <li key={video.id}>
              <VideoPod video={video} reasons={reasons} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="stream" title="No stories in this web yet" actions={<ButtonLink to="/catalogue">Browse the catalogue</ButtonLink>}>
          <p>When a story is tagged with this {KIND_LABEL[kind].toLowerCase()} or anything close to it, it appears here.</p>
        </EmptyState>
      )}
    </section>
  );
}

/* ───────────── Unknown address ───────────── */

function Unknown({ slug }: { slug: string }) {
  return (
    <div className="page wrap syn-page">
      <header className="page-head">
        <p className="kicker">
          <b>Connections</b>
        </p>
        <h1 className="page-title">No connections at this address</h1>
        <p className="page-lede">No place, person, movement, programme, story, decade, interest or theme answers to “{slug}”.</p>
      </header>
      <div className="syn-unknown-actions">
        <ButtonLink to="/synapse/place/miami" variant="primary" icon="synapse">
          Start at Miami
        </ButtonLink>
        <ButtonLink to={`/catalogue?q=${encodeURIComponent(slug.replace(/-/g, ' '))}`} icon="search">
          Search for “{slug.replace(/-/g, ' ')}”
        </ButtonLink>
      </div>
    </div>
  );
}
