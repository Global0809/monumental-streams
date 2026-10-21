import { describe, expect, it } from 'vitest';
import { buildCatalogue } from '../../shared/catalogue.ts';
import { planJourney } from '../../shared/journey.ts';
import {
  DEFAULT_DIAL,
  budgetLabel,
  dialEquals,
  dialFromParams,
  dialToSearch,
  indexForAngle,
  interestOptions,
  journeyKey,
  journeyParams,
  journeyTitle,
  knobAngle,
  newSeed,
  parseSeed,
  poolIds,
  poolStats,
  queueHref,
  snapMinutes,
  whereLevel,
  whereOptions,
  withOption,
  worldFor,
} from '../../src/features/somewhere/logic.ts';
import { NOW, fixtureCatalogue, fixturePayload } from './fixture.ts';

const cat = fixtureCatalogue();

describe('knob geometry', () => {
  it('spreads detents over a 270° sweep', () => {
    expect(knobAngle(0, 5)).toBe(-135);
    expect(knobAngle(2, 5)).toBe(0);
    expect(knobAngle(4, 5)).toBe(135);
    expect(knobAngle(0, 1)).toBe(0);
  });
  it('maps pointer angles to the nearest detent and clamps the bottom gap', () => {
    expect(indexForAngle(0, 5)).toBe(2);
    expect(indexForAngle(-135, 5)).toBe(0);
    expect(indexForAngle(70, 5)).toBe(3);
    expect(indexForAngle(170, 5)).toBe(4);
    expect(indexForAngle(-170, 5)).toBe(0);
    expect(indexForAngle(400, 6)).toBe(indexForAngle(40, 6));
    expect(indexForAngle(12, 1)).toBe(0);
  });
});

describe('knob options', () => {
  it('offers only interests with playable stories, Any first', () => {
    const payload = fixturePayload();
    payload.content.categories.push({ id: 'interest:food', slug: 'food', name: 'Food', summary: 'Food.' });
    const opts = interestOptions(buildCatalogue(payload), NOW);
    expect(opts[0]).toEqual({ value: '', label: 'Any' });
    expect(opts.map((o) => o.value)).not.toContain('interest:food');
    expect(opts.slice(1).every((o) => (o.count ?? 0) > 0)).toBe(true);
  });

  it('lifts places to city level and adds shared parents, gateway first', () => {
    expect(whereLevel(cat, 'place:wynwood')).toBe('place:miami');
    expect(whereLevel(cat, 'place:bronx')).toBe('place:new-york-city');
    expect(whereLevel(cat, 'place:puerto-rico')).toBe('place:puerto-rico');
    const values = whereOptions(cat, NOW).map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values[1]).toBe('place:miami');
    expect(values).toContain('place:miami-dade'); // Miami + Miami Beach share it
    expect(values).toContain('place:puerto-rico'); // San Juan + Loíza share it
    expect(values).toContain('place:london');
    expect(values).not.toContain('place:wynwood');
    expect(values).not.toContain('place:kingston'); // no playable stories
  });

  it('keeps a linked value selectable even when not derived', () => {
    const list = withOption([{ value: '', label: 'Any' }], 'interest:food', 'Food');
    expect(list.at(-1)).toEqual({ value: 'interest:food', label: 'Food' });
    expect(withOption(list, '', '')).toBe(list);
  });
});

describe('URL state', () => {
  it('round-trips through slugs with a stable order', () => {
    const dial = { interest: 'interest:music', minutes: 45, where: 'place:miami', mood: 'late' as const };
    const search = dialToSearch(cat, dial, 7);
    expect(search).toBe('interest=music&minutes=45&where=miami&mood=late&seed=7');
    const back = dialFromParams(new URLSearchParams(search), cat);
    expect(back.seed).toBe(7);
    expect(dialEquals(back.dial, dial)).toBe(true);
  });

  it('ignores unknown or malformed values', () => {
    const { dial, seed } = dialFromParams(new URLSearchParams('interest=nope&where=atlantis&mood=angry&minutes=abc&seed=-3'), cat);
    expect(dial).toEqual(DEFAULT_DIAL);
    expect(seed).toBeNull();
    expect(dialFromParams(new URLSearchParams(''), cat).seed).toBeNull();
  });

  it('snaps minutes to the dial and parses seeds strictly', () => {
    expect(snapMinutes(20)).toBe(15);
    expect(snapMinutes(500)).toBe(90);
    expect(snapMinutes(0)).toBe(30);
    expect(snapMinutes(Number.NaN)).toBe(30);
    expect(parseSeed('0042')).toBe(42);
    expect(parseSeed('4.2')).toBeNull();
    expect(parseSeed('99999999999')).toBeNull();
  });

  it('draws a fresh seed that differs from the previous one', () => {
    expect(newSeed(5, () => 0.5)).not.toBe(5);
    const s = newSeed(null, () => 0.5);
    expect(newSeed(s, () => 0.5)).not.toBe(s);
    for (let i = 0; i < 50; i++) {
      const n = newSeed(null);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99_999);
    }
  });
});

describe('journeys', () => {
  it('names, keys and parameterises a journey deterministically', () => {
    const dial = { interest: 'interest:music', minutes: 30, where: 'place:miami', mood: 'chill' as const };
    expect(journeyTitle(cat, dial)).toBe('30-minute chill journey through Music around Miami');
    expect(journeyTitle(cat, DEFAULT_DIAL)).toBe('30-minute journey');
    expect(journeyKey(cat, dial, 7)).toBe(journeyKey(cat, { ...dial }, 7));
    expect(journeyKey(cat, dial, 7)).not.toBe(journeyKey(cat, dial, 8));
    expect(journeyParams(cat, dial, 7)).toEqual({ minutes: '30', seed: '7', interest: 'music', where: 'miami', mood: 'chill' });
    expect(journeyParams(cat, DEFAULT_DIAL, 1)).toEqual({ minutes: '30', seed: '1' });
  });

  it('builds the player queue from every stop in order', () => {
    const plan = planJourney(cat, { minutes: 30, seed: 7, premium: false }, NOW);
    const href = queueHref(plan.items.map((i) => i.video));
    expect(plan.items.length).toBeGreaterThan(0);
    expect(href).toBe(`/watch/${plan.items[0].video.slug}?queue=${plan.items.map((i) => i.video.slug).join(',')}`);
    expect(queueHref([])).toBeNull();
  });

  it('formats the budget meter', () => {
    expect(budgetLabel(1660, 1800)).toBe('27:40 of 30:00');
  });

  it('counts exactly matching stories and members-only ones', () => {
    const music = { ...DEFAULT_DIAL, interest: 'interest:music' };
    const guest = poolStats(cat, music, false, NOW);
    const member = poolStats(cat, music, true, NOW);
    expect(member.count).toBe(guest.count + guest.locked);
    expect(member.locked).toBe(0);
    expect(guest.locked).toBeGreaterThan(0); // Brixton Sound Systems and Block Party need a membership
    const nowhere = poolStats(cat, { ...DEFAULT_DIAL, where: 'place:kingston' }, true, NOW);
    expect(nowhere).toEqual({ count: 0, seconds: 0, locked: 0 });
  });
});

describe('the world', () => {
  it('lights exactly the stories GO would draw from while dialling', () => {
    const music = { ...DEFAULT_DIAL, interest: 'interest:music' };
    const ids = poolIds(cat, music, false, NOW);
    expect(ids).toHaveLength(poolStats(cat, music, false, NOW).count);
    expect(ids.every((id) => (cat.get(id) as { categories: string[] }).categories.includes('interest:music'))).toBe(true);
    expect(worldFor(null, ids)).toEqual({ arrangement: { kind: 'quiet' }, highlight: ids });
    expect(worldFor(null, [])).toEqual({ arrangement: { kind: 'quiet' }, highlight: null });
  });

  it('brings a plan forward: first stop in focus, the others linked to it, all lit', () => {
    const plan = planJourney(cat, { minutes: 30, seed: 7, premium: false }, NOW);
    const stops = plan.items.map((i) => i.video.id);
    const w = worldFor(stops, ['video:ignored']);
    expect(w.arrangement).toEqual({ kind: 'focus', video: stops[0], related: stops.slice(1) });
    expect(w.highlight).toEqual(stops);
    expect(worldFor([], ['video:a'])).toEqual({ arrangement: { kind: 'quiet' }, highlight: ['video:a'] });
  });
});
