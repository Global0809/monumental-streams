/**
 * Phone journeys (Pixel 7 project; every test is tagged @mobile and skipped on desktop):
 * tab bar navigation, the catalogue filters dialog, the player by touch, and no
 * horizontal overflow on the main screens.
 */
import { expect, test, type Page } from '@playwright/test';

const media = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video.pl-video');
    return v ? { t: v.currentTime, paused: v.paused } : { t: -1, paused: true };
  });

async function expectPlaying(page: Page) {
  await expect.poll(async () => (await media(page)).paused, { timeout: 15_000 }).toBe(false);
  const start = (await media(page)).t;
  await expect.poll(async () => (await media(page)).t, { timeout: 15_000 }).toBeGreaterThan(start + 0.25);
}

test.describe('phone journeys @mobile', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
  });

  test('tab bar reaches each primary organ and marks the current one', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabs).toBeVisible();
    const stops: [string, RegExp][] = [
      ['World', /\/world$/],
      ['Time Machine', /\/time-machine$/],
      ['My World', /\/my-world$/],
      ['Home', /\/$/],
    ];
    for (const [name, url] of stops) {
      await tabs.getByRole('link', { name, exact: true }).tap();
      await expect(page).toHaveURL(url);
      await expect(tabs.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('main h1').first()).toBeVisible();
    }
  });

  test('catalogue filters dialog: choices apply and "Show N stories" matches the results', async ({ page }) => {
    const expected = (await (await page.request.get('/api/search?interest=documentary')).json()).total as number;
    expect(expected).toBeGreaterThan(0);
    await page.goto('/catalogue');
    await page.getByRole('button', { name: /^Filters/ }).tap();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('group', { name: /^Interests/ }).getByRole('button', { name: /^Documentary/ }).tap();
    await expect(page).toHaveURL(/interest=documentary/);
    const label = `${expected} ${expected === 1 ? 'story' : 'stories'}`;
    const show = dialog.getByRole('button', { name: `Show ${label}`, exact: true });
    await expect(show).toBeVisible();
    await show.tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cat-count')).toHaveText(label);
    await expect(page.getByRole('button', { name: 'Filters · 1' })).toBeVisible();
  });

  test('player is usable by touch: tap to play, tap shows controls, pause and play again', async ({ page }) => {
    await page.goto('/watch/newspaper-train-1942');
    await page.getByRole('button', { name: 'Play: Newspaper Train' }).tap();
    await expectPlaying(page);
    const chamber = page.getByRole('region', { name: 'Video player: Newspaper Train' });
    // controls fade while playing…
    await expect(chamber).toHaveAttribute('data-chrome', 'hidden', { timeout: 8_000 });
    // …a tap on the picture brings them back, and the bar is then tappable (they fade again after
    // 2.5 s of playback, so under a slow machine re-show them before retrying)
    const picture = chamber.locator('.pl-surface'); // aria-hidden gesture layer: no role to find it by
    await expect(async () => {
      if ((await chamber.getAttribute('data-chrome')) === 'hidden') {
        const box = (await picture.boundingBox())!;
        await picture.tap({ position: { x: box.width / 2, y: box.height * 0.3 }, timeout: 2_000 });
      }
      await expect(chamber).toHaveAttribute('data-chrome', 'shown', { timeout: 2_000 });
      await page.getByRole('button', { name: 'Pause Newspaper Train' }).tap({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect.poll(async () => (await media(page)).paused).toBe(true);
    await expect(chamber).toHaveAttribute('data-chrome', 'shown');
    await page.getByRole('button', { name: 'Play Newspaper Train' }).tap();
    await expectPlaying(page);
  });

  // Known issue (styling, src/features/watch/player/player.css): on a phone-width 16:9 stage the
  // control bar's gradient box (.pl-chrome, pointer-events: auto incl. its padding-top) covers the
  // centre of the picture, so it swallows taps meant for the touch-only centre Play button
  // (.pl-center-btn) shown while paused. Un-fixme once the chrome no longer intercepts it.
  test('the centre Play button shown while paused can be tapped', async ({ page }) => {
    await page.goto('/watch/newspaper-train-1942');
    await page.getByRole('button', { name: 'Play: Newspaper Train' }).tap();
    await expectPlaying(page);
    await page.getByRole('button', { name: 'Pause Newspaper Train' }).tap();
    await expect.poll(async () => (await media(page)).paused).toBe(true);
    await page.getByRole('region', { name: 'Video player: Newspaper Train' }).getByRole('button', { name: 'Play', exact: true }).tap({ timeout: 5_000 });
    await expectPlaying(page);
  });

  test('no horizontal overflow on the main screens', async ({ page }) => {
    for (const route of ['/', '/catalogue', '/world/miami', '/watch/newspaper-train-1942', '/somewhere', '/passport', '/my-world']) {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeAttached();
      await page.waitForTimeout(600); // late layout (art, lazy organs)
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    }
  });
});
