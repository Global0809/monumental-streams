/**
 * The interaction language, proved by outcome (lane: shared UI, player, search, rows):
 *   · saving flies an orb into My World, the item answers, and the story is listed there
 *   · choosing a section on Search changes the results and the URL, survives reload, and
 *     /search?section=… is a working entry point
 *   · rows drag with the mouse (a drag never opens a card), and arrow keys walk the cards
 *   · the player: [ ] step chapters, S saves to My World, the scrubber previews on hover,
 *     menus close and reopen mid-animation
 *   · reduced motion: no flight, the save is still announced
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });

/** Count save orbs added to the page and My World pulses, from now on. */
async function watchFlight(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __orbs: number; __received: number };
    w.__orbs = 0;
    w.__received = 0;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('save-orb')) w.__orbs++;
        if (r.type === 'attributes' && (r.target as HTMLElement).classList?.contains('is-receiving')) w.__received++;
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}
const flight = (page: Page) => page.evaluate(() => ({ orbs: (window as unknown as { __orbs: number }).__orbs, received: (window as unknown as { __received: number }).__received }));

const media = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video.pl-video');
    return v ? { t: v.currentTime, paused: v.paused } : { t: -1, paused: true };
  });

test.describe('saving → My World', () => {
  test('saving a card flies into My World, says so, and the story is listed there', async ({ page }) => {
    await page.goto('/search?q=coney');
    await watchFlight(page);
    await page.getByRole('button', { name: 'Save Coney Island at Night' }).click();
    await expect(page.getByRole('button', { name: 'Remove Coney Island at Night from saved' })).toHaveAttribute('aria-pressed', 'true');
    await expect(toast(page, 'Saved “Coney Island at Night” to My World')).toBeVisible();
    // the orb launched and the My World navigation item answered when it landed
    await expect.poll(async () => (await flight(page)).orbs).toBeGreaterThan(0);
    await expect.poll(async () => (await flight(page)).received).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.save-orb').count()).toBe(0); // cleaned up after landing

    await page.goto('/my-world?tab=saved');
    await expect(page.getByRole('link', { name: /Coney Island at Night/ }).first()).toBeVisible();
  });

  test('reduced motion: no flight, but the save is still announced and kept', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
    const page = await ctx.newPage();
    await page.goto('/search?q=coney');
    await watchFlight(page);
    await page.getByRole('button', { name: 'Save Coney Island at Night' }).click();
    await expect(toast(page, 'Saved “Coney Island at Night” to My World')).toBeVisible();
    expect((await flight(page)).orbs).toBe(0);
    await expect(page.getByRole('button', { name: 'Remove Coney Island at Night from saved' })).toHaveAttribute('aria-pressed', 'true');
    await ctx.close();
  });
});

test.describe('cards', () => {
  test('anywhere over a card lights and tilts its image; the card link carries the card cursor', async ({ page }) => {
    await page.goto('/search?q=coney');
    const pod = page.locator('.cat-grid .pod').first();
    await expect(pod).toBeVisible();
    const face = pod.locator('.pod-specimen');
    await face.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = (await face.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 3 });
    await expect(face).toHaveAttribute('data-lit', '');
    await expect.poll(() => face.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ry'))).toMatch(/^[1-9][\d.]*deg$/); // leans right, toward the pointer
    await expect(pod.locator('.pod-title a')).toHaveAttribute('data-cursor', 'view');
    await page.mouse.move(5, 5);
    await expect(face).not.toHaveAttribute('data-lit', '');
  });
});

test.describe('search sections', () => {
  test('choosing a section changes the results and the URL; it survives reload and clears', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    const sections = page.getByRole('group', { name: 'Sections' });
    const movies = sections.getByRole('button', { name: /^Movies/ });
    const everything = sections.getByRole('button', { name: /^Everything/ });
    await expect(everything).toHaveAttribute('aria-pressed', 'true');
    const all = Number((await page.locator('.cat-count b').innerText()).trim());
    const moviesCount = Number((await movies.locator('.cat-section-count').innerText()).replace(/\D+/g, ''));
    expect(moviesCount).toBeGreaterThan(0);
    expect(moviesCount).toBeLessThan(all);

    await movies.click();
    await expect(page).toHaveURL(/\/search\?interest=film$/);
    await expect(movies).toHaveAttribute('aria-pressed', 'true');
    await expect(everything).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.cat-count b')).toHaveText(String(moviesCount));
    await expect(page.getByRole('link', { name: 'Open Movies' })).toHaveAttribute('href', '/movies');
    // the same choice shows in the facet panel and the active-filter bar
    await expect(page.getByRole('group', { name: /^Interests/ }).getByRole('button', { name: /^Film/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Active filters' })).toContainText('Film');

    await page.reload();
    await expect(page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: /^Movies/ })).toHaveAttribute('aria-pressed', 'true');

    // pressing the lit section again lets go of it
    await page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: /^Movies/ }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.locator('.cat-count b')).toHaveText(String(all));
  });

  test('sections with nothing in them yet say so honestly (disabled with a zero count)', async ({ page }) => {
    await page.goto('/search');
    const sections = page.getByRole('group', { name: 'Sections' });
    for (const label of ['Movies', 'Music', 'Sports', 'Gaming', 'News', 'Fashion', 'Culture', 'Kids']) {
      const b = sections.getByRole('button', { name: new RegExp(`^${label}`) });
      const n = Number((await b.locator('.cat-section-count').innerText()).replace(/\D+/g, ''));
      if (n === 0) await expect(b).toBeDisabled();
      else await expect(b).toBeEnabled();
    }
  });

  test('/search?section=music is an entry point: rewritten to the canonical filter', async ({ page }) => {
    await page.goto('/search?section=music');
    await expect(page).toHaveURL(/\/search\?interest=music$/);
    await expect(page.getByRole('group', { name: 'Sections' }).getByRole('button', { name: /^Music/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cat-section-note')).toContainText('Music');
  });
});

test.describe('rows', () => {
  test('drag with the mouse scrolls the row and never opens the card it started on; a click still opens', async ({ page }) => {
    await page.goto('/search');
    const track = page.getByRole('list', { name: 'Collections' });
    await expect(track).toBeVisible();
    await expect.poll(() => track.evaluate((el) => el.scrollWidth > el.clientWidth + 8)).toBe(true);
    const box = (await track.boundingBox())!;
    const y = box.y + box.height * 0.4;
    const x = box.x + box.width * 0.7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 4 });
    await page.mouse.move(x - 320, y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/search$/); // the drag did not follow the link

    const card = page.locator('.cat-quick-link').nth(1);
    await card.click();
    await expect(page).toHaveURL(/\/collection\//);
  });

  test('arrow keys walk the cards; Home and End jump to the ends', async ({ page }) => {
    await page.goto('/search');
    const links = page.locator('.cat-quick-link');
    await expect(links.first()).toBeVisible();
    const n = await links.count();
    expect(n).toBeGreaterThan(2);
    await links.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(links.nth(n - 1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('ArrowLeft'); // already first: stays
    await expect(links.first()).toBeFocused();
  });
});

test.describe('player', () => {
  test('[ ] step chapters, S saves to My World, the scrubber previews, menus reopen mid-close', async ({ page }) => {
    await page.goto('/watch/reel-living-atlas');
    await page.getByRole('button', { name: 'Play: The Living Atlas' }).click();
    await expect.poll(async () => (await media(page)).paused, { timeout: 15_000 }).toBe(false);
    const player = page.getByRole('region', { name: /^Video player:/ });

    // pause at the start so the chapter arithmetic is exact
    await player.focus();
    await page.keyboard.press('k');
    await page.keyboard.press('0');
    await expect.poll(async () => (await media(page)).paused).toBe(true);
    await expect.poll(async () => (await media(page)).t).toBeLessThan(0.5);

    await page.keyboard.press(']');
    await expect(page.getByRole('status').filter({ hasText: /^Chapter · / })).toBeVisible();
    await expect.poll(async () => (await media(page)).t).toBeGreaterThan(1);
    const second = (await media(page)).t;
    await page.keyboard.press(']');
    await expect.poll(async () => (await media(page)).t).toBeGreaterThan(second + 0.5);
    await page.keyboard.press('['); // right at a chapter start: back to the previous one
    await expect.poll(async () => Math.abs((await media(page)).t - second)).toBeLessThan(0.5);

    // S: save to My World from the player, with the same announcement as everywhere
    await page.keyboard.press('s');
    await expect(toast(page, 'Saved “The Living Atlas” to My World')).toBeVisible();
    await expect(player.getByRole('button', { name: 'Remove The Living Atlas from saved' })).toHaveAttribute('aria-pressed', 'true');

    // hovering the scrubber previews the time there
    const box0 = (await player.boundingBox())!;
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
    const seek = page.getByRole('slider', { name: 'Seek' });
    const sb = (await seek.boundingBox())!;
    await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2, { steps: 4 });
    await expect(page.locator('.pl-tip')).toBeVisible();
    // (a chapter boundary near the middle may pull the preview onto it: magnetism)
    await expect(page.locator('.pl-tip-time')).toHaveText(/^0:[12]\d$/);

    // menus: close, then reopen before the closing animation has finished
    const settings = page.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    await expect(page.getByRole('menu', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await settings.click();
    const menu = page.getByRole('menu', { name: 'Settings' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemradio', { name: 'Normal' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(settings).toBeFocused();
  });
});
