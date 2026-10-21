/**
 * Search utility: a command-palette overlay with live results from the shared search engine.
 * Combobox pattern (input + listbox with aria-activedescendant): arrows move, Enter opens,
 * Escape closes (native <dialog>). "See all" carries the query into the full search page,
 * where it combines with every filter.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { defaultDiscovery, searchCatalogue } from '../../shared/search.ts';
import { runtimeLabel, settingLabel } from '../lib/format.ts';
import { useCatalogue } from '../state/catalogue.tsx';
import { sound } from '../systems/sound/engine.ts';
import { Dialog } from '../ui/feedback.tsx';
import { Icon } from '../ui/Icon.tsx';

interface Option {
  id: string;
  href: string;
  title: string;
  meta: string;
  thumb?: string;
  kind: 'video' | 'entity' | 'all';
}

const KIND_LABEL: Record<string, string> = {
  place: 'Place',
  person: 'Person',
  movement: 'Movement',
  programme: 'Programme',
  period: 'Era',
  theme: 'Theme',
  interest: 'Interest',
};

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cat = useCatalogue();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [activeIndex, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const options = useMemo<Option[]>(() => {
    const query = q.trim();
    if (!query) {
      // Suggestions before typing: the newest playable stories
      return cat.videos
        .filter((v) => cat.isPlayable(v))
        .slice(0, 5)
        .map((v) => ({ id: v.id, href: cat.href(v.id), title: v.title, meta: `${settingLabel(v)} · ${runtimeLabel(cat.runtime(v))}`, thumb: cat.artFor(v.art)?.posterSmall, kind: 'video' as const }));
    }
    const res = searchCatalogue(cat, { ...defaultDiscovery(), q: query });
    const vids: Option[] = res.results.slice(0, 6).map(({ video: v }) => ({
      id: v.id,
      href: cat.href(v.id),
      title: v.title,
      meta: `${settingLabel(v)} · ${runtimeLabel(cat.runtime(v)) || 'Planned'}`,
      thumb: cat.artFor(v.art)?.posterSmall,
      kind: 'video',
    }));
    const ents: Option[] = res.entities.slice(0, 4).map((e) => ({ id: e.id, href: cat.href(e.id), title: e.label, meta: KIND_LABEL[e.kind] ?? e.kind, kind: 'entity' }));
    return [...vids, ...ents, { id: 'all', href: `/catalogue?q=${encodeURIComponent(query)}`, title: `See all results for “${query}”`, meta: `${res.total} ${res.total === 1 ? 'story' : 'stories'}`, kind: 'all' }];
  }, [cat, q]);

  useEffect(() => setActive(0), [q]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    sound.play('transition');
    onClose();
    navigate(o.href);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
      sound.play('tick');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      sound.play('tick');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(options[activeIndex]);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Search" wide>
      <div className="palette">
        <div className="palette-field">
          <Icon name="search" size={20} />
          <input
            ref={input}
            className="palette-input"
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={options[activeIndex] ? `pal-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-label="Search stories, people, places and eras"
            placeholder="Search stories, people, places, eras…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <p className="palette-hint">{q.trim() ? 'Results update as you type' : 'Start typing, or jump to something new'}</p>
        <ul id="palette-list" role="listbox" aria-label="Search results" className="palette-list">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`palette-option palette-${o.kind}`}
              onPointerMove={() => setActive(i)}
              onClick={() => go(o)}
            >
              {o.thumb ? <img src={o.thumb} alt="" className="palette-thumb" /> : <span className="palette-thumb palette-glyph" aria-hidden="true"><Icon name={o.kind === 'all' ? 'arrow' : 'synapse'} size={18} /></span>}
              <span className="palette-text">
                <span className="palette-title">{o.title}</span>
                <span className="palette-meta">{o.meta}</span>
              </span>
              <Icon name="right" size={16} />
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
