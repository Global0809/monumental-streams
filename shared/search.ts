/**
 * Catalogue search: weighted full-text over every video's own and related records,
 * combined facet filters, "what would toggling yield" facet counts, sorting, entity
 * suggestions and relaxation hints for empty / near-empty results.
 *
 * Isomorphic and synchronous — the client runs it on every keystroke and the server
 * runs the same code for /api/search. Indexes are built lazily once per Catalogue.
 */
import { kindOf, overlaps } from './catalogue.ts';
import type { Catalogue, EntityKind } from './catalogue.ts';
import { foldedWords, indexTokens, isStopword, queryTokens, withinOneEdit } from './text.ts';
import type {
  Collection,
  DiscoveryState,
  DurationBucket,
  ID,
  Period,
  Place,
  Programme,
  ProvenanceFilter,
  SortKey,
  Video,
} from './types.ts';

/* ───────────────────────── Public types & constants ───────────────────────── */

export interface SearchHit {
  video: Video;
  score: number;
  /** Human labels of what the text query matched, strongest first: "title", "place: Miami". */
  matched: string[];
}

export interface EntityHit {
  id: ID;
  kind: EntityKind;
  label: string;
  score: number;
}

export interface FacetCounts {
  interests: Record<ID, number>;
  places: Record<ID, number>;
  periods: Record<ID, number>;
  access: { free: number; premium: number };
  duration: Record<DurationBucket, number>;
  provenance: Record<ProvenanceFilter, number>;
}

export interface Relaxation {
  key: 'q' | 'interests' | 'places' | 'periods' | 'access' | 'duration' | 'provenance' | 'playableOnly';
  /** The single value to drop (an id, a provenance filter, or one query word); absent = reset the whole key. */
  value?: ID | string;
  label: string;
  /** Result count once this relaxation is applied. */
  count: number;
}

export interface SearchResult {
  results: SearchHit[];
  total: number;
  entities: EntityHit[];
  facets: FacetCounts;
  relaxations: Relaxation[];
}

export const PROVENANCE_FILTERS: readonly ProvenanceFilter[] = ['original', 'archive', 'studio', 'open-cinema'];
export const DURATION_BUCKETS: readonly DurationBucket[] = ['any', 'under-5', '5-to-20', 'over-20'];
export const SORT_KEYS: readonly SortKey[] = ['relevance', 'newest', 'setting-oldest', 'setting-newest', 'shortest', 'longest'];

export const PROVENANCE_LABELS: Record<ProvenanceFilter, string> = {
  original: 'Monumental Originals',
  archive: 'Public-domain archive',
  studio: 'Studio concepts',
  'open-cinema': 'Open cinema',
};
export const DURATION_LABELS: Record<DurationBucket, string> = {
  any: 'Any length',
  'under-5': 'Under 5 min',
  '5-to-20': '5–20 min',
  'over-20': 'Over 20 min',
};
export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Most relevant',
  newest: 'Newest on Monumental',
  'setting-oldest': 'Set earliest',
  'setting-newest': 'Set most recently',
  shortest: 'Shortest',
  longest: 'Longest',
};

const ENTITY_LIMIT = 8;

/* ───────────────────────── Discovery state helpers ───────────────────────── */

export function defaultDiscovery(): DiscoveryState {
  return {
    q: '',
    interests: [],
    places: [],
    periods: [],
    access: 'all',
    duration: 'any',
    provenance: [],
    playableOnly: false,
    sort: 'relevance',
  };
}

/** A full state from a partial one (e.g. a rule collection's `rule`). */
export function discoveryWith(partial: Partial<DiscoveryState>): DiscoveryState {
  return { ...defaultDiscovery(), ...partial };
}

export function isDefaultDiscovery(s: DiscoveryState): boolean {
  return (
    s.q.trim() === '' &&
    s.interests.length === 0 &&
    s.places.length === 0 &&
    s.periods.length === 0 &&
    s.access === 'all' &&
    s.duration === 'any' &&
    s.provenance.length === 0 &&
    !s.playableOnly &&
    s.sort === 'relevance'
  );
}

/** Apply a relaxation suggested by searchCatalogue, returning the widened state. */
export function applyRelaxation(state: DiscoveryState, r: Relaxation): DiscoveryState {
  const without = <T extends string>(list: T[]) => (r.value === undefined ? [] : list.filter((x) => x !== r.value));
  switch (r.key) {
    case 'q':
      return { ...state, q: r.value === undefined ? '' : removeWord(state.q, r.value) };
    case 'interests':
      return { ...state, interests: without(state.interests) };
    case 'places':
      return { ...state, places: without(state.places) };
    case 'periods':
      return { ...state, periods: without(state.periods) };
    case 'provenance':
      return { ...state, provenance: without(state.provenance) };
    case 'access':
      return { ...state, access: 'all' };
    case 'duration':
      return { ...state, duration: 'any' };
    case 'playableOnly':
      return { ...state, playableOnly: false };
  }
}

/** Duration bucket for a runtime in seconds; null when the runtime is unknown. */
export function durationBucket(seconds: number | null): DurationBucket | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 300) return 'under-5';
  if (seconds <= 1200) return '5-to-20';
  return 'over-20';
}

/** True when a video counts under a provenance filter. */
export function matchesProvenance(cat: Catalogue, v: Video, f: ProvenanceFilter): boolean {
  switch (f) {
    case 'original':
      return v.provenance === 'monumental-original' || (v.programme ? (cat.get(v.programme) as Programme | undefined)?.original === true : false);
    case 'archive':
      return v.provenance === 'public-domain';
    case 'studio':
      return v.provenance === 'studio-concept';
    case 'open-cinema':
      return v.provenance === 'creative-commons';
  }
}

/** Videos of a collection: hand-picked items first (in order), then rule matches. */
export function collectionVideos(cat: Catalogue, collection: Collection, now?: Date): Video[] {
  const out: Video[] = [];
  const seen = new Set<ID>();
  const add = (v: Video | undefined) => {
    if (v && !seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  };
  for (const id of collection.items ?? []) {
    const e = cat.get(id);
    if (e && kindOf(id) === 'video') add(e as Video);
  }
  if (collection.rule) for (const hit of searchCatalogue(cat, discoveryWith(collection.rule), now).results) add(hit.video);
  return out;
}

/* ───────────────────────── Text index ───────────────────────── */

interface Field {
  label: string;
  weight: number;
  tokens: string[];
  exact: Set<string>;
  /** Each part's words as " w1 w2 … " for phrase matching. */
  phrases: string[];
}

interface Doc {
  fields: Field[];
  /** The title's folded words, for the exact-title bonus. */
  title: string;
}

interface VideoDoc extends Doc {
  /** Direct places plus all their ancestors (for place facet counts). */
  deepPlaces: ID[];
  /** Periods the historical setting overlaps. */
  settingPeriods: ID[];
}

interface EntityDoc extends Doc {
  id: ID;
  kind: EntityKind;
  label: string;
}

interface Query {
  tokens: string[];
  /** " w1 w2 …" of all typed words (stopwords included), or null for one-word queries. */
  phrase: string | null;
  /** All typed words joined, for exact-label bonuses. */
  whole: string;
}

const W = {
  title: 10,
  programme: 6,
  person: 6,
  place: 5,
  movement: 5,
  period: 4,
  category: 4,
  theme: 3,
  summary: 2,
  description: 1,
  entityName: 10,
  entityAlias: 8,
} as const;

function field(label: string, weight: number, parts: string[], compounds: boolean): Field {
  const tokens = parts.flatMap((p) => indexTokens(p, compounds));
  return { label, weight, tokens, exact: new Set(tokens), phrases: parts.map((p) => ` ${foldedWords(p).join(' ')} `) };
}

const videoIndexes = new WeakMap<Catalogue, VideoDoc[]>();
const entityIndexes = new WeakMap<Catalogue, EntityDoc[]>();

function videoIndex(cat: Catalogue): VideoDoc[] {
  let index = videoIndexes.get(cat);
  if (!index) {
    index = cat.videos.map((v) => videoDoc(cat, v));
    videoIndexes.set(cat, index);
  }
  return index;
}

function videoDoc(cat: Catalogue, v: Video): VideoDoc {
  const fields: Field[] = [field('title', W.title, [v.title], true)];
  const programme = v.programme ? (cat.get(v.programme) as Programme | undefined) : undefined;
  for (const p of [programme, programme?.parent ? (cat.get(programme.parent) as Programme | undefined) : undefined]) {
    if (p) fields.push(field(`programme: ${p.title}`, W.programme, [p.title], true));
  }
  for (const { person } of v.people ?? []) {
    const name = cat.label(person);
    fields.push(field(`person: ${name}`, W.person, [name], true));
  }
  const deepPlaces = unique(v.places.flatMap((id) => [id, ...cat.placeAncestors(id).map((p) => p.id)]));
  for (const id of deepPlaces) {
    const place = cat.get(id) as Place | undefined;
    if (place) fields.push(field(`place: ${place.name}`, W.place, [place.name, ...(place.aliases ?? [])], true));
  }
  for (const id of v.movements ?? []) fields.push(field(`movement: ${cat.label(id)}`, W.movement, [cat.label(id)], true));
  const settingPeriods = v.setting ? cat.periodsForYears(v.setting.from, v.setting.to).map((p) => p.id) : [];
  for (const id of unique([...v.periods, ...settingPeriods])) {
    fields.push(field(`period: ${cat.label(id)}`, W.period, [cat.label(id)], true));
  }
  if (v.setting?.label) fields.push(field(`setting: ${v.setting.label}`, W.period, [v.setting.label], true));
  for (const id of v.categories) fields.push(field(`interest: ${cat.label(id)}`, W.category, [cat.label(id)], true));
  for (const id of v.themes) fields.push(field(`theme: ${cat.label(id)}`, W.theme, [cat.label(id)], true));
  fields.push(field('summary', W.summary, [v.summary], false));
  fields.push(field('description', W.description, [v.description], false));
  return { fields, title: foldedWords(v.title).join(' '), deepPlaces, settingPeriods };
}

function entityIndex(cat: Catalogue): EntityDoc[] {
  let index = entityIndexes.get(cat);
  if (index) return index;
  const docs: EntityDoc[] = [];
  const add = (id: ID, kind: EntityKind, label: string, aliases: string[] = []) => {
    const fields = [field(label, W.entityName, [label], true)];
    if (aliases.length) fields.push(field(`${label} (alias)`, W.entityAlias, aliases, true));
    docs.push({ id, kind, label, fields, title: foldedWords(label).join(' ') });
  };
  for (const p of cat.places) add(p.id, 'place', p.name, p.aliases);
  for (const p of cat.people) add(p.id, 'person', p.name);
  for (const m of cat.movements) add(m.id, 'movement', m.name);
  for (const p of cat.programmes) add(p.id, 'programme', p.title);
  for (const p of cat.periods) add(p.id, 'period', p.label);
  for (const t of cat.themes) add(t.id, 'theme', t.name);
  for (const c of cat.categories) add(c.id, 'interest', c.name);
  entityIndexes.set(cat, docs);
  return docs;
}

function compileQuery(q: string): Query | null {
  const tokens = queryTokens(q);
  if (!tokens.length) return null;
  const all = foldedWords(q);
  return { tokens, phrase: all.length > 1 ? ` ${all.join(' ')}` : null, whole: all.join(' ') };
}

/**
 * How well one query token matches a field: 1 exact; prefix (last token only, search-as-you-
 * type) 0.5–0.9 by how much of the word is typed; fuzzy (≥ 5 chars, one edit) 0.45.
 */
function tokenFactor(token: string, isLast: boolean, f: Field): number {
  if (f.exact.has(token)) return 1;
  const fuzzy = token.length >= 5;
  let best = 0;
  for (const ft of f.tokens) {
    if (isLast && ft.length > token.length) {
      if (ft.startsWith(token)) best = Math.max(best, 0.5 + (0.4 * token.length) / ft.length);
      else if (fuzzy && withinOneEdit(token, ft.slice(0, token.length))) best = Math.max(best, 0.4);
    }
    if (fuzzy && best < 0.45 && Math.abs(ft.length - token.length) <= 1 && withinOneEdit(token, ft)) best = 0.45;
  }
  return best;
}

/** AND semantics: every token must match some field, otherwise null. */
function scoreDoc(doc: Doc, query: Query): { score: number; matched: string[] } | null {
  let score = 0;
  const matched = new Map<string, number>();
  for (let i = 0; i < query.tokens.length; i++) {
    let tokenScore = 0;
    for (const f of doc.fields) {
      const k = tokenFactor(query.tokens[i], i === query.tokens.length - 1, f);
      if (k > 0) {
        tokenScore += f.weight * k;
        matched.set(f.label, f.weight);
      }
    }
    if (tokenScore === 0) return null;
    score += tokenScore;
  }
  if (query.phrase) {
    let best = 0;
    for (const f of doc.fields) if (f.phrases.some((p) => p.includes(query.phrase!))) best = Math.max(best, f.weight);
    score += best * 1.5;
  }
  if (doc.title === query.whole) score += 15;
  const labels = [...matched.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  return { score, matched: labels };
}

function removeWord(q: string, word: string): string {
  const words = q.trim().split(/\s+/);
  const i = words.indexOf(word);
  if (i >= 0) words.splice(i, 1);
  return words.join(' ');
}

const unique = <T>(list: T[]) => [...new Set(list)];

/* ───────────────────────── Search ───────────────────────── */

/** Bit per constraint; a video's `fail` mask records which constraints it misses. */
const BIT = {
  q: 1,
  interests: 2,
  places: 4,
  periods: 8,
  access: 16,
  duration: 32,
  provenance: 64,
  playableOnly: 128,
} as const satisfies Record<Relaxation['key'], number>;

interface Row {
  video: Video;
  doc: VideoDoc;
  text: { score: number; matched: string[] } | null;
  access: 'free' | 'premium' | 'unavailable';
  playable: boolean;
  runtime: number | null;
  published: number;
  fail: number;
}

export function searchCatalogue(cat: Catalogue, state: DiscoveryState, now?: Date): SearchResult {
  const query = compileQuery(state.q);
  const index = videoIndex(cat);
  const interestSet = new Set(state.interests);
  const placeScope = new Set(state.places.flatMap((id) => [...cat.placeScope(id)]));
  const periodRanges = state.periods.flatMap((id) => {
    const p = kindOf(id) === 'period' ? (cat.get(id) as Period | undefined) : undefined;
    return p ? [[p.start, p.end] as const] : [];
  });

  const rows: Row[] = cat.videos.map((video, i) => {
    const doc = index[i];
    const text = query ? scoreDoc(doc, query) : { score: 0, matched: [] };
    const access = cat.effectiveAccess(video, now);
    const runtime = cat.runtime(video);
    const s = video.setting;
    let fail = 0;
    if (!text) fail |= BIT.q;
    if (interestSet.size && !video.categories.some((c) => interestSet.has(c))) fail |= BIT.interests;
    if (state.places.length && !video.places.some((p) => placeScope.has(p))) fail |= BIT.places;
    if (state.periods.length && !(s && periodRanges.some(([a, b]) => overlaps(s.from, s.to, a, b)))) fail |= BIT.periods;
    if (state.access !== 'all' && access !== state.access) fail |= BIT.access;
    if (state.duration !== 'any' && durationBucket(runtime) !== state.duration) fail |= BIT.duration;
    if (state.provenance.length && !state.provenance.some((f) => matchesProvenance(cat, video, f))) fail |= BIT.provenance;
    const playable = access !== 'unavailable';
    if (state.playableOnly && !playable) fail |= BIT.playableOnly;
    const published = Date.parse(video.published);
    return { video, doc, text, access, playable, runtime, published: Number.isNaN(published) ? 0 : published, fail };
  });

  const passing = rows.filter((r) => r.fail === 0).sort(comparator(state.sort, query !== null));
  return {
    results: passing.map((r) => ({ video: r.video, score: round(r.text?.score ?? 0), matched: r.text?.matched ?? [] })),
    total: passing.length,
    entities: query ? searchEntities(cat, query) : [],
    facets: facetCounts(cat, rows),
    relaxations: passing.length < 3 ? relaxations(cat, state, rows, index, passing.length) : [],
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function comparator(sort: SortKey, hasQuery: boolean): (a: Row, b: Row) => number {
  const newest = (a: Row, b: Row) => b.published - a.published;
  const playableFirst = (a: Row, b: Row) => Number(b.playable) - Number(a.playable);
  const nullsLast = (x: number | null, y: number | null, dir: 1 | -1) => (x === null ? (y === null ? 0 : 1) : y === null ? -1 : dir * (x - y));
  const tie = (a: Row, b: Row) => a.video.title.localeCompare(b.video.title) || (a.video.id < b.video.id ? -1 : 1);
  const primary: Record<SortKey, (a: Row, b: Row) => number> = {
    relevance: hasQuery
      ? (a, b) => (b.text?.score ?? 0) - (a.text?.score ?? 0) || playableFirst(a, b) || newest(a, b)
      : (a, b) => playableFirst(a, b) || newest(a, b),
    newest,
    'setting-oldest': (a, b) => nullsLast(a.video.setting?.from ?? null, b.video.setting?.from ?? null, 1) || nullsLast(a.video.setting?.to ?? null, b.video.setting?.to ?? null, 1),
    'setting-newest': (a, b) => nullsLast(a.video.setting?.from ?? null, b.video.setting?.from ?? null, -1) || nullsLast(a.video.setting?.to ?? null, b.video.setting?.to ?? null, -1),
    shortest: (a, b) => nullsLast(a.runtime, b.runtime, 1),
    longest: (a, b) => nullsLast(a.runtime, b.runtime, -1),
  };
  return (a, b) => primary[sort](a, b) || tie(a, b);
}

/** Counts per facet value with every other constraint applied and this facet's own selection ignored. */
function facetCounts(cat: Catalogue, rows: Row[]): FacetCounts {
  const zeros = (list: { id: ID }[]) => Object.fromEntries(list.map((e) => [e.id, 0])) as Record<ID, number>;
  const facets: FacetCounts = {
    interests: zeros(cat.categories),
    places: zeros(cat.places),
    periods: zeros(cat.periods),
    access: { free: 0, premium: 0 },
    duration: { any: 0, 'under-5': 0, '5-to-20': 0, 'over-20': 0 },
    provenance: { original: 0, archive: 0, studio: 0, 'open-cinema': 0 },
  };
  const bump = (record: Record<ID, number>, id: ID) => {
    if (Object.hasOwn(record, id)) record[id]++;
  };
  for (const r of rows) {
    const passesWithout = (bit: number) => (r.fail & ~bit) === 0;
    if (passesWithout(BIT.interests)) for (const c of unique(r.video.categories)) bump(facets.interests, c);
    if (passesWithout(BIT.places)) for (const p of r.doc.deepPlaces) bump(facets.places, p);
    if (passesWithout(BIT.periods)) for (const p of r.doc.settingPeriods) bump(facets.periods, p);
    if (passesWithout(BIT.access) && r.access !== 'unavailable') facets.access[r.access]++;
    if (passesWithout(BIT.duration)) {
      facets.duration.any++;
      const bucket = durationBucket(r.runtime);
      if (bucket) facets.duration[bucket]++;
    }
    if (passesWithout(BIT.provenance)) {
      for (const f of PROVENANCE_FILTERS) if (matchesProvenance(cat, r.video, f)) facets.provenance[f]++;
    }
  }
  return facets;
}

/** Single-step widenings that would yield more results than the current `total`, best first. */
function relaxations(cat: Catalogue, state: DiscoveryState, rows: Row[], index: VideoDoc[], total: number): Relaxation[] {
  const out: Relaxation[] = [];
  const countWithout = (bit: number) => rows.filter((r) => (r.fail & ~bit) === 0).length;
  const facet = (key: 'interests' | 'places' | 'periods', ids: ID[], anyLabel: string) => {
    if (!ids.length) return;
    const single = ids.length === 1;
    out.push({ key, value: single ? ids[0] : undefined, label: single ? `Remove ${cat.label(ids[0])}` : anyLabel, count: countWithout(BIT[key]) });
  };

  const q = state.q.trim();
  if (compileQuery(q)) {
    out.push({ key: 'q', label: `Clear the search “${q}”`, count: countWithout(BIT.q) });
    const words = unique(q.split(/\s+/)).filter((w) => foldedWords(w).some((t) => !isStopword(t)));
    if (words.length > 1) {
      for (const word of words) {
        const reduced = compileQuery(removeWord(q, word));
        const count = rows.filter((r, i) => (r.fail & ~BIT.q) === 0 && (!reduced || scoreDoc(index[i], reduced) !== null)).length;
        out.push({ key: 'q', value: word, label: `Search without “${word}”`, count });
      }
    }
  }
  facet('interests', state.interests, 'Any interest');
  facet('places', state.places, 'Anywhere');
  facet('periods', state.periods, 'Any period');
  if (state.access !== 'all') {
    out.push({ key: 'access', label: state.access === 'free' ? 'Include premium titles' : 'Include free titles', count: countWithout(BIT.access) });
  }
  if (state.duration !== 'any') out.push({ key: 'duration', label: 'Any length', count: countWithout(BIT.duration) });
  if (state.provenance.length) {
    const single = state.provenance.length === 1;
    out.push({
      key: 'provenance',
      value: single ? state.provenance[0] : undefined,
      label: single ? `Remove ${PROVENANCE_LABELS[state.provenance[0]]}` : 'Any source',
      count: countWithout(BIT.provenance),
    });
  }
  if (state.playableOnly) out.push({ key: 'playableOnly', label: 'Include titles not yet playable', count: countWithout(BIT.playableOnly) });

  // Stable sort keeps the declaration order above for equal counts.
  return out.filter((r) => r.count > total).sort((a, b) => b.count - a.count);
}

function searchEntities(cat: Catalogue, query: Query): EntityHit[] {
  const hits: EntityHit[] = [];
  for (const doc of entityIndex(cat)) {
    const scored = scoreDoc(doc, query);
    if (!scored) continue;
    const startsWith = doc.title.startsWith(query.whole) ? 3 : 0;
    hits.push({ id: doc.id, kind: doc.kind, label: doc.label, score: round(scored.score + startsWith) });
  }
  return hits.sort((a, b) => b.score - a.score || a.label.length - b.label.length || a.label.localeCompare(b.label)).slice(0, ENTITY_LIMIT);
}
