/**
 * Timeline maths for reels: loops are joined with a fixed crossfade, so every loop after the
 * first starts CROSSFADE seconds before the previous one ends. Repeats of the same loop are
 * seamless and are not crossfaded. Captions, chapters, the score and the video graph all use
 * this one timeline so they can never disagree.
 */
import type { Cue } from './vtt.ts';
import { loopTitle } from './loops.ts';

/** Crossfade between different loops, in seconds. */
export const CROSSFADE = 0.6;

export interface ReelSegment {
  stem: string;
  /** When the segment begins on the reel timeline (start of its crossfade-in). */
  start: number;
  /** Segment length including its repeats and both crossfade overlaps. */
  duration: number;
}

export interface ReelTimeline {
  segments: ReelSegment[];
  duration: number;
}

/** Builds the timeline from measured loop durations (seconds) and the repeat count. */
export function reelTimeline(loops: { stem: string; duration: number }[], repeat = 1): ReelTimeline {
  const segments: ReelSegment[] = [];
  let cursor = 0;
  for (const [i, loop] of loops.entries()) {
    const start = i === 0 ? 0 : cursor - CROSSFADE;
    const duration = loop.duration * repeat;
    segments.push({ stem: loop.stem, start, duration });
    cursor = start + duration;
  }
  return { segments, duration: round3(cursor) };
}

/**
 * One chapter per loop, titled from the stem. Boundaries sit in the middle of each crossfade
 * so the chapter list is contiguous and a chapter seek lands on its loop already dominant.
 */
export function chapterCues(timeline: ReelTimeline): Cue[] {
  const { segments, duration } = timeline;
  return segments.map((seg, i) => ({
    start: i === 0 ? 0 : round3(seg.start + CROSSFADE / 2),
    end: i === segments.length - 1 ? duration : round3(segments[i + 1].start + CROSSFADE / 2),
    text: loopTitle(seg.stem),
  }));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
