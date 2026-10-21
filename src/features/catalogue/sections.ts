/**
 * Search ⇄ the platform's sections. The section rail on the search page is a lens over the
 * interests facet: choosing "Music" sets the interest filter to exactly Music's interests
 * (so the URL stays ?interest=music, refresh-safe and shareable), and the rail lights the
 * section whose interests match the filter exactly. Counts are "what you would get" with
 * every other constraint applied. Pure — no DOM, no React.
 */
import { categorySections, SECTIONS, type Section } from '../../../shared/sections.ts';
import type { DiscoveryState, ID, Video } from '../../../shared/types.ts';

export const searchSections = (): Section[] => categorySections();

const sameSet = (a: ID[], b: ID[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The section whose interests equal the filter exactly, or null (no filter, or a custom mix). */
export function activeSection(interests: ID[], sections: Section[] = searchSections()): Section | null {
  if (!interests.length) return null;
  return sections.find((s) => !!s.interests?.length && sameSet(s.interests, interests)) ?? null;
}

/** The state with its interest filter replaced by a section's interests (null clears it). */
export function withSection(state: DiscoveryState, section: Section | null): DiscoveryState {
  return { ...state, interests: section ? [...(section.interests ?? [])] : [] };
}

/** How many of `videos` (already filtered by everything except interests) each section holds. */
export function sectionCounts(videos: Video[], sections: Section[] = searchSections()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sections) {
    const set = new Set(s.interests ?? []);
    out[s.id] = videos.filter((v) => v.categories.some((c) => set.has(c))).length;
  }
  return out;
}

/** A ?section= value — a section id ("movies") or path ("/movies") — resolved to a category section. */
export function sectionFromParam(raw: string | null | undefined, sections: Section[] = SECTIONS): Section | null {
  const v = (raw ?? '').trim().toLowerCase().replace(/^\/+/, '');
  if (!v) return null;
  const s = sections.find((x) => x.id === v || x.path === `/${v}`);
  return s && s.kind === 'category' ? s : null;
}
