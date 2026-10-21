/**
 * The platform's primary navigation — fixed labels and order from the client brief — and how
 * each destination maps onto the one shared catalogue. Category pages never hold their own
 * content lists: a video appears on a category page because its record carries the matching
 * interest (or kind), so adding a video makes it appear everywhere it belongs automatically.
 */
import type { Catalogue } from './catalogue.ts';
import type { ID, Video, VideoKind } from './types.ts';

export type SectionId =
  | 'home'
  | 'world'
  | 'time-machine'
  | 'live'
  | 'movies'
  | 'music'
  | 'sports'
  | 'gaming'
  | 'news'
  | 'fashion'
  | 'culture'
  | 'kids'
  | 'my-world';

/** Presentation family of a category page — each one composes the shared content differently. */
export type CategoryLayout = 'cinema' | 'soundstage' | 'arena' | 'arcade' | 'broadsheet' | 'runway' | 'atlas-of-ideas' | 'playroom';

export interface Section {
  id: SectionId;
  label: string; // exact navigation label
  path: string;
  icon: string; // Icon name in src/ui/Icon.tsx
  kind: 'home' | 'world' | 'time' | 'live' | 'category' | 'personal';
  /** Category membership: any of these interests (OR), optionally widened by kinds. */
  interests?: ID[];
  kinds?: VideoKind[];
  /** Sub-filters offered on the page (interest ids), e.g. Culture → Art, Food, Lifestyle. */
  facets?: ID[];
  layout?: CategoryLayout;
  art: ID; // hero art id
  tagline: string;
  /** What this space is for — shown honestly when it has no stories yet. */
  promise: string;
}

export const SECTIONS: Section[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: 'home',
    kind: 'home',
    art: 'art:living-membrane',
    tagline: 'Stream the world.',
    promise: 'Featured stories, your journeys and every way into the platform.',
  },
  {
    id: 'world',
    label: 'World',
    path: '/world',
    icon: 'globe',
    kind: 'world',
    art: 'art:living-atlas',
    tagline: 'Discover where it lives.',
    promise: 'A living globe of places, the stories set there and the routes that connect them.',
  },
  {
    id: 'time-machine',
    label: 'Time Machine',
    path: '/time-machine',
    icon: 'time',
    kind: 'time',
    art: 'art:time-machine',
    tagline: 'Step into any decade.',
    promise: 'Culture through time — what happened, where, and what it set in motion.',
  },
  {
    id: 'live',
    label: 'Live',
    path: '/live',
    icon: 'broadcast',
    kind: 'live',
    art: 'art:sound-aurora',
    tagline: 'What is happening now.',
    promise: 'Live broadcasts, premieres and events — shown only when they are real and scheduled.',
  },
  {
    id: 'movies',
    label: 'Movies',
    path: '/movies',
    icon: 'film',
    kind: 'category',
    interests: ['interest:film'],
    facets: ['interest:documentary'],
    layout: 'cinema',
    art: 'art:catalogue-player',
    tagline: 'Films, shorts and the archive on the big screen.',
    promise: 'Feature films, shorts and documentaries.',
  },
  {
    id: 'music',
    label: 'Music',
    path: '/music',
    icon: 'music',
    kind: 'category',
    interests: ['interest:music'],
    layout: 'soundstage',
    art: 'art:sound-aurora',
    tagline: 'Sound systems, scenes and the artists who carry them.',
    promise: 'Artists, sessions, scenes and the places music comes from.',
  },
  {
    id: 'sports',
    label: 'Sports',
    path: '/sports',
    icon: 'sport',
    kind: 'category',
    interests: ['interest:sport'],
    layout: 'arena',
    art: 'art:still-senators-world-series-1924',
    tagline: 'Games, athletes and the places that play.',
    promise: 'Sport as culture — athletes, rivalries, stadiums and the cities behind them.',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    path: '/gaming',
    icon: 'gamepad',
    kind: 'category',
    interests: ['interest:gaming'],
    layout: 'arcade',
    art: 'art:still-zero-ad-agni-trailer',
    tagline: 'Worlds you can play.',
    promise: 'Games, the people who make them and the worlds they open.',
  },
  {
    id: 'news',
    label: 'News',
    path: '/news',
    icon: 'news',
    kind: 'category',
    interests: ['interest:news'],
    layout: 'broadsheet',
    art: 'art:still-worlds-fair-1964',
    tagline: 'Reports and newsreels — dated, sourced, in context.',
    promise: 'Reports, newsreels and current affairs, always dated and sourced.',
  },
  {
    id: 'fashion',
    label: 'Fashion',
    path: '/fashion',
    icon: 'hanger',
    kind: 'category',
    interests: ['interest:fashion'],
    layout: 'runway',
    art: 'art:still-fashion-week-1951',
    tagline: 'Style, craft and the streets that set it.',
    promise: 'Designers, craft, street style and the cities that shape it.',
  },
  {
    id: 'culture',
    label: 'Culture',
    path: '/culture',
    icon: 'palette',
    kind: 'category',
    interests: ['interest:culture', 'interest:art', 'interest:food', 'interest:lifestyle', 'interest:documentary'],
    facets: ['interest:culture', 'interest:art', 'interest:documentary', 'interest:food', 'interest:lifestyle'],
    layout: 'atlas-of-ideas',
    art: 'art:story-paper',
    tagline: 'Art, food, ideas and the movements that connect them.',
    promise: 'Art, food, lifestyle and the movements that carry culture across borders.',
  },
  {
    id: 'kids',
    label: 'Kids',
    path: '/kids',
    icon: 'balloon',
    kind: 'category',
    interests: ['interest:kids'],
    layout: 'playroom',
    art: 'art:still-big-buck-bunny',
    tagline: 'Family-friendly stories for younger viewers.',
    promise: 'Family-friendly animation and stories for younger viewers — only titles suitable for children.',
  },
  {
    id: 'my-world',
    label: 'My World',
    path: '/my-world',
    icon: 'user',
    kind: 'personal',
    art: 'art:culture-passport',
    tagline: 'Everything you saved, watched and followed.',
    promise: 'Continue watching, saved stories and places, journeys, history and settings.',
  },
];

export const sectionById = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;
export const categorySections = () => SECTIONS.filter((s) => s.kind === 'category');

/** Videos belonging to a category section (catalogue-derived, never hand-listed). */
export function videosForSection(cat: Catalogue, s: Section): Video[] {
  if (!s.interests && !s.kinds) return [];
  return cat.videos.filter((v) => (s.interests ?? []).some((i) => v.categories.includes(i)) || (s.kinds ?? []).includes(v.kind));
}

/** The section a path belongs to (for active navigation state). */
export function sectionForPath(pathname: string): SectionId | null {
  if (pathname === '/') return 'home';
  const seg = pathname.split('/')[1];
  const direct = SECTIONS.find((s) => s.path === `/${seg}`);
  if (direct) return direct.id;
  // legacy and contextual routes map onto their parent destination
  if (seg === 'atlas' || seg === 'passport' || seg === 'synapse') return 'world';
  if (seg === 'time') return 'time-machine';
  if (seg === 'you' || seg === 'account' || seg === 'membership') return 'my-world';
  return null;
}
