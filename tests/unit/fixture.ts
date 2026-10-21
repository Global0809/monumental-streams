/**
 * A small but realistic catalogue for unit tests of the discovery engine.
 *
 *   United States › Florida › Miami-Dade County › Miami (gateway) › Wynwood, Little Havana
 *                                               › Miami Beach › South Beach
 *                 › New York › New York City › The Bronx
 *   Puerto Rico › San Juan, Loíza        United Kingdom › England › London › Brixton
 *   Jamaica › Kingston (expanding)       Cuba (expanding)
 *
 * Thirteen videos mix free / premium / early-access / coming-soon / planned, archive films
 * whose setting (1905) is far from their publication (2026), a timeless loop, and an original
 * series with a journey-shaped chapter. Every builder returns fresh objects so tests may mutate.
 */
import { buildCatalogue } from '../../shared/catalogue.ts';
import type { Catalogue } from '../../shared/catalogue.ts';
import type {
  ArtAsset,
  ArtUrls,
  CataloguePayload,
  Category,
  Mood,
  Movement,
  Period,
  Person,
  Place,
  Programme,
  PublicMediaInfo,
  RawContent,
  Route,
  Theme,
  Video,
} from '../../shared/types.ts';

/** "Today" for every time-dependent assertion (block party is in early access until 15 Nov). */
export const NOW = new Date('2026-10-20T12:00:00Z');

/** Measured runtimes in seconds, keyed by media id. */
export const RUNTIMES: Record<string, number> = {
  'media:wavemakers-teaser': 90,
  'media:wynwood-walls': 240,
  'media:south-beach-deco': 600,
  'media:subway-1905': 300,
  'media:viejo-san-juan': 540,
  'media:block-party': 1500,
  'media:bomba-loiza': 720,
  'media:brixton-sound': 1320,
  'media:miami-bass-reel': 180,
  'media:calle-ocho-nights': 400,
  'media:signal-loop': 60,
};

function place(slug: string, name: string, kind: Place['kind'], parent: string | null, country: string, coords: [number, number], extra: Partial<Place> = {}): Place {
  return {
    id: `place:${slug}`,
    slug,
    name,
    kind,
    ...(parent ? { parent: `place:${parent}` } : {}),
    country,
    coords,
    summary: `${name}.`,
    status: 'active',
    ...extra,
  };
}

const places = (): Place[] => [
  place('us', 'United States', 'country', null, 'US', [39.8, -98.6]),
  place('florida', 'Florida', 'state', 'us', 'US', [27.99, -81.76]),
  place('miami-dade', 'Miami-Dade County', 'county', 'florida', 'US', [25.6, -80.5]),
  place('miami', 'Miami', 'city', 'miami-dade', 'US', [25.7617, -80.1918], { gateway: true, aliases: ['The Magic City'] }),
  place('wynwood', 'Wynwood', 'neighbourhood', 'miami', 'US', [25.801, -80.1994]),
  place('little-havana', 'Little Havana', 'neighbourhood', 'miami', 'US', [25.766, -80.2197], { aliases: ['Calle Ocho'] }),
  place('miami-beach', 'Miami Beach', 'city', 'miami-dade', 'US', [25.7907, -80.13]),
  place('south-beach', 'South Beach', 'neighbourhood', 'miami-beach', 'US', [25.7826, -80.1341]),
  place('new-york', 'New York', 'state', 'us', 'US', [42.9, -75.5]),
  place('new-york-city', 'New York City', 'city', 'new-york', 'US', [40.7128, -74.006], { aliases: ['NYC'] }),
  place('bronx', 'The Bronx', 'borough', 'new-york-city', 'US', [40.8448, -73.8648]),
  place('puerto-rico', 'Puerto Rico', 'territory', null, 'PR', [18.2208, -66.5901]),
  place('san-juan', 'San Juan', 'city', 'puerto-rico', 'PR', [18.4655, -66.1057]),
  place('loiza', 'Loíza', 'city', 'puerto-rico', 'PR', [18.4313, -65.8802]),
  place('uk', 'United Kingdom', 'country', null, 'GB', [55.3781, -3.436]),
  place('england', 'England', 'constituent-country', 'uk', 'GB', [52.3555, -1.1743]),
  place('london', 'London', 'city', 'england', 'GB', [51.5072, -0.1276]),
  place('brixton', 'Brixton', 'neighbourhood', 'london', 'GB', [51.4613, -0.1156]),
  place('jamaica', 'Jamaica', 'country', null, 'JM', [18.1096, -77.2975], { status: 'expanding' }),
  place('kingston', 'Kingston', 'city', 'jamaica', 'JM', [17.9712, -76.7936], { status: 'expanding' }),
  place('cuba', 'Cuba', 'country', null, 'CU', [21.5218, -77.7812], { status: 'expanding' }),
];

const periods = (): Period[] =>
  Array.from({ length: 13 }, (_, i) => {
    const start = 1900 + i * 10;
    return { id: `period:${start}s`, slug: `${start}s`, label: `${start}s`, start, end: start + 9, summary: `The ${start}s.` };
  });

const categories = (): Category[] =>
  ['music', 'film', 'art', 'documentary', 'culture'].map((slug) => ({ id: `interest:${slug}`, slug, name: slug[0].toUpperCase() + slug.slice(1), summary: `${slug}.` }));

const themes = (): Theme[] =>
  ['diaspora', 'youth', 'architecture', 'resistance'].map((slug) => ({ id: `theme:${slug}`, slug, name: slug[0].toUpperCase() + slug.slice(1), summary: `${slug}.` }));

const movements = (): Movement[] => [
  { id: 'movement:sound-system', slug: 'sound-system', name: 'Sound system culture', start: 1950, end: null, places: ['place:kingston', 'place:brixton'], categories: ['interest:music'], themes: ['theme:diaspora'], summary: 'Mobile sound systems.' },
  { id: 'movement:hip-hop', slug: 'hip-hop', name: 'Hip hop', start: 1973, end: null, places: ['place:bronx'], categories: ['interest:music', 'interest:culture'], themes: ['theme:youth'], influences: ['movement:sound-system'], summary: 'Born at Bronx block parties.' },
  { id: 'movement:nuyorican', slug: 'nuyorican', name: 'Nuyorican movement', start: 1960, end: 1990, places: ['place:new-york-city', 'place:san-juan'], categories: ['interest:art', 'interest:culture'], themes: ['theme:diaspora'], summary: 'Puerto Rican arts in New York.' },
  { id: 'movement:miami-bass', slug: 'miami-bass', name: 'Miami bass', start: 1985, end: 1995, places: ['place:miami'], categories: ['interest:music'], themes: ['theme:youth'], influences: ['movement:hip-hop'], summary: 'Booming 808s.' },
];

const people = (): Person[] => [
  { id: 'person:valid-id', slug: 'valid-id', name: 'Valid ID', kind: 'presenter', roles: ['Inaugural presenter'], summary: 'Presenter.', places: ['place:miami'], categories: ['interest:music', 'interest:culture'], art: 'art:valid-id', provisional: true },
  { id: 'person:ana-colon', slug: 'ana-colon', name: 'Ana Colón', kind: 'artist', roles: ['Bomba dancer'], summary: 'Dancer.', places: ['place:loiza'] },
  { id: 'person:desmond-hale', slug: 'desmond-hale', name: 'Desmond Hale', kind: 'historical', roles: ['Sound system operator'], summary: 'Operator.', places: ['place:brixton', 'place:kingston'], movements: ['movement:sound-system'] },
];

const routes = (): Route[] => [
  { id: 'route:san-juan-to-new-york', from: 'place:san-juan', to: 'place:new-york-city', kind: 'migration', label: 'La Gran Migración', period: { from: 1945, to: 1965 }, movements: ['movement:nuyorican'], themes: ['theme:diaspora'], summary: 'The Great Migration.' },
  { id: 'route:kingston-to-london', from: 'place:kingston', to: 'place:london', kind: 'migration', label: 'Windrush crossings', period: { from: 1948, to: 1971 }, movements: ['movement:sound-system'], themes: ['theme:diaspora'], summary: 'Caribbean migration to Britain.' },
];

const programmes = (): Programme[] => [
  {
    id: 'programme:wavemakers', slug: 'wavemakers', title: 'WAVEMAKERS', kind: 'original-series', status: 'announced', original: true,
    tagline: 'The people who move culture.', description: 'An original series.', presenters: ['person:valid-id'],
    places: ['place:miami'], periods: ['period:2020s'], categories: ['interest:music', 'interest:culture'], themes: ['theme:diaspora'],
    art: 'art:wavemakers', statusNote: 'Announced; teaser available.',
  },
  {
    id: 'programme:wavemakers-pr-ny-london', slug: 'wavemakers-pr-ny-london', title: 'WAVEMAKERS: Puerto Rico, New York to London', kind: 'original-chapter',
    parent: 'programme:wavemakers', status: 'in-development', original: true, tagline: 'A journey.', description: 'A chapter.',
    presenters: ['person:valid-id'], places: ['place:san-juan', 'place:new-york-city', 'place:london'],
    periods: ['period:1940s', 'period:1950s', 'period:1960s', 'period:1970s', 'period:1980s'], movements: ['movement:nuyorican', 'movement:sound-system'],
    categories: ['interest:music', 'interest:culture'], themes: ['theme:diaspora'], route: ['place:san-juan', 'place:new-york-city', 'place:london'],
    art: 'art:wavemakers', statusNote: 'In development.',
  },
  {
    id: 'programme:open-archive', slug: 'open-archive', title: 'Open Archive', kind: 'demonstration-series', status: 'available', original: false,
    tagline: 'Public-domain films.', description: 'Demonstration media.', places: ['place:new-york-city', 'place:san-juan'],
    periods: ['period:1900s', 'period:1950s'], categories: ['interest:film', 'interest:documentary'], themes: [], art: 'art:loop', statusNote: 'Sample media.',
  },
  {
    id: 'programme:studio-sessions', slug: 'studio-sessions', title: 'Studio Sessions', kind: 'demonstration-series', status: 'available', original: false,
    tagline: 'Motion studies.', description: 'Studio loops.', places: ['place:miami', 'place:miami-beach'], periods: [],
    categories: ['interest:art'], themes: ['theme:architecture'], art: 'art:loop', statusNote: 'Studio concepts.',
  },
];

interface VideoSpec {
  slug: string;
  title: string;
  kind: Video['kind'];
  programme?: string;
  order?: number;
  places: string[];
  periods: string[];
  categories: string[];
  themes: string[];
  movements?: string[];
  moods: Mood[];
  people?: [string, string][];
  setting: Video['setting'];
  published: string;
  access: Video['access'];
  availability?: Video['availability'];
  provenance: Video['provenance'];
  media?: boolean;
  summary?: string;
  made?: number;
}

function video(s: VideoSpec): Video {
  const v: Video = {
    id: `video:${s.slug}`,
    slug: s.slug,
    title: s.title,
    kind: s.kind,
    summary: s.summary ?? `${s.title}.`,
    description: `About ${s.title}.`,
    categories: s.categories.map((c) => `interest:${c}`),
    places: s.places.map((p) => `place:${p}`),
    periods: s.periods.map((p) => `period:${p}`),
    themes: s.themes.map((t) => `theme:${t}`),
    moods: s.moods,
    setting: s.setting,
    published: s.published,
    access: s.access,
    availability: s.availability ?? { status: 'available' },
    footage: s.provenance === 'public-domain' ? ['archive'] : ['illustrative'],
    provenance: s.provenance,
    art: s.programme?.startsWith('wavemakers') ? 'art:wavemakers' : 'art:loop',
  };
  if (s.programme) v.programme = `programme:${s.programme}`;
  if (s.order !== undefined) v.order = s.order;
  if (s.movements) v.movements = s.movements.map((m) => `movement:${m}`);
  if (s.people) v.people = s.people.map(([person, role]) => ({ person: `person:${person}`, role }));
  if (s.media !== false) v.media = `media:${s.slug}`;
  if (s.made !== undefined) v.made = s.made;
  return v;
}

const videos = (): Video[] => [
  video({ slug: 'wavemakers-teaser', title: 'WAVEMAKERS — First Look', kind: 'teaser', programme: 'wavemakers', places: ['miami'], periods: ['2020s'], categories: ['music', 'culture'], themes: ['diaspora'], moods: ['lively'], people: [['valid-id', 'Presenter']], setting: { from: 2025, to: 2026, label: 'Today' }, published: '2026-09-01', access: 'free', provenance: 'studio-concept', summary: 'Valid ID opens the journey from the Miami gateway.' }),
  video({ slug: 'wavemakers-ep1', title: 'Puerto Rico to New York', kind: 'episode', programme: 'wavemakers-pr-ny-london', order: 1, places: ['san-juan', 'new-york-city'], periods: ['1940s', '1950s', '1960s'], categories: ['music', 'culture'], themes: ['diaspora'], movements: ['nuyorican'], moods: ['curious'], people: [['valid-id', 'Presenter']], setting: { from: 1945, to: 1965, label: 'La Gran Migración' }, published: '2026-10-01', access: 'premium', availability: { status: 'planned' }, provenance: 'monumental-original', media: false }),
  video({ slug: 'wavemakers-ep2', title: 'New York to London', kind: 'episode', programme: 'wavemakers-pr-ny-london', order: 2, places: ['new-york-city', 'london', 'brixton'], periods: ['1970s', '1980s'], categories: ['music'], themes: ['diaspora', 'youth'], movements: ['sound-system', 'hip-hop'], moods: ['lively'], people: [['valid-id', 'Presenter']], setting: { from: 1973, to: 1985 }, published: '2026-10-02', access: 'premium', availability: { status: 'planned' }, provenance: 'monumental-original', media: false }),
  video({ slug: 'wynwood-walls', title: 'Wynwood Walls in Motion', kind: 'short', programme: 'studio-sessions', order: 1, places: ['wynwood'], periods: ['2000s', '2010s', '2020s'], categories: ['art'], themes: ['youth'], moods: ['chill'], setting: { from: 2009, to: 2021 }, published: '2026-07-10', access: 'free', provenance: 'studio-concept', summary: 'Murals of the Wynwood arts district.' }),
  video({ slug: 'south-beach-deco', title: 'Deco Nights on South Beach', kind: 'short', programme: 'studio-sessions', order: 2, places: ['south-beach'], periods: ['1930s', '1940s'], categories: ['art', 'culture'], themes: ['architecture'], moods: ['chill', 'late'], setting: { from: 1930, to: 1945, label: 'Art Deco boom' }, published: '2026-07-20', access: 'premium', provenance: 'studio-concept' }),
  video({ slug: 'subway-1905', title: 'Interior New York Subway, 1905', kind: 'archive-film', programme: 'open-archive', order: 1, places: ['new-york-city'], periods: ['1900s'], categories: ['film', 'documentary'], themes: [], moods: ['curious'], setting: { from: 1904, to: 1905 }, made: 1905, published: '2026-09-20', access: 'free', provenance: 'public-domain' }),
  video({ slug: 'viejo-san-juan', title: 'Old San Juan, 1950', kind: 'archive-film', programme: 'open-archive', order: 2, places: ['san-juan'], periods: ['1950s'], categories: ['film', 'documentary', 'culture'], themes: ['diaspora'], moods: ['curious', 'chill'], setting: { from: 1949, to: 1951 }, made: 1950, published: '2026-08-01', access: 'free', provenance: 'public-domain' }),
  video({ slug: 'block-party', title: 'Block Party Blueprint', kind: 'feature', places: ['bronx'], periods: ['1970s'], categories: ['music', 'culture'], themes: ['youth'], movements: ['hip-hop'], moods: ['lively'], setting: { from: 1973, to: 1979 }, published: '2026-10-10', access: 'free', availability: { status: 'early-access', publicFrom: '2026-11-15' }, provenance: 'creative-commons' }),
  video({ slug: 'bomba-loiza', title: 'Bomba in Loíza', kind: 'short', places: ['loiza'], periods: ['1970s'], categories: ['music', 'culture'], themes: ['diaspora', 'resistance'], moods: ['lively'], people: [['ana-colon', 'Featured dancer']], setting: { from: 1970, to: 1979 }, published: '2026-06-15', access: 'free', provenance: 'creative-commons', summary: 'Drum and dance traditions of Loíza.' }),
  video({ slug: 'brixton-sound', title: 'Brixton Sound Systems', kind: 'feature', places: ['brixton'], periods: ['1970s', '1980s'], categories: ['music'], themes: ['diaspora', 'youth'], movements: ['sound-system'], moods: ['late'], people: [['desmond-hale', 'Sound system operator']], setting: { from: 1975, to: 1985 }, published: '2026-05-01', access: 'premium', provenance: 'creative-commons' }),
  video({ slug: 'miami-bass-reel', title: 'Miami Bass Pressure', kind: 'reel', places: ['miami'], periods: ['1980s', '1990s'], categories: ['music'], themes: ['youth'], movements: ['miami-bass'], moods: ['lively', 'late'], setting: { from: 1985, to: 1992 }, published: '2026-08-15', access: 'free', provenance: 'studio-concept' }),
  video({ slug: 'calle-ocho-nights', title: 'Calle Ocho Nights', kind: 'short', places: ['little-havana'], periods: ['2020s'], categories: ['music', 'culture'], themes: ['diaspora'], moods: ['late'], setting: { from: 2024, to: 2026 }, published: '2026-10-15', access: 'free', availability: { status: 'coming-soon', publicFrom: '2027-01-15' }, provenance: 'studio-concept' }),
  video({ slug: 'signal-loop', title: 'Signal Loop', kind: 'reel', places: [], periods: [], categories: ['art'], themes: [], moods: ['chill'], setting: null, published: '2026-04-01', access: 'free', provenance: 'studio-concept' }),
];

const art = (): ArtAsset[] => [
  { id: 'art:wavemakers', stem: '17-wavemakers-lines', alt: 'WAVEMAKERS key art', kind: 'studio-loop', provisional: true },
  { id: 'art:valid-id', stem: 'valid-id', alt: 'Valid ID portrait', kind: 'still', provisional: true },
  { id: 'art:loop', stem: '03-loop', alt: 'Studio loop', kind: 'studio-loop', provisional: false },
];

/** Authored content as it would be read from /content (with the art registry). */
export function fixtureContent(): RawContent {
  return {
    places: places(),
    periods: periods(),
    movements: movements(),
    people: people(),
    categories: categories(),
    themes: themes(),
    routes: routes(),
    programmes: programmes(),
    videos: videos(),
    collections: [
      { id: 'collection:miami-gateway', slug: 'miami-gateway', title: 'Miami Gateway', description: 'Start here.', rule: { places: ['place:miami'] }, featured: true },
      { id: 'collection:archive-picks', slug: 'archive-picks', title: 'Archive Picks', description: 'Hand-picked.', items: ['video:viejo-san-juan', 'video:subway-1905'] },
    ],
    art: art(),
    activity: [],
    external: [],
    membership: {
      tierName: 'Monumental+',
      plans: [{ id: 'monthly', label: 'Monthly', interval: 'month', displayPrice: null, provisional: true, stripePriceEnv: 'STRIPE_PRICE_MONTHLY' }],
      benefits: [{ id: 'early-access', title: 'Early access', detail: 'Watch new releases first.', live: true }],
      note: 'Prices are provisional.',
    },
  };
}

export function fixturePayload(): CataloguePayload {
  const { art: assets, ...content } = fixtureContent();
  const artUrls: Record<string, ArtUrls> = Object.fromEntries(
    assets.map((a) => [a.id, { poster: `/media/public/${a.stem}-1280.webp`, posterSmall: `/media/public/${a.stem}-640.webp`, lqip: 'data:image/webp;base64,', alt: a.alt, provisional: a.provisional }]),
  );
  const media: Record<string, PublicMediaInfo> = Object.fromEntries(
    Object.entries(RUNTIMES).map(([id, duration]) => [id, { duration, renditions: [], captions: [], hasAudio: true }]),
  );
  return { version: 'fixture', content, art: artUrls, media };
}

export function fixtureCatalogue(): Catalogue {
  return buildCatalogue(fixturePayload());
}
