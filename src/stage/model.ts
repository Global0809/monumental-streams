/**
 * Catalogue → stage model (pure). Derives one SeedInfo per catalogue video and resolves the
 * per-arrangement context a form needs (related stories, programme members, place scope,
 * routes). Nothing here touches the DOM or three.js.
 */
import type { Catalogue } from '../../shared/catalogue.ts';
import { relatedVideos } from '../../shared/relations.ts';
import { SECTIONS, videosForSection, type SectionId } from '../../shared/sections.ts';
import type { ID, Place, Video } from '../../shared/types.ts';
import type { Arrangement } from './contract.ts';
import type { LayoutInput, RouteInfo, SeedInfo } from './layouts.ts';

const publishedYear = (v: Video) => {
  const y = Number(v.published.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
};

/** One seed per catalogue video, in catalogue order. */
export function seedInfos(cat: Catalogue, now = new Date()): SeedInfo[] {
  const membership = new Map<ID, SectionId[]>();
  for (const s of SECTIONS) {
    if (s.kind !== 'category' && s.kind !== 'live') continue;
    for (const v of videosForSection(cat, s)) {
      const list = membership.get(v.id);
      if (list) list.push(s.id);
      else membership.set(v.id, [s.id]);
    }
  }
  return cat.videos.map((v) => {
    const first = v.places.map((id) => cat.get(id) as Place | undefined).find((p) => p && Array.isArray(p.coords));
    return {
      id: v.id,
      sections: membership.get(v.id) ?? [],
      place: first ? { id: first.id, lat: first.coords[0], lon: first.coords[1] } : null,
      years: {
        setting: v.setting ? { from: v.setting.from, to: v.setting.to } : null,
        made: v.made ?? null,
        published: publishedYear(v),
      },
      programme: v.programme,
      planned: !cat.isPlayable(v, now),
      premium: v.access === 'premium' || cat.effectiveAccess(v, now) === 'premium',
    };
  });
}

export function placeCoords(cat: Catalogue): Map<ID, [number, number]> {
  return new Map(cat.places.filter((p) => Array.isArray(p.coords)).map((p) => [p.id, [p.coords[0], p.coords[1]] as [number, number]]));
}

export function routeInfos(cat: Catalogue, coords = placeCoords(cat)): RouteInfo[] {
  const out: RouteInfo[] = [];
  for (const r of cat.routes) {
    const a = coords.get(r.from);
    const b = coords.get(r.to);
    if (a && b) out.push({ id: r.id, from: a, to: b });
  }
  return out;
}

/** Everything a form needs beyond the seeds, for one arrangement. */
export function layoutContext(
  cat: Catalogue,
  arrangement: Arrangement,
  base: { seeds: SeedInfo[]; saved: ID[]; aspect: number; places: Map<ID, [number, number]>; routes: RouteInfo[] },
): LayoutInput {
  const input: LayoutInput = { ...base, arrangement };
  if (arrangement.kind === 'focus') {
    if (arrangement.programme) input.members = cat.videosForProgramme(arrangement.programme).map((v) => v.id);
    const focusId = arrangement.video ?? input.members?.[0];
    if (!arrangement.related && focusId && cat.get(focusId)) {
      try {
        input.related = relatedVideos(cat, focusId, 10).map((r) => r.video.id);
      } catch {
        input.related = [];
      }
    }
  }
  if (arrangement.kind === 'world' && arrangement.place && cat.get(arrangement.place)) input.scope = cat.placeScope(arrangement.place);
  return input;
}
