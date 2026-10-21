/** Pure helpers for the search palette. */
import { SECTIONS, type Section } from '../../shared/sections.ts';

/** Destinations whose name (or one of its words) starts with the query, e.g. "mus" → Music, "mach" → Time Machine. */
export function matchingSections(query: string): Section[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return SECTIONS.filter((s) => {
    const label = s.label.toLowerCase();
    return label.startsWith(q) || label.split(/\s+/).some((w) => w.startsWith(q));
  });
}
