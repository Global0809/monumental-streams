/**
 * The reading beside the instrument: what this place in time holds. The decade's years (or the
 * one chosen year), the decade's summary, and four live groups drawn from the catalogue —
 * movements active then (select one to read it on the span timeline), places involved (open in
 * World), people, and the categories present, which are the filter for the stories below.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ID, Movement, Period } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Chip } from '../../ui/controls.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { decadePhrase, movementYears, type DecadeContext, type Lens } from './chrono.ts';
import type { CategoryPresence } from './timeline.ts';

const CAP = 6;
const LENS_SET: Record<Lens, string> = { setting: 'set', made: 'made', published: 'published' };

function Group<T>({ id, icon, title, items, render, empty }: { id: string; icon: IconName; title: string; items: T[]; render: (item: T) => ReactNode; empty: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, CAP);
  const rest = items.length - CAP;
  return (
    <div className="tm-ctx-group" role="group" aria-labelledby={id}>
      <h3 id={id} className="tm-ctx-h">
        <Icon name={icon} size={14} />
        <span>{title}</span>
        <span className="tm-ctx-n">{items.length}</span>
      </h3>
      {items.length ? (
        <ul className="tm-ctx-list">
          {shown.map(render)}
          {rest > 0 ? (
            <li>
              <button type="button" className="tm-ctx-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Show fewer' : `+${rest} more`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="tm-ctx-empty">{empty}</p>
      )}
    </div>
  );
}

export function EraPanel({
  period,
  year,
  lens,
  ctx,
  presence,
  inView,
  interest,
  selectedMovement,
  onInterest,
  onMovement,
}: {
  period: Period;
  year: number | null;
  lens: Lens;
  ctx: DecadeContext;
  presence: CategoryPresence[];
  /** Stories in view before the category filter. */
  inView: number;
  interest: ID | null;
  selectedMovement?: Movement;
  onInterest: (id: ID | null) => void;
  onMovement: (m: Movement) => void;
}) {
  const cat = useCatalogue();
  const phrase = year == null ? decadePhrase(period) : String(year);
  return (
    <section className="tm-panel" aria-labelledby="tm-panel-h" data-react="light">
      <p className="kicker">
        <b>Field notes</b> · {year == null ? 'the whole decade' : `a year in ${decadePhrase(period)}`}
      </p>
      <h2 id="tm-panel-h" className="tm-panel-years">
        {year ?? `${period.start}–${period.end}`}
      </h2>
      <p className="tm-panel-summary">
        {year != null ? <span className="tm-panel-tag">The decade · </span> : null}
        {period.summary}
      </p>

      <div className="tm-ctx">
        <Group
          id="tm-ctx-mv"
          icon="wave"
          title="Movements active"
          items={ctx.movements}
          empty={`No movements are recorded as active in ${phrase}.`}
          render={(m) => (
            <li key={m.id}>
              <button
                type="button"
                className="tm-ctx-item tm-ctx-mv"
                aria-pressed={selectedMovement?.id === m.id}
                onClick={() => {
                  sound.play('select');
                  onMovement(m);
                }}
              >
                <span className="tm-ctx-name">{m.name}</span>
                <span className="tm-ctx-meta">{movementYears(m)}</span>
              </button>
            </li>
          )}
        />
        <Group
          id="tm-ctx-pl"
          icon="globe"
          title="Places involved"
          items={ctx.places}
          empty={`No places are tied to ${phrase} yet.`}
          render={({ item, via }) => (
            <li key={item.id}>
              <Link to={cat.href(item.id)} className="tm-ctx-item tm-ctx-place" data-cursor-label="World" title={`Via ${via.slice(0, 3).join(', ')}`} onClick={() => sound.play('transition')}>
                <span className="tm-ctx-name">{item.name}</span>
                <span className="sr-only">, open in World</span>
                <Icon name="arrow" size={13} />
              </Link>
            </li>
          )}
        />
        <Group
          id="tm-ctx-pp"
          icon="user"
          title="People"
          items={ctx.people}
          empty={`No people are recorded for ${phrase} yet.`}
          render={({ item }) => (
            <li key={item.id}>
              <Link to={cat.href(item.id)} className="tm-ctx-item tm-ctx-person" data-cursor-label="Connections" onClick={() => sound.play('transition')}>
                <span className="tm-ctx-name">{item.name}</span>
                <span className="tm-ctx-meta">{item.roles[0] ?? item.kind}</span>
              </Link>
            </li>
          )}
        />
      </div>

      <div className="tm-cats" role="group" aria-labelledby="tm-cats-h">
        <h3 id="tm-cats-h" className="tm-ctx-h">
          <Icon name="filter" size={14} />
          <span>Categories present</span>
          <span className="tm-ctx-hint">filter the stories</span>
        </h3>
        {presence.length ? (
          <ul className="tm-cat-chips">
            <li>
              <Chip selected={!interest} onToggle={() => onInterest(null)} count={inView} tone="plasma">
                All
              </Chip>
            </li>
            {presence.map((p) => (
              <li key={p.category.id} data-quiet={p.count === 0 || undefined}>
                <Chip selected={interest === p.category.id} onToggle={() => onInterest(interest === p.category.id ? null : p.category.id)} count={p.count} tone="plasma">
                  {p.category.name}
                  {p.count === 0 ? <span className="sr-only"> (carried by {plural(p.movements.length, 'movement')}, no stories yet)</span> : null}
                </Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tm-ctx-empty">No stories {LENS_SET[lens]} in {phrase} carry a category yet.</p>
        )}
      </div>
    </section>
  );
}
