/**
 * Journey queues: "?queue=slug1,slug2,…" from Take Me Somewhere. Pure.
 * The queue travels with every link inside it so "Up next" follows the journey.
 */

export const QUEUE_MAX = 50;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parses, normalises, de-duplicates (first wins) and caps a queue parameter. */
export function parseQueue(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!slug || !SLUG.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= QUEUE_MAX) break;
  }
  return out;
}

export function queuePosition(queue: string[], slug: string): number {
  return queue.indexOf(slug);
}

/** The slug after `slug` in the queue; null when `slug` is last or not part of the queue. */
export function nextInQueue(queue: string[], slug: string): string | null {
  const i = queue.indexOf(slug);
  return i >= 0 && i + 1 < queue.length ? queue[i + 1] : null;
}

export function previousInQueue(queue: string[], slug: string): string | null {
  const i = queue.indexOf(slug);
  return i > 0 ? queue[i - 1] : null;
}

/** "?queue=a,b,c" (commas kept literal — slugs never need escaping), or "" for no queue. */
export function queueSearch(queue: string[]): string {
  return queue.length ? `?queue=${queue.join(',')}` : '';
}

export function watchHref(slug: string, queue: string[] = []): string {
  return `/watch/${slug}${queue.length && queue.includes(slug) ? queueSearch(queue) : ''}`;
}
