/**
 * Minimal WebVTT / SubRip handling for the media pipeline: parse either format into cues,
 * validate them against a measured duration, shift for trims and serialise as WebVTT.
 * Cue settings (e.g. "line:90%") are preserved; STYLE / REGION / NOTE blocks are dropped
 * because the player styles captions itself.
 */

export interface Cue {
  id?: string;
  start: number; // seconds
  end: number; // seconds
  settings?: string;
  text: string; // may span several lines
}

const TIMING = /^\s*(\S+)\s+-->\s+(\S+)(.*)$/;

/** Parses "HH:MM:SS.mmm", "MM:SS.mmm" or SRT's "HH:MM:SS,mmm". */
export function parseTimestamp(s: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid timestamp "${s}"`);
  const [, h = '0', min, sec, frac] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec) + Number(frac.padEnd(3, '0')) / 1000;
}

/** Formats seconds as "HH:MM:SS.mmm" (millisecond precision, never negative). */
export function formatTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** Parses the cues of a WebVTT or SRT document. */
export function parseCues(source: string): Cue[] {
  const blocks = source
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const cues: Cue[] = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(block)) continue;
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((l) => l.includes('-->'));
    if (timingIndex < 0 || timingIndex > 1) throw new Error(`Malformed cue block:\n${block}`);
    const [, a, b, rest] = TIMING.exec(lines[timingIndex]) ?? [];
    if (!a || !b) throw new Error(`Malformed cue timing: "${lines[timingIndex]}"`);
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text) continue;
    cues.push({
      id: timingIndex === 1 ? lines[0].trim() : undefined,
      start: parseTimestamp(a),
      end: parseTimestamp(b),
      settings: rest.trim() || undefined,
      text,
    });
  }
  return cues;
}

/**
 * Checks cues are well-formed for an asset of `duration` seconds: positive length, ordered
 * starts and nothing running past the end (a sign the caption timeline and the media
 * timeline have drifted apart). Returns a list of problems (empty = valid).
 */
export function validateCues(cues: Cue[], duration: number, tolerance = 0.05): string[] {
  const problems: string[] = [];
  if (cues.length === 0) problems.push('no cues');
  cues.forEach((c, i) => {
    const where = `cue ${i + 1} (${formatTimestamp(c.start)})`;
    if (!(c.end > c.start)) problems.push(`${where}: end is not after start`);
    if (i > 0 && c.start < cues[i - 1].start) problems.push(`${where}: starts before the previous cue`);
    if (c.end > duration + tolerance) problems.push(`${where}: ends at ${c.end.toFixed(3)}s, after the media ends (${duration.toFixed(3)}s)`);
  });
  return problems;
}

/**
 * Moves cues by `-offset` seconds (used after trimming `offset` seconds off the front) and
 * clips them to [0, duration], dropping cues that fall entirely outside.
 */
export function shiftCues(cues: Cue[], offset: number, duration: number): Cue[] {
  return cues
    .map((c) => ({ ...c, start: Math.max(0, c.start - offset), end: Math.min(duration, c.end - offset) }))
    .filter((c) => c.end - c.start > 0.001);
}

export function serializeVtt(cues: Cue[]): string {
  const body = cues.map((c) => {
    const timing = `${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}${c.settings ? ` ${c.settings}` : ''}`;
    return [c.id, timing, c.text].filter(Boolean).join('\n');
  });
  return `WEBVTT\n\n${body.join('\n\n')}\n`;
}
