/**
 * A place in time, in context: the movements alive then (each row carries its real span across
 * the clock, with the chosen decade or year as a frost column), the movement chosen into
 * ?movement= read in full, the places involved (into World) and the people. Text first, no boxes
 * inside boxes — only the movement reading sits on glass, because it is read over the world.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { overlaps } from '../../../shared/catalogue.ts';
import type { Movement, Period } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { movementSpan, movementYears, type DecadeContext } from './chrono.ts';
import type { TimeRange } from './timeline.ts';

const CAP = 6;
const THIS_YEAR = new Date().getFullYear();

/** A labelled list that shows its strongest few and discloses the rest. */
function Disclosed<T>({ id, title, items, render, empty }: { id: string; title: string; items: T[]; render: (item: T) => ReactNode; empty: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, CAP);
  const rest = items.length - CAP;
  return (
    <div className="tm-ctx-group" role="group" aria-labelledby={id}>
      <h3 id={id} className="tm-h3">
        {title}
      </h3>
      {items.length ? (
        <ul className="tm-ctx-list">
          {shown.map(render)}
          {rest > 0 ? (
            <li>
              <button type="button" className="tm-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Show fewer' : `+${rest} more`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="tm-quiet">{empty}</p>
      )}
    </div>
  );
}

export function TimeContext({
  periods,
  range,
  phrase,
  ctx,
  selected,
  showAll,
  onShowAll,
  onSelect,
}: {
  periods: Period[];
  range: TimeRange;
  phrase: string;
  ctx: DecadeContext;
  selected?: Movement;
  showAll: boolean;
  onShowAll: (all: boolean) => void;
  onSelect: (m: Movement | null) => void;
}) {
  const cat = useCatalogue();
  const from = periods[0]?.start ?? 1900;
  const to = periods[periods.length - 1]?.end ?? THIS_YEAR;
  const total = to + 1 - from;
  const list = showAll ? cat.movements : ctx.movements.concat(selected && !ctx.movements.includes(selected) ? [selected] : []);
  const col = {
    left: ((range.start - from) / total) * 100,
    width: ((range.end + 1 - range.start) / total) * 100,
  };

  return (
    <div className="tm-ctx">
      <div className="tm-ctx-movements">
        <div className="tm-ctx-group" role="group" aria-labelledby="tm-mv-h">
          <div className="tm-ctx-head">
            <h3 id="tm-mv-h" className="tm-h3">
              {showAll ? 'Every movement' : 'Movements active'}
            </h3>
            <button type="button" className="tm-more" onClick={() => onShowAll(!showAll)}>
              {showAll ? `Only ${phrase}` : `All ${cat.movements.length} movements`}
            </button>
          </div>
          {list.length ? (
            <ul
              className="tm-spans"
              style={{
                ['--col-l' as string]: `${col.left}%`,
                ['--col-w' as string]: `${col.width}%`,
              }}
            >
              {list.map((m) => {
                const s = movementSpan(m, from, to, THIS_YEAR);
                const on = selected?.id === m.id;
                const live = overlaps(m.start, m.end ?? 9999, range.start, range.end);
                return (
                  <li key={m.id} className="tm-span" data-selected={on || undefined} data-live={live || undefined}>
                    <button
                      type="button"
                      className="tm-span-name"
                      aria-pressed={on}
                      onClick={() => {
                        sound.play(on ? 'close' : 'select');
                        onSelect(on ? null : m);
                      }}
                    >
                      <span className="tm-span-title">{m.name}</span>
                      <span className="tm-span-years">
                        {movementYears(m)}
                        {live ? null : <span className="sr-only">, not active in {phrase}</span>}
                      </span>
                      <span className="tm-span-track" aria-hidden="true">
                        <span className="tm-span-bar" style={{ left: `${s.left}%`, width: `${s.width}%` }} data-before={s.before || undefined} data-ongoing={s.ongoing || undefined} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tm-quiet">
              No movements are recorded as active in {phrase}. Choose “All {cat.movements.length} movements” to see every movement across the clock.
            </p>
          )}
        </div>
      </div>

      <div className="tm-ctx-side">
        {selected ? <MovementReading movement={selected} range={range} phrase={phrase} onClose={() => onSelect(null)} /> : null}
        <Disclosed
          id="tm-ctx-pl"
          title="Places involved"
          items={ctx.places}
          empty={`No places are tied to ${phrase} yet.`}
          render={({ item, via }) => (
            <li key={item.id}>
              <Link to={cat.href(item.id)} className="tm-ctx-link" data-cursor-label="World" title={`Via ${via.slice(0, 3).join(', ')}`} onClick={() => sound.play('transition')}>
                <span>{item.name}</span>
                <span className="sr-only">, open in World</span>
                <Icon name="globe" size={14} />
              </Link>
            </li>
          )}
        />
        <Disclosed
          id="tm-ctx-pp"
          title="People"
          items={ctx.people}
          empty={`No people are recorded for ${phrase} yet.`}
          render={({ item }) => (
            <li key={item.id}>
              <Link to={cat.href(item.id)} className="tm-ctx-link" data-cursor-label="Connections" onClick={() => sound.play('transition')}>
                <span>{item.name}</span>
                <span className="tm-ctx-meta">{item.roles[0] ?? item.kind}</span>
              </Link>
            </li>
          )}
        />
      </div>
    </div>
  );
}

/** One movement read in full: dates, facts, places, lineage, and its connections page. */
function MovementReading({ movement: m, range, phrase, onClose }: { movement: Movement; range: TimeRange; phrase: string; onClose: () => void }) {
  const cat = useCatalogue();
  const stories = cat.videosForMovement(m.id);
  const roots = (m.influences ?? []).map((id) => cat.get(id) as Movement | undefined).filter((x): x is Movement => !!x);
  const echoes = cat.movements.filter((x) => x.influences?.includes(m.id));
  const live = overlaps(m.start, m.end ?? 9999, range.start, range.end);
  return (
    <article id="tm-mv-detail" className="tm-reading" aria-labelledby="tm-mv-title">
      <p className="tm-reading-years">{movementYears(m)}</p>
      <h3 id="tm-mv-title" className="tm-reading-title" tabIndex={-1}>
        {m.name}
      </h3>
      {!live ? <p className="tm-reading-note">Not active in {phrase} — shown for context</p> : null}
      <p className="tm-reading-summary">{m.summary}</p>
      {m.facts?.length ? (
        <dl className="tm-facts">
          {m.facts.map((f, i) => (
            <div key={i}>
              <dt>{f.label}</dt>
              <dd>
                {f.value}
                {f.source ? <span className="tm-fact-src"> — {f.source}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {m.places.length || roots.length || echoes.length ? (
        <ul className="tm-reading-links">
          {m.places.map((p) => (
            <li key={p}>
              <Link to={cat.href(p)} data-cursor-label="World">
                <Icon name="globe" size={14} />
                {cat.label(p)}
              </Link>
            </li>
          ))}
          {roots.map((r) => (
            <li key={r.id}>
              <Link to={cat.href(r.id)}>
                <span className="tm-dir" aria-hidden="true">
                  ←
                </span>
                <span className="sr-only">Drew on </span>
                {r.name}
              </Link>
            </li>
          ))}
          {echoes.map((r) => (
            <li key={r.id}>
              <Link to={cat.href(r.id)}>
                <span className="tm-dir" aria-hidden="true">
                  →
                </span>
                <span className="sr-only">Echoed by </span>
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="tm-quiet">{stories.length ? `${stories.length} ${stories.length === 1 ? 'story is' : 'stories are'} tagged with this movement.` : 'No stories are tagged with this movement yet.'}</p>
      <div className="tm-reading-actions">
        <ButtonLink to={`/synapse/movement/${m.slug}`} variant="ghost" icon="synapse">
          Open connections
        </ButtonLink>
        <Button variant="quiet" icon="close" onClick={onClose}>
          Clear
        </Button>
      </div>
    </article>
  );
}
