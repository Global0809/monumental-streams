import type { FootageType, Provenance, Video } from '../../shared/types.ts';

/** "0:42", "12:05", "1:02:03" */
export function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Human runtime: "42 sec", "8 min", "1 hr 12 min". */
export function runtimeLabel(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

/** Spoken-friendly runtime for aria-labels. */
export function runtimeSpoken(seconds: number | null | undefined): string {
  const l = runtimeLabel(seconds);
  return l.replace('sec', 'seconds').replace('min', 'minutes').replace('hr', 'hours');
}

export function settingLabel(v: Pick<Video, 'setting'>): string {
  if (!v.setting) return 'Timeless';
  if (v.setting.label) return v.setting.label;
  const { from, to } = v.setting;
  return from === to ? String(from) : `${from}–${to}`;
}

export const FOOTAGE_LABEL: Record<FootageType, string> = {
  archive: 'Archive footage',
  commentary: 'Commentary',
  reconstruction: 'Reconstruction',
  illustrative: 'Illustrative',
  fiction: 'Fiction',
  contemporary: 'Contemporary footage',
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  'monumental-original': 'Monumental Original',
  'studio-concept': 'Studio concept · demonstration',
  'public-domain': 'Public-domain demonstration media',
  'creative-commons': 'Creative Commons demonstration media',
};

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
