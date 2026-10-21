/**
 * Connections through time — the lineage as a graph (pure).
 *
 * Four strands, left to right: roots (what the era drew on) → the movements alive then →
 * echoes forward (later movements that list them as an influence, two generations) → what on
 * Monumental today carries the thread. Every edge is a recorded relation, never inferred.
 */
import type { ID } from '../../../shared/types.ts';
import type { DecadeContext } from './chrono.ts';

export type Strand = 'root' | 'now' | 'echo' | 'today';

export interface LineageEdge {
  from: string; // node key
  to: string;
  /** Edges between two echoes stay in one column. */
  within?: boolean;
}

export const nodeKey = (strand: Strand, id: ID) => `${strand}|${id}`;

export function lineageEdges(ctx: DecadeContext): LineageEdge[] {
  const edges: LineageEdge[] = [];
  const echoIds = new Set(ctx.echoes.map((e) => e.echo.id));
  for (const r of ctx.roots) for (const m of r.into) edges.push({ from: nodeKey('root', r.root.id), to: nodeKey('now', m.id) });
  for (const e of ctx.echoes) {
    for (const f of e.from) {
      if (e.generation === 1) edges.push({ from: nodeKey('now', f.id), to: nodeKey('echo', e.echo.id) });
      else if (echoIds.has(f.id)) edges.push({ from: nodeKey('echo', f.id), to: nodeKey('echo', e.echo.id), within: true });
    }
  }
  for (const t of ctx.today) {
    const strand: Strand = echoIds.has(t.through) ? 'echo' : 'now';
    edges.push({ from: nodeKey(strand, t.through), to: nodeKey('today', t.id) });
  }
  return edges;
}

/** Every node upstream and downstream of `key` (including it): the thread a hover lights. */
export function threadOf(edges: LineageEdge[], key: string): Set<string> {
  const out = new Set<string>([key]);
  const walk = (start: string, dir: 'up' | 'down') => {
    const stack = [start];
    while (stack.length) {
      const k = stack.pop()!;
      for (const e of edges) {
        const next = dir === 'down' ? (e.from === k ? e.to : null) : e.to === k ? e.from : null;
        if (next && !out.has(next)) {
          out.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk(key, 'down');
  walk(key, 'up');
  return out;
}
