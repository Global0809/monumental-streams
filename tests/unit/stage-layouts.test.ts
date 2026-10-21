import { describe, expect, it } from 'vitest';
import type { Arrangement } from '../../src/stage/contract.ts';
import {
  dot3,
  GLOBE_RADIUS,
  HELIX_AXIS,
  helixAxisPoint,
  highlightFactor,
  latLonToVec,
  layoutFor,
  migrationDelay,
  norm,
  ORGAN_SECTIONS,
  organPosition,
  rotateY,
  seedYear,
  slotPosition,
  vecToLatLon,
  type FormLayout,
  type LayoutInput,
  type Vec3,
} from '../../src/stage/layouts.ts';
import { layoutContext, placeCoords, routeInfos, seedInfos } from '../../src/stage/model.ts';
import { fixtureCatalogue, NOW } from './fixture.ts';

const cat = fixtureCatalogue();
const seeds = seedInfos(cat, NOW);
const places = placeCoords(cat);
const routes = routeInfos(cat, places);
const input = (arrangement: Arrangement, extra: Partial<LayoutInput> = {}): LayoutInput => ({
  ...layoutContext(cat, arrangement, { seeds, saved: [], aspect: 1.6, places, routes }),
  ...extra,
});
const form = (a: Arrangement, extra: Partial<LayoutInput> = {}) => layoutFor(input(a, extra));
const slot = (f: FormLayout, id: string) => f.seeds.find((s) => s.id === id)!;

const ALL: Arrangement[] = [
  { kind: 'home', featured: 'video:wavemakers-teaser' },
  { kind: 'home' },
  { kind: 'world' },
  { kind: 'world', place: 'place:miami' },
  { kind: 'world', route: 'route:kingston-to-london' },
  { kind: 'time' },
  { kind: 'time', decade: 1970 },
  { kind: 'time', decade: 1900, year: 1905, lens: 'made' },
  { kind: 'time', lens: 'published' },
  { kind: 'category', section: 'music' },
  { kind: 'category', section: 'live' },
  { kind: 'focus', video: 'video:block-party' },
  { kind: 'focus', programme: 'programme:open-archive' },
  { kind: 'focus', video: 'video:signal-loop', related: ['video:wynwood-walls', 'video:nope'] },
  { kind: 'watch', video: 'video:subway-1905' },
  { kind: 'personal' },
  { kind: 'quiet' },
];

const finite = (v: Vec3) => v.every((n) => Number.isFinite(n));
const angleDeg = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot3(norm(a), norm(b))))) * 180) / Math.PI;

describe('seed model', () => {
  it('derives one seed per video with sections, places, years and access marks', () => {
    expect(seeds.map((s) => s.id)).toEqual(cat.videos.map((v) => v.id));
    const ep1 = seeds.find((s) => s.id === 'video:wavemakers-ep1')!;
    expect(ep1.planned).toBe(true);
    expect(ep1.premium).toBe(true);
    const block = seeds.find((s) => s.id === 'video:block-party')!;
    expect(block.sections).toContain('music');
    expect(block.sections).toContain('culture');
    expect(block.place?.id).toBe('place:bronx');
    expect(seeds.find((s) => s.id === 'video:signal-loop')!.place).toBeNull();
    expect(seeds.find((s) => s.id === 'video:subway-1905')!.years).toMatchObject({ made: 1905, published: 2026, setting: { from: 1904, to: 1905 } });
  });
});

describe('every form', () => {
  it.each(ALL.map((a) => [JSON.stringify(a), a] as const))('%s places every seed finitely, with the same ids in order', (_k, a) => {
    const f = form(a);
    expect(f.seeds.map((s) => s.id)).toEqual(seeds.map((s) => s.id));
    for (const s of f.seeds) {
      for (const t of [0, 7.3, 120]) expect(finite(slotPosition(s, f, t))).toBe(true);
      expect(Number.isFinite(s.scale) && s.scale > 0).toBe(true);
      expect(s.presence).toBeGreaterThanOrEqual(0);
      expect(s.presence).toBeLessThanOrEqual(1);
    }
    expect(finite(f.camera.pos) && finite(f.camera.target)).toBe(true);
    for (const o of f.organs) expect(finite(organPosition(o, f, 3))).toBe(true);
  });

  it('migration keeps identity: the seed set is the same in every form and transitions stay short', () => {
    const ids = seeds.map((s) => s.id).join('|');
    for (const a of ALL) expect(form(a).seeds.map((s) => s.id).join('|')).toBe(ids);
    for (let i = 0; i < seeds.length; i++) {
      const d = migrationDelay(i, seeds.length, seeds[i].id);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(0.42);
    }
    expect(migrationDelay(0, 1)).toBe(0);
  });
});

describe('home constellation', () => {
  const f = form({ kind: 'home', featured: 'video:wavemakers-teaser' });
  it('reserves nine organ slots around the spine', () => {
    expect(f.organs.map((o) => o.section)).toEqual(ORGAN_SECTIONS);
    expect(f.organs).toHaveLength(9);
    for (const o of f.organs) expect(Math.hypot(o.pos[0], o.pos[2])).toBeGreaterThan(8);
    expect(f.furniture.spine).toBe(1);
  });
  it('the featured seed floats nearest the camera and does not orbit', () => {
    const feat = slot(f, 'video:wavemakers-teaser');
    expect(feat.role).toBe('featured');
    expect(feat.fixed).toBe(true);
    const cam = f.camera.pos;
    const d = (s: (typeof f.seeds)[number]) => Math.hypot(...(slotPosition(s, f, 0).map((v, i) => v - cam[i]) as Vec3));
    for (const s of f.seeds) if (s !== feat) expect(d(feat)).toBeLessThan(d(s));
    expect(slotPosition(feat, f, 50)).toEqual(slotPosition(feat, f, 0));
  });
  it('seeds orbit their organ (music stories circle the music organ)', () => {
    const music = f.organs.find((o) => o.section === 'music')!;
    const s = slot(f, 'video:brixton-sound');
    expect(s.center).toEqual(music.pos);
    const r = Math.hypot(...s.offset);
    expect(r).toBeGreaterThan(music.radius);
  });
});

describe('world globe', () => {
  it('seeds sit at their real places (direction matches lat/lon)', () => {
    const f = form({ kind: 'world' });
    for (const info of seeds) {
      const s = slot(f, info.id);
      if (!info.place) {
        expect(s.role).toBe('pool');
        continue;
      }
      const p = slotPosition(s, f, 0);
      const r = Math.hypot(...p);
      expect(r).toBeGreaterThan(GLOBE_RADIUS);
      expect(r).toBeLessThan(GLOBE_RADIUS * 1.2);
      // clustered seeds may step a few degrees aside, never more
      expect(angleDeg(p, latLonToVec(info.place.lat, info.place.lon))).toBeLessThan(8);
    }
  });
  it('a lone seed is exactly above its place', () => {
    const f = form({ kind: 'world' });
    const bronx = seeds.find((s) => s.id === 'video:block-party')!;
    const ll = vecToLatLon(slotPosition(slot(f, bronx.id), f, 0));
    expect(ll.lat).toBeCloseTo(bronx.place!.lat, 4);
    expect(ll.lon).toBeCloseTo(bronx.place!.lon, 4);
  });
  it('focusing a place points the camera at it and emphasises its stories', () => {
    const f = form({ kind: 'world', place: 'place:miami' });
    const [lat, lon] = places.get('place:miami')!;
    expect(angleDeg(f.camera.pos, latLonToVec(lat, lon))).toBeLessThan(4);
    const inside = slot(f, 'video:wynwood-walls'); // Wynwood ⊂ Miami
    const outside = slot(f, 'video:brixton-sound');
    expect(inside.scale).toBeGreaterThan(outside.scale);
    expect(inside.presence).toBeGreaterThan(outside.presence);
    expect(f.world?.place).toBe('place:miami');
  });
  it('a route frames the midpoint of its arc', () => {
    const f = form({ kind: 'world', route: 'route:kingston-to-london' });
    const k = latLonToVec(...places.get('place:kingston')!);
    const l = latLonToVec(...places.get('place:london')!);
    const mid = norm([k[0] + l[0], k[1] + l[1], k[2] + l[2]]);
    expect(angleDeg(f.camera.pos, mid)).toBeLessThan(4);
    expect(f.world?.route).toBe('route:kingston-to-london');
  });
});

describe('time helix', () => {
  const along = (p: Vec3) => dot3(p, HELIX_AXIS);
  it('orders seeds along the spine by setting year', () => {
    const f = form({ kind: 'time' });
    const placed = seeds
      .filter((s) => s.years.setting)
      .map((s) => ({ y: s.years.setting!.from, u: along(slotPosition(slot(f, s.id), f, 0)) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) if (placed[i].y > placed[i - 1].y + 1) expect(placed[i].u).toBeGreaterThan(placed[i - 1].u);
    expect(slot(f, 'video:signal-loop').role).toBe('pool'); // timeless → dim pool
    expect(slot(f, 'video:signal-loop').presence).toBeLessThan(0.5);
  });
  it('the made lens re-sorts: only archive films with a production year are on the spine', () => {
    const f = form({ kind: 'time', lens: 'made' });
    expect(slot(f, 'video:subway-1905').role).toBe('member');
    expect(slot(f, 'video:block-party').role).toBe('pool');
    expect(seedYear(seeds.find((s) => s.id === 'video:viejo-san-juan')!, 'made')).toBe(1950);
  });
  it('a decade focus moves the camera along the spine and lights its stories', () => {
    const a = form({ kind: 'time', decade: 1900 });
    const b = form({ kind: 'time', decade: 1970 });
    expect(along(b.camera.target)).toBeGreaterThan(along(a.camera.target));
    expect(Math.abs(along(b.camera.target) - along(helixAxisPoint(1975)))).toBeLessThan(2);
    expect(slot(b, 'video:block-party').presence).toBe(1);
    expect(slot(b, 'video:subway-1905').presence).toBeLessThan(1);
  });
  it('a story spanning the focused decade gathers inside it', () => {
    const ep1 = seeds.find((s) => s.id === 'video:wavemakers-ep1')!; // 1945–1965
    expect(seedYear(ep1, 'setting', { from: 1950, to: 1959 })).toBeCloseTo(1954.5);
    expect(seedYear(ep1, 'setting')).toBe(1945);
  });
});

describe('category chamber', () => {
  it('gathers exactly the section members around its organ; everything else recedes', () => {
    const f = form({ kind: 'category', section: 'music' });
    expect(f.organs).toHaveLength(1);
    expect(f.organs[0].section).toBe('music');
    for (const info of seeds) {
      const s = slot(f, info.id);
      if (info.sections.includes('music')) {
        expect(s.role).toBe('member');
        expect(Math.hypot(...s.offset)).toBeGreaterThan(f.organs[0].radius);
      } else {
        expect(s.role).toBe('recede');
        expect(s.presence).toBeLessThan(0.3);
        expect(slotPosition(s, f, 0)[2]).toBeLessThan(-15);
      }
    }
    expect(f.tint).toBe('music');
  });
  it('Live has its organ and no members yet (honest empty state)', () => {
    const f = form({ kind: 'category', section: 'live' });
    expect(f.organs.map((o) => o.section)).toEqual(['live']);
    expect(f.seeds.every((s) => s.role === 'recede')).toBe(true);
  });
});

describe('focus', () => {
  it('brings the story forward and rings its related seeds with filaments', () => {
    const f = form({ kind: 'focus', video: 'video:block-party', related: ['video:bomba-loiza', 'video:brixton-sound', 'video:miami-bass-reel'] });
    const focus = slot(f, 'video:block-party');
    expect(focus.role).toBe('focus');
    expect(focus.selected).toBe(true);
    const rel = f.seeds.filter((s) => s.role === 'related');
    expect(rel.map((s) => s.id).sort()).toEqual(['video:bomba-loiza', 'video:brixton-sound', 'video:miami-bass-reel']);
    expect(f.filaments).toEqual(rel.map((s) => ({ from: 'video:block-party', to: s.id })).sort((a, b) => ['video:bomba-loiza', 'video:brixton-sound', 'video:miami-bass-reel'].indexOf(a.to) - ['video:bomba-loiza', 'video:brixton-sound', 'video:miami-bass-reel'].indexOf(b.to)));
    const fp = slotPosition(focus, f, 0);
    const radii = rel.map((s) => Math.hypot(...(slotPosition(s, f, 0).map((v, i) => v - fp[i]) as Vec3)));
    for (const r of radii) {
      expect(r).toBeGreaterThan(2);
      expect(r).toBeLessThan(9);
    }
    // the focus seed is the one nearest the camera
    const cam = f.camera.pos;
    const dist = (p: Vec3) => Math.hypot(p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]);
    for (const s of f.seeds) if (s !== focus) expect(dist(fp)).toBeLessThan(dist(slotPosition(s, f, 0)));
  });
  it('resolves related seeds from the catalogue when the page gives none, and ignores unknown ids', () => {
    const f = form({ kind: 'focus', video: 'video:block-party' });
    expect(f.seeds.filter((s) => s.role === 'related').length).toBeGreaterThan(0);
    const g = form({ kind: 'focus', video: 'video:signal-loop', related: ['video:wynwood-walls', 'video:nope'] });
    expect(g.filaments).toEqual([{ from: 'video:signal-loop', to: 'video:wynwood-walls' }]);
  });
  it('a programme focus brings its first story forward and rings the rest', () => {
    const f = form({ kind: 'focus', programme: 'programme:open-archive' });
    expect(slot(f, 'video:subway-1905').role).toBe('focus');
    expect(slot(f, 'video:viejo-san-juan').role).toBe('related');
  });
});

describe('watch, personal, quiet', () => {
  it('watch: everything recedes and dims, energy drops to zero', () => {
    const f = form({ kind: 'watch', video: 'video:subway-1905' });
    expect(f.energy).toBe(0);
    for (const s of f.seeds) expect(s.presence).toBeLessThanOrEqual(0.3);
  });
  it('personal: saved seeds orbit the core, others are faint', () => {
    const f = form({ kind: 'personal' }, { saved: ['video:bomba-loiza', 'video:gone', 'video:subway-1905'] });
    expect(slot(f, 'video:bomba-loiza').role).toBe('saved');
    expect(slot(f, 'video:subway-1905').role).toBe('saved');
    expect(slot(f, 'video:block-party').presence).toBeLessThan(0.2);
    expect(f.furniture.core).toBe(1);
    const p = slotPosition(slot(f, 'video:bomba-loiza'), f, 0);
    expect(Math.hypot(...p)).toBeGreaterThan(3);
    expect(Math.hypot(...p)).toBeLessThan(8);
  });
  it('quiet: a calm low-intensity field', () => {
    const f = form({ kind: 'quiet' });
    expect(f.seeds.every((s) => s.presence < 0.5)).toBe(true);
    expect(f.organs).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('lat/lon round-trips and rotateY preserves length', () => {
    const v = latLonToVec(25.76, -80.19, 3);
    const ll = vecToLatLon(v);
    expect(ll.lat).toBeCloseTo(25.76, 6);
    expect(ll.lon).toBeCloseTo(-80.19, 6);
    expect(Math.hypot(...rotateY(v, 1.3))).toBeCloseTo(3, 9);
  });
  it('highlight dims everything outside the set', () => {
    expect(highlightFactor('a', null)).toEqual({ presence: 1, scale: 1 });
    expect(highlightFactor('a', ['a']).presence).toBe(1);
    expect(highlightFactor('b', new Set(['a'])).presence).toBeLessThan(0.5);
  });
});
