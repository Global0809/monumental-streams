// Smoke-checks the published GitHub Pages site: home renders, a deep link works, a video plays.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'https://global0809.github.io/monumental-streams/';
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base, { waitUntil: 'networkidle' });
const h1 = await page.locator('main h1').first().textContent().catch(() => null);
await page.goto(`${base}watch/newspaper-train-1942`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^play/i }).first().click().catch(() => undefined);
await page.waitForTimeout(5000);
const t = await page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
await page.goto(`${base}world/miami`, { waitUntil: 'networkidle' });
const world = await page.locator('main h1, main h2').first().textContent().catch(() => null);
console.log(JSON.stringify({ home: h1?.trim(), playedSeconds: Math.round(t * 10) / 10, world: world?.trim(), errors }));
await browser.close();
