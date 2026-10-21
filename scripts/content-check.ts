/**
 * npm run content:check [-- --content <dir> --media <dir>]
 *
 * Loads and validates content with exactly the loader the server uses (server/content.ts)
 * and prints a readable report: record counts, what is playable right now, period coverage
 * and every warning. Exits non-zero when content has errors, so it can gate CI and editors.
 * Directories default to CONTENT_DIR / MEDIA_DIR (from the environment or .env).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ContentError, loadContent } from '../server/content.ts';

const { values: args } = parseArgs({
  options: { content: { type: 'string' }, media: { type: 'string' } },
});
if (existsSync('.env')) process.loadEnvFile('.env');
const contentDir = path.resolve(args.content ?? process.env.CONTENT_DIR ?? './content');
const mediaDir = path.resolve(args.media ?? process.env.MEDIA_DIR ?? './media');

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const padStart = (s: string | number, n: number) => String(s).padStart(n);

function printList(title: string, lines: string[]) {
  if (!lines.length) return;
  console.log(`\n${title} (${lines.length})`);
  for (const line of lines) console.log(`  • ${line}`);
}

async function main() {
  console.log('Monumental Streams — content check');
  console.log(`  content  ${contentDir}`);
  console.log(`  media    ${mediaDir}`);

  let loaded;
  try {
    loaded = await loadContent({ contentDir, mediaDir });
  } catch (err) {
    if (!(err instanceof ContentError)) throw err;
    printList('Errors', err.errors);
    printList('Warnings', err.warnings);
    console.log(`\n✗ Content has ${err.errors.length} error${err.errors.length === 1 ? '' : 's'}. Fix them and run the check again.`);
    process.exitCode = 1;
    return;
  }

  const { raw, catalogue: cat, version, warnings } = loaded;
  console.log(`  version  ${version}`);

  const counts: [string, number][] = [
    ['places', raw.places.length],
    ['periods', raw.periods.length],
    ['movements', raw.movements.length],
    ['people', raw.people.length],
    ['interests', raw.categories.length],
    ['themes', raw.themes.length],
    ['routes', raw.routes.length],
    ['programmes', raw.programmes.length],
    ['collections', raw.collections.length],
    ['art assets', raw.art.length],
    ['activity items', raw.activity.length],
    ['external listings', raw.external.length],
    ['videos', raw.videos.length],
  ];
  console.log('\nRecords');
  for (const [label, n] of counts) console.log(`  ${pad(label, 18)}${padStart(n, 5)}`);

  const now = new Date();
  const access = { free: 0, premium: 0, unavailable: 0 };
  for (const v of cat.videos) access[cat.effectiveAccess(v, now)]++;
  const playable = access.free + access.premium;
  console.log(`\nPlayable now: ${playable} of ${cat.videos.length} (free ${access.free} · premium ${access.premium} · not playable ${access.unavailable})`);
  for (const v of cat.videos.filter((x) => cat.isPlayable(x, now))) {
    const seconds = cat.runtime(v) ?? 0;
    const runtime = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
    console.log(`  ${pad(cat.effectiveAccess(v, now), 8)} ${padStart(runtime, 6)}  ${v.title}`);
  }

  console.log('\nPeriod coverage (historical setting)');
  const coverage = cat.periodCoverage();
  const widest = Math.max(1, ...coverage.map((c) => c.count));
  for (const { period, count, playable: p } of coverage) {
    const bar = '█'.repeat(Math.round((count / widest) * 20)) || '·';
    console.log(`  ${pad(period.label, 12)} ${pad(bar, 21)} ${count} video${count === 1 ? '' : 's'} (${p} playable)`);
  }

  printList('Warnings', warnings);
  console.log('\n✓ Content is valid.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
