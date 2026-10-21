/**
 * A journey programme's route: stops are nodes linking into the Living Atlas, legs are soft
 * lines (and, in the full strip, link to the catalogued route between two stops).
 */
import { Link } from 'react-router';
import type { Programme } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { countryOf, legBetween, routeStops } from './programme-model.ts';
import './programme.css';

export function RouteStrip({ programme, compact }: { programme: Programme; compact?: boolean }) {
  const cat = useCatalogue();
  const stops = routeStops(cat, programme);
  if (stops.length < 2) return null;
  return (
    <ol className={`prog-route ${compact ? 'prog-route-compact' : ''}`} aria-label={`Route: ${stops.map((s) => s.name).join(' to ')}`}>
      {stops.map((s, i) => {
        const next = stops[i + 1];
        const leg = next ? legBetween(cat, s.id, next.id) : undefined;
        const country = countryOf(cat, s);
        return (
          <li key={s.id} className="prog-route-stop">
            <Link to={cat.href(s.id)} className="prog-route-place" data-cursor="open" data-cursor-label="Atlas" onClick={() => sound.play('transition')}>
              <span className="prog-route-node" aria-hidden="true" />
              <span className="prog-route-name">{s.name}</span>
              {!compact && country && country.id !== s.id ? <span className="prog-route-meta">{country.name}</span> : null}
            </Link>
            {next ? (
              compact || !leg ? (
                <span className="prog-route-leg" aria-hidden="true" />
              ) : (
                <Link to={cat.href(leg.id)} className="prog-route-leg prog-route-leg-link" data-cursor-label="Route" onClick={() => sound.play('transition')}>
                  <span className="prog-route-leg-label">{leg.label}</span>
                </Link>
              )
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
