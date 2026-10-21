import { describe, expect, it } from 'vitest';
import { firstName, greeting, initials, orbitSubset, parseTab, TAB_LABELS, YOU_TABS } from '../../src/features/you/helpers.ts';

describe('My World tabs', () => {
  it('offers the nine sections in order, Settings and Membership included', () => {
    expect(YOU_TABS.map((t) => TAB_LABELS[t])).toEqual(['Continue', 'Saved', 'Places', 'Journeys', 'History', 'Interests', 'For you', 'Settings', 'Membership']);
    expect(parseTab('places')).toBe('places');
    expect(parseTab('settings')).toBe('settings');
    expect(parseTab('you')).toBe('continue');
  });
});

describe('greeting', () => {
  it('follows the local hour', () => {
    expect(greeting(5)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good afternoon');
    expect(greeting(18)).toBe('Good evening');
    expect(greeting(0)).toBe('Good evening');
    expect(greeting(4)).toBe('Good evening');
  });

  it('uses the first name and up to two initials', () => {
    expect(firstName('Ana María Colón')).toBe('Ana');
    expect(firstName('  QA Reviewer ')).toBe('QA');
    expect(firstName(null)).toBe('');
    expect(initials('Ana María Colón')).toBe('AM');
    expect(initials('prana')).toBe('P');
    expect(initials('')).toBe('');
  });
});

// The orbit itself is drawn by the living world (personal arrangement, src/stage); My World
// only decides which saved seeds a hovered journey, place or counter singles out.
describe('orbitSubset (what a hovered item lights in the personal orbit)', () => {
  const orbit = ['video:a', 'video:b', 'video:c'];

  it('lights only the saved seeds the item is about', () => {
    expect(orbitSubset(['video:c', 'video:x', 'video:a'], orbit)).toEqual(['video:c', 'video:a']);
    expect(orbitSubset(new Set(['video:b']), orbit)).toEqual(['video:b']);
    expect(orbitSubset(['video:b', 'video:b'], orbit)).toEqual(['video:b']);
  });

  it('changes nothing when none or all of the orbit is involved', () => {
    expect(orbitSubset(['video:x'], orbit)).toBeNull();
    expect(orbitSubset([], orbit)).toBeNull();
    expect(orbitSubset(['video:a', 'video:b', 'video:c', 'video:x'], orbit)).toBeNull();
    expect(orbitSubset(['video:a'], [])).toBeNull();
  });
});
