/**
 * CONNECTIONS (the synapse route) — entity resolution and header facts (pure, no DOM).
 * The connections page doubles as the person, movement, theme and interest page, so the header
 * states what the data says and nothing more: kind, name, summary, key facts, honesty notes,
 * and one primary way onward (Watch / Open in World / Open in Time Machine / Programme page).
 */
import { kindOf } from '../../../shared/catalogue.ts';
import type { Catalogue, Entity, EntityKind } from '../../../shared/catalogue.ts';
import { discoveryWith } from '../../../shared/search.ts';
import { discoveryToSearch } from '../../../shared/url-state.ts';
import type { Category, ID, Movement, Period, Person, Place, Programme, Route, Theme, Video } from '../../../shared/types.ts';
import { FOOTAGE_LABEL, PROVENANCE_LABEL, dateLabel, settingLabel } from '../../lib/format.ts';
import type { IconName } from '../../ui/Icon.tsx';

export type SynKind = 'video' | 'programme' | 'place' | 'period' | 'movement' | 'person' | 'interest' | 'theme' | 'route';
export const SYN_KINDS: SynKind[] = ['place', 'person', 'movement', 'programme', 'video', 'period', 'interest', 'theme', 'route'];
export const isSynKind = (k: string): k is SynKind => (SYN_KINDS as string[]).includes(k);

export const KIND_LABEL: Record<EntityKind, string> = {
  video: 'Story',
  programme: 'Programme',
  place: 'Place',
  period: 'Decade',
  movement: 'Movement',
  person: 'Person',
  interest: 'Interest',
  theme: 'Theme',
  route: 'Route',
  collection: 'Collection',
};
export const KIND_PLURAL: Record<EntityKind, string> = {
  video: 'Stories',
  programme: 'Programmes',
  place: 'Places',
  period: 'Decades',
  movement: 'Movements',
  person: 'People',
  interest: 'Interests',
  theme: 'Themes',
  route: 'Routes',
  collection: 'Collections',
};

const PLACE_KIND: Record<Place['kind'], string> = {
  country: 'Country',
  territory: 'Territory',
  'constituent-country': 'Constituent country',
  state: 'State',
  county: 'County',
  city: 'City',
  borough: 'Borough',
  neighbourhood: 'Neighbourhood',
  district: 'District',
  venue: 'Venue',
};
const PERSON_KIND: Record<Person['kind'], string> = { presenter: 'Presenter', artist: 'Artist', historical: 'Historical figure', creator: 'Creator' };
const PROGRAMME_KIND: Record<Programme['kind'], string> = {
  'original-series': 'Original series',
  'original-chapter': 'Original chapter',
  'artist-campaign': 'Artist campaign',
  'demonstration-series': 'Demonstration series',
  collection: 'Collection',
};
export const PROGRAMME_STATUS: Record<Programme['status'], string> = { available: 'Available', announced: 'Announced', 'in-development': 'In development', planned: 'Planned' };
const VIDEO_KIND: Record<Video['kind'], string> = { episode: 'Episode', feature: 'Feature', short: 'Short', teaser: 'Teaser', reel: 'Reel', 'archive-film': 'Archive film' };
const ROUTE_KIND: Record<Route['kind'], string> = { migration: 'Migration', influence: 'Influence', exchange: 'Exchange', programme: 'Programme journey' };

/** Order tried when the URL's kind is missing or wrong (e.g. /synapse/person/miami). */
const FALLBACK: SynKind[] = ['place', 'person', 'movement', 'programme', 'video', 'period', 'interest', 'theme', 'route'];

export interface Resolved {
  entity: Entity;
  kind: SynKind;
  /** False when the URL's kind did not match and the page should redirect to the canonical address. */
  canonical: boolean;
}

export function resolveEntity(cat: Catalogue, kind: string, slug: string): Resolved | null {
  const wanted = kind === 'category' ? 'interest' : kind;
  const find = (k: SynKind) => (k === 'route' ? cat.get(`route:${slug}`) : cat.bySlug(k, slug));
  if (isSynKind(wanted)) {
    const e = find(wanted);
    if (e) return { entity: e, kind: wanted, canonical: wanted === kind };
  }
  if (slug.includes(':')) {
    const k = kindOf(slug);
    const e = cat.get(slug);
    if (e && k && isSynKind(k)) return { entity: e, kind: k, canonical: false };
  }
  for (const k of FALLBACK) {
    const e = find(k);
    if (e) return { entity: e, kind: k, canonical: false };
  }
  return null;
}

/** The synapse address of any entity; collections (not connectable) fall back to their page. */
export function synapseHref(cat: Catalogue, id: ID): string {
  const k = kindOf(id);
  if (!k || !isSynKind(k)) return cat.href(id);
  const e = cat.get(id);
  const slug = e && 'slug' in e && e.slug ? e.slug : id.slice(id.indexOf(':') + 1);
  return `/synapse/${k}/${slug}`;
}

/** The Time Machine decade for a year, clamped into the archive's range. */
export function decadeFor(cat: Catalogue, year: number): Period | undefined {
  const ps = cat.periods;
  if (!ps.length) return undefined;
  const y = Math.min(Math.max(year, ps[0].start), ps[ps.length - 1].end);
  return cat.periodsForYears(y, y)[0] ?? ps[0];
}

export function storiesFor(cat: Catalogue, id: ID, kind: SynKind): Video[] {
  switch (kind) {
    case 'place':
      return cat.videosForPlace(id, true);
    case 'person':
      return cat.videosForPerson(id);
    case 'movement':
      return cat.videosForMovement(id);
    case 'period':
      return cat.videosForPeriod(id);
    case 'programme':
      return cat.videosForProgramme(id);
    case 'interest':
      return cat.videosForCategory(id);
    case 'theme':
      return cat.videosForTheme(id);
    default:
      return [];
  }
}

export interface FactRow {
  label: string;
  items: { text: string; to?: string }[];
}
export interface HeaderAction {
  label: string;
  to: string;
  icon: IconName;
  /** Accessible name when the visible label is short ("Watch"). */
  aria?: string;
  /** Small caption shown beside the action ("Plays: …"). */
  note?: string;
}
export interface EntityHeader {
  kindLabel: string;
  title: string;
  lede: string;
  body?: string;
  facts: FactRow[];
  notices: string[];
  art?: ID;
  primary?: HeaderAction;
  secondary: HeaderAction[];
}

const plain = (...texts: string[]) => texts.map((text) => ({ text }));
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function entityHeader(cat: Catalogue, entity: Entity, kind: SynKind, now = new Date()): EntityHeader {
  const id = entity.id;
  const links = (ids: ID[]) => ids.filter((x) => cat.get(x)).map((x) => ({ text: cat.label(x), to: synapseHref(cat, x) }));
  const stories = storiesFor(cat, id, kind);
  const storiesRow: FactRow[] = kind === 'video' || kind === 'route' ? [] : [{ label: 'Stories', items: plain(stories.length ? count(stories.length, 'story', 'stories') : 'None yet') }];
  const out: EntityHeader = { kindLabel: KIND_LABEL[kind], title: cat.label(id), lede: '', facts: [], notices: [], secondary: [] };

  switch (kind) {
    case 'place': {
      const p = entity as Place;
      out.kindLabel = `Place · ${PLACE_KIND[p.kind]}`;
      out.lede = p.summary;
      const anc = cat.placeAncestors(p.id);
      if (anc.length) out.facts.push({ label: 'Part of', items: anc.map((a) => ({ text: a.name, to: synapseHref(cat, a.id) })) });
      out.facts.push({ label: 'Status', items: plain(p.status === 'active' ? 'Active' : 'Expanding — mapped so the archive can grow') });
      if (p.aliases?.length) out.facts.push({ label: 'Also known as', items: plain(...p.aliases) });
      out.facts.push(...storiesRow);
      for (const f of p.facts ?? []) out.facts.push({ label: f.label, items: plain(f.source ? `${f.value} (${f.source})` : f.value) });
      out.primary = { label: 'Open in World', to: cat.href(p.id), icon: 'globe' };
      break;
    }
    case 'person': {
      const x = entity as Person;
      out.kindLabel = `Person · ${PERSON_KIND[x.kind]}`;
      out.lede = x.summary;
      out.art = x.art;
      if (x.roles.length) out.facts.push({ label: 'Roles', items: plain(...x.roles) });
      if (x.places?.length) out.facts.push({ label: 'Places', items: links(x.places) });
      if (x.movements?.length) out.facts.push({ label: 'Movements', items: links(x.movements) });
      out.facts.push(...storiesRow);
      if (x.provisional) out.notices.push('Provisional record: this biography and imagery are placeholders awaiting approval.');
      const play = stories.find((v) => cat.isPlayable(v, now));
      if (play) out.primary = { label: 'Watch', to: cat.href(play.id), icon: 'play', aria: `Watch ${play.title}`, note: play.title };
      else if (x.places?.[0]) out.primary = { label: 'Open in World', to: cat.href(x.places[0]), icon: 'globe' };
      break;
    }
    case 'movement': {
      const m = entity as Movement;
      out.lede = m.summary;
      out.facts.push({ label: 'Years', items: plain(m.end === null ? `${m.start}–present` : m.start === m.end ? String(m.start) : `${m.start}–${m.end}`) });
      if (m.places.length) out.facts.push({ label: 'Where', items: links(m.places) });
      if (m.influences?.length) out.facts.push({ label: 'Drew on', items: links(m.influences) });
      const echoes = cat.movements.filter((x) => x.influences?.includes(m.id)).map((x) => x.id);
      if (echoes.length) out.facts.push({ label: 'Echoed by', items: links(echoes) });
      out.facts.push(...storiesRow);
      for (const f of m.facts ?? []) out.facts.push({ label: f.label, items: plain(f.source ? `${f.value} (${f.source})` : f.value) });
      const d = decadeFor(cat, m.start);
      if (d) out.primary = { label: 'Open in Time Machine', to: `/time-machine/${d.slug}?movement=${m.slug}`, icon: 'time' };
      break;
    }
    case 'period': {
      const p = entity as Period;
      out.lede = p.summary;
      out.facts.push({ label: 'Years', items: plain(`${p.start}–${p.end}`) });
      out.facts.push({ label: 'Movements alive', items: plain(String(cat.movementsForPeriod(p.id).length)) });
      out.facts.push({ label: 'Stories set then', items: plain(String(stories.length)) });
      out.primary = { label: 'Open in Time Machine', to: `/time-machine/${p.slug}`, icon: 'time' };
      break;
    }
    case 'programme': {
      const g = entity as Programme;
      out.kindLabel = `Programme · ${PROGRAMME_KIND[g.kind]}`;
      out.lede = g.tagline;
      out.body = g.description;
      out.art = g.art;
      out.facts.push({ label: 'Status', items: plain(PROGRAMME_STATUS[g.status]) });
      out.facts.push({ label: 'Origin', items: plain(g.original ? 'Monumental Original' : g.kind === 'demonstration-series' ? 'Demonstration media — not a Monumental Original' : 'Not a Monumental Original') });
      if (g.parent) out.facts.push({ label: 'Part of', items: links([g.parent]) });
      if (g.presenters?.length) out.facts.push({ label: 'Presented by', items: links(g.presenters) });
      if (g.route?.length) out.facts.push({ label: 'Journey', items: links(g.route) });
      out.facts.push(...storiesRow);
      if (g.statusNote) out.notices.push(g.statusNote);
      out.primary = { label: 'Programme page', to: cat.href(g.id), icon: 'list' };
      break;
    }
    case 'video': {
      const v = entity as Video;
      out.kindLabel = `Story · ${VIDEO_KIND[v.kind]}`;
      out.lede = v.summary;
      out.art = v.art;
      out.facts.push({ label: 'Set', items: plain(v.setting ? settingLabel(v) : 'Timeless — no historical setting') });
      out.facts.push({ label: 'Made', items: plain(v.made != null ? String(v.made) : 'Not recorded') });
      out.facts.push({ label: 'Published', items: plain(dateLabel(v.published)) });
      if (v.footage.length) out.facts.push({ label: 'Footage', items: plain(...v.footage.map((f) => FOOTAGE_LABEL[f])) });
      out.facts.push({ label: 'Provenance', items: plain(PROVENANCE_LABEL[v.provenance]) });
      if (v.programme) out.facts.push({ label: 'Programme', items: [{ text: cat.label(v.programme), to: cat.href(v.programme) }] });
      if (v.credits) out.facts.push({ label: 'Credit', items: plain(`${v.credits.attribution} · ${v.credits.licence}`) });
      if (v.availability.note) out.notices.push(v.availability.note);
      const playable = cat.isPlayable(v, now);
      out.primary = playable ? { label: 'Watch', to: cat.href(v.id), icon: 'play', aria: `Watch ${v.title}` } : { label: 'Story details', to: cat.href(v.id), icon: 'info' };
      if (v.programme) out.secondary.push({ label: 'Programme page', to: cat.href(v.programme), icon: 'list' });
      break;
    }
    case 'interest': {
      const c = entity as Category;
      out.lede = c.summary;
      out.facts.push(...storiesRow);
      out.facts.push({ label: 'Movements', items: plain(String(cat.movements.filter((m) => m.categories.includes(c.id)).length)) });
      out.primary = { label: 'Browse in catalogue', to: `/catalogue?${discoveryToSearch(discoveryWith({ interests: [c.id] }), cat)}`, icon: 'search' };
      break;
    }
    case 'theme': {
      const t = entity as Theme;
      out.lede = t.summary;
      out.facts.push(...storiesRow);
      out.facts.push({ label: 'Movements', items: plain(String(cat.movements.filter((m) => m.themes.includes(t.id)).length)) });
      out.primary = { label: 'Search the catalogue', to: `/catalogue?q=${encodeURIComponent(t.name)}`, icon: 'search' };
      break;
    }
    case 'route': {
      const r = entity as Route;
      out.kindLabel = `Route · ${ROUTE_KIND[r.kind]}`;
      out.lede = r.summary;
      out.facts.push({ label: 'From → to', items: links([r.from, r.to]) });
      out.facts.push({ label: 'Years', items: plain(r.period.to === null ? `${r.period.from}–present` : `${r.period.from}–${r.period.to}`) });
      if (r.movements?.length) out.facts.push({ label: 'Movements', items: links(r.movements) });
      if (r.themes?.length) out.facts.push({ label: 'Themes', items: links(r.themes) });
      out.primary = { label: 'Open in World', to: cat.href(r.id), icon: 'globe' };
      break;
    }
  }
  return out;
}
