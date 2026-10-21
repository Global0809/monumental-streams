/**
 * Normalised, indexed catalogue shared by server and client.
 * Built once from a CataloguePayload; every screen queries it instead of copying content.
 * Adding a video record automatically makes it reachable from its places (and their
 * ancestors), periods (via historical setting overlap), movements, people, categories,
 * themes, programmes and rule-based collections.
 */
import type {
  ArtUrls,
  CataloguePayload,
  Category,
  Collection,
  ID,
  Movement,
  Period,
  Person,
  Place,
  Programme,
  PublicMediaInfo,
  Route,
  Theme,
  Video,
} from './types.ts';

export type EntityKind =
  | 'video'
  | 'programme'
  | 'place'
  | 'period'
  | 'movement'
  | 'person'
  | 'interest'
  | 'theme'
  | 'route'
  | 'collection';

export type Entity = Video | Programme | Place | Period | Movement | Person | Category | Theme | Route | Collection;

const PREFIX_KIND: Record<string, EntityKind> = {
  video: 'video',
  programme: 'programme',
  place: 'place',
  period: 'period',
  movement: 'movement',
  person: 'person',
  interest: 'interest',
  theme: 'theme',
  route: 'route',
  collection: 'collection',
};

export function kindOf(id: ID): EntityKind | undefined {
  return PREFIX_KIND[id.slice(0, id.indexOf(':'))];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export interface Catalogue {
  version: string;
  payload: CataloguePayload;
  art: Record<ID, ArtUrls>;
  media: Record<ID, PublicMediaInfo>;

  videos: Video[];
  programmes: Programme[];
  places: Place[];
  periods: Period[]; // ascending by start
  movements: Movement[]; // ascending by start
  people: Person[];
  categories: Category[];
  themes: Theme[];
  routes: Route[];
  collections: Collection[];

  get(id: ID): Entity | undefined;
  bySlug(kind: EntityKind, slug: string): Entity | undefined;
  label(id: ID): string;
  /** Canonical in-app URL for any entity. */
  href(id: ID): string;

  /** Seconds from the measured media manifest; null when not playable. */
  runtime(v: Video): number | null;
  mediaInfo(v: Video): PublicMediaInfo | null;
  artFor(id: ID | undefined): ArtUrls | null;
  /** Has media and availability allows playback for someone right now. */
  isPlayable(v: Video, now?: Date): boolean;
  /** Effective access at a moment, accounting for early-access windows. */
  effectiveAccess(v: Video, now?: Date): 'free' | 'premium' | 'unavailable';

  placeAncestors(id: ID): Place[]; // nearest parent first
  placeChildren(id: ID): Place[];
  placeDescendants(id: ID): Place[]; // excluding self
  /** Self + descendants ids, for "Miami includes Wynwood" matching. */
  placeScope(id: ID): Set<ID>;

  videosForPlace(id: ID, deep?: boolean): Video[];
  videosForPeriod(id: ID): Video[]; // historical setting overlaps the period
  videosForYears(from: number, to: number): Video[];
  videosForMovement(id: ID): Video[];
  videosForPerson(id: ID): Video[];
  videosForCategory(id: ID): Video[];
  videosForTheme(id: ID): Video[];
  videosForProgramme(id: ID): Video[]; // series order, includes child chapters
  programmeChildren(id: ID): Programme[];
  programmesForPlace(id: ID): Programme[];
  routesForPlace(id: ID): Route[];
  movementsForPeriod(id: ID): Movement[]; // active during the period
  movementsForPlace(id: ID): Movement[];
  peopleForPlace(id: ID): Person[];
  /** Next video in the same programme by order, if any. */
  nextInProgramme(v: Video): Video | undefined;
  previousInProgramme(v: Video): Video | undefined;
  /** Count of setting-matched videos per period (time machine coverage). */
  periodCoverage(): { period: Period; count: number; playable: number }[];
  /** Period ids a year range overlaps. */
  periodsForYears(from: number, to: number): Period[];
}

export function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number) {
  return aFrom <= bTo && bFrom <= aTo;
}

export function buildCatalogue(payload: CataloguePayload): Catalogue {
  const c = payload.content;
  const all = new Map<ID, Entity>();
  const slugIndex = new Map<string, Entity>();
  const add = (kind: EntityKind, list: Entity[]) => {
    for (const e of list) {
      all.set(e.id, e);
      if ('slug' in e && e.slug) slugIndex.set(`${kind}/${e.slug}`, e);
    }
  };
  add('video', c.videos);
  add('programme', c.programmes);
  add('place', c.places);
  add('period', c.periods);
  add('movement', c.movements);
  add('person', c.people);
  add('interest', c.categories);
  add('theme', c.themes);
  add('collection', c.collections);
  for (const r of c.routes) all.set(r.id, r);

  const periods = [...c.periods].sort((a, b) => a.start - b.start);
  const movements = [...c.movements].sort((a, b) => a.start - b.start);
  const placeById = new Map(c.places.map((p) => [p.id, p]));
  const children = new Map<ID, Place[]>();
  for (const p of c.places) if (p.parent) push(children, p.parent, p);

  const ancestorsCache = new Map<ID, Place[]>();
  const placeAncestors = (id: ID): Place[] => {
    const cached = ancestorsCache.get(id);
    if (cached) return cached;
    const out: Place[] = [];
    let cur = placeById.get(id)?.parent;
    const guard = new Set<ID>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const p = placeById.get(cur);
      if (!p) break;
      out.push(p);
      cur = p.parent;
    }
    ancestorsCache.set(id, out);
    return out;
  };
  const placeDescendants = (id: ID): Place[] => {
    const out: Place[] = [];
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) {
      const p = stack.pop()!;
      out.push(p);
      stack.push(...(children.get(p.id) ?? []));
    }
    return out;
  };
  const scopeCache = new Map<ID, Set<ID>>();
  const placeScope = (id: ID) => {
    let s = scopeCache.get(id);
    if (!s) {
      s = new Set([id, ...placeDescendants(id).map((p) => p.id)]);
      scopeCache.set(id, s);
    }
    return s;
  };

  // Reverse indexes
  const byPlace = new Map<ID, Video[]>();
  const byPlaceDeep = new Map<ID, Video[]>();
  const byMovement = new Map<ID, Video[]>();
  const byPerson = new Map<ID, Video[]>();
  const byCategory = new Map<ID, Video[]>();
  const byTheme = new Map<ID, Video[]>();
  const byProgramme = new Map<ID, Video[]>();
  for (const v of c.videos) {
    const deepSeen = new Set<ID>();
    for (const pl of v.places) {
      push(byPlace, pl, v);
      for (const anc of [placeById.get(pl), ...placeAncestors(pl)]) {
        if (anc && !deepSeen.has(anc.id)) {
          deepSeen.add(anc.id);
          push(byPlaceDeep, anc.id, v);
        }
      }
    }
    for (const m of v.movements ?? []) push(byMovement, m, v);
    for (const p of v.people ?? []) push(byPerson, p.person, v);
    for (const cat of v.categories) push(byCategory, cat, v);
    for (const t of v.themes) push(byTheme, t, v);
    if (v.programme) push(byProgramme, v.programme, v);
  }
  const progChildren = new Map<ID, Programme[]>();
  for (const p of c.programmes) if (p.parent) push(progChildren, p.parent, p);
  const order = (a: Video, b: Video) =>
    (a.season ?? 0) - (b.season ?? 0) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title);
  for (const list of byProgramme.values()) list.sort(order);

  const mediaFor = (v: Video) => (v.media ? payload.media[v.media] ?? null : null);

  const effectiveAccess = (v: Video, now = new Date()): 'free' | 'premium' | 'unavailable' => {
    if (!mediaFor(v)) return 'unavailable';
    const a = v.availability;
    if (a.status === 'available') return v.access;
    if (a.status === 'early-access') {
      if (a.publicFrom && now >= new Date(a.publicFrom)) return v.access;
      return 'premium';
    }
    if (a.status === 'coming-soon' && a.publicFrom && now >= new Date(a.publicFrom)) return v.access;
    return 'unavailable';
  };

  const label = (id: ID): string => {
    const e = all.get(id);
    if (!e) return id;
    if ('title' in e && e.title) return e.title;
    if ('name' in e && e.name) return e.name;
    if ('label' in e && e.label) return e.label;
    return id;
  };

  const href = (id: ID): string => {
    const e = all.get(id);
    const k = kindOf(id);
    const slug = e && 'slug' in e ? e.slug : id.split(':')[1];
    switch (k) {
      case 'video':
        return `/watch/${slug}`;
      case 'programme':
        return `/programme/${slug}`;
      case 'place':
        return `/world/${slug}`;
      case 'period':
        return `/time-machine/${slug}`;
      case 'collection':
        return `/collection/${slug}`;
      case 'route': {
        const r = e as Route | undefined;
        return r ? `/world/${(all.get(r.from) as Place | undefined)?.slug ?? ''}?route=${id.split(':')[1]}` : '/world';
      }
      case 'interest':
        return `/synapse/interest/${slug}`;
      default:
        return `/synapse/${k}/${slug}`;
    }
  };

  const videosForYears = (from: number, to: number) =>
    c.videos.filter((v) => v.setting && overlaps(v.setting.from, v.setting.to, from, to));

  const cat: Catalogue = {
    version: payload.version,
    payload,
    art: payload.art,
    media: payload.media,
    videos: c.videos,
    programmes: c.programmes,
    places: c.places,
    periods,
    movements,
    people: c.people,
    categories: c.categories,
    themes: c.themes,
    routes: c.routes,
    collections: c.collections,

    get: (id) => all.get(id),
    bySlug: (kind, slug) => slugIndex.get(`${kind}/${slug}`),
    label,
    href,
    runtime: (v) => mediaFor(v)?.duration ?? null,
    mediaInfo: mediaFor,
    artFor: (id) => (id ? payload.art[id] ?? null : null),
    isPlayable: (v, now) => effectiveAccess(v, now) !== 'unavailable',
    effectiveAccess,

    placeAncestors,
    placeChildren: (id) => children.get(id) ?? [],
    placeDescendants,
    placeScope,

    videosForPlace: (id, deep = true) => (deep ? byPlaceDeep.get(id) : byPlace.get(id)) ?? [],
    videosForPeriod: (id) => {
      const p = all.get(id) as Period | undefined;
      return p ? videosForYears(p.start, p.end) : [];
    },
    videosForYears,
    videosForMovement: (id) => byMovement.get(id) ?? [],
    videosForPerson: (id) => byPerson.get(id) ?? [],
    videosForCategory: (id) => byCategory.get(id) ?? [],
    videosForTheme: (id) => byTheme.get(id) ?? [],
    videosForProgramme: (id) => {
      const own = byProgramme.get(id) ?? [];
      const kids = (progChildren.get(id) ?? []).flatMap((p) => byProgramme.get(p.id) ?? []);
      return [...own, ...kids];
    },
    programmeChildren: (id) => progChildren.get(id) ?? [],
    programmesForPlace: (id) => {
      const scope = placeScope(id);
      return c.programmes.filter((p) => p.places.some((pl) => scope.has(pl)) || p.route?.some((pl) => scope.has(pl)));
    },
    routesForPlace: (id) => {
      const scope = placeScope(id);
      return c.routes.filter((r) => scope.has(r.from) || scope.has(r.to));
    },
    movementsForPeriod: (id) => {
      const p = all.get(id) as Period | undefined;
      if (!p) return [];
      return movements.filter((m) => overlaps(m.start, m.end ?? 9999, p.start, p.end));
    },
    movementsForPlace: (id) => {
      const scope = placeScope(id);
      return movements.filter((m) => m.places.some((pl) => scope.has(pl)));
    },
    peopleForPlace: (id) => {
      const scope = placeScope(id);
      return c.people.filter((p) => p.places?.some((pl) => scope.has(pl)));
    },
    nextInProgramme: (v) => {
      if (!v.programme) return undefined;
      const list = byProgramme.get(v.programme) ?? [];
      const i = list.indexOf(v);
      return i >= 0 ? list[i + 1] : undefined;
    },
    previousInProgramme: (v) => {
      if (!v.programme) return undefined;
      const list = byProgramme.get(v.programme) ?? [];
      const i = list.indexOf(v);
      return i > 0 ? list[i - 1] : undefined;
    },
    periodCoverage: () =>
      periods.map((p) => {
        const vids = videosForYears(p.start, p.end);
        return { period: p, count: vids.length, playable: vids.filter((v) => effectiveAccess(v) !== 'unavailable').length };
      }),
    periodsForYears: (from, to) => periods.filter((p) => overlaps(p.start, p.end, from, to)),
  };
  return cat;
}
