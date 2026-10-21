/**
 * Validation of authored content (/content JSON) before it becomes a catalogue.
 *
 * Two passes, both run over every record so an editor sees all problems at once:
 *   1. shape — zod schemas mirroring shared/types.ts (unknown keys are warnings, not errors);
 *   2. integrity — id prefixes, unique ids/slugs, every reference resolves to an existing
 *      record of the right kind, no place/programme parent cycles, sane year ranges.
 *
 * Messages always start with the record id (or "collection[index]" when the id is unusable)
 * followed by the field path: `video:foo › places[1]: references unknown place "place:x"`.
 */
import { z } from 'zod';
import type {
  ActivityItem,
  ArtAsset,
  Category,
  Collection,
  DiscoveryState,
  ExternalAvailability,
  MembershipConfig,
  Movement,
  Period,
  Person,
  Place,
  Programme,
  RawContent,
  Route,
  Theme,
  Video,
} from './types.ts';

/* ───────────────────────── Primitive schemas ───────────────────────── */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** ISO 8601 date or timestamp that names a real calendar day (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m || Number.isNaN(Date.parse(value))) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}

const text = z.string().trim().min(1, 'must not be empty');
const ref = z.string().min(1, 'must be an id');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase-kebab-case');
const year = z.number().int().min(-5000).max(3000);
const isoDate = z.string().refine(isIsoDate, 'must be an ISO date (YYYY-MM-DD or a full ISO timestamp)');
const FactSchema = z.object({ label: text, value: text, source: z.string().optional() }).strict();

const DURATION_BUCKETS = ['any', 'under-5', '5-to-20', 'over-20'] as const;
const SORT_KEYS = ['relevance', 'newest', 'setting-oldest', 'setting-newest', 'shortest', 'longest'] as const;
const PROVENANCE_FILTERS = ['original', 'archive', 'studio', 'open-cinema'] as const;

/* ───────────────────────── Record schemas ───────────────────────── */

export const PlaceSchema = z
  .object({
    id: ref,
    slug,
    name: text,
    kind: z.enum(['country', 'territory', 'constituent-country', 'state', 'county', 'city', 'borough', 'neighbourhood', 'district', 'venue']),
    parent: ref.optional(),
    country: z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code'),
    coords: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
    summary: z.string(),
    aliases: z.array(text).optional(),
    gateway: z.boolean().optional(),
    status: z.enum(['active', 'expanding']),
    facts: z.array(FactSchema).optional(),
  })
  .strict() satisfies z.ZodType<Place>;

export const PeriodSchema = z
  .object({ id: ref, slug, label: text, start: year, end: year, summary: z.string() })
  .strict() satisfies z.ZodType<Period>;

export const MovementSchema = z
  .object({
    id: ref,
    slug,
    name: text,
    start: year,
    end: year.nullable(),
    places: z.array(ref),
    categories: z.array(ref),
    themes: z.array(ref),
    influences: z.array(ref).optional(),
    summary: z.string(),
    facts: z.array(FactSchema).optional(),
  })
  .strict() satisfies z.ZodType<Movement>;

export const PersonSchema = z
  .object({
    id: ref,
    slug,
    name: text,
    kind: z.enum(['presenter', 'artist', 'historical', 'creator']),
    roles: z.array(text),
    summary: z.string(),
    places: z.array(ref).optional(),
    movements: z.array(ref).optional(),
    categories: z.array(ref).optional(),
    art: ref.optional(),
    provisional: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<Person>;

export const CategorySchema = z.object({ id: ref, slug, name: text, summary: z.string() }).strict() satisfies z.ZodType<Category>;

export const ThemeSchema = z.object({ id: ref, slug, name: text, summary: z.string() }).strict() satisfies z.ZodType<Theme>;

export const RouteSchema = z
  .object({
    id: ref,
    from: ref,
    to: ref,
    kind: z.enum(['migration', 'influence', 'exchange', 'programme']),
    label: text,
    period: z.object({ from: year, to: year.nullable() }).strict(),
    movements: z.array(ref).optional(),
    themes: z.array(ref).optional(),
    summary: z.string(),
  })
  .strict() satisfies z.ZodType<Route>;

export const ProgrammeSchema = z
  .object({
    id: ref,
    slug,
    title: text,
    kind: z.enum(['original-series', 'original-chapter', 'artist-campaign', 'demonstration-series', 'collection']),
    parent: ref.optional(),
    status: z.enum(['available', 'announced', 'in-development', 'planned']),
    original: z.boolean(),
    tagline: z.string(),
    description: z.string(),
    presenters: z.array(ref).optional(),
    people: z.array(ref).optional(),
    places: z.array(ref),
    periods: z.array(ref),
    movements: z.array(ref).optional(),
    categories: z.array(ref),
    themes: z.array(ref),
    route: z.array(ref).optional(),
    art: ref,
    statusNote: z.string(),
  })
  .strict() satisfies z.ZodType<Programme>;

export const VideoSchema = z
  .object({
    id: ref,
    slug,
    title: text,
    kind: z.enum(['episode', 'feature', 'short', 'teaser', 'reel', 'archive-film']),
    programme: ref.optional(),
    season: z.number().int().min(1).optional(),
    order: z.number().int().min(0).optional(),
    summary: text,
    description: z.string(),
    categories: z.array(ref),
    places: z.array(ref),
    periods: z.array(ref),
    movements: z.array(ref).optional(),
    themes: z.array(ref),
    moods: z.array(z.enum(['chill', 'lively', 'curious', 'late'])),
    people: z.array(z.object({ person: ref, role: text }).strict()).optional(),
    setting: z.object({ from: year, to: year, label: z.string().optional() }).strict().nullable(),
    made: year.optional(),
    published: isoDate,
    access: z.enum(['free', 'premium']),
    availability: z
      .object({
        status: z.enum(['available', 'early-access', 'coming-soon', 'planned', 'unavailable']),
        publicFrom: isoDate.optional(),
        note: z.string().optional(),
      })
      .strict(),
    footage: z.array(z.enum(['archive', 'commentary', 'reconstruction', 'illustrative', 'fiction', 'contemporary'])),
    provenance: z.enum(['monumental-original', 'studio-concept', 'public-domain', 'creative-commons']),
    media: ref.optional(),
    art: ref,
    credits: z.object({ licence: text, attribution: text, sourceUrl: z.string().url().optional() }).strict().optional(),
    notes: z.array(text).optional(),
    context: text.optional(),
  })
  .strict() satisfies z.ZodType<Video>;

export const DiscoveryRuleSchema = z
  .object({
    q: z.string(),
    interests: z.array(ref),
    places: z.array(ref),
    periods: z.array(ref),
    access: z.enum(['all', 'free', 'premium']),
    duration: z.enum(DURATION_BUCKETS),
    provenance: z.array(z.enum(PROVENANCE_FILTERS)),
    playableOnly: z.boolean(),
    sort: z.enum(SORT_KEYS),
  })
  .partial()
  .strict() satisfies z.ZodType<Partial<DiscoveryState>>;

export const CollectionSchema = z
  .object({
    id: ref,
    slug,
    title: text,
    description: z.string(),
    rule: DiscoveryRuleSchema.optional(),
    items: z.array(ref).optional(),
    featured: z.boolean().optional(),
    art: ref.optional(),
  })
  .strict() satisfies z.ZodType<Collection>;

export const ArtAssetSchema = z
  .object({
    id: ref,
    stem: text,
    alt: z.string(),
    kind: z.enum(['studio-loop', 'still', 'generated']),
    provisional: z.boolean(),
    credit: z.string().optional(),
  })
  .strict() satisfies z.ZodType<ArtAsset>;

export const ActivityItemSchema = z
  .object({
    id: ref,
    kind: z.enum(['event', 'release', 'status']),
    title: text,
    place: ref.optional(),
    starts: isoDate.optional(),
    ends: isoDate.optional(),
    summary: z.string(),
    source: text,
    verifiedAt: isoDate,
    url: z.string().url().optional(),
  })
  .strict() satisfies z.ZodType<ActivityItem>;

export const ExternalAvailabilitySchema = z
  .object({ video: ref, service: text, url: z.string().url(), verifiedAt: isoDate })
  .strict() satisfies z.ZodType<ExternalAvailability>;

export const MembershipConfigSchema = z
  .object({
    tierName: text,
    plans: z.array(
      z
        .object({
          id: text,
          label: text,
          interval: z.enum(['month', 'year']),
          displayPrice: z.string().nullable(),
          provisional: z.boolean(),
          stripePriceEnv: z.string(),
        })
        .strict(),
    ),
    benefits: z.array(z.object({ id: text, title: text, detail: z.string(), live: z.boolean() }).strict()),
    note: z.string(),
  })
  .strict() satisfies z.ZodType<MembershipConfig>;

/** Record collections of RawContent, with the id prefix each one must carry (null = no prefix rule). */
const COLLECTIONS = {
  places: { schema: PlaceSchema, prefix: 'place', slugged: true },
  periods: { schema: PeriodSchema, prefix: 'period', slugged: true },
  movements: { schema: MovementSchema, prefix: 'movement', slugged: true },
  people: { schema: PersonSchema, prefix: 'person', slugged: true },
  categories: { schema: CategorySchema, prefix: 'interest', slugged: true },
  themes: { schema: ThemeSchema, prefix: 'theme', slugged: true },
  routes: { schema: RouteSchema, prefix: 'route', slugged: false },
  programmes: { schema: ProgrammeSchema, prefix: 'programme', slugged: true },
  videos: { schema: VideoSchema, prefix: 'video', slugged: true },
  collections: { schema: CollectionSchema, prefix: 'collection', slugged: true },
  art: { schema: ArtAssetSchema, prefix: 'art', slugged: false },
  activity: { schema: ActivityItemSchema, prefix: null, slugged: false },
  external: { schema: ExternalAvailabilitySchema, prefix: null, slugged: false },
} as const;

type CollectionKey = keyof typeof COLLECTIONS;
/** Id prefixes a reference can point at. "media" ids live in the media manifest, not in content. */
type RefKind = 'place' | 'period' | 'movement' | 'person' | 'interest' | 'theme' | 'route' | 'programme' | 'video' | 'collection' | 'art';

const KIND_NOUN: Record<RefKind, string> = {
  place: 'place',
  period: 'period',
  movement: 'movement',
  person: 'person',
  interest: 'interest (category)',
  theme: 'theme',
  route: 'route',
  programme: 'programme',
  video: 'video',
  collection: 'collection',
  art: 'art asset',
};

const withArticle = (noun: string) => `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/* ───────────────────────── Validation ───────────────────────── */

type Rec = Record<string, unknown>;

const isObject = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
/** String entries of an array field, with their index (non-strings are left to the shape pass). */
const refList = (v: unknown): [string, number][] =>
  Array.isArray(v) ? v.flatMap((x, i): [string, number][] => (typeof x === 'string' && x ? [[x, i]] : [])) : [];
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function formatPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '') || '(record)';
}

/**
 * Validate a full content set. Never throws, whatever the input shape.
 * `ok` is true when there are no errors; warnings never block publishing.
 */
export function validateContent(raw: RawContent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const input: unknown = raw;
  if (!isObject(input)) return { ok: false, errors: ['content: expected an object with places, videos, …'], warnings };

  // Records grouped by collection, each with the label used to prefix its messages.
  const records = {} as Record<CollectionKey, { rec: Rec; label: string }[]>;
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const list = input[key];
    records[key] = [];
    if (!Array.isArray(list)) {
      errors.push(`${key}: expected an array`);
      continue;
    }
    list.forEach((rec, i) => {
      if (!isObject(rec)) {
        errors.push(`${key}[${i}]: expected an object`);
        return;
      }
      records[key].push({ rec, label: str(rec.id) ?? (key === 'external' && str(rec.video) ? `external[${i}] (${rec.video})` : `${key}[${i}]`) });
    });
  }

  /* Pass 1 — shape */
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const { schema } = COLLECTIONS[key];
    for (const { rec, label } of records[key]) {
      const parsed = schema.safeParse(rec);
      if (parsed.success) continue;
      for (const issue of parsed.error.issues) {
        const line = `${label} › ${formatPath(issue.path)}: ${issue.message}`;
        (issue.code === 'unrecognized_keys' ? warnings : errors).push(line);
      }
    }
  }
  const membership = MembershipConfigSchema.safeParse(input.membership);
  if (!membership.success) {
    for (const issue of membership.error.issues) errors.push(`membership › ${formatPath(issue.path)}: ${issue.message}`);
  }

  /* Pass 2 — ids, slugs and references */
  const err = (label: string, field: string, message: string) => errors.push(`${label} › ${field}: ${message}`);
  const warn = (label: string, field: string, message: string) => warnings.push(`${label} › ${field}: ${message}`);

  const known = new Map<string, string>(); // id → owning prefix
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const { prefix, slugged } = COLLECTIONS[key];
    const seenSlugs = new Map<string, string>();
    for (const { rec, label } of records[key]) {
      const id = str(rec.id);
      if (prefix && id) {
        if (!new RegExp(`^${prefix}:[a-z0-9][a-z0-9._-]*$`).test(id)) err(label, 'id', `must look like "${prefix}:some-slug"`);
      }
      if (id) {
        if (known.has(id)) err(label, 'id', `duplicate id — another ${known.get(id)} record already uses it`);
        else known.set(id, prefix ?? key);
      }
      const s = str(rec.slug);
      if (slugged && s) {
        const other = seenSlugs.get(s);
        if (other) err(label, 'slug', `duplicate ${prefix} slug "${s}" (also used by ${other})`);
        else seenSlugs.set(s, label);
      }
    }
  }

  const check = (label: string, field: string, value: string, expected: RefKind) => {
    const kind = known.get(value);
    if (!kind) err(label, field, `references unknown ${KIND_NOUN[expected]} "${value}"`);
    else if (kind !== expected) err(label, field, `references "${value}", which is ${withArticle(KIND_NOUN[kind as RefKind] ?? kind)}, not ${withArticle(KIND_NOUN[expected])}`);
  };
  const checkOne = (label: string, rec: Rec, field: string, expected: RefKind) => {
    const v = str(rec[field]);
    if (v) check(label, field, v, expected);
  };
  const checkMany = (label: string, rec: Rec, field: string, expected: RefKind) => {
    for (const [v, i] of refList(rec[field])) check(label, `${field}[${i}]`, v, expected);
  };
  const checkRange = (label: string, field: string, from: unknown, to: unknown) => {
    const a = num(from);
    const b = num(to);
    if (a !== undefined && b !== undefined && a > b) err(label, field, `starts (${a}) after it ends (${b})`);
  };

  for (const { rec, label } of records.places) checkOne(label, rec, 'parent', 'place');
  findCycles(records.places, errors);

  for (const { rec, label } of records.periods) checkRange(label, 'start/end', rec.start, rec.end);

  for (const { rec, label } of records.movements) {
    checkMany(label, rec, 'places', 'place');
    checkMany(label, rec, 'categories', 'interest');
    checkMany(label, rec, 'themes', 'theme');
    checkMany(label, rec, 'influences', 'movement');
    for (const [v, i] of refList(rec.influences)) if (v === rec.id) err(label, `influences[${i}]`, 'a movement cannot influence itself');
    checkRange(label, 'start/end', rec.start, rec.end);
  }

  for (const { rec, label } of records.people) {
    checkMany(label, rec, 'places', 'place');
    checkMany(label, rec, 'movements', 'movement');
    checkMany(label, rec, 'categories', 'interest');
    checkOne(label, rec, 'art', 'art');
  }

  for (const { rec, label } of records.routes) {
    checkOne(label, rec, 'from', 'place');
    checkOne(label, rec, 'to', 'place');
    if (str(rec.from) && rec.from === rec.to) err(label, 'to', 'a route must join two different places');
    checkMany(label, rec, 'movements', 'movement');
    checkMany(label, rec, 'themes', 'theme');
    if (isObject(rec.period)) checkRange(label, 'period', rec.period.from, rec.period.to);
  }

  for (const { rec, label } of records.programmes) {
    checkOne(label, rec, 'parent', 'programme');
    checkMany(label, rec, 'presenters', 'person');
    checkMany(label, rec, 'people', 'person');
    checkMany(label, rec, 'places', 'place');
    checkMany(label, rec, 'periods', 'period');
    checkMany(label, rec, 'movements', 'movement');
    checkMany(label, rec, 'categories', 'interest');
    checkMany(label, rec, 'themes', 'theme');
    checkMany(label, rec, 'route', 'place');
    checkOne(label, rec, 'art', 'art');
  }
  findCycles(records.programmes, errors);

  const periodYears = new Map<string, [number, number]>();
  for (const { rec } of records.periods) {
    const [id, s, e] = [str(rec.id), num(rec.start), num(rec.end)];
    if (id && s !== undefined && e !== undefined) periodYears.set(id, [s, e]);
  }
  const usedPlaces = new Set<string>();
  const programmeOrders = new Map<string, string>(); // "programme|season|order" → first video label
  for (const { rec, label } of records.videos) {
    checkOne(label, rec, 'programme', 'programme');
    checkMany(label, rec, 'categories', 'interest');
    checkMany(label, rec, 'places', 'place');
    checkMany(label, rec, 'periods', 'period');
    checkMany(label, rec, 'movements', 'movement');
    checkMany(label, rec, 'themes', 'theme');
    checkOne(label, rec, 'art', 'art');
    if (Array.isArray(rec.people)) {
      rec.people.forEach((p, i) => {
        if (isObject(p) && str(p.person)) check(label, `people[${i}].person`, p.person as string, 'person');
      });
    }
    const media = str(rec.media);
    if (media && !/^media:[a-z0-9][a-z0-9._-]*$/.test(media)) err(label, 'media', 'must look like "media:some-id"');
    if (!media) warn(label, 'media', 'no media yet — the video is listed but not playable');

    const setting = isObject(rec.setting) ? rec.setting : null;
    if (setting) {
      checkRange(label, 'setting', setting.from, setting.to);
      const [from, to] = [num(setting.from), num(setting.to)];
      if (from !== undefined && to !== undefined) {
        for (const [pid, i] of refList(rec.periods)) {
          const span = periodYears.get(pid);
          if (span && !(span[0] <= to && from <= span[1])) warn(label, `periods[${i}]`, `"${pid}" does not overlap the setting ${from}–${to}`);
        }
      }
    }
    const availability = isObject(rec.availability) ? rec.availability : null;
    if (availability && (availability.status === 'early-access' || availability.status === 'coming-soon') && !str(availability.publicFrom)) {
      warn(label, 'availability.publicFrom', `"${availability.status}" without a publicFrom date never becomes public`);
    }
    const prog = str(rec.programme);
    const order = num(rec.order);
    if (prog && order !== undefined) {
      const key = `${prog}|${num(rec.season) ?? 0}|${order}`;
      const first = programmeOrders.get(key);
      if (first) warn(label, 'order', `same position in ${prog} as ${first}`);
      else programmeOrders.set(key, label);
    }
    for (const [p] of refList(rec.places)) usedPlaces.add(p);
  }

  for (const { rec, label } of records.collections) {
    checkMany(label, rec, 'items', 'video');
    checkOne(label, rec, 'art', 'art');
    if (isObject(rec.rule)) {
      checkMany(label, rec.rule, 'interests', 'interest');
      checkMany(label, rec.rule, 'places', 'place');
      checkMany(label, rec.rule, 'periods', 'period');
    }
    if (!isObject(rec.rule) && !Array.isArray(rec.items)) warn(label, 'rule/items', 'has neither a rule nor items, so it is always empty');
  }

  for (const { rec, label } of records.activity) checkOne(label, rec, 'place', 'place');
  for (const { rec, label } of records.external) checkOne(label, rec, 'video', 'video');

  for (const { rec, label } of records.art) {
    if (rec.provisional === true) warn(label, 'provisional', 'artwork is provisional until client-approved imagery replaces it');
  }

  // A place counts as used when a video is set there or in any of its descendants.
  const parentOf = new Map<string, string>();
  for (const { rec } of records.places) if (str(rec.id) && str(rec.parent)) parentOf.set(rec.id as string, rec.parent as string);
  const usedDeep = new Set<string>();
  for (const p of usedPlaces) {
    for (let cur: string | undefined = p; cur && !usedDeep.has(cur); cur = parentOf.get(cur)) usedDeep.add(cur);
  }
  for (const { rec, label } of records.places) {
    if (rec.status === 'active' && str(rec.id) && !usedDeep.has(rec.id as string)) {
      warn(label, 'status', 'marked "active" but no videos are set here or in its sub-places');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Report each parent cycle once (on its lexicographically smallest member). */
function findCycles(list: { rec: Rec; label: string }[], errors: string[]) {
  const parentOf = new Map<string, string>();
  for (const { rec } of list) if (str(rec.id) && str(rec.parent)) parentOf.set(rec.id as string, rec.parent as string);
  for (const start of parentOf.keys()) {
    const chain = [start];
    let cur = parentOf.get(start);
    while (cur && cur !== start && !chain.includes(cur)) {
      chain.push(cur);
      cur = parentOf.get(cur);
    }
    if (cur !== start) continue; // reaches a root, or joins a cycle that does not include start
    if (chain.some((id) => id < start)) continue;
    errors.push(`${start} › parent: forms a cycle (${[...chain, start].join(' → ')})`);
  }
}
