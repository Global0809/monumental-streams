/**
 * Movement span timeline — a mini gantt across every decade the Time Machine covers.
 * Each row is a movement; its bar spans its real years. Roots older than the axis carry a
 * left arrow ("from 1600"), ongoing movements a right arrow. The selected decade — or the one
 * selected year — is a frost column through every track. Rows are buttons (aria-pressed) that
 * select a movement into ?movement=, revealing its facts and links.
 */
import { Link } from 'react-router';
import { overlaps } from '../../../shared/catalogue.ts';
import type { Movement, Period } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink, Button } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { movementSpan, movementYears } from './chrono.ts';
import type { TimeRange } from './timeline.ts';

const THIS_YEAR = new Date().getFullYear();

export function MovementSpans({ periods, movements, decade, range, phrase, selected, onSelect }: { periods: Period[]; movements: Movement[]; decade: Period; range: TimeRange; phrase: string; selected?: Movement; onSelect: (m: Movement | null) => void }) {
  const from = periods[0]?.start ?? 1900;
  const to = periods[periods.length - 1]?.end ?? THIS_YEAR;
  const total = to + 1 - from;
  const selL = ((range.start - from) / total) * 100;
  const selW = ((range.end + 1 - range.start) / total) * 100;
  return (
    <div className="tm-gantt" data-year={range.start === range.end || undefined} style={{ ['--sel-l' as string]: `${selL}%`, ['--sel-w' as string]: `${selW}%`, ['--cols' as string]: periods.length }}>
      <div className="tm-gantt-head" aria-hidden="true">
        <span className="tm-gantt-corner">Movement</span>
        <ol className="tm-gantt-axis">
          {periods.map((p) => (
            <li key={p.id} data-on={p.id === decade.id || undefined}>
              <span className="tm-ax-long">{p.label}</span>
              <span className="tm-ax-short">’{p.label.slice(2, 4)}</span>
            </li>
          ))}
        </ol>
      </div>
      <ul className="tm-gantt-rows">
        {movements.map((m) => {
          const s = movementSpan(m, from, to, THIS_YEAR);
          const on = selected?.id === m.id;
          const live = overlaps(m.start, m.end ?? 9999, range.start, range.end);
          return (
            <li key={m.id} className="tm-gantt-row" data-selected={on || undefined} data-live={live || undefined}>
              <button
                type="button"
                className="tm-gantt-name"
                aria-pressed={on}
                onClick={() => {
                  sound.play(on ? 'close' : 'select');
                  onSelect(on ? null : m);
                }}
              >
                <span className="tm-gantt-title">{m.name}</span>
                <span className="tm-gantt-years">
                  {movementYears(m)}
                  {live ? null : <span className="sr-only">, not active in {phrase}</span>}
                </span>
              </button>
              <div className="tm-gantt-track" aria-hidden="true">
                <span className="tm-gantt-bar" style={{ left: `${s.left}%`, width: `${s.width}%` }} data-before={s.before || undefined} data-ongoing={s.ongoing || undefined}>
                  {s.before ? <span className="tm-gantt-from">{m.start}</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MovementDetail({ movement: m, range, phrase, onClose }: { movement: Movement; range: TimeRange; phrase: string; onClose: () => void }) {
  const cat = useCatalogue();
  const stories = cat.videosForMovement(m.id);
  const roots = (m.influences ?? []).map((id) => cat.get(id) as Movement | undefined).filter((x): x is Movement => !!x);
  const echoes = cat.movements.filter((x) => x.influences?.includes(m.id));
  const live = overlaps(m.start, m.end ?? 9999, range.start, range.end);
  return (
    <article id="tm-mv-detail" className="tm-mv panel panel-pad" aria-labelledby="tm-mv-title">
      <p className="kicker">
        <b>Movement</b> · {movementYears(m)}
      </p>
      <h3 id="tm-mv-title" className="tm-mv-title serif" tabIndex={-1}>
        {m.name}
      </h3>
      {!live ? <p className="tm-mv-note">Not active in {phrase} — shown for context</p> : null}
      <p className="tm-mv-summary">{m.summary}</p>
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
      {m.places.length ? (
        <div className="tm-mv-group">
          <h4 className="kicker">Where</h4>
          <ul className="tm-linklist">
            {m.places.map((p) => (
              <li key={p}>
                <Link to={cat.href(p)} data-cursor-label="World">
                  <Icon name="globe" size={14} />
                  {cat.label(p)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {roots.length || echoes.length ? (
        <div className="tm-mv-group">
          <h4 className="kicker">Lineage</h4>
          <ul className="tm-linklist">
            {roots.map((r) => (
              <li key={r.id}>
                <Link to={cat.href(r.id)}>
                  <span className="tm-dir" aria-hidden="true">←</span>
                  <span className="sr-only">Drew on </span>
                  {r.name}
                </Link>
              </li>
            ))}
            {echoes.map((r) => (
              <li key={r.id}>
                <Link to={cat.href(r.id)}>
                  <span className="tm-dir" aria-hidden="true">→</span>
                  <span className="sr-only">Echoed by </span>
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="tm-mv-stories muted">{stories.length ? `${stories.length} ${stories.length === 1 ? 'story is' : 'stories are'} tagged with this movement.` : 'No stories are tagged with this movement yet.'}</p>
      <div className="tm-mv-actions">
        <ButtonLink to={`/synapse/movement/${m.slug}`} variant="chrome" icon="synapse">
          Open connections
        </ButtonLink>
        <Button variant="quiet" icon="close" onClick={onClose}>
          Clear
        </Button>
      </div>
    </article>
  );
}
