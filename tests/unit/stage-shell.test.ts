/**
 * The shell's side of the living world: default arrangements per route, the director that
 * lets pages win, playback → watch, navigation previews, palette destinations and the
 * destination hues shared by CSS and the 3D world.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { SECTIONS, sectionById, videosForSection } from '../../shared/sections.ts';
import { arrangementKey, decadeFromSlug, defaultArrangement, organOf, previewableSection, tintFor, watchingArrangement } from '../../src/app/arrangement.ts';
import { matchingSections } from '../../src/app/palette-options.ts';
import { createArrangementDirector, endPreview, previewStore, startPreview } from '../../src/app/world.ts';
import { createStore } from '../../src/lib/store.ts';
import type { StageState } from '../../src/stage/contract.ts';
import { SECTION_HUES } from '../../src/styles/hues.ts';
import { fixtureCatalogue } from './fixture.ts';

const cat = fixtureCatalogue();
const freshStage = () => createStore<StageState>({ arrangement: { kind: 'quiet' }, highlight: null, hovered: null, hoveredPlace: null, quality: 'off', ready: false });

describe('default arrangement per route', () => {
  it('home, my world and utility pages', () => {
    expect(defaultArrangement('/', '', cat)).toEqual({ kind: 'home' });
    expect(defaultArrangement('/my-world', '?tab=saved', cat)).toEqual({ kind: 'personal' });
    for (const p of ['/catalogue', '/search', '/about', '/account', '/membership', '/somewhere', '/passport', '/synapse/place/miami', '/nope/at/all']) {
      expect(defaultArrangement(p, '', cat)).toEqual({ kind: 'quiet' });
    }
  });

  it('world, with the place from the slug when it exists', () => {
    expect(defaultArrangement('/world', '', cat)).toEqual({ kind: 'world' });
    expect(defaultArrangement('/world/miami', '', cat)).toEqual({ kind: 'world', place: 'place:miami' });
    expect(defaultArrangement('/world/atlantis', '', cat)).toEqual({ kind: 'world' });
  });

  it('time machine: decade from the slug, year and lens from the query', () => {
    expect(defaultArrangement('/time-machine', '', cat)).toEqual({ kind: 'time' });
    expect(defaultArrangement('/time-machine/1970s', '', cat)).toEqual({ kind: 'time', decade: 1970 });
    expect(defaultArrangement('/time-machine/1970s', '?year=1973&lens=made', cat)).toEqual({ kind: 'time', decade: 1970, year: 1973, lens: 'made' });
    expect(defaultArrangement('/time-machine/1942', '', cat)).toEqual({ kind: 'time', decade: 1940, year: 1942 });
    expect(defaultArrangement('/time-machine', '?lens=sideways', cat)).toEqual({ kind: 'time' });
  });

  it('every category destination (and Live) opens its chamber', () => {
    for (const s of SECTIONS.filter((x) => x.kind === 'category' || x.kind === 'live')) {
      expect(defaultArrangement(s.path, '', cat)).toEqual({ kind: 'category', section: s.id });
    }
  });

  it('stories and programmes come into focus', () => {
    expect(defaultArrangement('/watch/subway-1905', '?t=12', cat)).toEqual({ kind: 'focus', video: 'video:subway-1905' });
    expect(defaultArrangement('/programme/wavemakers', '', cat)).toEqual({ kind: 'focus', programme: 'programme:wavemakers' });
    expect(defaultArrangement('/watch/missing', '', cat)).toEqual({ kind: 'focus' });
  });

  it('helpers', () => {
    expect(organOf('/world/miami')).toBe('world');
    expect(organOf('/')).toBe('');
    expect(decadeFromSlug(cat, '1950s')).toEqual({ decade: 1950 });
    expect(decadeFromSlug(cat, "1990's")).toEqual({ decade: 1990 });
    expect(decadeFromSlug(cat, 'whenever')).toEqual({});
    expect(watchingArrangement({ kind: 'focus', video: 'video:subway-1905' }, '/watch/subway-1905', cat)).toEqual({ kind: 'watch', video: 'video:subway-1905' });
    expect(watchingArrangement({ kind: 'home' }, '/', cat)).toBeNull();
    expect(tintFor({ kind: 'category', section: 'music' })).toBe('music');
    expect(tintFor({ kind: 'time' })).toBe('time-machine');
    expect(tintFor({ kind: 'quiet' })).toBeNull();
    expect(previewableSection('movies')).toBe(true);
    expect(previewableSection('live')).toBe(false);
    expect(previewableSection('home')).toBe(false);
  });
});

describe('arrangement director', () => {
  it('applies the route default and resets highlight when the destination changes', () => {
    const stage = freshStage();
    const d = createArrangementDirector(cat, stage);
    stage.set((s) => ({ ...s, highlight: ['video:subway-1905'] }));
    d.route('/movies', '');
    expect(stage.get().arrangement).toEqual({ kind: 'category', section: 'movies' });
    expect(stage.get().highlight).toBeNull();
  });

  it("a page's own arrangement wins and is kept within the same page", () => {
    const stage = freshStage();
    const d = createArrangementDirector(cat, stage);
    d.route('/world', '');
    // the page declares its own (passive effect, after the shell)
    stage.set((s) => ({ ...s, arrangement: { kind: 'world', route: 'route:x' } }));
    d.route('/world/miami', '');
    expect(stage.get().arrangement).toEqual({ kind: 'world', route: 'route:x' });
    // a different destination: the shell sets the new default again
    d.route('/time-machine/1970s', '');
    expect(stage.get().arrangement).toEqual({ kind: 'time', decade: 1970 });
  });

  it('while the shell owns the arrangement, moves inside a page refine it', () => {
    const stage = freshStage();
    const d = createArrangementDirector(cat, stage);
    d.route('/world', '');
    d.route('/world/miami', '');
    expect(stage.get().arrangement).toEqual({ kind: 'world', place: 'place:miami' });
  });

  it('playback on a watch route recedes the world, and stopping restores it', () => {
    const stage = freshStage();
    const d = createArrangementDirector(cat, stage);
    d.route('/watch/subway-1905', '');
    d.playing(true, '/watch/subway-1905');
    expect(stage.get().arrangement).toEqual({ kind: 'watch', video: 'video:subway-1905' });
    d.playing(false, '/watch/subway-1905');
    expect(stage.get().arrangement).toEqual({ kind: 'focus', video: 'video:subway-1905' });
    // not a watch route: playback leaves the world alone
    d.route('/', '');
    d.playing(true, '/');
    expect(stage.get().arrangement).toEqual({ kind: 'home' });
  });

  it("restoring after playback keeps the page's ownership", () => {
    const stage = freshStage();
    const d = createArrangementDirector(cat, stage);
    d.route('/watch/subway-1905', '');
    stage.set((s) => ({ ...s, arrangement: { kind: 'focus', video: 'video:subway-1905', related: ['video:viejo-san-juan'] } }));
    d.playing(true, '/watch/subway-1905');
    d.playing(false, '/watch/subway-1905');
    expect(stage.get().arrangement).toEqual({ kind: 'focus', video: 'video:subway-1905', related: ['video:viejo-san-juan'] });
    d.route('/watch/subway-1905', '?t=40');
    expect(arrangementKey(stage.get().arrangement)).toContain('related');
  });
});

describe('navigation previews', () => {
  beforeEach(() => endPreview(freshStage()));

  it("lights a category's stories and restores the page's highlight on leave", () => {
    const stage = freshStage();
    stage.set((s) => ({ ...s, highlight: ['video:subway-1905'] }));
    startPreview(cat, 'music', stage);
    const music = videosForSection(cat, sectionById('music')).map((v) => v.id);
    expect(music.length).toBeGreaterThan(0);
    expect(stage.get().highlight).toEqual(music);
    expect(previewStore.get()).toBe('music');
    // sweeping to another destination keeps the original to restore
    startPreview(cat, 'movies', stage);
    endPreview(stage);
    expect(stage.get().highlight).toEqual(['video:subway-1905']);
    expect(previewStore.get()).toBeNull();
  });

  it('never clobbers a highlight the page changed meanwhile, and ignores non-category destinations', () => {
    const stage = freshStage();
    startPreview(cat, 'culture', stage);
    stage.set((s) => ({ ...s, highlight: ['video:block-party'] })); // the new page declared its own
    endPreview(stage);
    expect(stage.get().highlight).toEqual(['video:block-party']);
    startPreview(cat, 'home', stage);
    expect(stage.get().highlight).toEqual(['video:block-party']);
  });
});

describe('search palette destinations', () => {
  it('matches destination names by word prefix', () => {
    expect(matchingSections('mus').map((s) => s.label)).toEqual(['Music']);
    expect(matchingSections('machine').map((s) => s.label)).toEqual(['Time Machine']);
    expect(matchingSections('wor').map((s) => s.label)).toEqual(['World', 'My World']);
    expect(matchingSections('m')).toEqual([]);
    expect(matchingSections('subway')).toEqual([]);
  });
});

describe('destination hues', () => {
  it('every destination has one hue, and tokens.css matches hues.ts', () => {
    const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const s of SECTIONS) {
      const m = new RegExp(`--hue-${s.id}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
      expect(m?.[1]?.toLowerCase(), s.id).toBe(SECTION_HUES[s.id]);
    }
    expect(Object.keys(SECTION_HUES)).toHaveLength(13);
  });
});
