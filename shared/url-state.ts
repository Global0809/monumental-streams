/**
 * DiscoveryState ⇄ URLSearchParams for /catalogue (and /api/search).
 *
 *   ?q=bomba&interest=film,music&place=miami&period=1970s&access=free&dur=under-5
 *    &prov=archive,studio&playable=1&sort=newest
 *
 * URLs carry slugs, never raw ids. Defaults are omitted, values are written in a stable
 * order (slugs alphabetically, provenance in canonical order), and unknown or malformed
 * values are ignored. Round trips are lossless: fromParams(toParams(s)) equals s with its
 * lists in that same canonical order (a whitespace-only q counts as empty).
 */
import { kindOf } from './catalogue.ts';
import type { Catalogue, EntityKind } from './catalogue.ts';
import { DURATION_BUCKETS, PROVENANCE_FILTERS, SORT_KEYS, defaultDiscovery } from './search.ts';
import type { DiscoveryState, DurationBucket, ID, SortKey } from './types.ts';

type ListKey = 'interests' | 'places' | 'periods';

/** Discovery list fields, their URL parameter and the entity kind of their values. */
const LISTS: { key: ListKey; param: string; kind: EntityKind }[] = [
  { key: 'interests', param: 'interest', kind: 'interest' },
  { key: 'places', param: 'place', kind: 'place' },
  { key: 'periods', param: 'period', kind: 'period' },
];

function slugOf(cat: Catalogue, id: ID, kind: EntityKind): string | undefined {
  if (kindOf(id) !== kind) return undefined;
  const e = cat.get(id);
  return e && 'slug' in e ? e.slug : undefined;
}

/** Known ids for a list, deduplicated and ordered by slug. */
function canonicalIds(cat: Catalogue, ids: ID[], kind: EntityKind): { id: ID; slug: string }[] {
  const bySlug = new Map<string, ID>();
  for (const id of ids) {
    const slug = slugOf(cat, id, kind);
    if (slug) bySlug.set(slug, id);
  }
  return [...bySlug.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([slug, id]) => ({ id, slug }));
}

/** All comma-separated values of a (possibly repeated) parameter. */
function values(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function discoveryToParams(state: DiscoveryState, cat: Catalogue): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q.trim() !== '') p.set('q', state.q);
  for (const { key, param, kind } of LISTS) {
    const slugs = canonicalIds(cat, state[key], kind).map((e) => e.slug);
    if (slugs.length) p.set(param, slugs.join(','));
  }
  if (state.access !== 'all') p.set('access', state.access);
  if (state.duration !== 'any') p.set('dur', state.duration);
  const prov = PROVENANCE_FILTERS.filter((f) => state.provenance.includes(f));
  if (prov.length) p.set('prov', prov.join(','));
  if (state.playableOnly) p.set('playable', '1');
  if (state.sort !== 'relevance') p.set('sort', state.sort);
  return p;
}

export function discoveryFromParams(params: URLSearchParams, cat: Catalogue): DiscoveryState {
  const state = defaultDiscovery();
  const q = params.get('q');
  if (q !== null && q.trim() !== '') state.q = q;
  for (const { key, param, kind } of LISTS) {
    // Accept slugs (canonical) and, leniently, full ids of the right kind.
    const ids = values(params, param).map((v) => (v.includes(':') ? v : (cat.bySlug(kind, v)?.id ?? '')));
    state[key] = canonicalIds(cat, ids, kind).map((e) => e.id);
  }
  const access = params.get('access');
  if (access === 'free' || access === 'premium') state.access = access;
  const dur = params.get('dur') as DurationBucket | null;
  if (dur && DURATION_BUCKETS.includes(dur)) state.duration = dur;
  const prov = new Set(values(params, 'prov'));
  state.provenance = PROVENANCE_FILTERS.filter((f) => prov.has(f));
  const playable = params.get('playable');
  state.playableOnly = playable === '1' || playable === 'true';
  const sort = params.get('sort') as SortKey | null;
  if (sort && SORT_KEYS.includes(sort)) state.sort = sort;
  return state;
}

/** Query string for links ("?…" without the "?"), keeping commas readable instead of %2C. */
export function discoveryToSearch(state: DiscoveryState, cat: Catalogue): string {
  return discoveryToParams(state, cat).toString().replace(/%2C/gi, ',');
}
