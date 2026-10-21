import { describe, expect, it } from 'vitest';
import { graphFor } from '../../shared/relations.ts';
import { decadeFor, entityHeader, resolveEntity, synapseHref } from '../../src/features/synapse/entity.ts';
import { KIND_ORDER, edgesOf, layoutGraph, wrapLabel } from '../../src/features/synapse/layout.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();

describe('layoutGraph', () => {
  const g1 = graphFor(cat, 'place:miami', { depth: 1, limit: 12 });
  const g2 = graphFor(cat, 'place:miami', { depth: 2, limit: 8 });

  it('is deterministic', () => {
    const a = layoutGraph(g1, 900);
    const b = layoutGraph(g1, 900);
    expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(b.nodes.map((n) => [n.id, n.x, n.y]));
    expect(a.edges.map((e) => e.d)).toEqual(b.edges.map((e) => e.d));
  });

  it('puts the entity at the centre and groups the first ring by kind', () => {
    const l = layoutGraph(g1, 900);
    const centre = l.byId.get('place:miami')!;
    expect(centre.x).toBeCloseTo(l.width / 2);
    expect(centre.y).toBeCloseTo(l.height / 2);
    const ring = l.order.slice(1).map((id) => l.byId.get(id)!).filter((n) => n.depth === 1);
    const ranks = ring.map((n) => KIND_ORDER.indexOf(n.kind));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const angles = ring.map((n) => n.angle);
    expect(angles).toEqual([...angles].sort((a, b) => a - b));
  });

  it('keeps every node inside the canvas, on desktop and mobile widths', () => {
    for (const w of [358, 820, 1000]) {
      for (const g of [g1, g2]) {
        const l = layoutGraph(g, w);
        expect(l.compact).toBe(w < 560);
        for (const n of l.nodes) {
          expect(n.x - n.r).toBeGreaterThanOrEqual(0);
          expect(n.x + n.r).toBeLessThanOrEqual(l.width);
          expect(n.y - n.r).toBeGreaterThanOrEqual(0);
          expect(n.y + n.r).toBeLessThanOrEqual(l.height);
        }
      }
    }
  });

  it('fans the second ring out from the node that brought it in', () => {
    const l = layoutGraph(g2, 900);
    const outer = l.nodes.filter((n) => n.depth === 2);
    expect(outer.length).toBeGreaterThan(0);
    for (const n of outer) {
      expect(l.byId.get(n.parent!)?.depth).toBe(1);
      expect(edgesOf(l, n.id)[0].from === n.parent || edgesOf(l, n.id)[0].to === n.parent).toBe(true);
      expect(n.caption.shown).toBe(false);
    }
  });

  it('draws one curved axon per graph edge', () => {
    const l = layoutGraph(g1, 900);
    expect(l.edges).toHaveLength(g1.edges.length);
    for (const e of l.edges) expect(e.d).toMatch(/^M[\d.-]+ [\d.-]+ Q[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
  });
});

describe('wrapLabel', () => {
  it('wraps into at most two lines and marks what it cut', () => {
    const lines = wrapLabel('Valid ID presents WAVEMAKERS: Puerto Rico, New York to London', 16);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(16);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(wrapLabel('Miami', 16)).toEqual(['Miami']);
    expect(wrapLabel('Supercalifragilistic', 8)).toEqual(['Superca…']);
  });
});

describe('entity resolution', () => {
  it('resolves by kind and slug, and redirects a wrong kind', () => {
    expect(resolveEntity(cat, 'place', 'miami')).toMatchObject({ kind: 'place', canonical: true });
    expect(resolveEntity(cat, 'person', 'miami')).toMatchObject({ kind: 'place', canonical: false });
    expect(resolveEntity(cat, 'category', 'music')).toMatchObject({ kind: 'interest', canonical: false });
    expect(resolveEntity(cat, 'route', 'san-juan-to-new-york')).toMatchObject({ kind: 'route', canonical: true });
    expect(resolveEntity(cat, 'place', 'atlantis')).toBeNull();
  });

  it('builds synapse addresses for every connectable kind', () => {
    expect(synapseHref(cat, 'place:miami')).toBe('/synapse/place/miami');
    expect(synapseHref(cat, 'person:valid-id')).toBe('/synapse/person/valid-id');
    expect(synapseHref(cat, 'route:san-juan-to-new-york')).toBe('/synapse/route/san-juan-to-new-york');
  });

  it('clamps decades into the chronometer range', () => {
    expect(decadeFor(cat, 1600)?.slug).toBe('1900s');
    expect(decadeFor(cat, 1973)?.slug).toBe('1970s');
    expect(decadeFor(cat, 2100)?.slug).toBe('2020s');
  });
});

describe('entity headers', () => {
  it('sends movements to the chronometer with the movement selected', () => {
    const h = entityHeader(cat, cat.get('movement:hip-hop')!, 'movement');
    expect(h.primary?.to).toBe('/time-machine/1970s?movement=hip-hop');
    expect(h.facts.find((f) => f.label === 'Drew on')?.items.map((i) => i.text)).toEqual(['Sound system culture']);
    expect(h.facts.find((f) => f.label === 'Echoed by')?.items.map((i) => i.text)).toEqual(['Miami bass']);
  });

  it('is honest about provisional people and programme status', () => {
    const person = entityHeader(cat, cat.get('person:valid-id')!, 'person');
    expect(person.notices.join(' ')).toMatch(/Provisional/);
    const prog = entityHeader(cat, cat.get('programme:wavemakers-pr-ny-london')!, 'programme');
    expect(prog.notices).toContain('In development.');
    expect(prog.facts.find((f) => f.label === 'Origin')?.items[0].text).toBe('Monumental Original');
    const demo = entityHeader(cat, cat.get('programme:open-archive')!, 'programme');
    expect(demo.facts.find((f) => f.label === 'Origin')?.items[0].text).toMatch(/not a Monumental Original/);
  });

  it('separates setting, making and publication for stories', () => {
    const h = entityHeader(cat, cat.get('video:subway-1905')!, 'video', new Date('2026-10-20T12:00:00Z'));
    const fact = (l: string) => h.facts.find((f) => f.label === l)?.items[0].text;
    expect(fact('Set')).toBe('1904–1905');
    expect(fact('Made')).toBe('1905');
    expect(fact('Published')).toBeTruthy();
    expect(h.primary?.label).toBe('Watch');
    const planned = entityHeader(cat, cat.get('video:wavemakers-ep1')!, 'video');
    expect(planned.primary?.label).toBe('Story details');
  });

  it('opens places in World', () => {
    const h = entityHeader(cat, cat.get('place:wynwood')!, 'place');
    expect(h.primary).toMatchObject({ label: 'Open in World', to: '/world/wynwood' });
    expect(h.facts[0]).toMatchObject({ label: 'Part of' });
    expect(h.facts[0].items[0]).toEqual({ text: 'Miami', to: '/synapse/place/miami' });
  });
});
