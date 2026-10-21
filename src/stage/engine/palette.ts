/**
 * Stage palette: the design tokens (src/styles/tokens.css) read once at start-up, with the same
 * values as fallbacks, plus the category signature hues used to tint the haze.
 */
import * as THREE from 'three';
import type { SectionId } from '../../../shared/sections.ts';

function token(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export interface Palette {
  night: THREE.Color;
  night2: THREE.Color;
  plum: THREE.Color;
  pearl: THREE.Color;
  lilac: THREE.Color;
  iris: THREE.Color;
  irisDeep: THREE.Color;
  frost: THREE.Color;
  gold: THREE.Color;
  rose: THREE.Color;
  bone: THREE.Color;
  warm: THREE.Color;
}

export function readPalette(): Palette {
  const c = (name: string, fb: string) => new THREE.Color(token(name, fb));
  return {
    night: c('--night', '#0a0811'),
    night2: c('--night-2', '#100c1a'),
    plum: c('--plum', '#17121f'),
    pearl: c('--pearl', '#f3effc'),
    lilac: c('--lilac', '#cdc5e4'),
    iris: c('--iris', '#b3a3ff'),
    irisDeep: c('--iris-deep', '#3a2a86'),
    frost: c('--frost', '#9fdcff'),
    gold: c('--gold', '#f2d6a2'),
    rose: c('--rose', '#ff9fc8'),
    bone: new THREE.Color('#ece2d1'),
    warm: new THREE.Color('#d98a5e'),
  };
}

/** Category signature hues (docs/LIVING-ARCHIVE.md). */
export const SECTION_HUE: Partial<Record<SectionId, string>> = {
  movies: '#ffb45e',
  music: '#b3a3ff',
  sports: '#ff8d84',
  gaming: '#86e3ff',
  news: '#f3effc',
  fashion: '#f2b8a2',
  culture: '#72d8bd',
  kids: '#ffd0e6',
  live: '#ff5468',
};

export const ROUTE_HUE: Record<string, string> = {
  migration: '#b3a3ff',
  influence: '#9fdcff',
  exchange: '#f2d6a2',
  programme: '#f3effc',
};
