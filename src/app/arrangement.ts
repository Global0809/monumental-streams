/**
 * Shell-level world arrangements: what the living world does on every route before (or
 * without) the page refining it. Pure functions — the Shell applies the result to the stage
 * store on route change (see useRouteArrangement in world.ts) and pages may override it with
 * useArrangement(...).
 *
 *   /                       → home
 *   /world, /world/:place   → world (+ place from the slug)
 *   /time-machine/:decade   → time (+ decade, ?year=, ?lens=)
 *   /live, /movies … /kids  → category(section)
 *   /watch/:slug            → focus(video)   (→ watch while the programme plays)
 *   /programme/:slug        → focus(programme)
 *   /my-world               → personal
 *   anything else           → quiet
 */
import type { Catalogue } from '../../shared/catalogue.ts';
import { SECTIONS, type SectionId } from '../../shared/sections.ts';
import type { ID } from '../../shared/types.ts';
import type { Arrangement, TimeLens } from '../stage/contract.ts';

const LENSES: TimeLens[] = ['setting', 'made', 'published'];

/** Sections whose route shows their organ (the category chamber). */
const CHAMBERS = new Set<SectionId>(SECTIONS.filter((s) => s.kind === 'category' || s.kind === 'live').map((s) => s.id));

/** Minimal catalogue surface the arrangement needs (keeps the function easy to test). */
export type ArrangementCatalogue = Pick<Catalogue, 'bySlug' | 'periods'>;

/** First path segment, e.g. "/world/miami" → "world"; "/" → "". */
export function organOf(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}

function decodeSlug(s: string | undefined): string | undefined {
  if (!s) return undefined;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Resolve a Time Machine slug ("1970s", "period slug", or a bare year "1942") to a decade. */
export function decadeFromSlug(cat: ArrangementCatalogue, slug: string | undefined): { decade?: number; year?: number } {
  if (!slug) return {};
  const period = cat.bySlug('period', slug) as { start?: number } | undefined;
  if (period && typeof period.start === 'number') return { decade: Math.floor(period.start / 10) * 10 };
  const m = /^(\d{3,4})(['’]?s)?$/i.exec(slug.trim());
  if (!m) return {};
  const n = Number(m[1]);
  return m[2] ? { decade: Math.floor(n / 10) * 10 } : { decade: Math.floor(n / 10) * 10, year: n };
}

const idOf = (cat: ArrangementCatalogue, kind: 'video' | 'programme' | 'place', slug: string | undefined): ID | undefined => {
  if (!slug) return undefined;
  return (cat.bySlug(kind, slug) as { id?: ID } | undefined)?.id;
};

/** The world's default arrangement for a location. */
export function defaultArrangement(pathname: string, search: string, cat: ArrangementCatalogue): Arrangement {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  const [, organ, rawSlug] = path.split('/');
  const slug = decodeSlug(rawSlug);
  const params = new URLSearchParams(search);

  switch (organ) {
    case 'world': {
      const place = idOf(cat, 'place', slug);
      return place ? { kind: 'world', place } : { kind: 'world' };
    }
    case 'time-machine': {
      const { decade, year: slugYear } = decadeFromSlug(cat, slug);
      const qYear = Number(params.get('year'));
      const year = Number.isInteger(qYear) && qYear > 0 ? qYear : slugYear;
      const lensParam = params.get('lens') as TimeLens | null;
      const lens = lensParam && LENSES.includes(lensParam) ? lensParam : undefined;
      const a: Extract<Arrangement, { kind: 'time' }> = { kind: 'time' };
      if (decade !== undefined) a.decade = decade;
      else if (year !== undefined) a.decade = Math.floor(year / 10) * 10;
      if (year !== undefined) a.year = year;
      if (lens) a.lens = lens;
      return a;
    }
    case 'watch': {
      const video = idOf(cat, 'video', slug);
      return video ? { kind: 'focus', video } : { kind: 'focus' };
    }
    case 'programme': {
      const programme = idOf(cat, 'programme', slug);
      return programme ? { kind: 'focus', programme } : { kind: 'focus' };
    }
    case 'my-world':
      return { kind: 'personal' };
    default:
      if (CHAMBERS.has(organ as SectionId) && !slug) return { kind: 'category', section: organ as SectionId };
      return { kind: 'quiet' };
  }
}

/** While a programme plays on a watch route, the world dims and recedes behind the player. */
export function watchingArrangement(current: Arrangement, pathname: string, cat: ArrangementCatalogue): Arrangement | null {
  if (organOf(pathname) !== 'watch') return null;
  const video = current.kind === 'focus' && current.video ? current.video : idOf(cat, 'video', decodeSlug(pathname.split('/')[2]));
  return video ? { kind: 'watch', video } : null;
}

/** Stable serialisation (the stage store compares arrangements the same way). */
export const arrangementKey = (a: Arrangement) => JSON.stringify(a);

/** The section a hovered/focused destination previews in the world (category destinations only). */
export function previewableSection(id: SectionId): boolean {
  return SECTIONS.find((s) => s.id === id)?.kind === 'category';
}

/** Destination hue tint for the static world: what the current arrangement is "about". */
export function tintFor(a: Arrangement): SectionId | null {
  switch (a.kind) {
    case 'home':
      return 'home';
    case 'world':
      return 'world';
    case 'time':
      return 'time-machine';
    case 'category':
      return a.section;
    case 'personal':
      return 'my-world';
    default:
      return null;
  }
}
