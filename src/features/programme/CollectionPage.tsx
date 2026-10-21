/**
 * COLLECTION — a rule-based (self-updating) or hand-picked set of stories. The header says
 * which it is and what defines it, and the rule opens in the catalogue as live filters.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { collectionVideos, discoveryWith } from '../../../shared/search.ts';
import { discoveryToSearch } from '../../../shared/url-state.ts';
import type { Collection } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Art, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import { activeFilters } from '../catalogue/facets.ts';
import { LoopToggle } from './ProgrammeCard.tsx';
import { useLoop } from './useLoop.ts';
import './programme.css';

export default function CollectionPage() {
  const { slug = '' } = useParams();
  const cat = useCatalogue();
  const collection = cat.bySlug('collection', slug) as Collection | undefined;
  useEffect(() => {
    document.title = `${collection ? collection.title : 'Collection not found'} · Monumental Streams`;
  }, [collection]);
  if (!collection) {
    return (
      <div className="page wrap">
        <header className="page-head">
          <p className="kicker">Collection</p>
          <h1 className="page-title">Nothing lives at this address</h1>
        </header>
        <EmptyState
          icon="info"
          title="No collection matches this link"
          actions={
            <ButtonLink to="/catalogue" variant="primary" icon="search">
              Search the catalogue
            </ButtonLink>
          }
        >
          <p>There is no collection called “{slug}”. These collections are open:</p>
          <ul className="prog-missing-list">
            {cat.collections.map((c) => (
              <li key={c.id}>
                <Link to={cat.href(c.id)}>{c.title}</Link>
              </li>
            ))}
          </ul>
        </EmptyState>
      </div>
    );
  }
  return <CollectionView key={collection.id} collection={collection} />;
}

function CollectionView({ collection: c }: { collection: Collection }) {
  const cat = useCatalogue();
  const art = cat.artFor(c.art);
  const vid = useRef<HTMLVideoElement>(null);
  const loop = useLoop(vid, art?.preview || art?.previewSmall ? { large: art.preview, small: art.previewSmall } : null, { autoplay: true });
  const videos = useMemo(() => collectionVideos(cat, c), [cat, c]);
  const playable = videos.filter((v) => cat.isPlayable(v)).length;
  const rule = c.rule ? discoveryWith(c.rule) : null;
  const defining = rule ? activeFilters(cat, rule) : [];
  const search = rule ? discoveryToSearch(rule, cat) : '';
  const others = cat.collections.filter((x) => x.id !== c.id);

  useChapters([
    { id: 'coll-top', label: 'Collection' },
    { id: 'coll-stories', label: 'Stories' },
    ...(others.length ? [{ id: 'coll-more', label: 'More collections' }] : []),
  ]);

  return (
    <article className="prog prog-collection">
      <header
        className="prog-hero prog-hero-collection"
        id="coll-top"
        data-playing={loop.playing || undefined}
        onPointerEnter={loop.wake}
        onPointerLeave={loop.sleep}
        onFocus={loop.wake}
        onBlur={loop.sleep}
      >
        {c.art ? (
          <div className="prog-hero-ambient" aria-hidden="true">
            <Art art={c.art} alt="" sizes="large" eager />
          </div>
        ) : null}
        <div className="wrap prog-hero-inner">
          <div className="prog-hero-copy">
            <nav className="prog-crumbs" aria-label="Breadcrumb">
              <ol>
                <li>
                  <Link to="/catalogue">Catalogue</Link>
                </li>
                <li aria-current="page">Collection</li>
              </ol>
            </nav>
            <div className="prog-hero-badges">
              {c.featured ? <span className="badge prog-original">Featured</span> : null}
              <span className="badge">{rule ? 'Updates automatically' : 'Hand-picked'}</span>
            </div>
            <h1 className="prog-title" data-long={c.title.length > 34 || undefined}>
              <span>{c.title}</span>
            </h1>
            <p className="prog-desc prog-desc-lede">{c.description}</p>
            {defining.length ? (
              <div className="prog-rule">
                <p className="prog-rule-label" id="coll-rule-title">
                  Defined by
                </p>
                <ul aria-labelledby="coll-rule-title">
                  {defining.map((f) => (
                    <li key={`${f.key}:${f.value ?? ''}`} className={`prog-rule-chip prog-rule-${f.tone}`}>
                      <span className="prog-tag-node" aria-hidden="true" />
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="prog-tally">{videos.length ? `${plural(videos.length, 'story', 'stories')} · ${playable} playable now` : 'No stories yet'}</p>
            <div className="prog-actions">
              {rule ? (
                <ButtonLink to={`/catalogue${search ? `?${search}` : ''}`} variant="primary" size="lg" icon="filter" data-cursor-label="Catalogue">
                  Open in catalogue with these filters
                </ButtonLink>
              ) : null}
            </div>
          </div>
          <div className="prog-hero-screen">
            {c.art ? <Art art={c.art} alt="" sizes="large" eager /> : <span className="prog-hero-blank" />}
            {art?.preview || art?.previewSmall ? <video ref={vid} className="prog-hero-video" muted loop playsInline preload="none" tabIndex={-1} aria-hidden="true" /> : null}
            {art?.preview || art?.previewSmall ? <LoopToggle playing={loop.playing} onToggle={loop.toggle} className="prog-hero-toggle" label="header motion" /> : null}
          </div>
          {art?.provisional ? <p className="prog-art-note">Header art is a provisional studio motion concept</p> : null}
        </div>
      </header>

      <section className="section wrap" id="coll-stories" aria-labelledby="coll-stories-title">
        <SectionHeader kicker={rule ? 'Matched by rule' : 'In curated order'} title="Stories" id="coll-stories-title" />
        {videos.length ? (
          <ul className="grid-pods">
            {videos.map((v, i) => (
              <li key={v.id}>
                <VideoPod video={v} priority={i < 3} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="time"
            tone="plasma"
            title="Nothing here yet"
            actions={
              <ButtonLink to="/catalogue" icon="search">
                Browse everything
              </ButtonLink>
            }
          >
            <p>{rule ? 'No stories match this collection yet. It fills automatically as matching stories are added to the catalogue.' : 'No stories have been picked for this collection yet.'}</p>
          </EmptyState>
        )}
      </section>

      {others.length ? (
        <section className="section wrap" id="coll-more" aria-labelledby="coll-more-title">
          <SectionHeader kicker="Keep exploring" title="More collections" id="coll-more-title" />
          <ul className="prog-coll-links">
            {others.map((o) => {
              const n = collectionVideos(cat, o).length;
              return (
                <li key={o.id}>
                  <Link to={cat.href(o.id)} className="prog-coll-link" onClick={() => sound.play('transition')}>
                    <Art art={o.art} alt="" />
                    <span className="prog-coll-link-body">
                      <span className="prog-coll-link-title">{o.title}</span>
                      <span className="prog-coll-link-count">{n ? plural(n, 'story', 'stories') : 'No stories yet'}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
