/**
 * The eight presentation families for a category's results. All of them receive the same
 * engine output (search → facet → sort → group); each composes it for its subject:
 *
 *   cinema          a widescreen poster wall: two features, then the bill
 *   soundstage      tracks grouped by artist or scene, record-sleeve cards, and the scenes
 *                   (music movements) as frequency bands through time
 *   arena           the main event, then fixtures grouped by home ground
 *   arcade          a level-select grid of numbered cartridges
 *   broadsheet      lead story, columns and briefs — dates and sources first
 *   runway          a lookbook: tall numbered looks on a snap-scrolling runway
 *   atlas-of-ideas  a mosaic grouped by place (or era), each group opening into World
 *   playroom        big, friendly tiles
 *
 * Results glide when the collection changes (useFlip) and stand still under reduced motion.
 */
import { useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Section } from '../../../shared/sections.ts';
import type { Video } from '../../../shared/types.ts';
import { PROVENANCE_LABEL, dateLabel, plural, runtimeLabel, settingLabel } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { AccessBadge, Art } from '../../ui/Pod.tsx';
import { groupVideos, interestContext, sourceOf, type Group, type GroupMode } from './engine.ts';
import { CatCard, SaveButton, useFlip, type CardShape } from './parts.tsx';

export interface ResultsProps {
  section: Section;
  videos: Video[];
  group: GroupMode;
  pageRef: RefObject<HTMLElement | null>;
}

const sig = (videos: Video[], extra = '') => `${extra}|${videos.map((v) => v.id).join(',')}`;

function Cards({ videos, shape, pageRef, className, numbered, keyPrefix = '' }: { videos: Video[]; shape: CardShape; pageRef: RefObject<HTMLElement | null>; className: string; numbered?: boolean; keyPrefix?: string }) {
  return (
    <ul className={className}>
      {videos.map((v, i) => (
        <li key={v.id} data-flip={`${keyPrefix}${v.id}`} style={{ '--i': i } as CSSProperties}>
          <CatCard video={v} shape={shape} index={numbered ? i : undefined} hotRoot={pageRef} eager={i < 2} sizes={i < 2 && shape === 'scope' ? 'large' : 'small'} />
        </li>
      ))}
    </ul>
  );
}

function GroupHead({ g, icon }: { g: Group; icon?: 'globe' | 'time' | 'synapse' | 'user' }) {
  return (
    <header className="grp-head">
      <h3 className="grp-title">
        {g.href ? (
          <Link to={g.href} onClick={() => sound.play('transition')}>
            {icon ? <Icon name={icon} size={18} /> : null}
            {g.label}
            <Icon name="arrow" size={16} />
          </Link>
        ) : (
          g.label
        )}
      </h3>
      <p className="grp-note">
        {g.note ? <span>{g.note}</span> : null}
        <span>{plural(g.videos.length, 'title')}</span>
      </p>
    </header>
  );
}

/* ═════════════ cinema ═════════════ */

export function CinemaResults({ videos, pageRef }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  return (
    <div ref={ref} className="fam fam-cinema">
      <Cards videos={videos} shape="scope" pageRef={pageRef} className="wall" />
    </div>
  );
}

/* ═════════════ soundstage ═════════════ */

function Scenes({ section }: { section: Section }) {
  const cat = useCatalogue();
  const ctx = useMemo(() => interestContext(cat, section, 12), [cat, section]);
  const now = new Date().getFullYear();
  const FROM = 1900;
  const span = now - FROM;
  if (!ctx.movements.length) return null;
  return (
    <section className="scenes" aria-labelledby="scenes-title">
      <header className="scenes-head">
        <h3 id="scenes-title" className="cat-h3">
          <Icon name="wave" size={18} /> Scenes
        </h3>
        <p className="scenes-sub">The music movements in the catalogue, on one timeline. Each opens its Connections — where it started, what it grew from and what it set in motion.</p>
      </header>
      <ol className="scenes-bands">
        {ctx.movements.map((m) => {
          const start = Math.max(FROM, m.start);
          const end = m.end ?? now;
          return (
            <li key={m.id}>
              <Link to={cat.href(m.id)} className="band" onClick={() => sound.play('transition')} style={{ '--a': (start - FROM) / span, '--b': (end - FROM) / span } as CSSProperties}>
                <span className="band-name">{m.name}</span>
                <span className="band-years">
                  {m.start < FROM ? `since ${m.start}` : m.start}–{m.end ?? 'now'}
                </span>
                <span className="band-line" aria-hidden="true">
                  <span />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="scenes-axis" aria-hidden="true">
        <span />
        <span className="scenes-axis-track">
          {[1900, 1925, 1950, 1975, 2000].map((y) => (
            <span key={y} style={{ '--a': (y - FROM) / span } as CSSProperties}>
              {y}
            </span>
          ))}
          <span className="is-now" style={{ '--a': 1 } as CSSProperties}>
            now
          </span>
        </span>
        <span />
      </div>
    </section>
  );
}

export function SoundstageResults({ section, videos, group, pageRef }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupVideos(cat, videos, group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  return (
    <div ref={ref} className="fam fam-soundstage">
      {groups.map((g) => (
        <section key={g.key} className="track" aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}>
          {group !== 'all' ? <GroupHead g={g} icon={group === 'artist' ? 'user' : 'synapse'} /> : null}
          <Cards videos={g.videos} shape="sleeve" pageRef={pageRef} className="sleeves" keyPrefix={`${g.key}:`} />
        </section>
      ))}
      <Scenes section={section} />
    </div>
  );
}

/* ═════════════ arena ═════════════ */

export function ArenaResults({ videos, group, pageRef }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const main = videos[0];
  const groups = useMemo(() => groupVideos(cat, videos.slice(1), group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  if (!main) return null;
  return (
    <div ref={ref} className="fam fam-arena">
      <div className="arena-main" data-flip={`main:${main.id}`}>
        <p className="kicker">Main event</p>
        <CatCard video={main} shape="scope" hotRoot={pageRef} eager sizes="large" />
      </div>
      <div className="fixtures-list">
        {groups.map((g) =>
          g.videos.length ? (
            <section key={g.key} className={`fixtures ${group === 'all' || g.videos.length >= 3 ? 'is-wide' : ''}`} aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}>
              {group !== 'all' ? <GroupHead g={g} icon="globe" /> : null}
              <Cards videos={g.videos} shape="wide" pageRef={pageRef} className="fixture-grid" keyPrefix={`${g.key}:`} />
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ═════════════ arcade ═════════════ */

export function ArcadeResults({ videos, pageRef }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  return (
    <div ref={ref} className="fam fam-arcade">
      <Cards videos={videos} shape="cart" pageRef={pageRef} className="carts" numbered />
    </div>
  );
}

/* ═════════════ broadsheet ═════════════ */

function Source({ v }: { v: Video }) {
  return (
    <p className="src">
      <span className="src-k">Source</span>
      <span className="src-v">{sourceOf(v, PROVENANCE_LABEL[v.provenance])}</span>
      {v.credits?.licence ? <span className="src-l">{v.credits.licence}</span> : null}
    </p>
  );
}

function Dateline({ v }: { v: Video }) {
  const cat = useCatalogue();
  const place = v.places[0] ? cat.label(v.places[0]) : null;
  return (
    <p className="dateline">
      {v.made ? (
        <span>
          <b>Filmed</b> {v.made}
        </span>
      ) : null}
      <span>
        <b>Set</b> {settingLabel(v)}
      </span>
      {place ? <span>{place}</span> : null}
      <span>
        <b>Added</b> <time dateTime={v.published}>{dateLabel(v.published)}</time>
      </span>
    </p>
  );
}

export function BroadsheetResults({ videos, pageRef }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  const [lead, ...others] = videos;
  const columns = others.slice(0, 3);
  const briefs = others.slice(3);
  if (!lead) return null;
  const runtime = cat.runtime(lead);
  return (
    <div ref={ref} className="fam fam-broadsheet">
      <article className="lead" data-flip={`lead:${lead.id}`} data-vid={lead.id}>
        <Link to={cat.href(lead.id)} className="lead-art" tabIndex={-1} aria-hidden="true" data-react="light" onClick={() => sound.play('transition')}>
          <Art art={lead.art} sizes="large" eager />
          {runtime ? <span className="cc-runtime">{runtimeLabel(runtime)}</span> : null}
        </Link>
        <div className="lead-copy">
          <p className="kicker">Lead report</p>
          <Dateline v={lead} />
          <h3 className="lead-title">
            <Link to={cat.href(lead.id)} onClick={() => sound.play('transition')}>
              {lead.title}
            </Link>
          </h3>
          <p className="lead-stand">{lead.summary}</p>
          {lead.context ? (
            <p className="lead-context">
              <Icon name="info" size={16} /> {lead.context}
            </p>
          ) : null}
          <Source v={lead} />
          <div className="lead-actions">
            <AccessBadge video={lead} />
            <SaveButton video={lead} className="is-inline" />
          </div>
        </div>
      </article>
      {columns.length ? (
        <ul className="columns">
          {columns.map((v) => (
            <li key={v.id} data-flip={v.id}>
              <CatCard video={v} shape="story" hotRoot={pageRef}>
                <Dateline v={v} />
                <Source v={v} />
              </CatCard>
            </li>
          ))}
        </ul>
      ) : null}
      {briefs.length ? (
        <section className="briefs" aria-label="In brief">
          <h3 className="cat-h3">In brief</h3>
          <ol>
            {briefs.map((v) => (
              <li key={v.id} data-flip={v.id} data-vid={v.id}>
                <time dateTime={v.published}>{v.made ?? settingLabel(v)}</time>
                <Link to={cat.href(v.id)} onClick={() => sound.play('transition')}>
                  {v.title}
                </Link>
                <span className="brief-src">{sourceOf(v, PROVENANCE_LABEL[v.provenance])}</span>
                <SaveButton video={v} className="is-inline" />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/* ═════════════ runway ═════════════ */

export function RunwayResults({ videos, pageRef }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useFlip(ref, sig(videos));
  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    sound.play('transition');
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' });
  };
  return (
    <div ref={ref} className="fam fam-runway">
      <ul ref={track} className="looks" aria-label="Looks" onScroll={update}>
        {videos.map((v, i) => (
          <li key={v.id} data-flip={v.id}>
            <CatCard video={v} shape="look" index={i} hotRoot={pageRef} eager={i < 3} />
          </li>
        ))}
      </ul>
      {videos.length > 2 ? (
        <div className="looks-nav">
          <button type="button" className="icon-btn btn-chrome" aria-label="Previous looks" disabled={edge.start} onClick={() => page(-1)}>
            <Icon name="left" />
          </button>
          <button type="button" className="icon-btn btn-chrome" aria-label="Next looks" disabled={edge.end} onClick={() => page(1)}>
            <Icon name="right" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ═════════════ atlas-of-ideas ═════════════ */

export function MosaicResults({ videos, group, pageRef }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupVideos(cat, videos, group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  return (
    <div ref={ref} className="fam fam-ideas">
      {groups.map((g) => (
        <section
          key={g.key}
          className={`ideas-group ${group === 'all' ? 'is-all' : g.videos.length >= 3 ? 'is-wide' : g.videos.length === 2 ? 'is-pair' : 'is-single'}`}
          aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}
        >
          {group !== 'all' ? <GroupHead g={g} icon={group === 'era' ? 'time' : 'globe'} /> : null}
          <Cards videos={g.videos} shape="mosaic" pageRef={pageRef} className="mosaic" keyPrefix={`${g.key}:`} />
        </section>
      ))}
    </div>
  );
}

/* ═════════════ playroom ═════════════ */

export function PlayroomResults({ videos, pageRef }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  return (
    <div ref={ref} className="fam fam-playroom">
      <Cards videos={videos} shape="tile" pageRef={pageRef} className="tiles" />
    </div>
  );
}
