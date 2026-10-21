/**
 * The facet panel: interests, destinations (gateway + place tree), historical setting,
 * access, length, source and playability. Counts are "what you would get" with every
 * other constraint applied (shared/search.ts facetCounts). Used inline on wide screens and
 * inside the filters dialog on phones/tablets.
 */
import { useMemo, useState } from 'react';
import type { Catalogue } from '../../../shared/catalogue.ts';
import { DURATION_BUCKETS, DURATION_LABELS, PROVENANCE_FILTERS, PROVENANCE_LABELS, type FacetCounts } from '../../../shared/search.ts';
import type { DiscoveryState, DurationBucket, ID } from '../../../shared/types.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Chip, Segmented, Switch } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { decadeOptions, destinationTree, toggleIn, type PlaceNode } from './facets.ts';

type Update = (fn: (s: DiscoveryState) => DiscoveryState) => void;

export function FacetPanel({ cat, state, facets, onChange, idPrefix }: { cat: Catalogue; state: DiscoveryState; facets: FacetCounts; onChange: Update; idPrefix: string }) {
  const decades = decadeOptions(cat, facets.periods, state.periods);
  const sel = (n: number) => (n ? ` (${n} selected)` : '');
  return (
    <div className="srch-panel">
      <fieldset className="srch-facet">
        <legend className="srch-legend">
          <span>Interests</span>
          <span className="sr-only">{sel(state.interests.length)}</span>
        </legend>
        <ul className="srch-chips">
          {cat.categories.map((c) => {
            const n = facets.interests[c.id] ?? 0;
            const on = state.interests.includes(c.id);
            return (
              <li key={c.id}>
                <Chip selected={on} count={n} disabled={!on && n === 0} onToggle={() => onChange((s) => ({ ...s, interests: toggleIn(s.interests, c.id) }))}>
                  {c.name}
                </Chip>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="srch-facet">
        <legend className="srch-legend">
          <span>Destinations</span>
          <span className="sr-only">{sel(state.places.length)}</span>
        </legend>
        <p className="srch-hint">A place includes everywhere inside it: Miami includes its neighbourhoods.</p>
        <Destinations cat={cat} state={state} counts={facets.places} onChange={onChange} idPrefix={idPrefix} />
      </fieldset>

      <fieldset className="srch-facet">
        <legend className="srch-legend">
          <span>Set in</span>
          <span className="sr-only">{sel(state.periods.length)}</span>
        </legend>
        <p className="srch-hint">When the story takes place (its historical setting), not when it was made or published.</p>
        {decades.length ? (
          <ul className="srch-chips srch-decades">
            {decades.map((d) => (
              <li key={d.period.id}>
                <Chip tone="plasma" selected={d.selected} count={d.count} onToggle={() => onChange((s) => ({ ...s, periods: toggleIn(s.periods, d.period.id) }))}>
                  {d.period.label}
                </Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="srch-none">None of these stories is set in a particular decade.</p>
        )}
      </fieldset>

      <fieldset className="srch-facet">
        <legend className="srch-legend">Access &amp; length</legend>
        <Segmented
          label="Access"
          value={state.access}
          options={[
            { value: 'all', label: 'All' },
            { value: 'free', label: `Free · ${facets.access.free}` },
            { value: 'premium', label: `Premium · ${facets.access.premium}` },
          ]}
          onChange={(v) => onChange((s) => ({ ...s, access: v }))}
        />
        <Segmented<DurationBucket>
          label="Length"
          value={state.duration}
          options={DURATION_BUCKETS.map((b) => ({ value: b, label: b === 'any' ? DURATION_LABELS[b] : `${DURATION_LABELS[b]} · ${facets.duration[b]}` }))}
          onChange={(v) => onChange((s) => ({ ...s, duration: v }))}
        />
      </fieldset>

      <fieldset className="srch-facet">
        <legend className="srch-legend">
          <span>Source</span>
          <span className="sr-only">{sel(state.provenance.length)}</span>
        </legend>
        <ul className="srch-chips">
          {PROVENANCE_FILTERS.map((f) => {
            const n = facets.provenance[f];
            const on = state.provenance.includes(f);
            return (
              <li key={f}>
                <Chip tone={f === 'original' ? 'aurum' : 'ichor'} selected={on} count={n} disabled={!on && n === 0} onToggle={() => onChange((s) => ({ ...s, provenance: toggleIn(s.provenance, f) }))}>
                  {PROVENANCE_LABELS[f]}
                </Chip>
              </li>
            );
          })}
        </ul>
        <p className="srch-hint">Archive, studio and open-cinema titles are demonstration media while original programming is produced.</p>
      </fieldset>

      <div className="srch-facet srch-facet-switch">
        <Switch checked={state.playableOnly} onChange={(v) => onChange((s) => ({ ...s, playableOnly: v }))} label="Playable now only" description="Hide planned and coming-soon titles." />
      </div>
    </div>
  );
}

function Destinations({ cat, state, counts, onChange, idPrefix }: { cat: Catalogue; state: DiscoveryState; counts: Record<ID, number>; onChange: Update; idPrefix: string }) {
  const tree = useMemo(() => destinationTree(cat, counts, state.places), [cat, counts, state.places]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      sound.play(next.has(id) ? 'open' : 'close');
      return next;
    });
  const select = (id: ID) => onChange((s) => ({ ...s, places: toggleIn(s.places, id) }));
  if (!tree.gateway && !tree.roots.length) return <p className="srch-none">No destinations match the other filters.</p>;
  return (
    <div className="srch-places">
      {tree.gateway ? (
        <ul className="srch-place-list srch-gateway" aria-label="Launch gateway">
          <PlaceRow node={tree.gateway} depth={0} open={open} toggleOpen={toggleOpen} select={select} prefix={`${idPrefix}-gw`} gateway />
        </ul>
      ) : null}
      <ul className="srch-place-list" aria-label="Destinations by country">
        {tree.roots.map((n) => (
          <PlaceRow key={n.place.id} node={n} depth={0} open={open} toggleOpen={toggleOpen} select={select} prefix={`${idPrefix}-pl`} />
        ))}
      </ul>
    </div>
  );
}

function PlaceRow({ node, depth, open, toggleOpen, select, prefix, gateway }: { node: PlaceNode; depth: number; open: Set<string>; toggleOpen: (id: string) => void; select: (id: ID) => void; prefix: string; gateway?: boolean }) {
  const key = `${prefix}-${node.place.slug}`;
  const expanded = open.has(`${prefix}:${node.place.id}`) || (node.holdsSelection && !open.has(`${prefix}:closed:${node.place.id}`));
  const kids = node.children.length > 0;
  const toggle = () => {
    // Branches holding a selection start open; remember an explicit close separately.
    if (node.holdsSelection) toggleOpen(`${prefix}:closed:${node.place.id}`);
    else toggleOpen(`${prefix}:${node.place.id}`);
  };
  return (
    <li className="srch-place" style={{ ['--depth' as string]: depth }}>
      <div className="srch-place-row">
        <Chip selected={node.selected} count={node.count} onToggle={() => select(node.place.id)} className={gateway ? 'srch-gateway-chip' : ''}>
          {node.place.name}
          {gateway ? <span className="srch-gateway-tag">Gateway</span> : null}
        </Chip>
        {kids ? (
          <button
            type="button"
            className="srch-place-expand"
            aria-expanded={expanded}
            aria-controls={key}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${node.children.length} places in ${node.place.name}`}
            onClick={toggle}
          >
            <Icon name="down" size={16} />
            <span aria-hidden="true">{node.children.length}</span>
          </button>
        ) : null}
      </div>
      {kids ? (
        // Opens and closes as a smooth (interruptible) height transition; collapsed content is
        // visibility: hidden, so it is neither seen, focused nor announced.
        <div className="srch-collapse" data-open={expanded || undefined}>
          <ul id={key} className="srch-place-list srch-place-children">
            {node.children.map((c) => (
              <PlaceRow key={c.place.id} node={c} depth={depth + 1} open={open} toggleOpen={toggleOpen} select={select} prefix={prefix} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
