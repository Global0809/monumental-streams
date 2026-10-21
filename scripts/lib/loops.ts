/**
 * The studio motion loops (sources/previews/MS_preview_NN_<name>_1920x1080_30fps_8s_loop.mp4).
 * A loop's "stem" ("01-living-atlas") names every derivative: previews, posters, art entries
 * and reel chapters. The naming rule matches scripts/build-previews.sh.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fromRoot } from './files.ts';

export const LOOP_SOURCE_DIR = 'sources/previews';

/** "MS_preview_01_living_atlas_1920x1080_30fps_8s_loop.mp4" → "01-living-atlas" (null if not a loop). */
export function stemFromSourceName(fileName: string): string | null {
  const m = /^MS_preview_(\d+)_(.+?)_\d+x\d+.*\.mp4$/i.exec(fileName);
  return m ? `${m[1]}-${m[2].replace(/_/g, '-')}` : null;
}

/** Map of stem → absolute source path for every studio loop present on disk. */
export function findLoopSources(): Map<string, string> {
  const dir = fromRoot(LOOP_SOURCE_DIR);
  const found = new Map<string, string>();
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir).sort()) {
    const stem = stemFromSourceName(name);
    if (stem) found.set(stem, fromRoot(LOOP_SOURCE_DIR, name));
  }
  return found;
}

/** Viewer-facing chapter titles for the current loops. */
const LOOP_TITLES: Record<string, string> = {
  '01-living-atlas': 'Living Atlas',
  '02-time-machine': 'Time Machine',
  '03-connections': 'Every Story Has a Reason',
  '04-catalogue-player': 'Catalogue & Player',
  '05-premium-vault': 'The Premium Vault',
  '06-deco-atlas': 'Deco Atlas',
  '07-bauhaus-categories': 'What You Love',
  '08-culture-passport': 'Culture Passport',
  '09-brand-chrome': 'Monumental in Chrome',
  '10-living-membrane': 'Living Membrane',
  '11-sound-aurora': 'Sound Aurora',
  '12-cursor-language': 'Cursor Language',
  '13-mobile-app': 'Built for Touch',
  '14-search-filters': 'Search & Filters',
  '15-miami-isometric': 'Miami, up close',
  '16-story-paper': 'The Story Behind the Story',
  '17-wavemakers-lines': 'WAVEMAKERS',
  '18-take-me-somewhere': 'Take Me Somewhere',
};

/** Readable title for a stem; unknown (future) loops fall back to "12-new-thing" → "New Thing". */
export function loopTitle(stem: string): string {
  return (
    LOOP_TITLES[stem] ??
    stem
      .replace(/^\d+-/, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}
