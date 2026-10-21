/**
 * Live and My World — real outcomes, not decoration.
 *
 *  · Live says plainly that nothing is live, and every module is backed by real data: the
 *    schedule is exactly the catalogue's future availability windows (plus maintained activity
 *    in date), "recently published" is labelled as not live and filters by section, and the
 *    integration status is what the server reports.
 *  · My World's counters and tabs update the moment the library changes (save, follow,
 *    remove, undo), places and stamps have their own tab, Settings is /my-world?tab=settings,
 *    and profile actions (create account, sign out) work from the page itself.
 */
import { expect, test, type Page } from '@playwright/test';
import type { CataloguePayload, Video } from '../../shared/types.ts';

const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });
const vital = (page: Page, n: number, label: string) => page.getByRole('list', { name: 'My World at a glance' }).getByRole('button', { name: `${n} ${label} — show` });
const unique = () => `ia-live-you+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

/** Future availability windows, straight from the catalogue API (what the schedule must show). */
async function futureWindows(page: Page): Promise<Video[]> {
  const payload = (await (await page.request.get('/api/catalogue')).json()) as CataloguePayload;
  const now = Date.now();
  return payload.content.videos.filter(
    (v) => (v.availability.status === 'early-access' || v.availability.status === 'coming-soon') && v.availability.publicFrom && Date.parse(v.availability.publicFrom) > now,
  );
}

/* ───────────── Live ───────────── */

test.describe('Live', () => {
  test('states that nothing is live and shows only real, labelled modules', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing is live right now.');
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Live' })).toHaveAttribute('aria-current', 'page');

    const glance = page.getByRole('definition').filter({ hasText: 'No live source connected' });
    await expect(glance).toContainText('None');

    // the schedule is exactly the catalogue's future windows
    const windows = await futureWindows(page);
    const schedule = page.locator('#live-schedule');
    const rows = schedule.getByRole('listitem').filter({ has: page.locator('.live-window-title') });
    await expect(rows).toHaveCount(windows.length);
    for (const v of windows) await expect(schedule.getByRole('heading', { name: v.title, level: 3 })).toBeVisible();
    if (windows.length) {
      await expect(page.getByRole('img', { name: new RegExp(`^The next \\d+ days: .*${windows[0].title.split(':')[0]}`) })).toBeVisible();
      await expect(schedule).toContainText(/in \d+ days|tomorrow|today/);
    }

    // integration status comes from the server, honestly
    const wiring = page.locator('#live-wiring');
    await expect(wiring.getByRole('heading', { name: 'Live broadcasts and premieres' })).toBeVisible();
    await expect(wiring.getByText('Not connected', { exact: true })).toBeVisible();
    await expect(wiring).toContainText('Maintained file only');
  });

  test('recently published is labelled not live and a section filter changes the list (in the URL)', async ({ page }) => {
    await page.goto('/live');
    const recent = page.locator('#live-recent');
    await expect(recent.getByText('Published, not live')).toBeVisible();
    const status = recent.getByRole('status');
    await expect(status).toHaveText(/^\d+ stor(y|ies), newest first$/);
    const total = Number((await status.innerText()).match(/\d+/)![0]);

    const filters = page.getByRole('group', { name: 'Show recently published from' });
    const music = filters.getByRole('button', { name: /^Music/ });
    await music.click();
    await expect(music).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/live\?in=music$/);
    await expect(status).toHaveText(/^\d+ stor(y|ies) in Music, newest first$/);
    const inMusic = Number((await status.innerText()).match(/\d+/)![0]);
    expect(inMusic).toBeLessThan(total);
    await expect(recent.locator('.pod')).toHaveCount(Math.min(inMusic, 8));
    await expect(recent.locator('.live-pub').first()).toContainText('Published');

    // survives a reload, and "Everything" clears it
    await page.reload();
    await expect(filters.getByRole('button', { name: /^Music/ })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: /^Everything/ }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(status).toHaveText(`${total} stories, newest first`);
  });

  test('maintained activity appears only while in date, with its source', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    const ahead = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await page.route('**/api/activity', (route) =>
      route.fulfill({
        json: {
          items: [
            { id: 'qa-now', kind: 'event', title: 'QA street festival', starts: today, summary: 'A maintained listing for today.', source: 'QA desk', verifiedAt: today },
            { id: 'qa-later', kind: 'event', title: 'QA night market', starts: ahead, summary: 'A dated listing ahead.', source: 'QA desk', verifiedAt: today },
            { id: 'qa-past', kind: 'event', title: 'QA old parade', starts: '2020-01-01', summary: 'Long over.', source: 'QA desk', verifiedAt: today },
          ],
          external: [],
        },
      }),
    );
    await page.goto('/live');
    const now = page.locator('#live-now');
    await expect(now.getByRole('heading', { name: /Happening now/ })).toBeVisible();
    await expect(now.getByText('Maintained listings · not broadcasts')).toBeVisible();
    await expect(now.getByRole('heading', { name: 'QA street festival' })).toBeVisible();
    await expect(now).toContainText('Source: QA desk');
    await expect(page.getByText('QA old parade')).toHaveCount(0);
    // the dated one joins the schedule
    await expect(page.locator('#live-schedule').getByRole('heading', { name: 'QA night market' })).toBeVisible();
    // and the statement stays true: still nothing broadcasting
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing is live right now.');
  });

  test('saving a scheduled story updates My World', async ({ page }) => {
    const windows = (await futureWindows(page)).filter((v) => v.media);
    test.skip(!windows.length, 'no dated availability window in the catalogue right now');
    const v = windows[0];
    await page.goto('/live');
    await page.getByRole('button', { name: `Save ${v.title} to My World` }).click();
    await expect(toast(page, `Saved “${v.title}” to My World`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove ${v.title} from My World` })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My World/ }).click();
    await expect(page).toHaveURL(/\/my-world/);
    await expect(vital(page, 1, 'Saved')).toBeVisible();
    await vital(page, 1, 'Saved').click();
    await expect(page.getByRole('tab', { name: /Saved/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: `Remove ${v.title} from saved` }).filter({ hasText: 'Remove' })).toBeVisible();
  });
});

/* ───────────── My World ───────────── */

test.describe('My World', () => {
  test('counters and tabs move the moment the library does: save, follow, remove, undo', async ({ page }) => {
    await page.goto('/my-world');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My World');
    await expect(page.getByText(/^Good (morning|afternoon|evening)$/)).toBeVisible();
    for (const [n, label] of [
      [0, 'In progress'],
      [0, 'Saved'],
      [0, 'Places'],
      [0, 'Journeys'],
      [0, 'Passport stamps'],
    ] as const)
      await expect(vital(page, n, label)).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'My World sections' });
    await expect(tabs.getByRole('tab')).toHaveText([/Continue/, /Saved/, /Places/, /Journeys/, /History/, /Interests/, 'For you', 'Settings', 'Membership']);

    // follow an interest: the Interests count and the live status change at once
    await tabs.getByRole('tab', { name: /Interests/ }).click();
    await expect(page).toHaveURL(/tab=interests/);
    await page.getByRole('list', { name: 'Interests' }).getByRole('button', { name: /^Music/ }).click();
    await expect(page.getByRole('tabpanel').getByRole('status').filter({ hasText: 'Following 1 interest' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /Interests/ })).toContainText('1');

    // save from For you: the Saved counter and tab count update without a reload
    await tabs.getByRole('tab', { name: 'For you' }).click();
    const firstSave = page.getByRole('tabpanel').getByRole('button', { name: /^Save / }).first();
    const title = ((await firstSave.getAttribute('aria-label')) ?? '').replace(/^Save /, '');
    await firstSave.click();
    await expect(vital(page, 1, 'Saved')).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /Saved/ })).toContainText('1');

    // the counter opens its tab; removing works, and Undo brings it back
    await vital(page, 1, 'Saved').click();
    await expect(tabs.getByRole('tab', { name: /Saved/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: `Remove ${title} from saved` }).filter({ hasText: 'Remove' }).click();
    const t = toast(page, `Removed “${title}” from saved`);
    await expect(t).toBeVisible();
    await expect(vital(page, 0, 'Saved')).toBeVisible();
    await expect(page.getByText('No saved stories yet')).toBeVisible();
    await t.getByRole('button', { name: 'Undo' }).click();
    await expect(vital(page, 1, 'Saved')).toBeVisible();
    await expect(page.getByRole('button', { name: `Remove ${title} from saved` }).filter({ hasText: 'Remove' })).toBeVisible();
  });

  test('saved places have their own tab and reopen in World; Settings is /my-world?tab=settings', async ({ page }) => {
    await page.goto('/world/miami?view=list');
    await page.getByRole('button', { name: 'Save place' }).click();
    await expect(page.getByRole('button', { name: 'Saved place' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-world');
    await expect(vital(page, 1, 'Places')).toBeVisible();
    await vital(page, 1, 'Places').click();
    await expect(page).toHaveURL(/tab=places/);
    const open = page.getByRole('link', { name: 'Open Miami in World' });
    await expect(open).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connections from Miami' })).toHaveAttribute('href', '/synapse/place/miami');
    await open.click();
    await expect(page).toHaveURL(/\/world\/miami/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/my-world\?tab=settings$/);
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();
  });

  test('profile actions: create an account from My World, then sign out from it', async ({ page }) => {
    await page.goto('/my-world');
    const profile = page.getByRole('region', { name: 'Profile' });
    await expect(profile.getByText('Guest', { exact: true }).first()).toBeVisible();
    await profile.getByRole('link', { name: 'Create a free account' }).click();
    await expect(page).toHaveURL(/\/account\?mode=register&next=%2Fmy-world|\/account\?mode=register&next=\/my-world/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'My World' })).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('Lane Reviewer');
    await page.getByLabel('Email', { exact: true }).fill(unique());
    await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/my-world$/);
    await expect(page.getByText(/^Good (morning|afternoon|evening), Lane$/)).toBeVisible();
    await expect(profile.getByText('Lane Reviewer')).toBeVisible();
    await expect(profile.getByText('Synced to your account')).toBeVisible();

    await profile.getByRole('button', { name: 'Sign out' }).click();
    await expect(toast(page, /^Signed out/)).toBeVisible();
    await expect(profile.getByRole('link', { name: 'Create a free account' })).toBeVisible();
  });

  test('membership sits under My World and leads back to its tab', async ({ page }) => {
    await page.goto('/membership');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Membership');
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'My World' }).click();
    await expect(page).toHaveURL(/\/my-world\?tab=membership$/);
    await expect(page.getByRole('tab', { name: 'Membership' })).toHaveAttribute('aria-selected', 'true');
  });
});

/* ───────────── Responsive ───────────── */

for (const vp of [
  { width: 390, height: 844, touch: true },
  { width: 820, height: 1180, touch: true },
  { width: 1440, height: 900, touch: false },
]) {
  test(`/live and /my-world fit ${vp.width}px with one h1`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.width < 500, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
    const page = await ctx.newPage();
    for (const route of ['/live', '/my-world', '/my-world?tab=places', '/about']) {
      await page.goto(route);
      await page.locator('main h1').first().waitFor();
      await page.waitForTimeout(400);
      expect(await page.locator('h1').count(), `${route} h1 count`).toBe(1);
      const overflow = await page.evaluate(() => {
        document.body.style.overflowX = 'visible';
        return document.documentElement.scrollWidth - Math.min(window.innerWidth, document.documentElement.clientWidth);
      });
      expect(overflow, `${route} overflow at ${vp.width}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
}
