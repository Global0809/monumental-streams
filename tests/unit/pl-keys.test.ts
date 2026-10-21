import { describe, expect, it } from 'vitest';
import { shortcutFor, shouldHandle } from '../../src/features/watch/player/keys.ts';

describe('shortcutFor', () => {
  it('maps the documented keys', () => {
    expect(shortcutFor({ key: ' ' })).toEqual({ type: 'toggle' });
    expect(shortcutFor({ key: 'K' })).toEqual({ type: 'toggle' });
    expect(shortcutFor({ key: 'j' })).toEqual({ type: 'seek', by: -10 });
    expect(shortcutFor({ key: 'l' })).toEqual({ type: 'seek', by: 10 });
    expect(shortcutFor({ key: 'ArrowLeft' })).toEqual({ type: 'seek', by: -5 });
    expect(shortcutFor({ key: 'ArrowRight' })).toEqual({ type: 'seek', by: 5 });
    expect(shortcutFor({ key: 'ArrowUp' })).toEqual({ type: 'volume', by: 0.05 });
    expect(shortcutFor({ key: 'm' })).toEqual({ type: 'mute' });
    expect(shortcutFor({ key: 'f' })).toEqual({ type: 'fullscreen' });
    expect(shortcutFor({ key: 'c' })).toEqual({ type: 'captions' });
    expect(shortcutFor({ key: 'i' })).toEqual({ type: 'pip' });
    expect(shortcutFor({ key: '<' })).toEqual({ type: 'rate', dir: -1 });
    expect(shortcutFor({ key: '>' })).toEqual({ type: 'rate', dir: 1 });
    expect(shortcutFor({ key: '7' })).toEqual({ type: 'jump', fraction: 0.7 });
    expect(shortcutFor({ key: 'Home' })).toEqual({ type: 'start' });
    expect(shortcutFor({ key: 'End' })).toEqual({ type: 'end' });
    expect(shortcutFor({ key: '?' })).toEqual({ type: 'help' });
  });
  it('leaves modifier combos and unknown keys alone', () => {
    expect(shortcutFor({ key: 'f', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: 'l', metaKey: true })).toBeNull();
    expect(shortcutFor({ key: 'k', altKey: true })).toBeNull();
    expect(shortcutFor({ key: 'x' })).toBeNull();
    expect(shortcutFor({ key: 'Enter' })).toBeNull();
  });
});

describe('shouldHandle', () => {
  it('never steals keys from text fields or dialogs', () => {
    expect(shouldHandle('k', 'typing', true, true)).toBe(false);
    expect(shouldHandle(' ', 'dialog', false, true)).toBe(false);
  });
  it('lets sliders and the native video keep their arrows and Space', () => {
    expect(shouldHandle('ArrowLeft', 'slider', true, true)).toBe(false);
    expect(shouldHandle(' ', 'native', true, true)).toBe(false);
    expect(shouldHandle('m', 'slider', true, true)).toBe(true);
  });
  it('lets buttons keep Space but steers the player with arrows from inside it', () => {
    expect(shouldHandle(' ', 'control', true, true)).toBe(false);
    expect(shouldHandle('ArrowRight', 'control', true, true)).toBe(true);
    expect(shouldHandle('ArrowRight', 'control', false, true)).toBe(false);
    expect(shouldHandle('k', 'control', false, true)).toBe(true);
  });
  it('keeps page scrolling keys for the page unless the player is focused', () => {
    expect(shouldHandle('ArrowDown', 'neutral', false, true)).toBe(false);
    expect(shouldHandle('ArrowDown', 'neutral', true, true)).toBe(true);
    expect(shouldHandle('End', 'neutral', false, true)).toBe(false);
    expect(shouldHandle(' ', 'neutral', false, true)).toBe(true);
    expect(shouldHandle(' ', 'neutral', false, false)).toBe(false);
    expect(shouldHandle('ArrowLeft', 'neutral', false, false)).toBe(true);
    expect(shouldHandle('5', 'neutral', false, false)).toBe(true);
  });
});
