import { describe, expect, it } from 'vitest';
import { fold, indexTokens, listPhrase, mulberry32, periodPhrase, queryTokens, withinOneEdit, yearSpan } from '../../shared/text.ts';

describe('normalisation', () => {
  it('folds diacritics and case', () => {
    expect(fold('Loíza · MIGRACIÓN · Ñandú')).toBe('loiza · migracion · nandu');
  });

  it('tokenises queries without stopwords unless that is all there is', () => {
    expect(queryTokens('The Bronx, in 1977!')).toEqual(['bronx', '1977']);
    expect(queryTokens('the')).toEqual(['the']);
    expect(queryTokens("Don't stop")).toEqual(['dont', 'stop']);
  });

  it('adds adjacent-word compounds to label fields only', () => {
    expect(indexTokens('Hip hop', true)).toEqual(['hip', 'hop', 'hiphop']);
    expect(indexTokens('Hip hop', false)).toEqual(['hip', 'hop']);
  });
});

describe('withinOneEdit', () => {
  it.each([
    ['wynwood', 'wynwood', true],
    ['wynwod', 'wynwood', true], // deletion
    ['wynwoood', 'wynwood', true], // insertion
    ['wynwoud', 'wynwood', true], // substitution
    ['wnywood', 'wynwood', true], // adjacent transposition
    ['wnyowod', 'wynwood', false],
    ['wyn', 'wynwood', false],
  ])('%s vs %s → %s', (a, b, ok) => {
    expect(withinOneEdit(a, b)).toBe(ok);
    expect(withinOneEdit(b, a)).toBe(ok);
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 200 }, () => a());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
});

describe('phrases', () => {
  it('formats periods, years and lists for sentences', () => {
    expect(periodPhrase('1970s')).toBe('the 1970s');
    expect(periodPhrase('Belle Époque')).toBe('Belle Époque');
    expect([yearSpan(1945, 1965), yearSpan(1905, 1905), yearSpan(1973, null)]).toEqual(['1945–1965', '1905', '1973–present']);
    expect([listPhrase(['a']), listPhrase(['a', 'b']), listPhrase(['a', 'b', 'c'])]).toEqual(['a', 'a and b', 'a, b and c']);
  });
});
