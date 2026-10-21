import { describe, expect, it } from 'vitest';
import { constellation, ORBIT_SIZE, RING_ORDER } from '../../src/features/you/constellation.ts';
import { firstName, greeting, initials, parseTab, TAB_LABELS, YOU_TABS } from '../../src/features/you/helpers.ts';

describe('My World tabs', () => {
  it('offers the nine sections in order, Settings and Membership included', () => {
    expect(YOU_TABS.map((t) => TAB_LABELS[t])).toEqual(['Continue', 'Saved', 'Places', 'Journeys', 'History', 'Interests', 'For you', 'Settings', 'Membership']);
    expect(parseTab('places')).toBe('places');
    expect(parseTab('settings')).toBe('settings');
    expect(parseTab('you')).toBe('continue');
  });
});

describe('greeting', () => {
  it('follows the local hour', () => {
    expect(greeting(5)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good afternoon');
    expect(greeting(18)).toBe('Good evening');
    expect(greeting(0)).toBe('Good evening');
    expect(greeting(4)).toBe('Good evening');
  });

  it('uses the first name and up to two initials', () => {
    expect(firstName('Ana María Colón')).toBe('Ana');
    expect(firstName('  QA Reviewer ')).toBe('QA');
    expect(firstName(null)).toBe('');
    expect(initials('Ana María Colón')).toBe('AM');
    expect(initials('prana')).toBe('P');
    expect(initials('')).toBe('');
  });
});

describe('constellation', () => {
  const empty = { continue: [], saved: [], places: [], journeys: [] };

  it('draws every ring, even empty ones, and no nodes for an empty library', () => {
    const { rings, nodes } = constellation(empty);
    expect(rings.map((r) => r.id)).toEqual(RING_ORDER);
    expect(rings.every((r) => r.count === 0)).toBe(true);
    expect(nodes).toEqual([]);
    // rings nest outward in order and stay inside the drawing
    for (let i = 1; i < rings.length; i++) expect(rings[i].r).toBeGreaterThan(rings[i - 1].r);
    expect(rings[rings.length - 1].r).toBeLessThan(ORBIT_SIZE / 2);
  });

  it('places one node per real item on its ring', () => {
    const { nodes } = constellation({
      ...empty,
      continue: [{ id: 'video:a', label: 'A', progress: 0.4 }],
      saved: [
        { id: 'video:b', label: 'B' },
        { id: 'video:c', label: 'C' },
      ],
      places: [{ id: 'place:london', label: 'London', stamp: true }],
    });
    expect(nodes.map((n) => [n.id, n.ring])).toEqual([
      ['video:a', 'continue'],
      ['video:b', 'saved'],
      ['video:c', 'saved'],
      ['place:london', 'places'],
    ]);
    const c = ORBIT_SIZE / 2;
    for (const n of nodes) {
      const r = Math.hypot(n.x - c, n.y - c);
      expect(r).toBeGreaterThan(100);
      expect(r).toBeLessThan(c);
    }
    // two saved stories sit opposite each other
    const [b, cc] = nodes.filter((n) => n.ring === 'saved');
    expect(Math.abs(cc.angle - b.angle)).toBeCloseTo(180);
    expect(nodes.find((n) => n.id === 'place:london')?.stamp).toBe(true);
    expect(nodes[0].progress).toBe(0.4);
  });

  it('caps a crowded ring and reports what it left out', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `video:${i}`, label: String(i) }));
    const { rings, nodes } = constellation({ ...empty, saved: many }, 12);
    expect(nodes).toHaveLength(12);
    expect(rings.find((r) => r.id === 'saved')).toMatchObject({ count: 30, hidden: 18 });
  });
});
