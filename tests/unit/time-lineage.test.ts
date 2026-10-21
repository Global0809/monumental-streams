import { describe, expect, it } from 'vitest';
import type { Period } from '../../shared/types.ts';
import { decadeContext, videosInLens } from '../../src/features/time/chrono.ts';
import { lineageEdges, nodeKey, threadOf } from '../../src/features/time/lineage.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const p = cat.bySlug('period', '1970s') as Period;
const ctx = decadeContext(cat, p, videosInLens(cat, p, 'setting'));
const edges = lineageEdges(ctx);

describe('connections through time', () => {
  it('draws only recorded relations: roots → era → echoes → today', () => {
    // hip hop (alive in the 1970s) drew on sound-system culture
    expect(edges).toContainEqual({ from: nodeKey('root', 'movement:sound-system'), to: nodeKey('now', 'movement:hip-hop') });
    // Miami bass (1985) lists hip hop as an influence: an echo forward
    expect(edges).toContainEqual({ from: nodeKey('now', 'movement:hip-hop'), to: nodeKey('echo', 'movement:miami-bass') });
    // every "today" item hangs from the movement it was found through
    for (const t of ctx.today) expect(edges.some((e) => e.to === nodeKey('today', t.id) && e.from.endsWith(`|${t.through}`))).toBe(true);
    // every edge points forward through the strands, or stays within echoes
    const order = { root: 0, now: 1, echo: 2, today: 3 } as const;
    for (const e of edges) {
      const a = order[e.from.split('|')[0] as keyof typeof order];
      const b = order[e.to.split('|')[0] as keyof typeof order];
      expect(e.within ? a === 2 && b === 2 : b > a).toBe(true);
    }
  });

  it('lights a whole thread upstream and downstream, and nothing beside it', () => {
    const thread = threadOf(edges, nodeKey('now', 'movement:hip-hop'));
    expect(thread.has(nodeKey('root', 'movement:sound-system'))).toBe(true);
    expect(thread.has(nodeKey('echo', 'movement:miami-bass'))).toBe(true);
    expect(thread.has(nodeKey('now', 'movement:nuyorican'))).toBe(false);
    expect(threadOf([], 'x')).toEqual(new Set(['x']));
  });
});
