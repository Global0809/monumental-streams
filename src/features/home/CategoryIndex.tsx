/**
 * The constellation index: the nine organs that orbit the Monumental spine, as a typographic
 * index the DOM can be read and navigated by. Counts come from videosForSection; an empty
 * category says "Coming soon" and Live never claims a broadcast that does not exist.
 *
 * The index and the world answer each other: pointing at (or focusing) a category lights its
 * stories in the world (the same preview the navigation uses, which also tints the static
 * world); a seed under the pointer in the world, or a category previewed from the navigation,
 * lights its line here. Choosing a category opens it — as does clicking its organ in the world
 * (HomePage handles organActivate).
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import type { SectionId } from '../../../shared/sections.ts';
import { endPreview, startPreview, usePreviewSection } from '../../app/world.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { organIndex, seedSections, storyCountLabel } from './home-model.ts';
import { useHoveredSeed } from './light.ts';

export function CategoryIndex() {
  const cat = useCatalogue();
  const entries = useMemo(() => organIndex(cat), [cat]);
  const bySeed = useMemo(() => seedSections(cat), [cat]);
  const hovered = useHoveredSeed();
  const previewing = usePreviewSection();
  const fromWorld = new Set<SectionId>(hovered ? (bySeed.get(hovered) ?? []) : []);
  const stocked = entries.filter((e) => !e.live && e.count > 0).length;
  const categories = entries.filter((e) => !e.live).length;

  const timer = useRef(0);
  const mine = useRef(false);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (mine.current) endPreview();
    },
    [],
  );
  const enter = (id: SectionId, empty: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    if (empty) {
      // nothing to light: let the world rest rather than dim everything
      if (mine.current) endPreview();
      mine.current = false;
      return;
    }
    const go = () => {
      mine.current = true;
      startPreview(cat, id);
    };
    if (delay <= 0) go();
    else timer.current = window.setTimeout(go, delay);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    if (mine.current) endPreview();
    mine.current = false;
  };

  return (
    <section className="section wrap home-index" id="home-categories" aria-labelledby="home-categories-title" data-reveal>
      <div className="home-col">
        <h2 id="home-categories-title" className="home-h2">
          Categories
        </h2>
        <p className="home-support">{stocked === categories ? 'Every category holds stories today.' : `${stocked} of ${categories} categories hold stories today.`}</p>
        <ol className="home-organs">
          {entries.map(({ section, count, live }) => {
            const empty = live || count === 0;
            const lit = previewing === section.id || fromWorld.has(section.id);
            return (
              <li key={section.id}>
                <Link
                  to={section.path}
                  className="home-organ"
                  data-hue={section.id}
                  data-empty={empty || undefined}
                  data-live={live || undefined}
                  data-lit={lit || undefined}
                  data-cursor="open"
                  data-cursor-label={section.label}
                  onPointerEnter={(e) => e.pointerType !== 'touch' && enter(section.id, empty, 90)}
                  onPointerLeave={leave}
                  onFocus={() => enter(section.id, empty, 0)}
                  onBlur={leave}
                  onClick={() => sound.play('transition')}
                >
                  <span className="home-organ-glyph" aria-hidden="true">
                    <Icon name={section.icon as IconName} size={18} />
                  </span>
                  <span className="home-organ-name">{section.label}</span>
                  <span className="home-organ-count">{live ? 'Nothing is on air' : storyCountLabel(count)}</span>
                  <Icon name="arrow" size={18} className="home-organ-go" />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
