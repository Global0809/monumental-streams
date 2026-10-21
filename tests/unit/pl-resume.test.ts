import { describe, expect, it } from 'vitest';
import { isComplete, mediaErrorInfo, planStart, reachedStampThreshold, stampMessage } from '../../src/features/watch/player/resume.ts';

const entry = (pos: number, dur: number, done = false) => ({ pos, dur, at: 1, done });

describe('planStart', () => {
  it('resumes meaningful, unfinished progress by default', () => {
    expect(planStart({ entry: entry(192, 813), duration: 813 })).toEqual({ at: 192, reason: 'resume' });
  });
  it('ignores samples, finished titles and near-complete positions', () => {
    expect(planStart({ entry: entry(4, 813), duration: 813 })).toEqual({ at: 0, reason: 'start' });
    expect(planStart({ entry: entry(400, 813, true), duration: 813 })).toEqual({ at: 0, reason: 'start' });
    expect(planStart({ entry: entry(800, 813), duration: 813 })).toEqual({ at: 0, reason: 'start' });
    expect(planStart({})).toEqual({ at: 0, reason: 'start' });
  });
  it('lets ?t= override saved progress, clamped inside the programme', () => {
    expect(planStart({ entry: entry(192, 813), linkTime: 62, duration: 813 })).toEqual({ at: 62, reason: 'link' });
    expect(planStart({ linkTime: 5000, duration: 37.6 })).toEqual({ at: 36.6, reason: 'link' });
    expect(planStart({ entry: entry(192, 813), linkTime: 0, duration: 813 })).toEqual({ at: 0, reason: 'start' });
    expect(planStart({ linkTime: 30, duration: null })).toEqual({ at: 30, reason: 'link' });
  });
  it('falls back to the saved duration when none is measured', () => {
    expect(planStart({ entry: entry(100, 200) })).toEqual({ at: 100, reason: 'resume' });
  });
});

describe('thresholds', () => {
  it('completes at 95% and stamps at 60%', () => {
    expect(isComplete(95, 100)).toBe(true);
    expect(isComplete(94.9, 100)).toBe(false);
    expect(isComplete(5, 0)).toBe(false);
    expect(reachedStampThreshold(60, 100)).toBe(true);
    expect(reachedStampThreshold(59, 100)).toBe(false);
  });
});

describe('messages', () => {
  it('words stamp toasts', () => {
    expect(stampMessage(['San Juan'])).toBe('Passport stamp earned: San Juan');
    expect(stampMessage(['Miami', 'Miami Beach', 'London'])).toBe('Passport stamps earned: Miami, Miami Beach and London');
    expect(stampMessage([])).toBe('');
  });
  it('words every MediaError code', () => {
    for (const code of [1, 2, 3, 4, undefined]) {
      const info = mediaErrorInfo(code);
      expect(info.title.length).toBeGreaterThan(5);
      expect(info.detail.length).toBeGreaterThan(20);
    }
    expect(mediaErrorInfo(2).title).toMatch(/connection/i);
  });
});
