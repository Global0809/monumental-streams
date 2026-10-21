/**
 * Accessible place picker (ARIA 1.2 combobox + listbox): type to filter, ↑/↓ to move,
 * Enter to add, Escape to close. Each option names the place, its kind and where it sits,
 * and whether it has stories yet.
 */
import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { ID, Place } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { placeTrail, searchPlaces } from './logic.ts';

export const PlaceCombobox = forwardRef<HTMLInputElement, { exclude: Set<ID>; onPick: (p: Place) => void; disabled?: boolean; hint?: string }>(function PlaceCombobox(
  { exclude, onPick, disabled, hint },
  ref,
) {
  const cat = useCatalogue();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPlaces(cat, query, exclude, 8), [cat, query, exclude]);
  const optionId = (i: number) => `${id}-opt-${i}`;
  const expanded = open && !disabled;

  const pick = (p: Place | undefined) => {
    if (!p) return;
    onPick(p);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      if (expanded && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        e.preventDefault();
        setQuery('');
      }
    }
  };

  return (
    <div className="pp-combo">
      <label htmlFor={id} className="pp-combo-label">
        Add a stop
      </label>
      <div className="pp-combo-field">
        <Icon name="search" size={18} />
        <input
          ref={ref}
          id={id}
          className="input pp-combo-input"
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && results[active] ? optionId(active) : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search places — Miami, Brixton, Loíza…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          data-native-cursor=""
        />
        <ul id={listId} role="listbox" aria-label="Places" className="pp-combo-list" hidden={!expanded}>
        {results.map((p, i) => {
          const stories = cat.videosForPlace(p.id, true).length;
          return (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="pp-combo-opt"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
            >
              <span className="pp-combo-name">{p.name}</span>
              <span className="pp-combo-trail">{placeTrail(cat, p)}</span>
              <span className={`pp-combo-status ${stories ? 'is-live' : ''}`}>{stories ? `${stories} ${stories === 1 ? 'story' : 'stories'}` : 'No stories yet'}</span>
            </li>
          );
        })}
        {!results.length ? (
          <li className="pp-combo-none" role="option" aria-selected={false} aria-disabled="true">
            No places match “{query}”
          </li>
        ) : null}
        </ul>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {expanded ? (results.length ? `${results.length} ${results.length === 1 ? 'place' : 'places'} available` : 'No places match') : ''}
      </p>
    </div>
  );
});
