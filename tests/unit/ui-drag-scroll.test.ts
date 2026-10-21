import { describe, expect, it } from 'vitest';
import { DRAG_SLOP, exceedsSlop, glideDistance, glideStep, MAX_VELOCITY, PULLBACK, releaseVelocity, settleTarget, verticalIntent } from '../../src/ui/drag-scroll.ts';

describe('press → drag decision', () => {
  it('a small wobble stays a click', () => {
    expect(exceedsSlop(DRAG_SLOP, 0)).toBe(false);
    expect(exceedsSlop(3, 2)).toBe(false);
  });
  it('a clear sideways move becomes a drag, in either direction', () => {
    expect(exceedsSlop(DRAG_SLOP + 1, 0)).toBe(true);
    expect(exceedsSlop(-20, 5)).toBe(true);
  });
  it('a mostly vertical move belongs to the page, not the row', () => {
    expect(exceedsSlop(8, 20)).toBe(false);
    expect(verticalIntent(8, 20)).toBe(true);
    expect(verticalIntent(20, 8)).toBe(false);
    expect(verticalIntent(1, 4)).toBe(false); // still inside the slop
  });
});

describe('releaseVelocity', () => {
  it('measures px per ms over the recent samples only', () => {
    const samples = [
      { t: 0, x: 0 }, // too old: ignored
      { t: 400, x: 10 },
      { t: 450, x: 60 },
      { t: 480, x: 90 },
    ];
    expect(releaseVelocity(samples)).toBeCloseTo((90 - 10) / 80, 5);
  });
  it('is zero without movement or time', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 5, x: 5 }])).toBe(0);
    expect(releaseVelocity([{ t: 5, x: 5 }, { t: 5, x: 50 }])).toBe(0);
  });
  it('is signed and clamped', () => {
    expect(releaseVelocity([{ t: 0, x: 500 }, { t: 10, x: 0 }])).toBe(-MAX_VELOCITY);
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 10, x: 500 }])).toBe(MAX_VELOCITY);
  });
});

describe('glide', () => {
  it('decays every frame and covers v·dt', () => {
    const s = glideStep(2, 1000 / 60);
    expect(s.dx).toBeCloseTo(2 * (1000 / 60), 6);
    expect(s.v).toBeLessThan(2);
    expect(s.v).toBeGreaterThan(1.5);
  });
  it('is frame-rate independent: two half steps decay like one full step', () => {
    const full = glideStep(1, 1000 / 60).v;
    const half = glideStep(glideStep(1, 1000 / 120).v, 1000 / 120).v;
    expect(half).toBeCloseTo(full, 6);
  });
  it('a faster flick travels further, and the sign is kept', () => {
    expect(glideDistance(2)).toBeGreaterThan(glideDistance(1));
    expect(glideDistance(-1)).toBeLessThan(0);
    expect(glideDistance(0)).toBe(0);
  });
});

describe('settleTarget', () => {
  const starts = [0, 300, 600, 900];
  const max = 1000;
  it('at rest, lands on the nearest item', () => {
    expect(settleTarget(140, starts, max)).toBe(0);
    expect(settleTarget(160, starts, max)).toBe(300);
  });
  it('after a fling, keeps going instead of being dragged back', () => {
    expect(settleTarget(340, starts, max, 1)).toBe(600);
    expect(settleTarget(300 + PULLBACK - 1, starts, max, 1)).toBe(300);
    expect(settleTarget(560, starts, max, -1)).toBe(300);
  });
  it('the end of the row is always a resting place, and results are clamped', () => {
    expect(settleTarget(999, starts, max)).toBe(max);
    expect(settleTarget(980, starts, max)).toBe(max);
    expect(settleTarget(950, starts, max, 1)).toBe(max);
    expect(settleTarget(-40, [], max)).toBe(0);
    expect(settleTarget(1200, [], max)).toBe(max);
  });
});
