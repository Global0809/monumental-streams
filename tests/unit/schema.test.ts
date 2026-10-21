import { describe, expect, it } from 'vitest';
import { isIsoDate, validateContent } from '../../shared/schema.ts';
import type { RawContent } from '../../shared/types.ts';
import { fixtureContent } from './fixture.ts';

/** Validate the fixture after applying a mutation to a fresh copy. */
function validateWith(mutate: (c: RawContent) => void) {
  const content = fixtureContent();
  mutate(content);
  return validateContent(content);
}

const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;

describe('validateContent', () => {
  it('accepts the fixture, warning about what is not yet finished', () => {
    const r = validateContent(fixtureContent());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        'video:wavemakers-ep1 › media: no media yet — the video is listed but not playable',
        'video:wavemakers-ep2 › media: no media yet — the video is listed but not playable',
        'art:wavemakers › provisional: artwork is provisional until client-approved imagery replaces it',
      ]),
    );
  });

  it('reports unknown references with the record id and field', () => {
    const r = validateWith((c) => {
      find(c.videos, 'video:bomba-loiza').places.push('place:atlantis');
      find(c.programmes, 'programme:wavemakers').presenters = ['person:nobody'];
      c.collections[1].items!.push('video:missing');
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'video:bomba-loiza › places[1]: references unknown place "place:atlantis"',
        'programme:wavemakers › presenters[0]: references unknown person "person:nobody"',
        'collection:archive-picks › items[2]: references unknown video "video:missing"',
      ]),
    );
  });

  it('reports references to the wrong kind of record', () => {
    const r = validateWith((c) => {
      find(c.videos, 'video:subway-1905').categories.push('theme:diaspora');
      find(c.routes, 'route:kingston-to-london').to = 'movement:hip-hop';
      find(c.people, 'person:valid-id').art = 'video:subway-1905';
    });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'video:subway-1905 › categories[2]: references "theme:diaspora", which is a theme, not an interest (category)',
        'route:kingston-to-london › to: references "movement:hip-hop", which is a movement, not a place',
        'person:valid-id › art: references "video:subway-1905", which is a video, not an art asset',
      ]),
    );
  });

  it('checks id prefixes, duplicate ids and duplicate slugs', () => {
    const r = validateWith((c) => {
      c.themes.push({ id: 'diaspora-two', slug: 'diaspora-two', name: 'Diaspora II', summary: '' });
      c.places.push({ ...c.places[3] });
      c.videos.push({ ...find(c.videos, 'video:signal-loop'), id: 'video:signal-loop-2' });
    });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'diaspora-two › id: must look like "theme:some-slug"',
        'place:miami › id: duplicate id — another place record already uses it',
        'place:miami › slug: duplicate place slug "miami" (also used by place:miami)',
        'video:signal-loop-2 › slug: duplicate video slug "signal-loop" (also used by video:signal-loop)',
      ]),
    );
  });

  it('detects place parent cycles', () => {
    const r = validateWith((c) => {
      find(c.places, 'place:us').parent = 'place:miami';
    });
    expect(r.errors.filter((e) => e.includes('cycle'))).toEqual([
      'place:florida › parent: forms a cycle (place:florida → place:us → place:miami → place:miami-dade → place:florida)',
    ]);
  });

  it('checks coordinates, year ranges and dates', () => {
    const r = validateWith((c) => {
      find(c.places, 'place:miami').coords = [125, -80];
      find(c.videos, 'video:block-party').setting = { from: 1990, to: 1980 };
      find(c.videos, 'video:bomba-loiza').published = '2026-02-30';
      find(c.movements, 'movement:nuyorican').end = 1950;
    });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'place:miami › coords[0]: Number must be less than or equal to 90',
        'video:block-party › setting: starts (1990) after it ends (1980)',
        'video:bomba-loiza › published: must be an ISO date (YYYY-MM-DD or a full ISO timestamp)',
        'movement:nuyorican › start/end: starts (1960) after it ends (1950)',
      ]),
    );
  });

  it('reports shape errors per record and treats unknown keys as warnings', () => {
    const r = validateWith((c) => {
      const v = find(c.videos, 'video:subway-1905') as unknown as Record<string, unknown>;
      delete v.moods;
      v.acces = 'free';
      (find(c.places, 'place:wynwood') as unknown as Record<string, unknown>).status = 'busy';
    });
    expect(r.errors).toEqual(expect.arrayContaining(['video:subway-1905 › moods: Required', expect.stringMatching(/^place:wynwood › status: Invalid enum value/)]));
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/^video:subway-1905 › \(record\): Unrecognized key\(s\) in object: 'acces'/)]));
  });

  it('warns about active places without stories and setting/period mismatches', () => {
    const r = validateWith((c) => {
      find(c.places, 'place:kingston').status = 'active';
      find(c.videos, 'video:subway-1905').periods.push('period:1990s');
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        'place:kingston › status: marked "active" but no videos are set here or in its sub-places',
        'video:subway-1905 › periods[1]: "period:1990s" does not overlap the setting 1904–1905',
      ]),
    );
    // Ancestors of places with videos count as used.
    expect(r.warnings.some((w) => w.startsWith('place:us ›'))).toBe(false);
  });

  it('never throws on garbage', () => {
    expect(validateContent(null as unknown as RawContent).ok).toBe(false);
    const r = validateContent({ places: 'nope', videos: [42] } as unknown as RawContent);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining(['places: expected an array', 'videos[0]: expected an object']));
  });
});

describe('isIsoDate', () => {
  it.each([
    ['2026-10-20', true],
    ['2026-10-20T12:30:00Z', true],
    ['2026-10-20T12:30:00.123+02:00', true],
    ['2026-02-30', false],
    ['20/10/2026', false],
    ['2026-13-01', false],
    ['', false],
  ])('%s → %s', (value, ok) => expect(isIsoDate(value)).toBe(ok));
});
