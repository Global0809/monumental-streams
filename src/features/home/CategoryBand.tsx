/**
 * The category band: one tile per category in navigation order, each with the count of
 * stories the shared catalogue holds for it today (videosForSection). Pointing at a tile
 * fans out a peek of real stories from it. Categories with nothing yet say so — "Coming
 * soon" — and still link to their page, which explains what they will hold. Live closes the
 * band as its own strip and never claims a broadcast that does not exist.
 */
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Art, SectionHeader } from '../../ui/Pod.tsx';
import { categoryTiles, liveSection, storyCountLabel, type CategoryTile } from './home-model.ts';

export function CategoryBand() {
  const cat = useCatalogue();
  const tiles = useMemo(() => categoryTiles(cat), [cat]);
  const live = liveSection();
  const stocked = tiles.filter((t) => t.count > 0).length;

  return (
    <section className="section wrap home-cats-section" id="home-categories" aria-labelledby="home-categories-title" data-reveal>
      <SectionHeader title="Categories" id="home-categories-title">
        {stocked} of {tiles.length} categories hold stories today. Each one draws on the same catalogue, so new stories appear wherever they belong.
      </SectionHeader>
      <ul className="home-cats">
        {tiles.map((t) => (
          <li key={t.section.id}>
            <CategoryTileLink tile={t} />
          </li>
        ))}
      </ul>
      <Link to={live.path} className="home-live" data-cursor="open" data-cursor-label="Live" onClick={() => sound.play('transition')}>
        <span className="home-live-signal" aria-hidden="true">
          <Icon name={live.icon as IconName} size={20} />
        </span>
        <span className="home-live-name">{live.label}</span>
        <span className="home-live-state">Nothing is on air</span>
        <span className="home-live-promise">{live.promise}</span>
        <Icon name="arrow" size={18} className="home-live-go" />
      </Link>
    </section>
  );
}

function CategoryTileLink({ tile }: { tile: CategoryTile }) {
  const cat = useCatalogue();
  const { section, count, sample } = tile;
  const empty = count === 0;
  return (
    <Link
      to={section.path}
      className="home-cat"
      data-empty={empty || undefined}
      data-layout={section.layout}
      data-react="tilt light"
      data-cursor="open"
      data-cursor-label={section.label}
      onClick={() => sound.play('transition')}
    >
      <span className="home-cat-art" aria-hidden="true">
        <Art art={section.art} alt="" />
      </span>
      {sample.length ? (
        <span className="home-cat-peek" aria-hidden="true">
          {sample.map((v, i) => (
            <span key={v.id} className="home-cat-peek-card" style={{ '--k': i } as CSSProperties}>
              <img src={cat.artFor(v.art)?.posterSmall} alt="" loading="lazy" decoding="async" />
            </span>
          ))}
        </span>
      ) : null}
      <span className="home-cat-text">
        <span className="home-cat-icon" aria-hidden="true">
          <Icon name={section.icon as IconName} size={20} />
        </span>
        <span className="home-cat-name">{section.label}</span>
        <span className={empty ? 'home-cat-soon' : 'home-cat-count'}>{storyCountLabel(count)}</span>
        <span className="home-cat-line">{empty ? section.promise : section.tagline}</span>
      </span>
    </Link>
  );
}
