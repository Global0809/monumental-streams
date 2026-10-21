/** Where playback starts, when it counts as complete, when stamps are earned, and error wording. Pure. */
import { PROGRESS_DONE_RATIO } from '../../../../shared/library.ts';
import { listPhrase } from '../../../../shared/text.ts';
import type { ProgressEntry } from '../../../../shared/types.ts';

/** Less than this is a sample, not a session worth resuming (matches shared/library.ts). */
export const RESUME_MIN_SECONDS = 5;
/** Share of a programme that earns its places' passport stamps. */
export const STAMP_RATIO = 0.6;

export interface StartPlan {
  /** Seconds to start from. */
  at: number;
  /** 'link' = ?t= deep link, 'resume' = saved progress, 'start' = from the beginning. */
  reason: 'link' | 'resume' | 'start';
}

export function planStart({ entry, linkTime, duration }: { entry?: ProgressEntry | null; linkTime?: number | null; duration?: number | null }): StartPlan {
  const dur = duration && duration > 0 ? duration : 0;
  if (linkTime != null && Number.isFinite(linkTime) && linkTime >= 0) {
    const at = dur ? Math.min(linkTime, Math.max(0, dur - 1)) : linkTime;
    return { at, reason: at > 0 ? 'link' : 'start' };
  }
  if (entry && !entry.done && entry.pos > RESUME_MIN_SECONDS) {
    const total = dur || entry.dur;
    if (!total || entry.pos / total < PROGRESS_DONE_RATIO) return { at: entry.pos, reason: 'resume' };
  }
  return { at: 0, reason: 'start' };
}

export const isComplete = (pos: number, dur: number) => dur > 0 && pos / dur >= PROGRESS_DONE_RATIO;
export const reachedStampThreshold = (pos: number, dur: number) => dur > 0 && pos / dur >= STAMP_RATIO;

export function stampMessage(placeNames: string[]): string {
  if (!placeNames.length) return '';
  return placeNames.length === 1 ? `Passport stamp earned: ${placeNames[0]}` : `Passport stamps earned: ${listPhrase(placeNames)}`;
}

/** Human wording for HTMLMediaElement MediaError codes (1–4). */
export function mediaErrorInfo(code: number | null | undefined): { title: string; detail: string } {
  switch (code) {
    case 1:
      return { title: 'Playback was stopped', detail: 'Loading stopped before the video was ready. Try again to pick up where you were.' };
    case 2:
      return { title: 'The connection dropped', detail: 'The video stopped arriving over the network. Check your connection, then try again — we’ll resume at the same moment.' };
    case 3:
      return {
        title: 'This video couldn’t be decoded',
        detail: 'Your device had trouble decoding part of the stream. Trying again often helps; the browser’s own player may cope better.',
      };
    case 4:
      return {
        title: 'This device can’t play the stream',
        detail: 'The format isn’t supported here, or the playback link has lapsed. Try again for a fresh link, or switch to the browser’s own player.',
      };
    default:
      return { title: 'Playback stopped unexpectedly', detail: 'Something interrupted the video. Try again — we’ll resume at the same moment.' };
  }
}
