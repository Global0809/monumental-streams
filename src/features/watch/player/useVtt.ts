/** Fetches and parses a public WebVTT file (chapters / thumbnails). Failures simply yield no cues. */
import { useEffect, useState } from 'react';
import { parseThumbnails, parseVtt, type Cue, type ThumbCue } from './vtt.ts';

const cache = new Map<string, Promise<string>>();

function load(url: string): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(`VTT ${r.status}`);
      return r.text();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function useChapterCues(url: string | undefined | null): Cue[] {
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    setCues([]);
    if (!url) return;
    let live = true;
    load(url)
      .then((text) => live && setCues(parseVtt(text).filter((c) => c.text)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);
  return cues;
}

export function useThumbnailCues(url: string | undefined | null): ThumbCue[] {
  const [cues, setCues] = useState<ThumbCue[]>([]);
  useEffect(() => {
    setCues([]);
    if (!url) return;
    let live = true;
    const abs = new URL(url, window.location.href).href;
    load(url)
      .then((text) => {
        if (!live) return;
        const parsed = parseThumbnails(text, abs);
        setCues(parsed);
        // Warm the sprite so the first hover is instant.
        const first = parsed[0]?.url;
        if (first) {
          const img = new Image();
          img.decoding = 'async';
          img.src = first;
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);
  return cues;
}
