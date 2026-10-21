/**
 * MONUMENTAL STREAMS — central content contract.
 *
 * One catalogue, stable prefixed identifiers ("place:miami", "video:open-archive-subway-1905"),
 * relationships by id only. Every screen derives from these records; nothing is duplicated.
 * Authored JSON lives in /content, is validated by shared/schema.ts and normalised by
 * shared/catalogue.ts for both the server and the client.
 */

export type ID = string;

/* ───────────────────────── Taxonomy ───────────────────────── */

export type PlaceKind =
  | 'country' // sovereign state, e.g. United States, United Kingdom, Jamaica
  | 'territory' // e.g. Puerto Rico (unincorporated US territory)
  | 'constituent-country' // e.g. England within the UK
  | 'state' // e.g. Florida
  | 'county' // e.g. Miami-Dade County
  | 'city' // incorporated city / municipality, e.g. Miami, Miami Beach, San Juan
  | 'borough' // e.g. The Bronx
  | 'neighbourhood' // e.g. Wynwood, Little Havana, Brixton
  | 'district' // official historic/administrative district, e.g. Miami Beach Architectural District
  | 'venue'; // a specific building or site

export interface Place {
  id: ID; // "place:miami"
  slug: string; // "miami" — unique across places, used in URLs
  name: string;
  kind: PlaceKind;
  parent?: ID; // administrative/geographic parent (neighbourhood → city → county → state → country)
  country: string; // ISO 3166-1 alpha-2 of the area itself where one exists ("US", "PR", "GB", "JM", "CU")
  coords: [lat: number, lon: number]; // WGS84 decimal degrees, accurate to the place's centre
  summary: string;
  aliases?: string[]; // alternate names used by search ("El Barrio", "Calle Ocho")
  gateway?: boolean; // the launch gateway (Miami)
  /** "active" = has stories now; "expanding" = mapped so the system can grow, no stories yet. */
  status: 'active' | 'expanding';
  facts?: Fact[];
}

export interface Fact {
  label: string;
  value: string;
  source?: string; // human-readable source note
}

export interface Period {
  id: ID; // "period:1970s"
  slug: string; // "1970s"
  label: string; // "1970s"
  start: number; // 1970
  end: number; // 1979
  summary: string;
}

/** A cultural movement / era with real dates. Bridges places, periods and people. */
export interface Movement {
  id: ID; // "movement:hip-hop-origins"
  slug: string;
  name: string;
  start: number; // year
  end: number | null; // null = ongoing
  places: ID[];
  categories: ID[];
  themes: ID[];
  influences?: ID[]; // earlier movements this one draws from (lineage)
  summary: string;
  facts?: Fact[];
}

export interface Person {
  id: ID; // "person:valid-id"
  slug: string;
  name: string;
  kind: 'presenter' | 'artist' | 'historical' | 'creator';
  roles: string[]; // ["Inaugural presenter", "Featured artist"]
  summary: string;
  places?: ID[];
  movements?: ID[];
  categories?: ID[];
  art?: ID; // art asset id (provisional until approved imagery exists)
  /** True when the record is a placeholder awaiting client-approved biography/imagery. */
  provisional?: boolean;
}

/** Interests / creative disciplines: music, film, documentary, art, fashion, food, culture, sport, gaming, lifestyle. */
export interface Category {
  id: ID; // "interest:music"
  slug: string;
  name: string;
  summary: string;
}

export interface Theme {
  id: ID; // "theme:diaspora"
  slug: string;
  name: string;
  summary: string;
}

/** A cultural connection between two places (migration, influence, exchange, or a programme's journey). */
export interface Route {
  id: ID; // "route:san-juan-to-new-york"
  from: ID; // place id
  to: ID; // place id
  kind: 'migration' | 'influence' | 'exchange' | 'programme';
  label: string; // "La Gran Migración"
  period: { from: number; to: number | null };
  movements?: ID[];
  themes?: ID[];
  summary: string;
}

/* ───────────────────────── Programming ───────────────────────── */

export type ProgrammeKind =
  | 'original-series' // WAVEMAKERS, THE STORY BEHIND THE STORY
  | 'original-chapter' // "Valid ID presents WAVEMAKERS: Puerto Rico, New York to London"
  | 'artist-campaign' // Better Late Than Never
  | 'demonstration-series' // preview catalogue groupings (sample media)
  | 'collection';

export type ProgrammeStatus = 'available' | 'announced' | 'in-development' | 'planned';

export interface Programme {
  id: ID; // "programme:wavemakers"
  slug: string;
  title: string;
  kind: ProgrammeKind;
  parent?: ID; // a chapter belongs to a series
  status: ProgrammeStatus;
  original: boolean; // a Monumental Original
  tagline: string;
  description: string;
  presenters?: ID[]; // person ids
  people?: ID[];
  places: ID[];
  periods: ID[];
  movements?: ID[];
  categories: ID[];
  themes: ID[];
  /** Ordered journey of place ids, for journey-shaped programmes (Puerto Rico → New York → London). */
  route?: ID[];
  art: ID; // art asset id
  /** Plain statement shown to viewers about what exists today (honesty note). */
  statusNote: string;
}

export type VideoKind = 'episode' | 'feature' | 'short' | 'teaser' | 'reel' | 'archive-film';

export type FootageType =
  | 'archive' // genuine historical footage
  | 'commentary' // presenter / interview / talking-head material
  | 'reconstruction' // staged re-creation of past events
  | 'illustrative' // motion design / artwork depicting ideas, not events
  | 'fiction' // narrative fiction (e.g. open-movie shorts)
  | 'contemporary'; // present-day documentary footage

export type Provenance =
  | 'monumental-original' // finished client programme (none exist yet)
  | 'studio-concept' // Monumental studio motion design (the preview loops)
  | 'public-domain' // demonstration media in the public domain
  | 'creative-commons'; // demonstration media under a CC licence

export type Mood = 'chill' | 'lively' | 'curious' | 'late';

export type Access = 'free' | 'premium';

export type AvailabilityStatus =
  | 'available' // playable now under its access level
  | 'early-access' // premium members now; everyone from publicFrom
  | 'coming-soon' // dated, not yet playable
  | 'planned' // no date, not playable
  | 'unavailable'; // withdrawn / media missing

export interface Availability {
  status: AvailabilityStatus;
  publicFrom?: string; // ISO date
  note?: string;
}

export interface Credit {
  licence: string; // "Public domain (US, pre-1930 publication)", "CC BY 3.0"
  attribution: string; // exact attribution text to display
  sourceUrl?: string;
}

export interface Video {
  id: ID; // "video:..."
  slug: string;
  title: string;
  kind: VideoKind;
  programme?: ID; // series / chapter / demonstration series
  season?: number;
  order?: number; // series order within programme (1-based)
  summary: string; // one line
  description: string; // paragraph(s)
  categories: ID[];
  places: ID[];
  periods: ID[];
  movements?: ID[];
  themes: ID[];
  moods: Mood[];
  people?: { person: ID; role: string }[];
  /** Historical setting — when the story takes place. Separate from publication. null = timeless/abstract. */
  setting: { from: number; to: number; label?: string } | null;
  /** When the work was originally made (archive films). */
  made?: number;
  /** When it was published on Monumental Streams (ISO date). */
  published: string;
  access: Access;
  availability: Availability;
  footage: FootageType[];
  provenance: Provenance;
  /** Media asset id resolved server-side (media manifest). Absent = not playable (planned programming). */
  media?: ID;
  art: ID;
  credits?: Credit;
  /** Optional editorial "why it matters" lines used in connection explanations. */
  notes?: string[];
  /** Viewer context card shown before playback: dated framing, omissions, sensitive material. */
  context?: string;
}

/** Rule-based or hand-picked collection. Rule collections pick up new videos automatically. */
export interface Collection {
  id: ID; // "collection:miami-gateway"
  slug: string;
  title: string;
  description: string;
  rule?: Partial<DiscoveryState>;
  items?: ID[];
  featured?: boolean;
  art?: ID;
}

/** Visual asset registry entry. Content references "art:*" ids; files are swappable. */
export interface ArtAsset {
  id: ID; // "art:wavemakers-key"
  stem: string; // file stem in /media/public ("17-wavemakers-lines")
  alt: string;
  kind: 'studio-loop' | 'still' | 'generated';
  provisional: boolean; // true until client-approved artwork replaces it
  credit?: string;
}

/** Maintained editorial data for "current activity". Only shown when present and in date. */
export interface ActivityItem {
  id: ID;
  kind: 'event' | 'release' | 'status';
  title: string;
  place?: ID;
  starts?: string;
  ends?: string;
  summary: string;
  source: string; // who maintains/verified it
  verifiedAt: string;
  url?: string;
}

/** Where content can be found outside Monumental. Only shown when maintained/verified. */
export interface ExternalAvailability {
  video: ID;
  service: string;
  url: string;
  verifiedAt: string;
}

export interface MembershipConfig {
  /** Display name of the paid tier. */
  tierName: string;
  /** Prices are unapproved — every price carries provisional=true until signed off. */
  plans: { id: string; label: string; interval: 'month' | 'year'; displayPrice: string | null; provisional: boolean; stripePriceEnv: string }[];
  /** Only benefits that actually exist in the catalogue/product today. */
  benefits: { id: string; title: string; detail: string; live: boolean }[];
  note: string;
}

export interface RawContent {
  places: Place[];
  periods: Period[];
  movements: Movement[];
  people: Person[];
  categories: Category[];
  themes: Theme[];
  routes: Route[];
  programmes: Programme[];
  videos: Video[];
  collections: Collection[];
  art: ArtAsset[];
  activity: ActivityItem[];
  external: ExternalAvailability[];
  membership: MembershipConfig;
}

/* ───────────────────────── Media (server-resolved) ───────────────────────── */

export interface Rendition {
  height: number;
  width: number;
  bandwidth: number; // bits per second
  label: string; // "1080p"
}

export interface CaptionTrack {
  lang: string; // BCP-47
  label: string;
  kind: 'captions' | 'subtitles' | 'descriptions';
  src: string; // URL (public)
  default?: boolean;
}

export interface MediaAsset {
  id: ID; // "media:reel-world-wired"
  duration: number; // seconds, measured by ffprobe
  width: number;
  height: number;
  hasAudio: boolean;
  renditions: Rendition[]; // actually encoded renditions only
  hls?: string; // path relative to media root, e.g. "reel-world-wired/master.m3u8"
  mp4: string; // progressive fallback, e.g. "reel-world-wired/720.mp4"
  captions: CaptionTrack[];
  chapters?: string; // public URL to WebVTT chapters
  thumbnails?: string; // public URL to WebVTT thumbnail track (sprite xywh)
  source: string; // source note for the asset manifest
}

/* ───────────────────────── Client-facing projections ───────────────────────── */

/** Public media facts merged into a video on the client. Never includes protected file paths. */
export interface PublicMediaInfo {
  duration: number;
  renditions: Rendition[];
  captions: CaptionTrack[];
  chapters?: string;
  thumbnails?: string;
  hasAudio: boolean;
}

export interface ArtUrls {
  poster: string; // 1280w webp
  posterSmall: string; // 640w webp
  lqip: string; // data URI
  preview?: string; // 720p loop mp4
  previewSmall?: string; // 480p loop mp4
  alt: string;
  provisional: boolean;
}

/** GET /api/catalogue payload. */
export interface CataloguePayload {
  version: string; // content hash
  content: Omit<RawContent, 'art'>;
  art: Record<ID, ArtUrls>;
  media: Record<ID, PublicMediaInfo>; // keyed by media id
}

/* ───────────────────────── Discovery state ───────────────────────── */

export type DurationBucket = 'any' | 'under-5' | '5-to-20' | 'over-20';
export type SortKey = 'relevance' | 'newest' | 'setting-oldest' | 'setting-newest' | 'shortest' | 'longest';
export type ProvenanceFilter = 'original' | 'archive' | 'studio' | 'open-cinema';

export interface DiscoveryState {
  q: string;
  interests: ID[]; // category ids
  places: ID[]; // place ids (include descendants)
  periods: ID[]; // period ids — matched against the historical SETTING
  access: 'all' | 'free' | 'premium';
  duration: DurationBucket;
  provenance: ProvenanceFilter[];
  playableOnly: boolean;
  sort: SortKey;
}

/* ───────────────────────── Relations ───────────────────────── */

export type ReasonKind =
  | 'place'
  | 'place-family' // shares a parent/child place (Wynwood ⊂ Miami)
  | 'route' // places joined by a cultural route
  | 'period'
  | 'movement'
  | 'lineage' // movement influence chain
  | 'person'
  | 'category'
  | 'theme'
  | 'programme'
  | 'series-order'
  | 'mood'
  | 'history' // "Because you watched …"
  | 'access' // "Free to watch now"
  | 'editorial'; // gateway / featured picks

export interface Reason {
  kind: ReasonKind;
  label: string; // human sentence fragment: "Both set in Miami"
  via?: ID; // the shared entity
}

export interface Connection {
  target: ID;
  weight: number;
  reasons: Reason[];
}

/* ───────────────────────── Personal state ───────────────────────── */

export interface ProgressEntry {
  pos: number; // seconds
  dur: number; // seconds
  at: number; // epoch ms (last write — used for merge)
  done: boolean;
}

export interface Stamped {
  at: number;
  removed?: boolean; // tombstone so removals sync across devices
}

export interface Journey {
  id: string;
  title: string;
  kind: 'passport' | 'somewhere';
  stops: ID[]; // place ids (passport) or video ids (somewhere)
  params?: Record<string, string>;
  at: number;
  removed?: boolean;
}

export interface HistoryEntry {
  video: ID;
  at: number;
  removed?: boolean; // tombstone so a removed entry stays removed after merging devices
}

export type MotionPref = 'system' | 'reduce' | 'full';

export interface Preferences {
  sound: { enabled: boolean; master: number; ambience: number; effects: number; programme: number; muted: boolean };
  motion: MotionPref;
  previews: 'auto' | 'hover' | 'off';
  captions: { enabled: boolean; lang: string; size: 'm' | 'l' | 'xl' };
  playbackRate: number;
  autoplayNext: boolean;
  nativeControls: boolean;
  cursor: 'organic' | 'native';
  at: number;
}

export interface Library {
  version: 1;
  progress: Record<ID, ProgressEntry>;
  saved: Record<ID, Stamped>; // video ids
  savedPlaces: Record<ID, Stamped>;
  journeys: Record<string, Journey>;
  history: HistoryEntry[]; // newest first, capped
  historyClearedAt?: number; // entries at or before this are cleared on every device
  interests: Record<ID, Stamped>; // category ids
  stamps: Record<ID, { at: number; video: ID }>; // passport stamps by place id
  prefs: Preferences;
  updatedAt: number;
}

/* ───────────────────────── Account / membership ───────────────────────── */

export type MembershipStatus =
  | 'none' // signed-in free account
  | 'active' // premium, paid, server-verified
  | 'cancelled' // premium until periodEnd, will not renew
  | 'past_due'
  | 'expired'
  | 'dev_preview'; // development preview entitlement — NO payment taken

export interface SessionInfo {
  user: { id: string; email: string; name: string; createdAt: string } | null;
  membership: {
    status: MembershipStatus;
    premium: boolean; // server-computed entitlement right now
    periodEnd: string | null;
    source: 'stripe' | 'dev-preview' | null;
  };
  csrf: string;
}

export interface PlatformConfig {
  billing: { mode: 'stripe-test' | 'stripe-live' | 'setup-pending'; devPreviewEnabled: boolean };
  sync: { mode: 'server' };
  integrations: { id: string; name: string; status: 'connected' | 'not-configured' | 'not-connected'; detail: string }[];
  environment: 'development' | 'production';
}
