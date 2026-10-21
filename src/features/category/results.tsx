/**
 * The eight presentation families for a category's results. All of them receive the same
 * engine output (search → facet → sort → group) and the same seed card (VideoPod: its poster
 * behind a hairline rim, hover/focus lights its seed, a seed under the pointer lights it,
 * saving flies the seed into My World). Each family composes it for its subject through
 * layout and type — never through decorative imagery:
 *
 *   cinema          the bill: two widescreen features, then the programme
 *   soundstage      square sleeves grouped by artist or scene, and the scenes on one timeline
 *   arena           the main event, then fixtures grouped by home ground
 *   arcade          a level-select grid, numbered
 *   broadsheet      columns and briefs — dates and sources first
 *   runway          a lookbook: tall numbered looks on a snap-scrolling runway
 *   atlas-of-ideas  a mosaic grouped by place (or era), each group opening into World
 *   playroom        big, friendly tiles
 *
 * Results glide when the collection changes (useFlip) and stand still under reduced motion.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Section } from '../../../shared/sections.ts';
import type { Video } from '../../../shared/types.ts';
import { PROVENANCE_LABEL, plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { VideoPod } from '../../ui/Pod.tsx';
import { groupVideos, interestContext, sourceOf, type Group, type GroupMode } from './engine.ts';
import { Dateline, GroupHead, SaveAction, Source, useFlip } from './parts.tsx';
import { seedPointer, useWorldLit } from './world.ts';

export interface ResultsProps {
  section: Section;
  videos: Video[];
  group: GroupMode;
}

const sig = (videos: Video[], extra = '') => `${extra}|${videos.map((v) => v.id).join(',')}`;

function Cards({ videos, className, size = 'md', keyPrefix = '', eager = 2 }: { videos: Video[]; className: string; size?: 'sm' | 'md' | 'lg'; keyPrefix?: string; eager?: number }) {
  return (
    <ul className={`cards ${className}`}>
      {videos.map((v, i) => (
        <li key={v.id} data-flip={`${keyPrefix}${v.id}`} style={{ '--i': i } as CSSProperties}>
          <VideoPod video={v} size={size} priority={i < eager} />
        </li>
      ))}
    </ul>
  );
}

const groupHead = (g: Group, icon?: 'globe' | 'time' | 'synapse' | 'user') => <GroupHead label={g.label} href={g.href} note={g.note} count={g.videos.length} icon={icon} />;

/* ═════════════ cinema ═════════════ */

export function CinemaResults({ videos }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  const features = videos.slice(0, 2);
  const bill = videos.slice(2);
  return (
    <div ref={ref} className="fam fam-cinema">
      <ul className="cards features">
        {features.map((v) => (
          <li key={v.id} data-flip={v.id}>
            <VideoPod video={v} size="lg" priority />
          </li>
        ))}
      </ul>
      {bill.length ? <Cards videos={bill} className="bill" eager={0} /> : null}
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
          Scenes
        </h3>
        <p className="cat-sub">The music movements in the catalogue on one timeline. Each opens its Connections.</p>
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

export function SoundstageResults({ section, videos, group }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupVideos(cat, videos, group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  return (
    <div ref={ref} className="fam fam-soundstage">
      {groups.map((g) => (
        <section key={g.key} className="track" aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}>
          {group !== 'all' ? groupHead(g, group === 'artist' ? 'user' : 'synapse') : null}
          <Cards videos={g.videos} className="sleeves" size="sm" keyPrefix={`${g.key}:`} />
        </section>
      ))}
      <Scenes section={section} />
    </div>
  );
}

/* ═════════════ arena ═════════════ */

export function ArenaResults({ videos, group }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const main = videos[0];
  const groups = useMemo(() => groupVideos(cat, videos.slice(1), group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  if (!main) return null;
  return (
    <div ref={ref} className="fam fam-arena">
      <div className="arena-main" data-flip={`main:${main.id}`}>
        <p className="fam-label">Main event</p>
        <VideoPod video={main} size="lg" priority />
      </div>
      {groups.map((g) =>
        g.videos.length ? (
          <section key={g.key} className="fixtures" aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}>
            {group !== 'all' ? groupHead(g, 'globe') : null}
            <Cards videos={g.videos} className="fixture-grid" keyPrefix={`${g.key}:`} eager={0} />
          </section>
        ) : null,
      )}
    </div>
  );
}

/* ═════════════ arcade ═════════════ */

export function ArcadeResults({ videos }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  return (
    <div ref={ref} className="fam fam-arcade">
      <Cards videos={videos} className="levels numbered" />
    </div>
  );
}

/* ═════════════ broadsheet ═════════════ */

function Brief({ v }: { v: Video }) {
  const cat = useCatalogue();
  const lit = useWorldLit(v.id);
  return (
    <li data-flip={v.id} data-vid={v.id} data-world-lit={lit || undefined} {...seedPointer(v.id)}>
      <time dateTime={v.published}>{v.made ?? v.published.slice(0, 4)}</time>
      <Link to={cat.href(v.id)} className="brief-title" onClick={() => sound.play('transition')}>
        {v.title}
      </Link>
      <span className="brief-src">{sourceOf(v, PROVENANCE_LABEL[v.provenance])}</span>
      <SaveAction video={v} className="brief-save" />
    </li>
  );
}

export function BroadsheetResults({ videos }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  const columns = videos.slice(0, 3);
  const briefs = videos.slice(3);
  return (
    <div ref={ref} className="fam fam-broadsheet">
      <ul className="cards columns">
        {columns.map((v, i) => (
          <li key={v.id} data-flip={v.id}>
            <VideoPod
              video={v}
              priority={i < 2}
              footer={
                <>
                  <Dateline v={v} />
                  <Source v={v} />
                </>
              }
            />
          </li>
        ))}
      </ul>
      {briefs.length ? (
        <section className="briefs" aria-labelledby="briefs-title">
          <h3 id="briefs-title" className="cat-h3">
            In brief
          </h3>
          <ol>
            {briefs.map((v) => (
              <Brief key={v.id} v={v} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/* ═════════════ runway ═════════════ */

export function RunwayResults({ videos }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  useFlip(ref, sig(videos));
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const next = { start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 };
    setEdge((e) => (e.start === next.start && e.end === next.end ? e : next));
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, videos.length]);
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    sound.play('transition');
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' });
  };
  return (
    <div ref={ref} className="fam fam-runway">
      <ul ref={track} className="cards looks numbered" aria-label="Looks" onScroll={update}>
        {videos.map((v, i) => (
          <li key={v.id} data-flip={v.id}>
            <VideoPod video={v} priority={i < 3} />
          </li>
        ))}
      </ul>
      {!(edge.start && edge.end) ? (
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

export function MosaicResults({ videos, group }: ResultsProps) {
  const cat = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupVideos(cat, videos, group), [cat, videos, group]);
  useFlip(ref, sig(videos, group));
  return (
    <div ref={ref} className="fam fam-ideas">
      {groups.map((g) => (
        <section key={g.key} className={`ideas-group ${group === 'all' ? 'is-all' : g.videos.length >= 3 ? 'is-wide' : ''}`} aria-label={`${g.label}, ${plural(g.videos.length, 'title')}`}>
          {group !== 'all' ? groupHead(g, group === 'era' ? 'time' : 'globe') : null}
          <Cards videos={g.videos} className="mosaic" keyPrefix={`${g.key}:`} />
        </section>
      ))}
    </div>
  );
}

/* ═════════════ playroom ═════════════ */

export function PlayroomResults({ videos }: ResultsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, sig(videos));
  return (
    <div ref={ref} className="fam fam-playroom">
      <Cards videos={videos} className="tiles" size="lg" />
    </div>
  );
}
