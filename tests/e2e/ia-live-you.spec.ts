/**
 * Live and My World — real outcomes, not decoration.
 *
 *  · Live says plainly that nothing is live, and every module is backed by real data: the
 *    schedule is exactly the catalogue's future availability windows (plus maintained activity
 *    in date), "recently published" is labelled as not live and filters by section, and the
 *    integration status is what the server reports. Live is an editorial layer over the Live
 *    chamber (the dormant organ is the hero; the page draws no instrument of its own): pointing
 *    at a dated story lights its seed, and the section filter leaves only its seeds alight.
 *  · My World's counters and tabs update the moment the library changes (save, follow,
 *    remove, undo), places and stamps have their own tab, Settings is /my-world?tab=settings,
 *    and profile actions (create account, sign out) work from the page itself.
 *  · The living world answers (stage store in dev, and the engine's own form when WebGL runs):
 *    My World is the personal core, removing a saved story releases its seed from the orbit and
 *    Undo brings it back, cards and seeds light each other; Take Me Somewhere lights the stories
 *    the knobs match and brings the planned journey forward; Membership lights what Premium
 *    unlocks; the 404 is a quiet field with a way back.
 */
import { expect, test, type Page } from '@playwright/test';
import type { CataloguePayload, Video } from '../../shared/types.ts';

const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });
const vital = (page: Page, n: number, label: string) => page.getByRole('list', { name: 'My World at a glance' }).getByRole('button', { name: `${n} ${label} — show` });
/** The seeds the world is lighting, as the Live page mirrors the stage store: 'all', or the ids. */
const litIds = async (page: Page) => ((await page.locator('.live').getAttribute('data-world-highlight')) ?? '').split(' ').filter(Boolean);
const unique = () => `ia-live-you+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

type StageSnapshot = { kind: string; video?: string; related?: string[]; highlight: string[] | null; hovered: string | null };
/**
 * The stage store as the pages drive it. Dev server only: the module is imported by the exact
 * URL the app loaded it from (Vite may add a ?t= version), so it is the same instance.
 */
const stage = (page: Page) =>
  page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/stage/store.ts')).pop() ?? '/src/stage/store.ts';
    const m = await import(url);
    const s = m.stageStore.get();
    return { ...s.arrangement, highlight: s.highlight, hovered: s.hovered } as StageSnapshot;
  });
const setStageHovered = (page: Page, id: string | null) =>
  page.evaluate(async (seed) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/stage/store.ts')).pop() ?? '/src/stage/store.ts';
    const m = await import(url);
    m.setHovered(seed);
  }, id);
/** True once the 3D engine runs (dev QA handle); false where WebGL 2 is unavailable. */
const engineLive = (page: Page) =>
  page
    .waitForFunction(() => !!(window as unknown as { __stage?: { form?: unknown } }).__stage?.form, null, { timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
/** The role the engine gave a seed in its current form ('saved' = orbiting the personal core). */
const seedRole = (page: Page, id: string) =>
  page.evaluate((seed) => {
    const form = (window as unknown as { __stage?: { form?: { kind: string; seeds: { id: string; role: string }[] } } }).__stage?.form;
    return form ? `${form.kind}:${form.seeds.find((s) => s.id === seed)?.role ?? 'none'}` : null;
  }, id);

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
      await expect(schedule).toContainText(/in \d+ days|tomorrow|today/);
      // pointing at a dated story lights its seed in the Live chamber (and the row answers)
      const row = rows.first();
      await row.hover();
      await expect(row).toHaveAttribute('data-world-lit', 'true');
    }
    // the dormant organ is the hero: no instrument drawn by the page, one gold action
    await expect(page.locator('main svg[role="img"], main canvas')).toHaveCount(0);
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    await expect(page.locator('.live')).toHaveAttribute('data-world-highlight', 'all');

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
    // the world keeps only the Music stories alight
    await expect.poll(async () => (await litIds(page)).length).toBe(inMusic);

    // survives a reload, and "Everything" clears it
    await page.reload();
    await expect(filters.getByRole('button', { name: /^Music/ })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: /^Everything/ }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(status).toHaveText(`${total} stories, newest first`);
    await expect(page.locator('.live')).toHaveAttribute('data-world-highlight', 'all');
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

  test('on a phone the first screen says nothing is live and offers a Watch action @mobile', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing is live right now.');
    const fold = await page.evaluate(() => window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 0));
    for (const loc of [page.locator('main h1'), page.getByRole('link', { name: 'Watch the newest story' })]) {
      await expect(loc).toBeInViewport();
      const box = (await loc.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(fold + 1);
    }
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

/* ───────────── The living world answers ───────────── */

test.describe('My World in the living world', () => {
  test('saved seeds orbit the personal core; removing one releases it, Undo brings it back', async ({ page }) => {
    await page.goto('/catalogue?q=coney');
    await page.getByRole('button', { name: 'Save Coney Island at Night' }).click();
    await expect(page.getByRole('button', { name: 'Remove Coney Island at Night from saved' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-world?tab=saved&stage=webgl');
    await expect.poll(async () => (await stage(page)).kind).toBe('personal');
    const pod = page.getByRole('tabpanel').locator('.pod').filter({ hasText: 'Coney Island at Night' });
    const id = (await pod.getAttribute('data-seed'))!;
    expect(id).toMatch(/^video:/);
    const live = await engineLive(page);
    if (live) await expect.poll(() => seedRole(page, id)).toBe('personal:saved');

    await page.getByRole('button', { name: 'Remove Coney Island at Night from saved' }).filter({ hasText: 'Remove' }).click();
    const t = toast(page, 'Removed “Coney Island at Night” from saved');
    await expect(t).toBeVisible();
    await expect(page.getByText('No saved stories yet')).toBeVisible();
    // the seed leaves the orbit: the world re-forms without it
    if (live) await expect.poll(() => seedRole(page, id)).toBe('personal:recede');

    await t.getByRole('button', { name: 'Undo' }).click();
    await expect(pod).toBeVisible();
    if (live) await expect.poll(() => seedRole(page, id)).toBe('personal:saved');
    if (!live) test.info().annotations.push({ type: 'world', description: 'WebGL 2 unavailable: orbit membership checked through the store only' });
  });

  test('cards and seeds light each other; the resume action is the one gold action', async ({ page }) => {
    await page.goto('/catalogue?q=coney');
    await page.getByRole('button', { name: 'Save Coney Island at Night' }).click();
    await page.goto('/my-world?tab=saved');
    const pod = page.getByRole('tabpanel').locator('.pod').first();
    const id = (await pod.getAttribute('data-seed'))!;

    // DOM → world: pointing at the card lights its seed, leaving releases it
    await pod.hover();
    await expect.poll(async () => (await stage(page)).hovered).toBe(id);
    await page.mouse.move(5, 5);
    await expect.poll(async () => (await stage(page)).hovered).toBeNull();

    // world → DOM: the seed under the pointer in the world lights its card
    await setStageHovered(page, id);
    await expect(pod).toHaveAttribute('data-world-lit', 'true');
    await setStageHovered(page, null);
    await expect(pod).not.toHaveAttribute('data-world-lit');

    // with nothing in progress, creating an account is the one gold action
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Profile' }).getByRole('link', { name: 'Create a free account' })).toHaveClass(/btn-primary/);
  });
});

test.describe('Take Me Somewhere in the living world', () => {
  test('the knobs light the stories they match; GO brings the planned journey forward', async ({ page }) => {
    await page.goto('/somewhere');
    const readout = page.locator('.tms-readout');
    const matched = async () => Number(((await readout.innerText()).match(/(\d+) stor/) ?? [])[1] ?? NaN);

    // dialling: a quiet field with exactly the matching stories lit
    await expect.poll(async () => (await stage(page)).kind).toBe('quiet');
    const all = await matched();
    await expect.poll(async () => (await stage(page)).highlight?.length).toBe(all);
    const interest = page.getByRole('slider', { name: 'Interest' });
    await interest.focus();
    await page.keyboard.press('ArrowRight');
    await expect(interest).not.toHaveAttribute('aria-valuetext', 'Any');
    await expect.poll(matched).toBeLessThan(all);
    const narrowed = await matched();
    await expect.poll(async () => (await stage(page)).highlight?.length).toBe(narrowed);

    // GO: the first stop comes forward, every other stop is linked to it, the whole plan is lit
    await page.getByRole('button', { name: /^GO/ }).click();
    await expect(page).toHaveURL(/seed=\d+/);
    const stops = page.locator('.tms-stop');
    await expect(stops.first()).toBeVisible();
    const ids = await stops.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.seed!));
    expect(ids.length).toBeGreaterThan(0);
    await expect.poll(() => stage(page)).toMatchObject({ kind: 'focus', video: ids[0], related: ids.slice(1), highlight: ids });

    // a stop and its seed light each other
    await stops.nth(0).hover();
    await expect.poll(async () => (await stage(page)).hovered).toBe(ids[0]);
    await page.mouse.move(5, 5);
    await setStageHovered(page, ids[ids.length - 1]);
    await expect(stops.nth(ids.length - 1)).toHaveAttribute('data-world-lit', 'true');

    // turning a knob after the plan returns the world to the dialled pool until GO again
    await interest.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Settings changed — press GO')).toBeVisible();
    await expect.poll(async () => (await stage(page)).kind).toBe('quiet');

    // the address rebuilds the same plan, and the same world, after a reload
    await page.reload();
    await expect.poll(() => stage(page)).toMatchObject({ kind: 'focus', video: ids[0], highlight: ids });
  });
});

test.describe('quiet pages in the living world', () => {
  test('membership lights what Premium unlocks; the 404 is a quiet field with a way back', async ({ page }) => {
    await page.goto('/membership');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Membership');
    const unlocks = await page.locator('#mem-unlocks .pod').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.seed!).sort());
    // a calm field while you read your status…
    await expect.poll(async () => {
      const s = await stage(page);
      return { kind: s.kind, lit: s.highlight };
    }).toEqual({ kind: 'quiet', lit: null });
    // …and exactly the stories Premium unlocks light up once that list is in view
    await page.locator('#mem-unlocks-h').scrollIntoViewIfNeeded();
    await page.locator('#mem-unlocks .pod').first().scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const s = await stage(page);
      return { kind: s.kind, lit: s.highlight ? [...s.highlight].sort() : null };
    }).toEqual({ kind: 'quiet', lit: unlocks.length ? unlocks : null });

    await page.goto('/this/does/not/coney-island');
    await expect(page.getByText(/no signal at this address/i)).toBeVisible();
    await expect.poll(async () => (await stage(page)).kind).toBe('quiet');
    await expect(page.locator('main .btn-primary')).toHaveText('Back to Home');
    await expect(page.getByRole('link', { name: 'Search for “coney island”' })).toHaveAttribute('href', '/catalogue?q=coney%20island');
    // a direct visit has nowhere in the app to step back to, so no "Go back" is offered
    await expect(page.getByRole('button', { name: 'Go back' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await stage(page)).kind).toBe('home');
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
