/**
 * Stage data for the globe and the flat map, seen through the lens. Pure (no DOM, no
 * Three.js) so the "what glows" rules are unit-tested:
 *
 *   selected place ............ 3 (ring + label)
 *   route ends, the place's
 *   scope, a hovered result ... 2 (brighter, labelled when hovered)
 *   lens on: matching stories . 2, sized by the matching count
 *            movements only ... 0, a hollow ring (culture here, no matching stories yet)
 *            nothing .......... 1 (dimmed) — or hidden with "stories only"
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { ID, Place, Route } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { narrowsStories, routeMatches, type PlaceSignal, type WorldFilters } from './filters.ts';
import { nodeSize, type AtlasModel, type StageNode, type StageRoute } from './model.ts';

export interface StageInput {
  place?: Place;
  route?: Route;
  /** The selected place and everything inside it. */
  scope: Set<ID> | null;
  filters: WorldFilters;
  /** Per-place signal under the lens; null when nothing is filtered. */
  signals: Map<ID, PlaceSignal> | null;
  /** A place being hovered or focused in a list beside the stage. */
  hot?: ID | null;
}

/** Few enough matches to name them all on the stage. */
const LABEL_ALL_BELOW = 7;

export function buildStageNodes(model: AtlasModel, i: StageInput): StageNode[] {
  const { place, route, scope, signals, filters, hot = null } = i;
  const ends = new Set<ID>(route ? [route.from, route.to] : []);
  const small = !!scope && scope.size <= 8;
  const lensed = narrowsStories(filters) && !!signals;
  const matched = lensed ? model.nodes.filter((n) => n.level === 'city' && (signals.get(n.id)?.stories ?? 0) > 0).length : 0;
  const out: StageNode[] = [];
  for (const n of model.nodes) {
    const sig = signals?.get(n.id);
    const stories = sig ? sig.stories : n.count;
    const movements = sig?.movements ?? 0;
    const selected = n.id === place?.id;
    const pinned = selected || ends.has(n.id) || n.id === hot;
    if (filters.storiesOnly && stories === 0 && !pinned) continue;

    const hollow = lensed ? stories === 0 : n.expanding && n.count === 0;
    let state: StageNode['state'];
    if (selected) state = 3;
    else if (ends.has(n.id) || n.id === hot || scope?.has(n.id)) state = 2;
    else if (route) state = lensed && stories > 0 ? 0 : 1;
    else if (lensed) state = stories > 0 ? 2 : movements > 0 ? 0 : 1;
    else state = 0;

    let meta: string;
    if (lensed) meta = stories ? `${plural(stories, 'match', 'matches')}${movements ? ` · ${plural(movements, 'movement')}` : ''}` : movements ? `${plural(movements, 'movement')} · no matching stories` : 'No matches';
    else meta = n.gateway ? `Gateway · ${plural(n.count, 'story', 'stories')}` : hollow ? 'Expanding' : plural(n.count, 'story', 'stories');

    out.push({
      id: n.id,
      slug: n.place.slug,
      name: n.place.name,
      meta,
      lat: n.lat,
      lon: n.lon,
      size: nodeSize(stories, hollow),
      expanding: hollow,
      gateway: n.gateway,
      state,
      label: pinned || (n.gateway && !lensed) || (lensed && stories > 0 && matched < LABEL_ALL_BELOW && n.level === 'city') || (small && !!scope?.has(n.id) && n.level === 'city'),
      level: n.level,
    });
  }
  return out;
}

export function buildStageRoutes(cat: Catalogue, i: StageInput): StageRoute[] {
  const { route, scope, signals, filters } = i;
  const lensed = narrowsStories(filters) && !!signals;
  const coords = (id: ID) => (cat.get(id) as Place | undefined)?.coords;
  const out: StageRoute[] = [];
  for (const r of cat.routes) {
    const a = coords(r.from);
    const b = coords(r.to);
    if (!a || !b) continue;
    const touches = !!scope && (scope.has(r.from) || scope.has(r.to));
    let state: StageRoute['state'];
    if (route) state = r.id === route.id ? 3 : 0;
    else if (lensed && !routeMatches(cat, r, filters, signals)) state = 0;
    else state = touches ? 2 : 1;
    out.push({ id: r.id, from: a, to: b, kind: r.kind, state });
  }
  return out;
}
