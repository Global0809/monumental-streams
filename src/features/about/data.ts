/**
 * Everything the About page states about the catalogue is derived here from live data —
 * counts, credits, provenance, provisional art — so it can never drift from the content.
 * Pure; unit-tested in tests/unit/about-data.test.ts.
 */
import type { Catalogue } from '../../../shared/catalogue.ts';
import type { Credit, FootageType, Provenance, Video } from '../../../shared/types.ts';

export interface CountRow {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

export function contentCounts(cat: Catalogue, now: Date = new Date()): CountRow[] {
  const playable = cat.videos.filter((v) => cat.isPlayable(v, now)).length;
  const originals = cat.programmes.filter((p) => p.original).length;
  const active = cat.places.filter((p) => p.status === 'active').length;
  const ongoing = cat.movements.filter((m) => m.end === null).length;
  return [
    { key: 'videos', label: 'Videos', value: cat.videos.length, detail: `${playable} playable now` },
    { key: 'programmes', label: 'Programmes', value: cat.programmes.length, detail: `${originals} Monumental Original${originals === 1 ? '' : 's'}` },
    { key: 'places', label: 'Places', value: cat.places.length, detail: `${active} with stories · ${cat.places.length - active} expanding` },
    { key: 'periods', label: 'Periods', value: cat.periods.length },
    { key: 'movements', label: 'Movements', value: cat.movements.length, detail: ongoing ? `${ongoing} ongoing` : undefined },
    { key: 'people', label: 'People', value: cat.people.length },
    { key: 'interests', label: 'Interests', value: cat.categories.length },
    { key: 'themes', label: 'Themes', value: cat.themes.length },
    { key: 'routes', label: 'Cultural routes', value: cat.routes.length },
    { key: 'collections', label: 'Collections', value: cat.collections.length },
  ];
}

export const PROVENANCE_ORDER: Provenance[] = ['monumental-original', 'studio-concept', 'public-domain', 'creative-commons'];
export const FOOTAGE_ORDER: FootageType[] = ['archive', 'contemporary', 'commentary', 'reconstruction', 'illustrative', 'fiction'];

export const FOOTAGE_NOTE: Record<FootageType, string> = {
  archive: 'Genuine historical footage, filmed at the time.',
  contemporary: 'Present-day documentary footage.',
  commentary: 'Presenter, interview or talking-head material.',
  reconstruction: 'A staged re-creation of past events — not a record of them.',
  illustrative: 'Motion design or artwork that depicts ideas, not events.',
  fiction: 'Narrative fiction, such as open-movie shorts.',
};

export function tally<K extends string>(videos: Video[], keysOf: (v: Video) => K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const v of videos) for (const k of new Set(keysOf(v))) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export const provenanceCounts = (cat: Catalogue) => tally<Provenance>(cat.videos, (v) => [v.provenance]);
export const footageCounts = (cat: Catalogue) => tally<FootageType>(cat.videos, (v) => v.footage);

/** Every video that carries a credit (required for CC films), alphabetical by title. */
export function creditsFrom(cat: Catalogue): { video: Video; credit: Credit }[] {
  return cat.videos
    .filter((v): v is Video & { credits: Credit } => !!v.credits && !!v.credits.licence)
    .map((v) => ({ video: v, credit: v.credits }))
    .sort((a, b) => a.video.title.localeCompare(b.video.title));
}

export function artStatus(cat: Catalogue): { total: number; provisional: number } {
  const all = Object.values(cat.art);
  return { total: all.length, provisional: all.filter((a) => a.provisional).length };
}

/** Only http(s) links are rendered as links. */
export function safeHttpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
