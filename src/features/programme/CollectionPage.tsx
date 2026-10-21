/**
 * COLLECTION — a rule-based (self-updating) or hand-picked set of stories. The header says
 * which it is and what defines it, and the rule opens in Search as live filters.
 *
 * The living world gathers the collection: its first story is the seed in front and the rest
 * ring it on light filaments, all of them lit (focus + highlight = its stories). The header
 * paints no picture of its own. Hovering another collection lights its stories instead, and
 * the page's highlight returns on leave. An empty collection leaves a quiet field.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { collectionVideos, discoveryWith } from '../../../shared/search.ts';
import { discoveryToSearch } from '../../../shared/url-state.ts';
import type { Collection } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { plural } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { EmptyState } from '../../ui/feedback.tsx';
import { Art, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import { activeFilters } from '../catalogue/facets.ts';
import { useHighlightPreview } from '../watch/seed.ts';
import { longestWordEm } from './programme-model.ts';
import './programme.css';

export default function CollectionPage() {
  const { slug = '' } = useParams();
  const cat = useCatalogue();
  const collection = cat.bySlug('collection', slug) as Collection | undefined;
  useEffect(() => {
    document.title = `${collection ? collection.title : 'Collection not found'} · Monumental Streams`;
  }, [collection]);
  if (!collection) return <MissingCollection slug={slug} />;
  return <CollectionView key={collection.id} collection={collection} />;
}

function MissingCollection({ slug }: { slug: string }) {
  const cat = useCatalogue();
  useArrangement({ kind: 'quiet' });
  return (
    <div className="page wrap prog-missing">
      <header className="page-head">
        <p className="eyebrow">Collection</p>
        <h1 className="title-monument prog-missing-title">Nothing lives at this address</h1>
      </header>
      <EmptyState
        icon="info"
        title="No collection matches this link"
        actions={
          <ButtonLink to="/search" variant="primary" icon="search">
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

function CollectionView({ collection: c }: { collection: Collection }) {
  const cat = useCatalogue();
  const videos = useMemo(() => collectionVideos(cat, c), [cat, c]);
  const ids = useMemo(() => videos.map((v) => v.id), [videos]);
  const playable = videos.filter((v) => cat.isPlayable(v)).length;
  const rule = c.rule ? discoveryWith(c.rule) : null;
  const defining = rule ? activeFilters(cat, rule) : [];
  const search = rule ? discoveryToSearch(rule, cat) : '';
  const others = cat.collections.filter((x) => x.id !== c.id);
  const art = cat.artFor(c.art);

  /* The world: the collection gathered around its first story, every one of them lit. */
  useArrangement(ids.length ? { kind: 'focus', video: ids[0], related: ids.slice(1, 18) } : { kind: 'quiet' }, ids.length ? ids : null);

  useChapters([
    { id: 'coll-top', label: 'Collection' },
    { id: 'coll-stories', label: 'Stories' },
    ...(others.length ? [{ id: 'coll-more', label: 'More collections' }] : []),
  ]);

  const titleStyle = { '--title-word': longestWordEm(c.title).toFixed(2) } as CSSProperties;

  return (
    <article className="prog prog-collection">
      <header className="wrap prog-hero" id="coll-top">
        <div className="prog-hero-copy">
          <p className="eyebrow prog-eyebrow">
            <span>{c.featured ? 'Featured collection' : 'Collection'}</span>
            <span>{rule ? 'Updates automatically' : 'Hand-picked'}</span>
          </p>
          <h1 className="prog-title" data-long={c.title.length > 30 || undefined} style={titleStyle}>
            {c.title}
          </h1>
          <p className="prog-tagline" data-long={c.description.length > 110 || undefined}>
            {c.description}
          </p>
          {defining.length ? (
            <div className="prog-rule">
              <p className="eyebrow prog-rule-label" id="coll-rule-title">
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
          <p className="prog-now-tally prog-coll-tally">
            {videos.length ? `${plural(videos.length, 'story', 'stories')} · ${playable} playable now — gathered in the world` : 'No stories yet'}
            {art?.provisional ? ' · provisional artwork' : ''}
          </p>
          {rule ? (
            <div className="prog-actions">
              <ButtonLink to={`/search${search ? `?${search}` : ''}`} variant="primary" size="lg" icon="filter" data-cursor-label="Search">
                Open in Search with these filters
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </header>

      <section className="section wrap" id="coll-stories" aria-labelledby="coll-stories-title">
        <SectionHeader title="Stories" id="coll-stories-title">
          {rule ? 'Matched by the rule above — the collection fills itself as stories are added.' : 'In curated order.'}
        </SectionHeader>
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
              <ButtonLink to="/search" icon="search">
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
          <SectionHeader title="More collections" id="coll-more-title" />
          <ul className="prog-coll-links">
            {others.map((o) => (
              <li key={o.id}>
                <OtherCollection collection={o} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

/** Another collection; while hovered or focused its stories are the ones lit in the world. */
function OtherCollection({ collection: o }: { collection: Collection }) {
  const cat = useCatalogue();
  const ids = useMemo(() => collectionVideos(cat, o).map((v) => v.id), [cat, o]);
  const preview = useHighlightPreview(() => ids);
  return (
    <Link
      to={cat.href(o.id)}
      className="prog-coll-link"
      onClick={() => sound.play('transition')}
      {...preview.handlers}
    >
      <span className="prog-coll-link-art">
        <Art art={o.art} alt="" />
      </span>
      <span className="prog-coll-link-body">
        <span className="prog-coll-link-title">{o.title}</span>
        <span className="prog-coll-link-count">{ids.length ? plural(ids.length, 'story', 'stories') : 'No stories yet'}</span>
      </span>
    </Link>
  );
}
