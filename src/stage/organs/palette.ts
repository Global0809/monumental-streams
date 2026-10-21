/**
 * Organ palette — one signature hue per category (docs/LIVING-ARCHIVE.md, docs/ART-DIRECTION.md),
 * all inside the Chrome Bloom night palette (src/styles/tokens.css). Hex strings in sRGB so
 * pages can reuse them for accents; the shaders convert them to linear through THREE.Color.
 */
import type { SectionId } from '../../../shared/sections.ts';

export interface OrganPalette {
  /** Signature hue: rims, filaments and glows. */
  hue: string;
  /** Deeper companion for cores, interiors and gradients. */
  deep: string;
  /** Optional secondary accents (Kids' pastel prism, Live's dormant outline). */
  accents?: string[];
}

/** Shared family colours (not section specific). */
export const FAMILY = {
  night: '#0a0811', // --night
  plum: '#17121f', // --plum
  shade: '#231b31', // bone shadow side: warm violet, sinks into the night
  bone: '#e4d9c7', // bone-white with a warm cast
  gold: '#f2d6a2', // --gold, seed rim light
  iris: '#b3a3ff', // --iris
  frost: '#9fdcff', // --frost
} as const;

export const ORGAN_PALETTE: Record<SectionId, OrganPalette> = {
  movies: { hue: '#ffb45e', deep: '#a8501c' }, // amber — projector light
  music: { hue: '#b3a3ff', deep: '#5b44d6' }, // iris
  sports: { hue: '#ff8d84', deep: '#b8364a' }, // coral-rose
  gaming: { hue: '#86e3ff', deep: '#2a7fb8' }, // frost cyan
  news: { hue: '#f3effc', deep: '#8f93b8' }, // pearl white
  fashion: { hue: '#f2b8a2', deep: '#a8585a' }, // rose-gold
  culture: { hue: '#72d8bd', deep: '#1f7c6c' }, // verdigris
  kids: { hue: '#ffd0e6', deep: '#b39cff', accents: ['#ffc4df', '#c9b8ff', '#a9e4ff', '#fff0b0', '#b8f2d2'] }, // pastel prism
  live: { hue: '#ff5468', deep: '#5c1622' }, // signal red — outline only while nothing is live
  home: { hue: '#f2d6a2', deep: '#8a6a3a' }, // gold (neutral form)
  world: { hue: '#b3a3ff', deep: '#3a2a86' }, // iris (neutral form)
  'time-machine': { hue: '#9fdcff', deep: '#2f6f99' }, // frost (neutral form)
  'my-world': { hue: '#f2d6a2', deep: '#8a6a3a' }, // gold (neutral form)
};

/** The nine category organs plus Live, in navigation order. */
export const ORGAN_SECTIONS = ['live', 'movies', 'music', 'sports', 'gaming', 'news', 'fashion', 'culture', 'kids'] as const satisfies readonly SectionId[];
export type OrganSection = (typeof ORGAN_SECTIONS)[number];

export const isOrganSection = (id: string): id is OrganSection => (ORGAN_SECTIONS as readonly string[]).includes(id);

/** Art id of the rendered artwork for an organ (content/art.json). */
export const organArtId = (id: OrganSection) => `art:organ-${id}`;
