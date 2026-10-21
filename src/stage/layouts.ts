/**
 * THE LIVING ARCHIVE — forms (pure layout functions, no DOM, no three.js).
 *
 * Every arrangement is a FORM: where each seed rests, how it drifts, which organs are present,
 * where the camera looks and which scene furniture (spine, globe, helix, core) is lit. Every
 * form returns one slot per seed, in the input order and with the same ids, so seeds keep
 * their identity and migrate between forms instead of being rebuilt.
 *
 * World units: the home constellation spans ~±14, the globe has radius GLOBE_RADIUS, the time
 * helix runs along HELIX_AXIS. Positions at time t come from slotPosition(slot, form, t).
 */
import type { SectionId } from '../../shared/sections.ts';
import type { ID } from '../../shared/types.ts';
import type { Arrangement, TimeLens } from './contract.ts';

export type Vec3 = [number, number, number];

/* ───────────── Inputs ───────────── */

export interface SeedInfo {
  id: ID;
  /** Category sections the story belongs to (videosForSection), in navigation order. */
  sections: SectionId[];
  /** First place with coordinates. */
  place: { id: ID; lat: number; lon: number } | null;
  years: { setting: { from: number; to: number } | null; made: number | null; published: number | null };
  programme?: ID;
  planned: boolean;
  premium: boolean;
}

export interface RouteInfo {
  id: ID;
  from: [number, number];
  to: [number, number];
}

export interface LayoutInput {
  seeds: SeedInfo[];
  arrangement: Arrangement;
  /** Saved video ids (My World). */
  saved?: ID[];
  /** Focus: related seeds (resolved by the engine when the page gives none). */
  related?: ID[];
  /** Focus on a programme: its videos in series order. */
  members?: ID[];
  /** World: place id → [lat, lon]. */
  places?: Map<ID, [number, number]>;
  /** World: the focused place and its descendants. */
  scope?: Set<ID> | null;
  routes?: RouteInfo[];
  /** Viewport width / height. */
  aspect?: number;
}

/* ───────────── Outputs ───────────── */

export type SeedRole = 'member' | 'featured' | 'focus' | 'related' | 'saved' | 'recede' | 'pool' | 'ambient';

export interface SeedSlot {
  id: ID;
  role: SeedRole;
  /** Centre the seed circles (local spin axis: world Y through it). */
  center: Vec3;
  /** Offset from the centre at t = 0. */
  offset: Vec3;
  /** Local orbit speed (rad/s) about the Y axis through the centre. */
  spin: number;
  /** Exempt from the form's global spin (e.g. the featured seed in front of the camera). */
  fixed?: boolean;
  scale: number;
  /** 0 hidden … 1 fully present. */
  presence: number;
  /** Selected (iris rim). */
  selected?: boolean;
}

export interface OrganSlot {
  section: SectionId;
  pos: Vec3;
  /** Target bounding radius in world units. */
  radius: number;
  presence: number;
  fixed?: boolean;
}

export interface CameraShot {
  pos: Vec3;
  target: Vec3;
  fov: number;
  /** Horizontal shift of the subject as a fraction of the viewport width (+ = towards the right). */
  bias: number;
}

export interface Furniture {
  spine: number;
  globe: number;
  helix: number;
  core: number;
  haze: number;
}

export interface FormLayout {
  kind: Arrangement['kind'];
  seeds: SeedSlot[];
  organs: OrganSlot[];
  camera: CameraShot;
  /** Global spin (rad/s) about world Y through the origin. */
  spin: number;
  filaments: { from: ID; to: ID }[];
  furniture: Furniture;
  /** Overall liveliness 0..1 (watch is nearly still). */
  energy: number;
  /** Section whose hue tints the haze. */
  tint: SectionId | null;
  /** Free orbit by dragging. */
  orbit: 'free' | 'yaw' | 'none';
  world?: { place?: ID; route?: ID; latLon?: [number, number] };
  time?: { decade?: number; year?: number; lens: TimeLens };
}

/* ───────────── Constants ───────────── */

/** The nine category organs that orbit the Monumental spine on Home. */
export const ORGAN_SECTIONS: SectionId[] = ['movies', 'music', 'sports', 'gaming', 'news', 'fashion', 'culture', 'kids', 'live'];

export const GLOBE_RADIUS = 5;
export const HELIX_FIRST = 1900;
export const HELIX_LAST = 2029;
export const HELIX_DECADES: number[] = Array.from({ length: (HELIX_LAST + 1 - HELIX_FIRST) / 10 }, (_, i) => HELIX_FIRST + i * 10);
const HELIX_MID = (HELIX_FIRST + HELIX_LAST + 1) / 2; // 1965
const HELIX_UNITS_PER_YEAR = 0.42;
const HELIX_RADIUS = 2.5;
/** Unit direction of the time spine (left-front → right-back). */
export const HELIX_AXIS: Vec3 = norm([0.88, 0.06, -0.47]);

const HOME_ORGAN_RING = 12;
const HOME_ORGAN_RADIUS = 1.75;
const DESK_BIAS = 0.17;

/* ───────────── Vector helpers ───────────── */

export function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function rotateY(v: Vec3, a: number): Vec3 {
  if (a === 0) return v;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Same convention as the World atlas: lon 0 faces +Z, lat 90 is +Y. */
export function latLonToVec(lat: number, lon: number, r = 1): Vec3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

export function vecToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: (Math.asin(clamp(v[1] / r, -1, 1)) * 180) / Math.PI, lon: (Math.atan2(v[0], v[2]) * 180) / Math.PI };
}

/** Deterministic 0..1 hash of a string (+ salt) — stable scatter without Math.random. */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Position of a slot at time t (seconds) under its form's spins. */
export function slotPosition(slot: SeedSlot, form: Pick<FormLayout, 'spin'>, t: number): Vec3 {
  const local = add(slot.center, rotateY(slot.offset, slot.spin * t));
  return slot.fixed ? local : rotateY(local, form.spin * t);
}

export function organPosition(o: OrganSlot, form: Pick<FormLayout, 'spin'>, t: number): Vec3 {
  return o.fixed ? o.pos : rotateY(o.pos, form.spin * t);
}

/* ───────────── Migration timing ───────────── */

/** Stagger (s) before a seed starts migrating: a sweeping wave, never more than 0.42s. */
export function migrationDelay(index: number, count: number, id = ''): number {
  if (count <= 1) return 0;
  const wave = (index / (count - 1)) * 0.3;
  return Math.min(0.42, wave + hash01(id, 7) * 0.12);
}

/** Duration (s) of one migration leg. */
export const MIGRATION_SECONDS = 1.15;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ───────────── Shared builders ───────────── */

/**
 * Seeds around a centre: tilted rings of up to `perRing`, each ring wider and tilted the other
 * way, so a dozen reads as a halo and hundreds as a layered shell.
 */
function ringOffsets(n: number, inner: number, opts: { perRing?: number; gap?: number; tilt?: number; phase?: number } = {}): Vec3[] {
  const perRing = opts.perRing ?? 10;
  const gap = opts.gap ?? 1.15;
  const tilt = opts.tilt ?? 0.32;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const ring = Math.floor(i / perRing);
    const inRing = Math.min(perRing, n - ring * perRing);
    const k = i - ring * perRing;
    const a = (k / inRing) * Math.PI * 2 + (opts.phase ?? 0) + ring * 0.7;
    const r = inner + ring * gap;
    const tl = (ring % 2 === 0 ? 1 : -1) * tilt;
    out.push([Math.cos(a) * r, Math.sin(a) * r * tl, Math.sin(a) * r]);
  }
  return out;
}

/** Deterministic scatter inside an ellipsoidal shell (haze, pools, quiet field). */
function scatter(id: ID, size: Vec3, salt = 0): Vec3 {
  const u = hash01(id, 11 + salt) * 2 - 1;
  const v = hash01(id, 23 + salt) * 2 - 1;
  const w = hash01(id, 37 + salt) * 2 - 1;
  return [u * size[0], v * size[1], w * size[2]];
}

function recede(info: SeedInfo, presence = 0.14): SeedSlot {
  return {
    id: info.id,
    role: 'recede',
    center: [0, 0, -38],
    offset: scatter(info.id, [34, 15, 12]),
    spin: 0.006,
    scale: 0.55,
    presence,
  };
}

const narrow = (aspect: number | undefined) => (aspect ?? 1.6) < 0.9;
const bias = (aspect: number | undefined) => (narrow(aspect) ? 0 : DESK_BIAS);

const FURNITURE_NONE: Furniture = { spine: 0, globe: 0, helix: 0, core: 0, haze: 1 };

/* ───────────── Forms ───────────── */

/** Primary organ for a seed: the first of its sections that has an organ. */
export function primaryOrgan(info: SeedInfo): SectionId | null {
  for (const s of ORGAN_SECTIONS) if (info.sections.includes(s)) return s;
  return null;
}

export function homeOrganSlots(): OrganSlot[] {
  return ORGAN_SECTIONS.map((section, i) => {
    const a = (i / ORGAN_SECTIONS.length) * Math.PI * 2 + 0.35;
    return {
      section,
      pos: [Math.sin(a) * HOME_ORGAN_RING, Math.sin(i * 1.7) * 2.4, Math.cos(a) * HOME_ORGAN_RING],
      radius: HOME_ORGAN_RADIUS,
      presence: 1,
    };
  });
}

export function homeForm(input: LayoutInput & { arrangement: { kind: 'home' } }): FormLayout {
  const organs = homeOrganSlots();
  const byOrgan = new Map<SectionId | null, SeedInfo[]>();
  const featured = input.arrangement.featured;
  for (const s of input.seeds) {
    if (s.id === featured) continue;
    const o = primaryOrgan(s);
    const list = byOrgan.get(o);
    if (list) list.push(s);
    else byOrgan.set(o, [s]);
  }
  const slots = new Map<ID, SeedSlot>();
  organs.forEach((o, oi) => {
    const members = byOrgan.get(o.section) ?? [];
    const offs = ringOffsets(members.length, o.radius + 1.25, { perRing: 8, gap: 0.95, tilt: 0.42, phase: oi * 0.9 });
    members.forEach((m, k) => {
      slots.set(m.id, { id: m.id, role: 'member', center: o.pos, offset: offs[k], spin: (oi % 2 ? -1 : 1) * 0.16, scale: 0.62, presence: 0.95 });
    });
  });
  const loose = byOrgan.get(null) ?? [];
  const looseOffs = ringOffsets(loose.length, 5.4, { perRing: 12, gap: 1.2, tilt: 0.12 });
  loose.forEach((m, k) => {
    slots.set(m.id, { id: m.id, role: 'member', center: [0, -0.5, 0], offset: looseOffs[k], spin: 0.05, scale: 0.6, presence: 0.85 });
  });
  const n = narrow(input.aspect);
  const seeds = input.seeds.map((s) => {
    if (s.id === featured) {
      return { id: s.id, role: 'featured', center: n ? [0.4, 3.2, 13] : [3.6, 0.8, 13.5], offset: [0, 0, 0], spin: 0, fixed: true, scale: 1.55, presence: 1 } satisfies SeedSlot;
    }
    return slots.get(s.id)!;
  });
  return {
    kind: 'home',
    seeds,
    organs,
    camera: { pos: [0, 3.6, 31], target: [0, 0.6, 0], fov: 40, bias: bias(input.aspect) },
    spin: 0.022,
    filaments: [],
    furniture: { ...FURNITURE_NONE, spine: 1 },
    energy: 1,
    tint: null,
    orbit: 'yaw',
  };
}

/** Globe: seeds settle at their first place; seeds sharing a place cluster around it. */
export function worldForm(input: LayoutInput & { arrangement: { kind: 'world' } }): FormLayout {
  const R = GLOBE_RADIUS;
  const { place, route } = input.arrangement;
  const scope = input.scope ?? null;
  const groups = new Map<ID, SeedInfo[]>();
  for (const s of input.seeds) {
    if (!s.place) continue;
    const list = groups.get(s.place.id);
    if (list) list.push(s);
    else groups.set(s.place.id, [s]);
  }
  const slots = new Map<ID, SeedSlot>();
  for (const [pid, list] of groups) {
    const { lat, lon } = list[0].place!;
    const nrm = latLonToVec(lat, lon);
    // tangent basis at the place
    const up = cross([0, 1, 0], nrm);
    const east = Math.hypot(up[0], up[1], up[2]) < 1e-6 ? ([1, 0, 0] as Vec3) : norm(up);
    const north = cross(nrm, east);
    const inScope = !!scope?.has(pid);
    list.forEach((s, k) => {
      let off: Vec3 = [0, 0, 0];
      if (list.length > 1) {
        const ring = Math.floor(k / 7);
        const inRing = Math.min(7, list.length - ring * 7);
        const a = ((k - ring * 7) / inRing) * Math.PI * 2 + ring * 0.45;
        const r = 0.34 + ring * 0.3;
        off = add(mul(east, Math.cos(a) * r), mul(north, Math.sin(a) * r));
      }
      const alt = R * (1.075 + (list.length > 1 ? 0.012 * Math.floor(k / 7) : 0));
      slots.set(s.id, {
        id: s.id,
        role: 'member',
        center: add(mul(nrm, alt), off),
        offset: [0, 0, 0],
        spin: 0,
        scale: inScope ? 0.42 : 0.3,
        presence: scope ? (inScope ? 1 : 0.55) : 0.95,
        selected: inScope && list.length === 1 && place === pid,
      });
    });
  }
  const pool = input.seeds.filter((s) => !s.place);
  const poolOffs = ringOffsets(pool.length, R * 1.75, { perRing: 14, gap: 0.8, tilt: 0.08 });
  pool.forEach((s, k) => slots.set(s.id, { id: s.id, role: 'pool', center: [0, -R * 0.72, 0], offset: poolOffs[k], spin: 0.03, scale: 0.34, presence: 0.32 }));

  // camera
  let latLon: [number, number] | undefined;
  let dist = 17.5;
  const focusPlace = place ? input.places?.get(place) : undefined;
  const focusRoute = route ? input.routes?.find((r) => r.id === route) : undefined;
  if (focusRoute) {
    const a = latLonToVec(...focusRoute.from);
    const b = latLonToVec(...focusRoute.to);
    const m = vecToLatLon(norm(add(a, b)));
    latLon = [m.lat, m.lon];
    const ang = Math.acos(clamp(dot3(a, b), -1, 1));
    dist = 12.5 + ang * 4.2;
  } else if (focusPlace) {
    latLon = focusPlace;
    dist = 12.2;
  }
  const view = latLon ?? [22, -52];
  const dir = latLonToVec(view[0], view[1]);
  const n = narrow(input.aspect);
  const camPos = add(mul(dir, dist * (n ? 1.25 : 1)), [0, 0.6, 0]);
  const target = latLon ? mul(dir, R * 0.22) : [0, 0, 0];
  return {
    kind: 'world',
    seeds: input.seeds.map((s) => slots.get(s.id)!),
    organs: [],
    camera: { pos: camPos, target: target as Vec3, fov: 38, bias: bias(input.aspect) },
    spin: 0,
    filaments: [],
    furniture: { ...FURNITURE_NONE, globe: 1, haze: 0.6 },
    energy: 0.8,
    tint: null,
    orbit: 'free',
    world: { place, route, latLon },
  };
}

/** Point on the time spine's axis for a (fractional) year. */
export function helixAxisPoint(year: number): Vec3 {
  return mul(HELIX_AXIS, (year - HELIX_MID) * HELIX_UNITS_PER_YEAR);
}

/** Basis around the time spine: B1 faces the viewer (horizontal), B2 points up. */
export const HELIX_B1 = norm(cross(HELIX_AXIS, [0, 1, 0]));
export const HELIX_B2 = cross(HELIX_B1, HELIX_AXIS);

/** Point on the helix strand (radius r around the axis) for a year; one turn per decade. */
export function helixPoint(year: number, r = HELIX_RADIUS, phase = 0): Vec3 {
  const a = ((year - HELIX_FIRST) / 10) * Math.PI * 2 + phase;
  return add(helixAxisPoint(year), add(mul(HELIX_B1, Math.cos(a) * r), mul(HELIX_B2, Math.sin(a) * r)));
}

/** Year a seed takes on the helix under a lens (null → the pool). */
export function seedYear(info: SeedInfo, lens: TimeLens, focus?: { from: number; to: number }): number | null {
  let y: number | null;
  if (lens === 'setting') {
    const s = info.years.setting;
    if (!s) return null;
    y = s.from;
    // a story that spans the focused era gathers inside it
    if (focus && s.from <= focus.to && focus.from <= s.to) y = clamp((focus.from + focus.to) / 2, s.from, s.to);
  } else y = lens === 'made' ? info.years.made : info.years.published;
  if (y == null || !Number.isFinite(y) || y < HELIX_FIRST || y > HELIX_LAST + 0.999) return null;
  return y;
}

export function timeForm(input: LayoutInput & { arrangement: { kind: 'time' } }): FormLayout {
  const { decade, year } = input.arrangement;
  const lens = input.arrangement.lens ?? 'setting';
  const focus = year != null ? { from: year, to: year } : decade != null ? { from: decade, to: decade + 9 } : undefined;
  const yearOf = new Map<ID, number | null>();
  for (const s of input.seeds) yearOf.set(s.id, seedYear(s, lens, focus));
  // seeds sharing a year step around the strand and outward
  const seen = new Map<number, number>();
  const pool: SeedInfo[] = [];
  const slots = new Map<ID, SeedSlot>();
  const ordered = [...input.seeds].sort((a, b) => (yearOf.get(a.id) ?? 0) - (yearOf.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  for (const s of ordered) {
    const y = yearOf.get(s.id);
    if (y == null) {
      pool.push(s);
      continue;
    }
    const key = Math.round(y);
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const inFocus = focus ? y >= focus.from && y <= focus.to + 0.999 : true;
    const r = HELIX_RADIUS + Math.floor(k / 3) * 0.95;
    const pos = helixPoint(y + 0.5, r, (k % 3) * 2.1);
    slots.set(s.id, {
      id: s.id,
      role: 'member',
      center: pos,
      offset: [0, 0, 0],
      spin: 0,
      scale: focus ? (inFocus ? 0.72 : 0.46) : 0.6,
      presence: focus ? (inFocus ? 1 : 0.42) : 0.9,
    });
  }
  const poolCenter = add(helixAxisPoint(HELIX_FIRST - 6), [0, -6.2, 2.5]);
  const poolOffs = ringOffsets(pool.length, 2.2, { perRing: 9, gap: 0.8, tilt: 0.1 });
  pool.forEach((s, k) => slots.set(s.id, { id: s.id, role: 'pool', center: poolCenter, offset: poolOffs[k], spin: 0.04, scale: 0.42, presence: 0.26 }));

  const n = narrow(input.aspect);
  let camera: CameraShot;
  if (focus) {
    const mid = year != null ? year + 0.5 : decade! + 5;
    const c = helixAxisPoint(mid);
    // a side view square to the spine (slightly above, slightly looking forward in time)
    const toward = norm(add(HELIX_B1, mul(HELIX_B2, 0.32)));
    const d = (year != null ? 12 : 16.5) * (n ? 1.45 : 1);
    camera = { pos: add(c, add(mul(toward, d), mul(HELIX_AXIS, -1.6))), target: add(c, mul(HELIX_AXIS, 0.4)), fov: 40, bias: bias(input.aspect) };
  } else {
    camera = { pos: [-7, 6.5, 38 * (n ? 1.45 : 1)], target: [1.5, 0, -1], fov: 40, bias: bias(input.aspect) };
  }
  return {
    kind: 'time',
    seeds: input.seeds.map((s) => slots.get(s.id)!),
    organs: [],
    camera,
    spin: 0,
    filaments: [],
    furniture: { ...FURNITURE_NONE, helix: 1, haze: 0.7 },
    energy: 0.8,
    tint: null,
    orbit: 'yaw',
    time: { decade, year, lens },
  };
}

export function categoryForm(input: LayoutInput & { arrangement: { kind: 'category' } }): FormLayout {
  const section = input.arrangement.section;
  const hasOrgan = ORGAN_SECTIONS.includes(section);
  const members = input.seeds.filter((s) => s.sections.includes(section));
  const coreR = hasOrgan ? 3.5 : 1.6;
  const offs = ringOffsets(members.length, coreR + 2.6, { perRing: 9, gap: 1.35, tilt: 0.22 });
  const slots = new Map<ID, SeedSlot>();
  members.forEach((m, k) => slots.set(m.id, { id: m.id, role: 'member', center: [0, 0, 0], offset: offs[k], spin: 0.075, scale: 0.78, presence: 1 }));
  const n = narrow(input.aspect);
  return {
    kind: 'category',
    seeds: input.seeds.map((s) => slots.get(s.id) ?? recede(s)),
    organs: hasOrgan ? [{ section, pos: [0, 0, 0], radius: coreR, presence: 1, fixed: true }] : [],
    camera: { pos: [0, 1.6, 19 * (n ? 1.5 : 1)], target: [0, 0, 0], fov: 40, bias: bias(input.aspect) },
    spin: 0,
    filaments: [],
    furniture: { ...FURNITURE_NONE },
    energy: 1,
    tint: section,
    orbit: 'yaw',
  };
}

export function focusForm(input: LayoutInput & { arrangement: { kind: 'focus' } }): FormLayout {
  const a = input.arrangement;
  const members = input.members ?? [];
  const focusId = a.video ?? members[0];
  const ids = new Set(input.seeds.map((s) => s.id));
  const ring = [...new Set([...members, ...(a.related ?? input.related ?? [])])].filter((id) => id !== focusId && ids.has(id)).slice(0, 18);
  const ringIndex = new Map(ring.map((id, i) => [id, i]));
  const n = narrow(input.aspect);
  const radius = 4.8 + Math.max(0, ring.length - 8) * 0.22;
  const seeds = input.seeds.map((s): SeedSlot => {
    if (s.id === focusId) return { id: s.id, role: 'focus', center: n ? [0, 2.2, 4] : [0.4, 0.4, 4], offset: [0, 0, 0], spin: 0, fixed: true, scale: 2.0, presence: 1, selected: true };
    const k = ringIndex.get(s.id);
    if (k !== undefined) {
      const ang = (k / Math.max(1, ring.length)) * Math.PI * 2 + Math.PI / 2;
      return {
        id: s.id,
        role: 'related',
        center: [Math.cos(ang) * radius, Math.sin(ang) * radius * 0.78, 0.6 + Math.sin(ang * 2) * 0.6],
        offset: [0, 0, 0],
        spin: 0,
        fixed: true,
        scale: 0.78,
        presence: 0.95,
      };
    }
    return recede(s, 0.12);
  });
  return {
    kind: 'focus',
    seeds,
    organs: [],
    camera: { pos: [0, 0.8, 17 * (n ? 1.45 : 1)], target: [0, 0.4, 0], fov: 40, bias: bias(input.aspect) },
    spin: 0,
    filaments: focusId && ids.has(focusId) ? ring.map((to) => ({ from: focusId, to })) : [],
    furniture: { ...FURNITURE_NONE },
    energy: 0.9,
    tint: null,
    orbit: 'none',
  };
}

export function watchForm(input: LayoutInput & { arrangement: { kind: 'watch' } }): FormLayout {
  const id = input.arrangement.video;
  return {
    kind: 'watch',
    seeds: input.seeds.map((s): SeedSlot =>
      s.id === id
        ? { id: s.id, role: 'focus', center: [0, 0, -22], offset: [0, 0, 0], spin: 0, fixed: true, scale: 1.6, presence: 0.3, selected: true }
        : { id: s.id, role: 'recede', center: [0, 0, -60], offset: scatter(s.id, [44, 20, 10]), spin: 0, scale: 0.6, presence: 0.06 },
    ),
    organs: [],
    camera: { pos: [0, 0, 20], target: [0, 0, -10], fov: 40, bias: 0 },
    spin: 0,
    filaments: [],
    furniture: { ...FURNITURE_NONE, haze: 0.25 },
    energy: 0,
    tint: null,
    orbit: 'none',
  };
}

export function personalForm(input: LayoutInput & { arrangement: { kind: 'personal' } }): FormLayout {
  const ids = new Set(input.seeds.map((s) => s.id));
  const saved = (input.saved ?? []).filter((id) => ids.has(id));
  const offs = ringOffsets(saved.length, 3.9, { perRing: 9, gap: 1.25, tilt: 0.3 });
  const index = new Map(saved.map((id, i) => [id, i]));
  const n = narrow(input.aspect);
  return {
    kind: 'personal',
    seeds: input.seeds.map((s): SeedSlot => {
      const k = index.get(s.id);
      if (k === undefined) return { id: s.id, role: 'recede', center: [0, 0, -30], offset: scatter(s.id, [30, 14, 10]), spin: 0.005, scale: 0.5, presence: 0.1 };
      return { id: s.id, role: 'saved', center: [0, 0, 0], offset: offs[k], spin: 0.09, scale: 0.72, presence: 1 };
    }),
    organs: [],
    camera: { pos: [0, 1.8, 17 * (n ? 1.5 : 1)], target: [0, 0, 0], fov: 40, bias: bias(input.aspect) },
    spin: 0,
    filaments: [],
    furniture: { ...FURNITURE_NONE, core: 1 },
    energy: 0.9,
    tint: null,
    orbit: 'yaw',
  };
}

export function quietForm(input: LayoutInput): FormLayout {
  return {
    kind: 'quiet',
    seeds: input.seeds.map((s) => ({ id: s.id, role: 'ambient', center: [0, 0, -14], offset: scatter(s.id, [28, 10, 9], 3), spin: 0, scale: 0.55, presence: 0.32 })),
    organs: [],
    camera: { pos: [0, 0, 22], target: [0, 0, -6], fov: 42, bias: 0 },
    spin: 0.01,
    filaments: [],
    furniture: { ...FURNITURE_NONE, haze: 0.8 },
    energy: 0.5,
    tint: null,
    orbit: 'none',
  };
}

/** The form for any arrangement. */
export function layoutFor(input: LayoutInput): FormLayout {
  const a = input.arrangement;
  switch (a.kind) {
    case 'home':
      return homeForm({ ...input, arrangement: a });
    case 'world':
      return worldForm({ ...input, arrangement: a });
    case 'time':
      return timeForm({ ...input, arrangement: a });
    case 'category':
      return categoryForm({ ...input, arrangement: a });
    case 'focus':
      return focusForm({ ...input, arrangement: a });
    case 'watch':
      return watchForm({ ...input, arrangement: a });
    case 'personal':
      return personalForm({ ...input, arrangement: a });
    default:
      return quietForm(input);
  }
}

/** Highlight (filter results) modulation: non-highlighted seeds dim, highlighted ones swell. */
export function highlightFactor(id: ID, highlight: ID[] | Set<ID> | null): { presence: number; scale: number } {
  if (!highlight) return { presence: 1, scale: 1 };
  const has = highlight instanceof Set ? highlight.has(id) : highlight.includes(id);
  return has ? { presence: 1, scale: 1.08 } : { presence: 0.24, scale: 0.9 };
}
