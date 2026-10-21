/**
 * Visual check helper: screenshots a route of the running dev server.
 *   node scripts/shot.ts /atlas/miami --out shots/atlas.png [--mobile|--tablet] [--wait 1500]
 *        [--reduced] [--full] [--click "css selector"] [--eval "js"] [--base http://localhost:5173]
 * Skips the first-visit intro, prints console errors, exits non-zero on page errors.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
// Git Bash (MSYS) rewrites "/atlas" into "C:/Program Files/Git/atlas" — undo that, and also
// accept routes written without the leading slash ("atlas/miami").
const OPTION_VALUES = new Set(['out', 'wait', 'click', 'eval', 'base'].flatMap((o) => {
  const i = args.indexOf(`--${o}`);
  return i >= 0 ? [args[i + 1]] : [];
}));
const raw = args.find((a, i) => !a.startsWith('--') && !OPTION_VALUES.has(a) && !(i > 0 && args[i - 1].startsWith('--') && OPTION_VALUES.has(a)));
const demangled = raw?.match(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/)?.[1]?.replace(/\\/g, '/');
const path = raw ? (demangled !== undefined ? `/${demangled}` : raw.startsWith('/') ? raw : `/${raw}`) : '/';
const base = opt('base', 'http://localhost:5173')!;
const out = opt('out', `shots/${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}${flag('mobile') ? '-mobile' : flag('tablet') ? '-tablet' : ''}.png`)!;
const viewport = flag('mobile') ? { width: 390, height: 844 } : flag('tablet') ? { width: 820, height: 1180 } : { width: 1440, height: 900 };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  hasTouch: flag('mobile') || flag('tablet'),
  isMobile: flag('mobile'),
  reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
});
await context.addInitScript(() => {
  try {
    localStorage.setItem('ms.awakened.v1', '1');
  } catch {
    /* ignore */
  }
});
const page = await context.newPage();
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(base + path, { waitUntil: 'networkidle' });
const click = opt('click');
if (click) await page.click(click);
const js = opt('eval');
if (js) console.log('eval →', await page.evaluate(js));
await page.waitForTimeout(Number(opt('wait', '1200')));
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: flag('full') });
console.log(`saved ${out} (${viewport.width}×${viewport.height})`);
if (errors.length) console.log('console errors:\n' + errors.join('\n'));
await browser.close();
process.exit(errors.some((e) => e.startsWith('pageerror')) ? 1 : 0);
