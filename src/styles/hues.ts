/**
 * Destination hues — the one colour each navigation destination owns. The DOM uses the CSS
 * custom properties (--hue-<section> in tokens.css); the 3D world (organs, highlight tints)
 * can import the same values from here. tests/unit/stage-hues.test.ts keeps both in step.
 */
import type { SectionId } from '../../shared/sections.ts';

export const SECTION_HUES: Record<SectionId, string> = {
  home: '#f2d6a2', // champagne gold — the spine itself
  world: '#a9c4ff', // moonlit globe
  'time-machine': '#9fdcff', // frost: time
  live: '#ff5a6e', // signal red, outline only while nothing is live
  movies: '#ffb45e', // amber
  music: '#b3a3ff', // iris
  sports: '#ff8f86', // coral-rose
  gaming: '#74e4f2', // frost cyan
  news: '#eef0f6', // pearl white
  fashion: '#f2b8a2', // rose-gold
  culture: '#6fcfae', // verdigris
  kids: '#f9c6ec', // soft pastel prism (lead hue)
  'my-world': '#f2d6a2', // gold: your own core
};

/** The core palette the world is lit with. */
export const WORLD_LIGHT = {
  night: '#07060c',
  gold: '#f2d6a2',
  iris: '#b3a3ff',
  frost: '#9fdcff',
  marrow: '#efe6d6',
  signal: '#ff5a6e',
} as const;

/** CSS custom property for a section's hue, e.g. hueVar('time-machine') → 'var(--hue-time-machine)'. */
export const hueVar = (id: SectionId) => `var(--hue-${id})`;

/** '#rrggbb' → 0xrrggbb (THREE.Color accepts numbers). */
export const hueNumber = (id: SectionId) => parseInt(SECTION_HUES[id].slice(1), 16);
