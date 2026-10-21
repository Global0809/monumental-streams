/**
 * The two ways out of the constellation, as editorial invitations rather than miniatures: the
 * World and the Time Machine are already in the world (the same seeds settle on the globe or
 * unspool along the helix), so Home does not paint its own globe or instrument.
 *
 * Each invitation changes the world honestly while it is pointed at or focused: World lights
 * the stories that have a place on the globe, a destination lights the stories set there;
 * Time Machine lights the stories with a historical setting, a decade lights that decade's
 * stories. In the other direction, a seed under the pointer in the world lights the
 * destinations and decades it belongs to.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { ID } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { decadeIds, liveliestDecade, timeInvitation, worldInvitation } from './home-model.ts';
import { useHoveredSeed, useLightZone } from './light.ts';

export function Invitations() {
  return (
    <div className="wrap home-invites">
      <WorldInvitation />
      <TimeInvitation />
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function WorldInvitation() {
  const cat = useCatalogue();
  const inv = useMemo(() => worldInvitation(cat), [cat]);
  const hubIds = useMemo(() => new Map(inv.hubs.map((h) => [h.place.id, h.videos.map((v) => v.id)])), [inv]);
  const zone = useLightZone((key) => (key ? hubIds.get(key) : inv.placed));
  const hovered = useHoveredSeed();
  const gateway = inv.hubs.find((h) => h.gateway);
  if (!inv.hubs.length) return null;

  return (
    <section className="home-invite" id="home-world" aria-labelledby="home-world-title" data-hue="world" data-reveal {...zone}>
      <h2 id="home-world-title" className="home-h2 home-invite-title">
        World
      </h2>
      <p className="home-invite-line">
        {plural(inv.placed.length, 'story', 'stories')} placed on a living globe, across {plural(inv.hubs.length, 'destination', 'destinations')}
        {gateway ? `, with ${gateway.place.name} as the gateway` : ''}.
      </p>
      <ul className="home-invite-links" aria-label="Destinations with stories">
        {inv.hubs.map((h) => {
          const lit = !!hovered && h.videos.some((v) => v.id === hovered);
          return (
            <li key={h.place.id}>
              <Link to={cat.href(h.place.id)} data-light={h.place.id} data-lit={lit || undefined} data-cursor="open" data-cursor-label="World" onClick={() => sound.play('transition')}>
                <span className="home-invite-name">{h.place.name}</span>
                <span className="home-invite-count">{plural(h.videos.length, 'story', 'stories')}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ButtonLink to="/world" variant="quiet" iconAfter="arrow" className="home-invite-open" data-cursor-label="World">
        Open World
      </ButtonLink>
    </section>
  );
}

function TimeInvitation() {
  const cat = useCatalogue();
  const inv = useMemo(() => timeInvitation(cat), [cat]);
  const byDecade = useMemo(() => new Map<ID, ID[]>(inv.decades.map((d) => [d.period.id, decadeIds(cat, d.period.id)])), [cat, inv]);
  const zone = useLightZone((key) => (key ? byDecade.get(key) : inv.dated));
  const hovered = useHoveredSeed();
  const liveliest = liveliestDecade(inv.decades);

  return (
    <section className="home-invite" id="home-time" aria-labelledby="home-time-title" data-hue="time-machine" data-reveal {...zone}>
      <h2 id="home-time-title" className="home-h2 home-invite-title">
        Time Machine
      </h2>
      <p className="home-invite-line">
        {inv.decades.length
          ? `${plural(inv.dated.length, 'story', 'stories')} set in the past, across ${plural(inv.decades.length, 'decade', 'decades')}${inv.span ? ` from ${inv.span.from} to ${inv.span.to}` : ''}.`
          : 'No stories are set in a past decade yet.'}
      </p>
      {inv.decades.length ? (
        <ul className="home-invite-links home-invite-decades" aria-label="Decades with stories">
          {inv.decades.map((d) => {
            const lit = !!hovered && !!byDecade.get(d.period.id)?.includes(hovered);
            return (
              <li key={d.period.id}>
                <Link
                  to={cat.href(d.period.id)}
                  data-light={d.period.id}
                  data-lit={lit || undefined}
                  data-peak={d === liveliest || undefined}
                  data-cursor="open"
                  data-cursor-label="Travel"
                  onClick={() => sound.play('transition')}
                >
                  <span className="home-invite-name">{d.period.label}</span>
                  <span className="home-invite-count">{plural(d.count, 'story', 'stories')}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <ButtonLink to="/time-machine" variant="quiet" iconAfter="arrow" className="home-invite-open" data-cursor-label="Time Machine">
        Open the Time Machine
      </ButtonLink>
    </section>
  );
}
