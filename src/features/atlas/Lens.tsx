/**
 * The lens — the World's filter bar. Category (a primary-navigation section, then one of its
 * facets), era (a decade strip whose bars show how many stories are set then), access and
 * "stories only". Every change rewrites the URL, so the globe, the map, the list and the
 * panel all re-light from the same state, and refresh / back / a shared link restore it.
 *
 * Single choices are radio groups with roving focus (arrow keys, Home, End); a keyboard move
 * replaces the history entry instead of stacking one per key press.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SectionId } from '../../../shared/sections.ts';
import { categorySections } from '../../../shared/sections.ts';
import type { ID } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { sound } from '../../systems/sound/engine.ts';
import { Segmented } from '../../ui/controls.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { activeFilterCount, isFiltering, sectionOf, type AccessFilter, type EraDensity, type WorldFilters } from './filters.ts';
import './lens.css';

export type LensChange = (next: WorldFilters, opts?: { replace?: boolean }) => void;

interface RadioOption<T extends string> {
  value: T;
  label: string;
  /** Spoken after the label ("2 stories"). */
  detail?: string;
  count?: number;
  icon?: IconName;
  empty?: boolean;
}

/** Keeps the chosen item of a horizontal scroller in view (without moving the page). */
function useRevealChecked(ref: React.RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const sc = el?.closest<HTMLElement>('.wl-scroll');
    if (!el || !sc) return;
    const a = el.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    if (a.right > b.right - 8) sc.scrollLeft += a.right - b.right + 32;
    else if (a.left < b.left + 8) sc.scrollLeft -= b.left - a.left + 32;
  }, [ref, key]);
}

/** A radiogroup of chips with roving focus. */
function RadioChips<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: RadioOption<T>[]; onChange: (v: T, keyboard: boolean) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealChecked(ref, value);
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = options.length - 1;
    else return;
    e.preventDefault();
    sound.play('tick');
    onChange(options[n].value, true);
    // focus the chosen radio itself: the URL (and so aria-checked) updates a moment later
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <div ref={ref} className={`wl-radios ${className}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="wl-chip"
            data-empty={o.empty || undefined}
            data-react="light"
            onClick={() => {
              if (on) return;
              sound.play('select');
              onChange(o.value, false);
            }}
          >
            {o.icon ? <Icon name={o.icon} size={15} /> : <span className="wl-chip-node" aria-hidden="true" />}
            <span className="wl-chip-label">{o.label}</span>
            {o.count !== undefined ? (
              <span className="wl-chip-count">
                <span aria-hidden="true">{o.count}</span>
                <span className="sr-only">, {o.detail ?? o.count}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Decades as a strip of radios; each bar's height is the number of stories set then. */
function EraStrip({ value, density, onChange }: { value: ID | null; density: EraDensity[]; onChange: (era: ID | null, keyboard: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealChecked(ref, value);
  const max = Math.max(1, ...density.map((d) => d.stories));
  const ids: (ID | null)[] = [null, ...density.map((d) => d.period.id)];
  const onKey = (e: KeyboardEvent) => {
    const i = Math.max(0, ids.indexOf(value));
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(ids.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = ids.length - 1;
    else return;
    e.preventDefault();
    if (n === i) return;
    sound.play('tick');
    onChange(ids[n], true);
    // focus the chosen radio itself: the URL (and so aria-checked) updates a moment later
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };
  const pick = (id: ID | null) => {
    if (id === value) return;
    sound.play('select');
    onChange(id, false);
  };
  return (
    <div ref={ref} className="wl-era" role="radiogroup" aria-label="Era" onKeyDown={onKey}>
      <button type="button" role="radio" aria-checked={value === null} tabIndex={value === null ? 0 : -1} className="wl-era-any" onClick={() => pick(null)}>
        Any era
      </button>
      <div className="wl-era-track">
        {density.map((d) => {
          const on = d.period.id === value;
          const h = d.stories ? 0.28 + 0.72 * (d.stories / max) : 0;
          return (
            <button
              key={d.period.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="wl-era-cell"
              data-empty={!d.stories && !d.movements ? true : undefined}
              onClick={() => pick(d.period.id)}
              title={`${d.period.label}: ${plural(d.stories, 'story', 'stories')}, ${plural(d.movements, 'movement')}`}
            >
              <span className="wl-era-bar" aria-hidden="true">
                <span style={{ ['--h' as string]: h }} />
                {d.movements ? <i /> : null}
              </span>
              <span className="wl-era-label">
                <span aria-hidden="true">{d.period.label}</span>
                <span className="sr-only">
                  {d.period.label}, {plural(d.stories, 'story', 'stories')}, {plural(d.movements, 'movement')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ACCESS_OPTIONS: { value: AccessFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'premium', label: 'Premium' },
];

export interface LensProps {
  filters: WorldFilters;
  sectionCounts: Map<SectionId, number>;
  facetCounts: Map<ID, number>;
  density: EraDensity[];
  /** Placed stories across every category under the rest of the lens. */
  allStories: number;
  onChange: LensChange;
}

export function Lens({ filters, sectionCounts, facetCounts, density, allStories, onChange }: LensProps) {
  const cat = useCatalogue();
  const [open, setOpen] = useState(false);
  const moreId = useId();
  const section = sectionOf(filters.section);
  const active = activeFilterCount(filters);
  const secondary = [filters.era, filters.access !== 'all', filters.storiesOnly].filter(Boolean).length;

  const sectionOptions = useMemo<RadioOption<SectionId | 'all'>[]>(
    () => [
      { value: 'all', label: 'Everything', count: allStories, detail: plural(allStories, 'story', 'stories') },
      ...categorySections().map((s) => {
        const n = sectionCounts.get(s.id) ?? 0;
        return { value: s.id, label: s.label, count: n, detail: plural(n, 'story', 'stories'), empty: n === 0 };
      }),
    ],
    [sectionCounts, allStories],
  );
  const facetOptions = useMemo<RadioOption<string>[]>(
    () =>
      section?.facets?.length
        ? [
            { value: 'all', label: `All ${section.label.toLowerCase()}` },
            ...section.facets.map((id) => {
              const n = facetCounts.get(id) ?? 0;
              return { value: id, label: cat.label(id), count: n, detail: plural(n, 'story', 'stories'), empty: n === 0 };
            }),
          ]
        : [],
    [section, facetCounts, cat],
  );

  const set = (patch: Partial<WorldFilters>, keyboard = false) => onChange({ ...filters, ...patch }, { replace: keyboard });

  // horizontal scrollers fade at whichever edge has more to show
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scrollers = [...root.querySelectorAll<HTMLElement>('.wl-scroll')];
    const mark = (el: HTMLElement) => {
      el.toggleAttribute('data-more-left', el.scrollLeft > 4);
      el.toggleAttribute('data-more-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    const onScroll = (e: Event) => mark(e.currentTarget as HTMLElement);
    const ro = new ResizeObserver(() => scrollers.forEach(mark));
    for (const el of scrollers) {
      mark(el);
      el.addEventListener('scroll', onScroll, { passive: true });
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      for (const el of scrollers) el.removeEventListener('scroll', onScroll);
    };
  }, [section?.id, open]);

  return (
    <section ref={rootRef} className="wl" aria-labelledby="wl-title" data-open={open || undefined} data-filtering={isFiltering(filters) || undefined}>
      <h2 id="wl-title" className="sr-only">
        Filter the world
      </h2>
      <div className="wl-main">
        <div className="wl-scroll wl-cats">
          <RadioChips
            label="Category"
            value={filters.section ?? 'all'}
            options={sectionOptions}
            onChange={(v, k) => set({ section: v === 'all' ? null : v, facet: null }, k)}
          />
        </div>
        <div className="wl-actions">
          <button type="button" className="wl-more-btn" aria-expanded={open} aria-controls={moreId} onClick={() => (sound.play(open ? 'close' : 'open'), setOpen(!open))}>
            <Icon name="filter" size={16} />
            <span>Era, access and more</span>
            {secondary ? <span className="wl-more-n">{secondary}</span> : null}
            <Icon name="down" size={16} />
          </button>
          {active ? (
            <button
              type="button"
              className="wl-clear"
              aria-label="Clear all filters"
              onClick={() => (sound.play('unsave'), onChange({ section: null, facet: null, era: null, access: 'all', storiesOnly: false }))}
            >
              <Icon name="close" size={14} />
              Clear
              <span className="wl-clear-n" aria-hidden="true">
                {active}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {facetOptions.length ? (
        <div className="wl-facets wl-scroll">
          <span className="wl-facets-lead" aria-hidden="true">
            {section?.label}
            <Icon name="right" size={14} />
          </span>
          <RadioChips label={`${section?.label} focus`} value={filters.facet ?? 'all'} options={facetOptions} onChange={(v, k) => set({ facet: v === 'all' ? null : v }, k)} className="wl-radios-facets" />
        </div>
      ) : null}

      <div id={moreId} className="wl-more">
        <div className="wl-scroll wl-era-wrap">
          <EraStrip value={filters.era} density={density} onChange={(era, k) => set({ era }, k)} />
        </div>
        <div className="wl-tail">
          <Segmented label="Access" hideLabel value={filters.access} options={ACCESS_OPTIONS} onChange={(access) => set({ access })} />
          <button
            type="button"
            role="switch"
            aria-checked={filters.storiesOnly}
            className="wl-switch"
            onClick={() => {
              sound.play(filters.storiesOnly ? 'close' : 'open');
              set({ storiesOnly: !filters.storiesOnly });
            }}
          >
            <span className="wl-switch-track" aria-hidden="true">
              <span />
            </span>
            Stories only
          </button>
        </div>
      </div>
    </section>
  );
}
