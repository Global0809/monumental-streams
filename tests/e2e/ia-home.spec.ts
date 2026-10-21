/**
 * Home journeys: the hierarchy holds, and every interactive part of Home has a real outcome —
 * changing the decade changes the stories, pointing at a destination reveals what is set
 * there and choosing it opens the World, category counts come from the catalogue and empty
 * categories are honest, and saving the featured teaser lands in My World.
 * Expected numbers are computed from the live catalogue API, never hard-coded.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildCatalogue, type Catalogue } from '../../shared/catalogue.ts';
import { SECTIONS, videosForSection } from '../../shared/sections.ts';
import type { CataloguePayload } from '../../shared/types.ts';

const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });
const plural = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;

let cat: Catalogue;

test.beforeAll(async ({ request }) => {
  cat = buildCatalogue((await (await request.get('/api/catalogue')).json()) as CataloguePayload);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

test.describe('home', () => {
  test('hierarchy: featured opening, entry experiences, categories, rows, tools, then My World', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).toContainText('Stream the world.');
    // one gold primary action for the whole view: the featured teaser
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Watch the WAVEMAKERS teaser' })).toHaveAttribute('href', '/watch/wavemakers-teaser');

    const order = ['#home-hero', '#home-world', '#home-time', '#home-categories', '#home-for-you', '#home-archive', '#home-tools', '#home-my-world'];
    const tops: number[] = [];
    for (const sel of order) tops.push(await page.locator(sel).evaluate((el) => el.getBoundingClientRect().top + window.scrollY));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    // live counts in the opening come from the catalogue
    const stats = page.getByRole('list', { name: 'In the catalogue today' });
    await expect(stats).toContainText(`${cat.videos.length} stories`);
  });

  test('Time Machine preview: changing the decade changes the stories and opens the Time Machine there', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Time Machine', exact: true });
    const slider = region.getByRole('slider', { name: 'Decade' });
    await slider.scrollIntoViewIfNeeded();

    const coverage = cat.periodCoverage();
    const count = (slug: string) => coverage.find((c) => c.period.slug === slug)!.count;
    const expectDecade = async (slug: string) => {
      await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`^${slug}, `));
      await expect(region.getByRole('heading', { level: 3, name: /^The \d{4}s$/ })).toHaveText(`The ${slug}`);
      await expect(region.locator('.home-time-stats dd').first()).toHaveText(String(count(slug)));
      const shown = Math.min(3, count(slug));
      if (shown) await expect(region.getByRole('list', { name: `Stories set in the ${slug}`, exact: true }).locator(':scope > li')).toHaveCount(shown);
      else await expect(region.getByText(`No stories are set in the ${slug} yet.`)).toBeVisible();
    };

    // keyboard: Home → first decade, then step right four times
    await slider.focus();
    await page.keyboard.press('Home');
    await expectDecade(coverage[0].period.slug);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expectDecade(coverage[4].period.slug);
    // the stories listed really are set in that decade
    const p4 = coverage[4].period;
    const set = cat.videosForPeriod(p4.id).map((v) => v.title);
    for (const title of await region.locator('.home-time-grid .pod-title a').allInnerTexts()) {
      expect(set.some((t) => title.startsWith(t))).toBe(true);
    }

    // pointer: a click along the spine lands on the decade under it
    const box = (await slider.boundingBox())!;
    const target = 5;
    await page.mouse.click(box.x + ((target + 0.5) / coverage.length) * box.width, box.y + box.height / 2);
    const slug = coverage[target].period.slug;
    await expectDecade(slug);

    // dragging scrubs across decades
    await page.mouse.move(box.x + box.width * 0.02, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.98, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expectDecade(coverage.at(-1)!.period.slug);
    await page.mouse.click(box.x + ((target + 0.5) / coverage.length) * box.width, box.y + box.height / 2);
    await expectDecade(slug);

    await region.getByRole('link', { name: `Open the Time Machine in the ${slug}` }).click();
    await expect(page).toHaveURL(new RegExp(`/time-machine/${slug}$`));
    await page.goBack();
    // coming back keeps the chosen decade
    await expect(page.getByRole('region', { name: 'Time Machine', exact: true }).getByRole('slider', { name: 'Decade' })).toHaveAttribute('aria-valuetext', new RegExp(`^${slug}, `));
  });

  test('World preview: pointing at a destination reveals its stories; choosing it opens the World there', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'World', exact: true });
    await region.scrollIntoViewIfNeeded();
    await expect(region.getByRole('img', { name: /^Globe showing \d+ destinations/ })).toBeAttached();

    const london = cat.bySlug('place', 'london')!;
    const n = cat.videosForPlace(london.id, true).length;
    const dests = region.getByRole('list', { name: 'Destinations with stories' });
    const link = dests.getByRole('link', { name: /^London/ });
    await expect(link).toContainText(plural(n));

    // the gateway is selected first
    const gateway = cat.places.find((p) => p.gateway)!;
    await expect(dests.getByRole('link', { name: new RegExp(`^${gateway.name}`) })).toHaveAttribute('aria-current', 'true');

    await link.hover();
    await expect(link).toHaveAttribute('aria-current', 'true');
    await expect(region.getByRole('heading', { level: 3, name: 'London' })).toBeVisible();
    const stories = region.getByRole('list', { name: 'Stories set in and around London' }).getByRole('link');
    await expect(stories).toHaveCount(Math.min(3, n));
    const titles = cat.videosForPlace(london.id, true).map((v) => v.title);
    for (const t of await stories.allInnerTexts()) expect(titles.some((x) => t.startsWith(x))).toBe(true);
    await expect(region.getByRole('link', { name: 'Open London in World' })).toHaveAttribute('href', '/world/london');

    // keyboard focus selects too
    const ny = dests.getByRole('link', { name: /^New York City/ });
    await ny.focus();
    await expect(region.getByRole('heading', { level: 3, name: 'New York City' })).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(/\/world\/london$/);
    await expect(page.locator('main h1')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('region', { name: 'World', exact: true }).getByRole('link', { name: /^London/ })).toHaveAttribute('aria-current', 'true');
  });

  test('categories: counts come from the shared catalogue, empty ones say so and still link', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Categories', exact: true });
    await region.scrollIntoViewIfNeeded();
    for (const s of SECTIONS.filter((x) => x.kind === 'category')) {
      const count = videosForSection(cat, s).length;
      const tile = region.getByRole('link', { name: new RegExp(`^${s.label}`) });
      await expect(tile).toHaveAttribute('href', s.path);
      await expect(tile).toContainText(count ? plural(count) : 'Coming soon');
    }
    const live = region.getByRole('link', { name: /^Live/ });
    await expect(live).toContainText('Nothing is on air');
    await expect(live).toHaveAttribute('href', '/live');

    // an empty category still opens its page
    const empty = SECTIONS.find((s) => s.kind === 'category' && videosForSection(cat, s).length === 0);
    const target = empty ?? SECTIONS.find((s) => s.kind === 'category')!;
    await region.getByRole('link', { name: new RegExp(`^${target.label}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  });

  test('saving the featured teaser lands in My World', async ({ page }) => {
    await page.goto('/');
    const me = page.getByRole('region', { name: 'My World', exact: true });
    const saved = me.getByRole('link', { name: /Saved stories$/ });
    await expect(saved).toHaveText(/^0\s*Saved stories$/);

    const save = page.getByRole('button', { name: 'Save teaser' });
    await expect(save).toHaveAttribute('aria-pressed', 'false');
    await save.click();
    await expect(toast(page, '“WAVEMAKERS — motion teaser” to My World')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved to My World' })).toHaveAttribute('aria-pressed', 'true');
    await expect(saved).toHaveText(/^1\s*Saved stories$/);

    // following an interest in "Tune your picks" counts in My World too
    const following = me.getByRole('link', { name: /Following$/ });
    await expect(following).toHaveText(/^0\s*Following$/);
    await page.getByRole('group', { name: 'Tune your picks' }).getByRole('button', { name: /^Music/ }).click();
    await expect(following).toHaveText(/^1\s*Following$/);

    await saved.click();
    await expect(page).toHaveURL(/\/my-world\?tab=saved$/);
    await expect(page.getByRole('link', { name: /WAVEMAKERS — motion teaser/ }).first()).toBeVisible();
  });
});

test.describe('home on a phone @mobile', () => {
  test('tapping the spine changes the decade; the page never scrolls sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Time Machine', exact: true });
    const slider = region.getByRole('slider', { name: 'Decade' });
    await slider.scrollIntoViewIfNeeded();
    const coverage = cat.periodCoverage();
    const box = (await slider.boundingBox())!;
    const i = coverage.length - 1;
    await page.touchscreen.tap(box.x + ((i + 0.5) / coverage.length) * box.width, box.y + box.height / 2);
    await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`^${coverage[i].period.slug}, `));
    await expect(region.getByRole('heading', { level: 3, name: /^The \d{4}s$/ })).toHaveText(`The ${coverage[i].period.slug}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
