/**
 * Monumental Originals on Home: each programme as a poster with its title and its status as
 * it stands today (in development, planned, announced), never a promise of episodes. A
 * programme is not a seed itself, so pointing at one lights its entries in the world.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ID, Programme } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Art, Row, SectionHeader } from '../../ui/Pod.tsx';
import { PROGRAMME_KIND_LABEL, PROGRAMME_STATUS_LABEL } from '../programme/programme-model.ts';
import { useLightZone } from './light.ts';

export function Originals({ programmes }: { programmes: Programme[] }) {
  const cat = useCatalogue();
  const members = useMemo(() => new Map<ID, ID[]>(programmes.map((p) => [p.id, cat.videosForProgramme(p.id).map((v) => v.id)])), [cat, programmes]);
  const zone = useLightZone((key) => (key ? members.get(key) : null));
  return (
    <section className="section wrap home-shelf" data-stage-block id="home-originals" aria-labelledby="home-originals-title" data-reveal>
      <SectionHeader
        title="Originals"
        id="home-originals-title"
        action={
          <ButtonLink to="/collection/monumental-originals" variant="quiet" iconAfter="arrow">
            Originals collection
          </ButtonLink>
        }
      >
        Made here. Each shows its status as it stands today.
      </SectionHeader>
      <div {...zone}>
        <Row label="Monumental Originals">
          {programmes.map((p) => (
            <Original key={p.id} programme={p} />
          ))}
        </Row>
      </div>
    </section>
  );
}

function Original({ programme: p }: { programme: Programme }) {
  const cat = useCatalogue();
  const href = cat.href(p.id);
  const parent = p.parent ? cat.label(p.parent) : null;
  return (
    <article className="home-orig" data-light={p.id} data-status={p.status}>
      <Link to={href} className="home-orig-art" tabIndex={-1} aria-hidden="true" draggable={false} data-cursor="open" data-cursor-label="Programme">
        <Art art={p.art} alt="" />
      </Link>
      <h3 className="home-orig-title">
        <Link to={href} draggable={false} data-cursor="open" data-cursor-label="Programme" onClick={() => sound.play('transition')}>
          {p.title}
          <span className="sr-only">
            , {parent ? `part of ${parent}` : PROGRAMME_KIND_LABEL[p.kind]}, {PROGRAMME_STATUS_LABEL[p.status]}
          </span>
        </Link>
      </h3>
      <p className="home-orig-meta" aria-hidden="true">
        <span className="home-orig-status">
          <span className="home-orig-node" />
          {PROGRAMME_STATUS_LABEL[p.status]}
        </span>
        <span>{parent ? `Part of ${parent}` : PROGRAMME_KIND_LABEL[p.kind]}</span>
      </p>
      {p.tagline ? <p className="home-orig-line">{p.tagline}</p> : null}
    </article>
  );
}
