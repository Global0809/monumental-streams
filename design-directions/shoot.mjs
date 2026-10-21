// Screenshots the design-direction mockups (node design-directions/shoot.mjs).
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const name of ['a-chrome-bloom', 'b-pearl-editorial', 'c-cinematic']) {
  await page.goto(pathToFileURL(join(here, `${name}.html`)).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(here, `${name}.png`) });
  console.log('shot', name);
}
await browser.close();
