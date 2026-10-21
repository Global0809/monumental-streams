import { describe, expect, it } from 'vitest';
import { nextInQueue, parseQueue, previousInQueue, QUEUE_MAX, queuePosition, queueSearch, watchHref } from '../../src/features/watch/player/queue.ts';

describe('parseQueue', () => {
  it('splits, trims, lowercases and de-duplicates', () => {
    expect(parseQueue(' reel-living-atlas, Coney-Island-1905 ,reel-living-atlas,,sintel ')).toEqual(['reel-living-atlas', 'coney-island-1905', 'sintel']);
  });
  it('drops anything that is not a slug', () => {
    expect(parseQueue('ok,../etc,with space,<script>,a--b,-lead,trail-,fine-1')).toEqual(['ok', 'fine-1']);
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('')).toEqual([]);
  });
  it('caps the length', () => {
    const many = Array.from({ length: QUEUE_MAX + 10 }, (_, i) => `v-${i}`).join(',');
    expect(parseQueue(many)).toHaveLength(QUEUE_MAX);
  });
});

describe('queue navigation', () => {
  const q = ['a', 'b', 'c'];
  it('finds neighbours', () => {
    expect(queuePosition(q, 'b')).toBe(1);
    expect(nextInQueue(q, 'a')).toBe('b');
    expect(nextInQueue(q, 'c')).toBeNull();
    expect(nextInQueue(q, 'zzz')).toBeNull();
    expect(previousInQueue(q, 'a')).toBeNull();
    expect(previousInQueue(q, 'c')).toBe('b');
  });
  it('builds links that carry the queue only when the target is in it', () => {
    expect(queueSearch(q)).toBe('?queue=a,b,c');
    expect(queueSearch([])).toBe('');
    expect(watchHref('b', q)).toBe('/watch/b?queue=a,b,c');
    expect(watchHref('x', q)).toBe('/watch/x');
    expect(watchHref('b')).toBe('/watch/b');
  });
});
