import { describe, expect, it } from 'vitest';
import {
  bufferedSegments,
  clamp,
  nearestSpeed,
  parseStartParam,
  percentTime,
  rateLabel,
  seekPhrase,
  seekValueText,
  stepRate,
  usableDuration,
} from '../../src/features/watch/player/time.ts';

describe('time labels', () => {
  it('builds scrubber value text', () => {
    expect(seekValueText(62, 813)).toBe('1:02 of 13:33');
    expect(seekValueText(900, 813)).toBe('13:33 of 13:33');
    expect(seekValueText(-4, 37.6)).toBe('0:00 of 0:37');
    expect(seekValueText(5, 0)).toBe('0:05');
  });
  it('labels rates', () => {
    expect(rateLabel(1)).toBe('1×');
    expect(rateLabel(0.5)).toBe('0.5×');
    expect(rateLabel(1.25)).toBe('1.25×');
  });
  it('phrases seeks', () => {
    expect(seekPhrase(10)).toBe('Forward 10 seconds');
    expect(seekPhrase(-5)).toBe('Back 5 seconds');
    expect(seekPhrase(1)).toBe('Forward 1 second');
  });
});

describe('speeds', () => {
  it('snaps to supported speeds and steps within bounds', () => {
    expect(nearestSpeed(1.3)).toBe(1.25);
    expect(nearestSpeed(0)).toBe(1);
    expect(nearestSpeed(Number.NaN)).toBe(1);
    expect(stepRate(1, 1)).toBe(1.25);
    expect(stepRate(1, -1)).toBe(0.75);
    expect(stepRate(2, 1)).toBe(2);
    expect(stepRate(0.5, -1)).toBe(0.5);
  });
});

describe('maths', () => {
  it('clamps, including non-finite input', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(Number.NaN, 0, 3)).toBe(0);
  });
  it('maps digits to tenths', () => {
    expect(percentTime(5, 100)).toBe(50);
    expect(percentTime(0, 100)).toBe(0);
    expect(percentTime(9, 0)).toBe(0);
  });
  it('prefers the element duration, then the measured runtime', () => {
    expect(usableDuration(37.6, 30)).toBe(37.6);
    expect(usableDuration(Number.NaN, 30)).toBe(30);
    expect(usableDuration(Infinity, null)).toBe(0);
  });
  it('turns buffered ranges into percentages', () => {
    expect(bufferedSegments([{ start: 0, end: 10 }, { start: 20, end: 50 }], 100)).toEqual([
      { left: 0, width: 10 },
      { left: 20, width: 30 },
    ]);
    expect(bufferedSegments([{ start: 0, end: 10 }], 0)).toEqual([]);
    expect(bufferedSegments([{ start: 90, end: 140 }], 100)).toEqual([{ left: 90, width: 10 }]);
  });
});

describe('parseStartParam', () => {
  it('accepts seconds, clock and unit forms', () => {
    expect(parseStartParam('90')).toBe(90);
    expect(parseStartParam('90.5')).toBe(90.5);
    expect(parseStartParam('1:30')).toBe(90);
    expect(parseStartParam('1:02:03')).toBe(3723);
    expect(parseStartParam('1m30s')).toBe(90);
    expect(parseStartParam('2h')).toBe(7200);
    expect(parseStartParam('45s')).toBe(45);
    expect(parseStartParam(' 12 ')).toBe(12);
  });
  it('rejects junk', () => {
    expect(parseStartParam(null)).toBeNull();
    expect(parseStartParam('')).toBeNull();
    expect(parseStartParam('-5')).toBeNull();
    expect(parseStartParam('abc')).toBeNull();
    expect(parseStartParam('1:75')).toBeNull();
    expect(parseStartParam('m')).toBeNull();
  });
});
