/**
 * Pure helpers for the catalogue's facet panel and active-filter bar. They shape what
 * shared/search.ts returns (facet counts) into what the UI renders; no searching here.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import { applyRelaxation, defaultDiscovery, DURATION_LABELS, PROVENANCE_LABELS, type Relaxation } from '../../../shared/search.ts';
import type { DiscoveryState, ID, Period, Place } from '../../../shared/types.ts';

/* ───────────── Destinations ───────────── */

export interface PlaceNode {
  place: Place;
  count: number;
  selected: boolean;
  /** A descendant is selected (keeps the branch visible and expanded). */
  holdsSelection: boolean;
  children: PlaceNode[];
}

const byCountThenName = (a: PlaceNode, b: PlaceNode) => b.count - a.count || a.place.name.localeCompare(b.place.name);

/**
 * The destination tree: the gateway first, then top-level places (countries, territories).
 * A place is shown only when it has matching stories or is (or holds) a selection.
 */
export function destinationTree(cat: Catalogue, counts: Record<ID, number>, selected: ID[]): { gateway: PlaceNode | null; roots: PlaceNode[] } {
  const chosen = new Set(selected);
  const build = (place: Place): PlaceNode | null => {
    const children = cat
      .placeChildren(place.id)
      .map(build)
      .filter((n): n is PlaceNode => n !== null)
      .sort(byCountThenName);
    const count = counts[place.id] ?? 0;
    const isSelected = chosen.has(place.id);
    const holdsSelection = children.some((c) => c.selected || c.holdsSelection);
    if (count <= 0 && !isSelected && !holdsSelection) return null;
    return { place, count, selected: isSelected, holdsSelection, children };
  };
  const gatewayPlace = cat.places.find((p) => p.gateway);
  const gateway = gatewayPlace ? build(gatewayPlace) : null;
  const roots = cat.places
    .filter((p) => !p.parent)
    .map(build)
    .filter((n): n is PlaceNode => n !== null)
    .sort(byCountThenName);
  return { gateway, roots };
}

/* ───────────── Decades ───────────── */

export interface DecadeOption {
  period: Period;
  count: number;
  selected: boolean;
}

/** Decades with stories set in them (or selected), chronological. */
export function decadeOptions(cat: Catalogue, counts: Record<ID, number>, selected: ID[]): DecadeOption[] {
  const chosen = new Set(selected);
  return cat.periods
    .map((period) => ({ period, count: counts[period.id] ?? 0, selected: chosen.has(period.id) }))
    .filter((o) => o.count > 0 || o.selected);
}

/* ───────────── Active filters ───────────── */

export interface ActiveFilter {
  key: Relaxation['key'];
  value?: string;
  label: string;
  /** Accessible name for its remove button. */
  removeLabel: string;
  tone: 'ichor' | 'plasma' | 'aurum' | 'ember';
}

/** Every constraint in a state as a removable chip, in panel order (sort is not a filter). */
export function activeFilters(cat: Catalogue, s: DiscoveryState): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const q = s.q.trim();
  if (q) out.push({ key: 'q', label: `“${q}”`, removeLabel: `Clear the search “${q}”`, tone: 'ichor' });
  for (const id of s.interests) out.push({ key: 'interests', value: id, label: cat.label(id), removeLabel: `Remove interest ${cat.label(id)}`, tone: 'ichor' });
  for (const id of s.places) out.push({ key: 'places', value: id, label: cat.label(id), removeLabel: `Remove destination ${cat.label(id)}`, tone: 'ichor' });
  for (const id of s.periods) out.push({ key: 'periods', value: id, label: `Set in ${cat.label(id)}`, removeLabel: `Remove setting ${cat.label(id)}`, tone: 'plasma' });
  if (s.access !== 'all') {
    const label = s.access === 'free' ? 'Free only' : 'Premium only';
    out.push({ key: 'access', label, removeLabel: `Remove ${label}`, tone: s.access === 'premium' ? 'aurum' : 'ichor' });
  }
  if (s.duration !== 'any') out.push({ key: 'duration', label: DURATION_LABELS[s.duration], removeLabel: `Remove length ${DURATION_LABELS[s.duration]}`, tone: 'ichor' });
  for (const f of s.provenance) out.push({ key: 'provenance', value: f, label: PROVENANCE_LABELS[f], removeLabel: `Remove source ${PROVENANCE_LABELS[f]}`, tone: f === 'original' ? 'aurum' : 'ichor' });
  if (s.playableOnly) out.push({ key: 'playableOnly', label: 'Playable now', removeLabel: 'Include titles not yet playable', tone: 'ichor' });
  return out;
}

export function removeFilter(s: DiscoveryState, f: ActiveFilter): DiscoveryState {
  return applyRelaxation(s, { key: f.key, value: f.value, label: f.label, count: 0 });
}

/** Reset every filter and the query, keeping the chosen sort order. */
export function clearFilters(s: DiscoveryState): DiscoveryState {
  return { ...defaultDiscovery(), sort: s.sort };
}

/** True when anything narrows the results (query or any filter; sort alone does not count). */
export function isFiltered(s: DiscoveryState): boolean {
  return s.q.trim() !== '' || filterCount(s) > 0;
}

/** Number of facet filters in effect (the query excluded), for the "Filters (n)" button. */
export function filterCount(s: DiscoveryState): number {
  return s.interests.length + s.places.length + s.periods.length + s.provenance.length + (s.access !== 'all' ? 1 : 0) + (s.duration !== 'any' ? 1 : 0) + (s.playableOnly ? 1 : 0);
}

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
