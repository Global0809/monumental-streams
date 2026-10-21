/**
 * Small, dependency-free text and number helpers shared by the discovery engine
 * (search, relations, recommendations, journeys). Isomorphic: no DOM or Node APIs.
 */

/** Words that never have to match on their own ("the bronx" behaves like "bronx"). */
const STOPWORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);

/** Lowercase and fold diacritics: "Loíza" → "loiza", "Migración" → "migracion". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Folded alphanumeric words. Apostrophes are dropped inside words ("don't" → "dont"). */
export function foldedWords(text: string): string[] {
  return fold(text)
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word);
}

/**
 * Query tokens: folded words with stopwords removed — unless the query is nothing but
 * stopwords, in which case they are kept so the query still means something.
 */
export function queryTokens(query: string): string[] {
  const all = foldedWords(query);
  const meaningful = all.filter((w) => !STOPWORDS.has(w));
  return meaningful.length ? meaningful : all;
}

/**
 * Index tokens for a searchable field. Besides plain words, short label-like fields also
 * carry adjacent-word compounds so "hiphop" finds "Hip hop" and "southbeach" finds
 * "South Beach".
 */
export function indexTokens(text: string, compounds: boolean): string[] {
  const list = foldedWords(text);
  if (!compounds) return list;
  const out = [...list];
  for (let i = 0; i + 1 < list.length; i++) out.push(list[i] + list[i + 1]);
  return out;
}

/**
 * True when the restricted Damerau-Levenshtein distance between a and b is at most 1:
 * equal, or one insertion, deletion, substitution or adjacent transposition apart.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // transposition
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // deletion / insertion
}

/** Deterministic 32-bit PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "1970s" → "the 1970s"; other labels ("Belle Époque") are returned unchanged. */
export function periodPhrase(label: string): string {
  return /^\d{3,4}s$/.test(label) ? `the ${label}` : label;
}

/** Year span for sentences: "1945–1965", "1905", "1973–present". */
export function yearSpan(from: number, to: number | null): string {
  if (to === null) return `${from}–present`;
  return from === to ? String(from) : `${from}–${to}`;
}

/** Natural-language list: ["a"] → "a", ["a","b"] → "a and b", ["a","b","c"] → "a, b and c". */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
