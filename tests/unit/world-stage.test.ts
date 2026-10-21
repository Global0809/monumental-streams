import { describe, expect, it } from 'vitest';
import type { Place, Route } from '../../shared/types.ts';
import { NO_FILTERS, placeSignals, type WorldFilters } from '../../src/features/atlas/filters.ts';
import { buildAtlasModel } from '../../src/features/atlas/model.ts';
import { buildStageNodes, buildStageRoutes, type StageInput } from '../../src/features/atlas/stage.ts';
import { fixtureCatalogue, NOW } from './fixture.ts';

const cat = fixtureCatalogue();
const model = buildAtlasModel(cat);
const input = (f: Partial<WorldFilters> = {}, extra: Partial<StageInput> = {}): StageInput => {
  const filters = { ...NO_FILTERS, ...f };
  const filtering = filters.section || filters.era || filters.access !== 'all' || filters.storiesOnly;
  return { scope: null, filters, signals: filtering ? placeSignals(cat, filters, NOW) : null, ...extra };
};
const node = (nodes: ReturnType<typeof buildStageNodes>, id: string) => nodes.find((n) => n.id === id);

describe('stage nodes', () => {
  it('without a lens: everything normal, the gateway labelled, the selection ringed', () => {
    const miami = cat.get('place:miami') as Place;
    const nodes = buildStageNodes(model, input({}, { place: miami, scope: cat.placeScope(miami.id) }));
    expect(node(nodes, 'place:miami')).toMatchObject({ state: 3, label: true });
    expect(node(nodes, 'place:wynwood')?.state).toBe(2); // inside the selection
    expect(node(nodes, 'place:london')?.state).toBe(0);
    expect(node(nodes, 'place:kingston')).toMatchObject({ expanding: true, meta: 'Expanding' });
  });

  it('under a lens: matches glow and grow, movements leave a hollow ring, the rest dims', () => {
    const nodes = buildStageNodes(model, input({ section: 'music', era: 'period:1970s' }));
    const bronx = node(nodes, 'place:new-york-city')!;
    expect(bronx.state).toBe(2);
    expect(bronx.expanding).toBe(false);
    expect(bronx.meta).toMatch(/^\d+ match/);
    expect(node(nodes, 'place:kingston')).toMatchObject({ state: 0, expanding: true, meta: '1 movement · no matching stories' });
    expect(node(nodes, 'place:miami')).toMatchObject({ state: 1, meta: 'No matches' });
    // few matches: they are all named on the stage
    expect(bronx.label).toBe(true);
    // a bigger count draws a bigger node
    const london = node(nodes, 'place:london')!;
    expect(london.size).toBeGreaterThanOrEqual(bronx.size);
  });

  it('"stories only" hides empty places but never the selection or a hovered row', () => {
    const kingston = cat.get('place:kingston') as Place;
    const nodes = buildStageNodes(model, input({ storiesOnly: true }, { place: kingston, scope: cat.placeScope(kingston.id), hot: 'place:wynwood' }));
    expect(node(nodes, 'place:kingston')?.state).toBe(3);
    expect(node(nodes, 'place:wynwood')).toMatchObject({ state: 2, label: true });
    const others = nodes.filter((n) => n.id !== 'place:kingston' && n.id !== 'place:wynwood');
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((n) => (model.counts.get(n.id) ?? 0) > 0)).toBe(true);
  });
});

describe('stage routes', () => {
  it('dims routes the lens excludes and keeps a selected route on top', () => {
    const lit = buildStageRoutes(cat, input({ era: 'period:1950s' }));
    expect(lit.find((r) => r.id === 'route:kingston-to-london')?.state).toBe(1);
    const dark = buildStageRoutes(cat, input({ era: 'period:1990s' }));
    expect(dark.every((r) => r.state === 0)).toBe(true);
    const route = cat.get('route:san-juan-to-new-york') as Route;
    const chosen = buildStageRoutes(cat, input({ era: 'period:1990s' }, { route }));
    expect(chosen.find((r) => r.id === route.id)?.state).toBe(3);
  });
});
