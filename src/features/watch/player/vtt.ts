/**
 * WebVTT parsing for the player: chapters, sprite thumbnails and caption cue text.
 * Pure (no DOM) so it runs under vitest in node.
 */

export interface Cue {
  start: number; // seconds
  end: number; // seconds
  text: string;
  id?: string;
}

export interface ThumbCue {
  start: number;
  end: number;
  /** Absolute URL of the image (sprite sheet or single frame). */
  url: string;
  /** Sprite region in image pixels; w/h are 0 when the cue names a whole image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const TIMESTAMP = /^(?:(\d+):)?(\d+):(\d{2})(?:[.,](\d{1,3}))?$/;

/** "00:01:02.500" | "01:02.500" | "1:02" → seconds; null when malformed. */
export function parseTimestamp(raw: string): number | null {
  const m = TIMESTAMP.exec(raw.trim());
  if (!m) return null;
  const hours = m[1] !== undefined ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (seconds >= 60) return null;
  if (m[1] !== undefined && minutes >= 60) return null;
  const millis = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Parses WebVTT text into cues sorted by start. Skips the header, NOTE, STYLE and REGION blocks. */
export function parseVtt(text: string): Cue[] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = src.split(/\n(?:[ \t]*\n)+/);
  const out: Cue[] = [];
  for (const rawBlock of blocks) {
    const lines = rawBlock.replace(/^\n+/, '').split('\n');
    if (!lines.length || !lines[0].trim()) continue;
    const head = lines[0].trim();
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(head)) continue;
    let i = 0;
    if (/^WEBVTT/.test(head)) {
      // A header block can (incorrectly) run straight into the first cue: start at its timing line.
      const t = lines.findIndex((l) => l.includes('-->'));
      if (t < 0) continue;
      i = t;
    }
    let id: string | undefined;
    if (!lines[i].includes('-->')) {
      id = lines[i].trim() || undefined;
      i += 1;
    }
    const timing = lines[i];
    if (!timing || !timing.includes('-->')) continue;
    const [left, right = ''] = timing.split('-->');
    const start = parseTimestamp(left);
    const end = parseTimestamp(right.trim().split(/\s+/)[0] ?? '');
    if (start === null || end === null || end < start) continue;
    const body = lines.slice(i + 1).join('\n').trim();
    out.push(id ? { start, end, text: body, id } : { start, end, text: body });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Thumbnail track: each cue's text is an image reference, usually a sprite region
 * ("sprite.webp#xywh=160,0,160,90"). Relative references resolve against the VTT's URL.
 */
export function parseThumbnails(text: string, baseUrl: string): ThumbCue[] {
  const out: ThumbCue[] = [];
  for (const c of parseVtt(text)) {
    const ref = c.text.split('\n')[0]?.trim();
    if (!ref) continue;
    const hashAt = ref.indexOf('#');
    const path = hashAt >= 0 ? ref.slice(0, hashAt) : ref;
    const frag = hashAt >= 0 ? ref.slice(hashAt + 1) : '';
    let url: string;
    try {
      url = new URL(path, baseUrl).href;
    } catch {
      continue;
    }
    const m = /(?:^|&)xywh=(?:pixel:)?(\d+),(\d+),(\d+),(\d+)/.exec(frag);
    const [x, y, w, h] = m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : [0, 0, 0, 0];
    out.push({ start: c.start, end: c.end, url, x, y, w, h });
  }
  return out;
}

/** Index of the last cue that has started at time t (contiguous tracks: chapters, thumbnails); -1 before the first. */
export function lastStartedIndex(cues: { start: number }[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The cue active at t (start ≤ t < end), or null. */
export function cueAt<T extends { start: number; end: number }>(cues: T[], t: number): T | null {
  const i = lastStartedIndex(cues, t);
  if (i < 0) return null;
  // Overlapping cues: walk back for one that still covers t.
  for (let j = i; j >= 0; j--) if (cues[j].start <= t && t < cues[j].end) return cues[j];
  return null;
}

/** Chapter cue at t: the last chapter that has started (gaps belong to the previous chapter). */
export function chapterAt<T extends { start: number }>(chapters: T[], t: number): T | null {
  const i = lastStartedIndex(chapters, t);
  return i >= 0 ? chapters[i] : null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&lrm;': '‎',
  '&rlm;': '‏',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** Caption cue text → display lines: markup tags stripped (voice, class, italics, karaoke), entities decoded. */
export function cueLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/<[^>]*>/g, '')
        .replace(/&(?:amp|lt|gt|nbsp|lrm|rlm|quot|apos|#39);/g, (e) => ENTITIES[e] ?? e)
        .trim(),
    )
    .filter(Boolean);
}
