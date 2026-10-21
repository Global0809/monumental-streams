/**
 * THE LIVING ARCHIVE — stage contract.
 *
 * One persistent 3D world lives behind every route. Every playable or planned story in the
 * catalogue is a SEED (a luminous biomechanical capsule carrying its poster). Routes never
 * mount their own 3D scenes: they ask the stage for an ARRANGEMENT and the same seeds travel
 * there. The DOM stays the semantic source of truth (headings, lists, buttons, links); the
 * stage mirrors and amplifies it, and every stage interaction has a DOM equivalent.
 *
 *   home      constellation — seeds orbit the Monumental spine in rings by category
 *   world     globe — seeds settle on their places; destinations, routes and focus
 *   time      helix — seeds unspool along a vertebral spine of years (setting/made/published)
 *   category  chamber — the section's procedural ORGAN draws its members in; others recede
 *   focus     one story or programme in front; related seeds linked by light filaments
 *   watch     playback — the world dims and recedes behind the player
 *   personal  My World — saved seeds orbit the viewer's own core
 *   quiet     utility pages (search, account, about) — a calm, low-intensity field
 */
import type { SectionId } from '../../shared/sections.ts';
import type { ID } from '../../shared/types.ts';

export type TimeLens = 'setting' | 'made' | 'published';

export type Arrangement =
  | { kind: 'home'; featured?: ID }
  | { kind: 'world'; place?: ID; route?: ID }
  | { kind: 'time'; decade?: number; year?: number; lens?: TimeLens }
  | { kind: 'category'; section: SectionId }
  | { kind: 'focus'; video?: ID; programme?: ID; related?: ID[] }
  | { kind: 'watch'; video: ID }
  | { kind: 'personal' }
  | { kind: 'quiet' };

export interface StageState {
  arrangement: Arrangement;
  /** Seeds (video ids) the page wants emphasised — e.g. current filter results. null = all. */
  highlight: ID[] | null;
  /** Seed under the pointer (from the stage) or under keyboard focus (from the DOM). */
  hovered: ID | null;
  /** Place under the pointer on the globe. */
  hoveredPlace: ID | null;
  /** Capability actually in use: 'webgl' full scene, 'lite' reduced scene, 'off' (no WebGL / user setting). */
  quality: 'webgl' | 'lite' | 'off';
  ready: boolean;
}

/** Events the stage emits when the viewer acts inside the 3D world. Pages decide outcomes. */
export interface StageEvents {
  seedActivate: { id: ID }; // click/tap on a seed (default handler: navigate to the story)
  placeActivate: { id: ID }; // click/tap on a destination on the globe
  decadeActivate: { decade: number }; // click/tap on a vertebra of the time helix
  organActivate: { section: SectionId }; // click/tap on a category organ (home constellation)
}

export type StageEventName = keyof StageEvents;
