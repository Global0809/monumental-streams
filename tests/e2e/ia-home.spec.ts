/**
 * Home journeys: Home is an editorial layer over the home constellation, and every part of
 * it has a real outcome — in the DOM and in the living world. The featured chapter's gold
 * action watches the teaser; the category index counts from the catalogue and lights each
 * category's seeds; the World and Time Machine invitations light the stories they hold and
 * open their destinations; a seed under the pointer in the world lights the DOM back; saving
 * the teaser lands in My World. Expected numbers come from the live catalogue API, never
 * hard-coded. World state is read through the dev-only window.__stage handle.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildCatalogue, type Catalogue } from '../../shared/catalogue.ts';
import { SECTIONS, sectionById, videosForSection } from '../../shared/sections.ts';
import type { CataloguePayload } from '../../shared/types.ts';
import { worldHubs } from '../../src/features/home/home-model.ts';

const TEASER = 'video:wavemakers-teaser';
const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });
const plural = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;
const sorted = (ids: string[] | null | undefined) => (ids ? [...ids].sort() : ids);

type StageSnap = { arrangement: { kind: string; featured?: string }; highlight: string[] | null; hovered: string | null };
const stage = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __stage?: { store: { get(): StageSnap } } }).__stage?.store.get();
    return s ? { arrangement: s.arrangement, highlight: s.highlight, hovered: s.hovered } : null;
  });
/** The 3D stage is running (dev builds expose window.__stage); false where WebGL is unavailable. */
async function stageRunning(page: Page) {
  try {
    await page.waitForFunction(() => !!(window as unknown as { __stage?: unknown }).__stage, null, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}
/** Put a seed under the pointer as the engine does when the viewer points at it in the world. */
const pointAtSeed = (page: Page, id: string | null) =>
  page.evaluate((seed) => {
    const st = (window as unknown as { __stage: { store: { set(fn: (s: StageSnap) => StageSnap): void } } }).__stage.store;
    st.set((s) => ({ ...s, hovered: seed }));
  }, id);

let cat: Catalogue;

test.beforeAll(async ({ request }) => {
  cat = buildCatalogue((await (await request.get('/api/catalogue')).json()) as CataloguePayload);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

test.describe('home', () => {
  test('hierarchy: the opening, the index, the invitations, calm rows, tools, then My World — and no visuals of its own', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).toContainText('Stream the world.');
    // one gold primary action for the whole view: watch the featured teaser
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    const watch = page.getByRole('link', { name: 'Watch the teaser' });
    await expect(watch).toHaveAttribute('href', '/watch/wavemakers-teaser');
    await expect(watch).toBeInViewport();
    // the featured chapter states its honest status
    const feature = page.getByRole('region', { name: /WAVEMAKERS/ });
    await expect(feature.getByRole('heading', { level: 2 })).toContainText('WAVEMAKERS');
    await expect(feature).toContainText('In development');
    await expect(feature).toContainText('not footage from the programme');

    // the world is the picture: Home paints no hero video, globe or instrument of its own
    await expect(page.locator('main canvas')).toHaveCount(0);
    await expect(page.locator('#home-hero video, #home-hero img')).toHaveCount(0);
    await expect(page.locator('.la-stage')).toHaveAttribute('data-arrangement', 'home');

    const order = ['#home-hero', '#home-categories', '#home-world', '#home-time', '#home-for-you', '#home-archive', '#home-originals', '#home-tools', '#home-my-world'];
    const tops: number[] = [];
    for (const sel of order) tops.push(await page.locator(sel).evaluate((el) => el.getBoundingClientRect().top + window.scrollY));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  test('the world takes the home constellation with the featured seed in front; the chapter and its seed light each other', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await stageRunning(page)), 'the 3D stage is not running in this browser');
    await expect.poll(async () => (await stage(page))?.arrangement).toEqual({ kind: 'home', featured: TEASER });

    // focusing the chapter lights its seed …
    await page.getByRole('link', { name: 'Watch the teaser' }).focus();
    await expect.poll(async () => (await stage(page))?.hovered).toBe(TEASER);
    await page.locator('#main').focus(); // focus leaves the editorial item
    await expect.poll(async () => (await stage(page))?.hovered).toBeNull();
    // … and pointing at the seed in the world lights the chapter
    const feature = page.locator('.home-feature');
    await pointAtSeed(page, TEASER);
    await expect(feature).toHaveAttribute('data-lit');
    await pointAtSeed(page, null);
    await expect(feature).not.toHaveAttribute('data-lit');
  });

  test('categories: the nine organs with counts from the catalogue; each lights its stories in the world and opens', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Categories', exact: true });
    await region.scrollIntoViewIfNeeded();
    const lines = region.getByRole('listitem');
    await expect(lines).toHaveCount(9);
    for (const s of SECTIONS.filter((x) => x.kind === 'category')) {
      const count = videosForSection(cat, s).length;
      const line = region.getByRole('link', { name: new RegExp(`^${s.label}`) });
      await expect(line).toHaveAttribute('href', s.path);
      await expect(line).toContainText(count ? plural(count) : 'Coming soon');
    }
    const live = region.getByRole('link', { name: /^Live/ });
    await expect(live).toContainText('Nothing is on air');
    await expect(live).toHaveAttribute('href', '/live');
    await expect(lines.last()).toContainText('Live'); // Live closes the ring

    // focusing a category previews it in the world (the static world takes its hue too)
    const music = sectionById('music');
    await region.getByRole('link', { name: /^Music/ }).focus();
    await expect(page.locator('.la-stage')).toHaveAttribute('data-tint', 'music');
    if (await stageRunning(page)) {
      await expect.poll(async () => sorted((await stage(page))?.highlight)).toEqual(sorted(videosForSection(cat, music).map((v) => v.id)));
      // a seed under the pointer in the world lights the categories it belongs to
      const seed = videosForSection(cat, sectionById('movies'))[0];
      await page.locator('#main').focus(); // focus leaves the editorial item
      await expect.poll(async () => (await stage(page))?.highlight).toBeNull();
      await pointAtSeed(page, seed.id);
      await expect(region.getByRole('link', { name: /^Movies/ })).toHaveAttribute('data-lit');
      for (const s of SECTIONS.filter((x) => x.kind === 'category')) {
        const holds = videosForSection(cat, s).some((v) => v.id === seed.id);
        const line = region.getByRole('link', { name: new RegExp(`^${s.label}`) });
        if (holds) await expect(line).toHaveAttribute('data-lit');
        else await expect(line).not.toHaveAttribute('data-lit');
      }
      await pointAtSeed(page, null);
    }

    // choosing one opens it (an empty category still opens and explains itself)
    const empty = SECTIONS.find((s) => s.kind === 'category' && videosForSection(cat, s).length === 0);
    const target = empty ?? music;
    await region.getByRole('link', { name: new RegExp(`^${target.label}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${target.path}$`));
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('World invitation: the destinations light their stories in the world and open the World there', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'World', exact: true });
    await region.scrollIntoViewIfNeeded();
    const hubs = worldHubs(cat);
    const dests = region.getByRole('list', { name: 'Destinations with stories' });
    await expect(dests.getByRole('link')).toHaveCount(hubs.length);
    const london = hubs.find((h) => h.place.slug === 'london')!;
    const link = dests.getByRole('link', { name: /^London/ });
    await expect(link).toContainText(plural(london.videos.length));
    await expect(link).toHaveAttribute('href', '/world/london');

    if (await stageRunning(page)) {
      // pointing at the invitation lights every story placed on the globe …
      const placed = cat.videos.filter((v) => v.places.some((id) => Array.isArray((cat.get(id) as { coords?: unknown } | undefined)?.coords))).map((v) => v.id);
      await region.getByRole('heading', { name: 'World' }).hover();
      await expect.poll(async () => sorted((await stage(page))?.highlight)).toEqual(sorted(placed));
      // … a destination lights only the stories set there
      await link.focus();
      await expect.poll(async () => sorted((await stage(page))?.highlight)).toEqual(sorted(london.videos.map((v) => v.id)));
      // and a seed in the world lights the destinations it is set in
      await page.locator('#main').focus(); // focus leaves the editorial item
      await page.mouse.move(5, 5);
      await expect.poll(async () => (await stage(page))?.highlight).toBeNull();
      await pointAtSeed(page, TEASER);
      for (const h of hubs) {
        const l = dests.getByRole('link', { name: new RegExp(`^${h.place.name}`) });
        if (h.videos.some((v) => v.id === TEASER)) await expect(l).toHaveAttribute('data-lit');
        else await expect(l).not.toHaveAttribute('data-lit');
      }
      await pointAtSeed(page, null);
    }

    await link.click();
    await expect(page).toHaveURL(/\/world\/london$/);
    await expect(page.locator('main h1')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('region', { name: 'World', exact: true })).toBeVisible();
  });

  test('Time Machine invitation: a decade lights its stories and opens the Time Machine there', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Time Machine', exact: true });
    await region.scrollIntoViewIfNeeded();
    const decades = cat.periodCoverage().filter((c) => c.count > 0);
    const list = region.getByRole('list', { name: 'Decades with stories' });
    await expect(list.getByRole('link')).toHaveCount(decades.length);
    const d = decades[0];
    const link = list.getByRole('link', { name: new RegExp(`^${d.period.label}`) });
    await expect(link).toContainText(plural(d.count));

    if (await stageRunning(page)) {
      await link.focus();
      await expect.poll(async () => sorted((await stage(page))?.highlight)).toEqual(sorted(cat.videosForPeriod(d.period.id).map((v) => v.id)));
    }
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/time-machine/${d.period.slug}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(region.getByRole('link', { name: 'Open the Time Machine' })).toHaveAttribute('href', '/time-machine');
  });

  test('saving the featured teaser lands in My World; following an interest tunes the picks', async ({ page }) => {
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

    // following an interest from "Tune your picks" counts in My World too
    const following = me.getByRole('link', { name: /Following$/ });
    await expect(following).toHaveText(/^0\s*Following$/);
    const tune = page.getByRole('group', { name: 'Tune your picks' });
    await tune.getByText('Tune your picks').click();
    await tune.getByRole('button', { name: /^Music/ }).click();
    await expect(following).toHaveText(/^1\s*Following$/);
    await expect(tune).toContainText('Following 1');

    await saved.click();
    await expect(page).toHaveURL(/\/my-world\?tab=saved$/);
    await expect(page.getByRole('link', { name: /WAVEMAKERS — motion teaser/ }).first()).toBeVisible();
  });
});

test.describe('home on a phone @mobile', () => {
  test('the first screen holds the line, the featured title and a visible Watch action; nothing scrolls sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.goto('/');
    await expect(page.locator('main h1')).toBeInViewport();
    await expect(page.locator('#home-feature-title')).toBeInViewport();
    const watch = page.getByRole('link', { name: 'Watch the teaser' });
    await expect(watch).toBeInViewport();
    const tabs = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
    const box = (await watch.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(tabs!.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // the save keeps its name on a phone, drawn as a bookmark
    await expect(page.getByRole('button', { name: 'Save teaser' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // a category is one tap away and opens
    const region = page.getByRole('region', { name: 'Categories', exact: true });
    await region.getByRole('link', { name: /^Music/ }).tap();
    await expect(page).toHaveURL(/\/music$/);
  });
});
