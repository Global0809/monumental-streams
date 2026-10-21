import { describe, expect, it } from 'vitest';
import type { EntityKind } from '../../shared/catalogue.ts';
import { connectionsFor, explainPair, graphFor, relate, relatedVideos } from '../../shared/relations.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const labels = (a: string, b: string) => explainPair(cat, a, b).map((r) => r.label);

describe('explainPair', () => {
  it('explains place family ties', () => {
    expect(labels('video:wynwood-walls', 'video:miami-bass-reel')).toContain('Wynwood is part of Miami');
    expect(labels('place:miami', 'video:wynwood-walls')).toEqual(['Wynwood is part of Miami']);
    expect(labels('video:wynwood-walls', 'video:south-beach-deco')).toContain('Both in Miami-Dade County');
  });

  it('explains shared places, people and series order', () => {
    const reasons = explainPair(cat, 'video:wavemakers-ep1', 'video:wavemakers-ep2');
    expect(reasons[0]).toEqual({ kind: 'series-order', label: 'Next in WAVEMAKERS: Puerto Rico, New York to London', via: 'programme:wavemakers-pr-ny-london' });
    expect(reasons.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Presented by Valid ID', 'Both set in New York City', 'Shares the theme Diaspora', 'Both Music']),
    );
    expect(labels('video:wavemakers-ep2', 'video:wavemakers-ep1')[0]).toBe('Previous in WAVEMAKERS: Puerto Rico, New York to London');
    expect(labels('video:wavemakers-teaser', 'video:wavemakers-ep1')).toContain('Both part of WAVEMAKERS');
  });

  it('explains cultural routes between places', () => {
    expect(labels('video:viejo-san-juan', 'video:subway-1905')).toContain('Linked by La Gran Migración (San Juan → New York City, 1945–1965)');
    expect(labels('route:san-juan-to-new-york', 'video:viejo-san-juan')[0]).toBe('On La Gran Migración (San Juan → New York City, 1945–1965)');
  });

  it('explains movement lineage, shared periods, themes and categories', () => {
    const reasons = labels('video:block-party', 'video:brixton-sound');
    expect(reasons).toEqual(['Hip hop drew on Sound system culture', 'Both set in the 1970s', 'Shares the theme Youth', 'Both Music']);
    expect(labels('movement:miami-bass', 'movement:hip-hop')).toContain('Miami bass drew on Hip hop');
  });

  it('phrases reasons from the point of view of an entity itself', () => {
    expect(labels('period:1970s', 'video:bomba-loiza')).toEqual(['Set in the 1970s']);
    expect(labels('person:valid-id', 'video:wavemakers-ep1')).toContain('Presented by Valid ID');
    expect(labels('person:ana-colon', 'video:bomba-loiza')).toContain('Features Ana Colón');
    expect(labels('programme:wavemakers', 'video:wavemakers-ep1')[0]).toBe('Part of WAVEMAKERS');
    expect(labels('programme:wavemakers', 'programme:wavemakers-pr-ny-london')[0]).toBe('WAVEMAKERS: Puerto Rico, New York to London is a chapter of WAVEMAKERS');
    expect(labels('theme:diaspora', 'video:bomba-loiza')).toEqual(['Explores Diaspora']);
    expect(labels('interest:music', 'movement:hip-hop')).toEqual(['Filed under Music']);
    expect(labels('movement:hip-hop', 'place:bronx')).toEqual(['Rooted in The Bronx']);
  });

  it('returns nothing for unrelated, unknown or identical ids', () => {
    expect(explainPair(cat, 'video:signal-loop', 'video:subway-1905')).toEqual([]);
    expect(explainPair(cat, 'video:nope', 'video:subway-1905')).toEqual([]);
    expect(explainPair(cat, 'video:subway-1905', 'video:subway-1905')).toEqual([]);
  });

  it('weighs a pair the same in both directions', () => {
    const ids = [...cat.videos, ...cat.places, ...cat.movements, ...cat.people, ...cat.routes, ...cat.programmes].map((e) => e.id);
    for (const a of ids) for (const b of ids) expect(relate(cat, a, b).weight).toBe(relate(cat, b, a).weight);
  });

  it('sorts reasons strongest first with documented weights', () => {
    const { reasons, weight } = relate(cat, 'video:block-party', 'video:brixton-sound');
    expect(reasons.map((r) => r.kind)).toEqual(['lineage', 'period', 'theme', 'category']);
    expect(weight).toBe(2 + 2 + 1.5 + 1);
  });
});

describe('connectionsFor', () => {
  it.each<[string, EntityKind]>([
    ['video:bomba-loiza', 'video'],
    ['programme:open-archive', 'programme'],
    ['place:miami', 'place'],
    ['period:1970s', 'period'],
    ['movement:hip-hop', 'movement'],
    ['person:desmond-hale', 'person'],
    ['interest:film', 'interest'],
    ['theme:architecture', 'theme'],
    ['route:kingston-to-london', 'route'],
  ])('connects %s (%s) with explained, ranked connections', (id) => {
    const list = connectionsFor(cat, id);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c) => c.target !== id && c.reasons.length > 0 && c.weight > 0)).toBe(true);
    expect(list.map((c) => c.weight)).toEqual([...list.map((c) => c.weight)].sort((a, b) => b - a));
  });

  it('respects limit and kinds', () => {
    const videos = connectionsFor(cat, 'place:miami', { kinds: ['video'], limit: 3 });
    expect(videos).toHaveLength(3);
    expect(videos.every((c) => c.target.startsWith('video:'))).toBe(true);
    expect(connectionsFor(cat, 'place:miami', { kinds: ['video'] }).map((c) => c.target)).toContain('video:wynwood-walls');
  });
});

describe('relatedVideos', () => {
  it('excludes the video itself and ranks by weight', () => {
    const list = relatedVideos(cat, 'video:block-party');
    expect(list.map((r) => r.video.id)).not.toContain('video:block-party');
    expect(list[0].video.slug).toBe('wavemakers-ep2');
    expect(list.map((r) => r.weight)).toEqual([...list.map((r) => r.weight)].sort((a, b) => b - a));
    expect(relatedVideos(cat, 'video:block-party', 2)).toHaveLength(2);
  });

  it('ranks non-playable titles below playable ones of equal weight', () => {
    for (const id of cat.videos.map((v) => v.id)) {
      const list = relatedVideos(cat, id, 50);
      for (let i = 1; i < list.length; i++) {
        if (list[i].weight === list[i - 1].weight && cat.isPlayable(list[i].video)) expect(cat.isPlayable(list[i - 1].video)).toBe(true);
      }
    }
  });

  it('returns nothing for non-video ids', () => {
    expect(relatedVideos(cat, 'place:miami')).toEqual([]);
  });
});

describe('graphFor', () => {
  it('builds a one-hop graph around any entity', () => {
    const { nodes, edges } = graphFor(cat, 'movement:hip-hop', { limit: 5 });
    expect(nodes[0]).toMatchObject({ id: 'movement:hip-hop', kind: 'movement', label: 'Hip hop', depth: 0 });
    expect(nodes.filter((n) => n.depth === 1)).toHaveLength(5);
    expect(edges.filter((e) => e.from === 'movement:hip-hop')).toHaveLength(5);
  });

  it('expands to depth 2 with unique nodes and valid, explained edges', () => {
    const { nodes, edges } = graphFor(cat, 'place:san-juan', { depth: 2, limit: 6 });
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(nodes.some((n) => n.depth === 2)).toBe(true);
    for (const e of edges) {
      expect(ids).toContain(e.from);
      expect(ids).toContain(e.to);
      expect(e.reasons.length).toBeGreaterThan(0);
    }
    const keys = edges.map((e) => [e.from, e.to].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is empty for unknown ids', () => {
    expect(graphFor(cat, 'place:atlantis')).toEqual({ nodes: [], edges: [] });
  });
});
