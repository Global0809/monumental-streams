/** Entry, sound, motion, keyboard, routing and mobile body-plan journeys. */
import { expect, test } from '@playwright/test';

test.describe('entry', () => {
  test('first visit shows a skippable awakening; returning visit goes straight to content', async ({ page }) => {
    await page.goto('/');
    const intro = page.getByRole('dialog', { name: /monumental/i });
    await expect(intro).toBeVisible();
    await expect(page.getByRole('button', { name: /skip intro/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toBeHidden();
    await expect(page.locator('main h1')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('dialog', { name: /monumental/i })).toHaveCount(0);
  });

  test('deep links never show the intro', async ({ page }) => {
    await page.goto('/catalogue?q=miami');
    await expect(page.getByRole('dialog', { name: /monumental/i })).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('"Enter with sound" is the explicit gesture that wakes audio', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter with sound' }).click();
    await expect(page.getByRole('button', { name: /turn website sound off/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('sound + motion preferences', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
  });

  test('site starts silent and the visible toggle persists across reloads (still needing a gesture)', async ({ page }) => {
    await page.goto('/about');
    const toggle = page.getByRole('button', { name: /turn website sound on/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: /turn website sound off/i })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(400); // debounced persistence
    await page.reload();
    // preference remembered, but audio stays asleep until the viewer acts again
    const again = page.getByRole('button', { name: /turn website sound on/i });
    await expect(again).toHaveAttribute('aria-pressed', 'false');
    await expect(again).toHaveClass(/is-inviting/);
  });

  test('reduced-motion system preference is honoured', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    await ctx.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
    const page = await ctx.newPage();
    await page.goto('/about');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await ctx.close();
  });
});

test.describe('keyboard + routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
  });

  test('skip link, "/" search shortcut and search submission', async ({ page }) => {
    await page.goto('/about');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.locator('body').click({ position: { x: 600, y: 500 } });
    await page.keyboard.press('/');
    const search = page.getByRole('combobox', { name: /search stories/i });
    await expect(search).toBeFocused();
    await search.fill('subway');
    // live results: the first option is the matching story; Enter opens it
    await expect(page.getByRole('option', { name: /Interior N\.Y\. Subway/ })).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(/\/watch\/nyc-subway-1905/);
    // "See all results" carries the query into the full search page
    await page.goto('/about');
    await page.keyboard.press('/');
    await page.getByRole('combobox', { name: /search stories/i }).fill('subway');
    await page.getByRole('option', { name: /See all results/ }).click();
    await expect(page).toHaveURL(/\/catalogue\?q=subway/);
  });

  test('sidebar navigation, browser back and refresh restore the route', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Time Machine', exact: true }).click();
    await expect(page).toHaveURL(/\/time-machine/);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'World', exact: true }).click();
    await expect(page).toHaveURL(/\/world/);
    await page.goBack();
    await expect(page).toHaveURL(/\/time-machine/);
    await page.reload();
    await expect(page).toHaveURL(/\/time-machine/);
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('unknown routes show a helpful not-found state', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByText(/no signal at this address/i)).toBeVisible();
  });
});

test.describe('mobile body plan @mobile', () => {
  test('tab bar and more sheet reach every organ', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('button', { name: 'Menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Live', exact: true }).click();
    await expect(page).toHaveURL(/\/live$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
