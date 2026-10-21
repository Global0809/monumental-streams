import { describe, expect, it } from 'vitest';
import { shortcutFor, SHORTCUTS } from '../../src/features/watch/player/keys.ts';
import { chapterStep, MAGNET_PX, magnetTime } from '../../src/features/watch/player/time.ts';

describe('magnetTime (scrubber magnetism)', () => {
  // 100 s on a 1000 px bar: 1 px = 0.1 s, so the 10 px magnet reaches ±1 s
  const dur = 100;
  const w = 1000;
  it('snaps onto a chapter boundary within the magnet radius', () => {
    expect(magnetTime(30.6, dur, w, [30, 70])).toEqual({ t: 30, joint: 30 });
    expect(magnetTime(69.2, dur, w, [30, 70])).toEqual({ t: 70, joint: 70 });
  });
  it('leaves the time alone outside the radius', () => {
    expect(magnetTime(31.5, dur, w, [30, 70])).toEqual({ t: 31.5, joint: null });
  });
  it('picks the nearest of two close boundaries', () => {
    expect(magnetTime(50.4, dur, w, [50, 51]).joint).toBe(50);
    expect(magnetTime(50.6, dur, w, [50, 51]).joint).toBe(51);
  });
  it('scales with the bar: a narrow bar pulls from further in seconds', () => {
    // 200 px bar: 1 px = 0.5 s → reach is MAGNET_PX × 0.5 = 5 s
    expect(magnetTime(34, dur, 200, [30]).joint).toBe(30);
    expect(magnetTime(30 + MAGNET_PX * 0.5 + 0.5, dur, 200, [30]).joint).toBeNull();
  });
  it('does nothing without a duration, a width or boundaries', () => {
    expect(magnetTime(10, 0, w, [10]).joint).toBeNull();
    expect(magnetTime(10, dur, 0, [10]).joint).toBeNull();
    expect(magnetTime(10, dur, w, [])).toEqual({ t: 10, joint: null });
  });
});

describe('chapterStep ([ and ])', () => {
  const starts = [0, 60, 120, 240];
  it('] goes to the next chapter start, or nowhere after the last', () => {
    expect(chapterStep(starts, 10, 1)).toBe(60);
    expect(chapterStep(starts, 60, 1)).toBe(120);
    expect(chapterStep(starts, 250, 1)).toBeNull();
  });
  it('[ returns to the start of the current chapter…', () => {
    expect(chapterStep(starts, 90, -1)).toBe(60);
  });
  it('…or, right after a chapter began, to the previous one', () => {
    expect(chapterStep(starts, 61, -1)).toBe(0);
    expect(chapterStep(starts, 121.5, -1)).toBe(60);
  });
  it('[ at the very start has nowhere to go', () => {
    expect(chapterStep(starts, 0, -1)).toBeNull();
    expect(chapterStep(starts, 1.5, -1)).toBe(0);
  });
  it('accepts unsorted input', () => {
    expect(chapterStep([120, 0, 60], 70, 1)).toBe(120);
  });
});

describe('new player shortcuts', () => {
  it('maps chapters, save and next', () => {
    expect(shortcutFor({ key: '[' })).toEqual({ type: 'chapter', dir: -1 });
    expect(shortcutFor({ key: ']' })).toEqual({ type: 'chapter', dir: 1 });
    expect(shortcutFor({ key: 's' })).toEqual({ type: 'save' });
    expect(shortcutFor({ key: 'S' })).toEqual({ type: 'save' });
    expect(shortcutFor({ key: 'N' })).toEqual({ type: 'next' });
  });
  it('leaves lower-case n and modifier combos alone', () => {
    expect(shortcutFor({ key: 'n' })).toBeNull();
    expect(shortcutFor({ key: 's', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: 's', metaKey: true })).toBeNull();
  });
  it('lists them in the shortcuts dialog', () => {
    const labels = SHORTCUTS.map((s) => s.label).join(' | ');
    expect(labels).toMatch(/chapter/i);
    expect(labels).toMatch(/My World/);
    expect(labels).toMatch(/Next video/);
  });
});
