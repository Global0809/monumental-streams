/**
 * World — real outcomes of exploring: a category re-lights the map and the results, choosing
 * a place reveals what matches there, turning time changes the collection, saving reaches
 * My World, and the address remembers the whole exploration (refresh, back from a story,
 * the recent-places trail). Map and list views keep these deterministic (no WebGL needed).
 */
import { expect, test, type Page } from '@playwright/test';
import { pinPreviewCatalogue } from './snapshot.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

const category = (page: Page) => page.getByRole('radiogroup', { name: 'Category' });
const era = (page: Page) => page.getByRole('radiogroup', { name: 'Era' });
const map = (page: Page) => page.getByRole('region', { name: 'Flat map of the world' });
const node = (page: Page, name: string) => map(page).getByRole('link', { name: new RegExp(`^${name},`) });
const h1 = (page: Page) => page.getByRole('heading', { level: 1 });
const stories = (page: Page) => page.getByRole('region', { name: /^Stories here/ });
const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });

test.describe('World @world', () => {
  test('a category re-lights the map, the results and the counts; keyboard walks the chips', async ({ page }) => {
    await pinPreviewCatalogue(page);
    await page.goto('/world?view=map');
    await expect(category(page).getByRole('radio', { name: /^Everything/ })).toHaveAttribute('aria-checked', 'true');
    await expect(node(page, 'London')).toHaveAttribute('data-state', '0');
    const summary = page.locator('.atlas-sum');
    const before = (await summary.innerText()).trim();

    await category(page).getByRole('radio', { name: /^Music/ }).click();
    await expect(page).toHaveURL(/\/world\?view=map&cat=music$/);
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toHaveAttribute('aria-checked', 'true');
    // matching places glow, the rest dim
    await expect(node(page, 'London')).toHaveAttribute('data-state', '2');
    await expect(node(page, 'London')).toHaveAttribute('aria-label', /^London, \d+ match/);
    await expect(node(page, 'Tokyo')).toHaveAttribute('data-state', '1');
    await expect(summary).not.toHaveText(before);
    // the panel ranks the places that light up
    const results = page.getByRole('region', { name: /glows?$/ });
    await expect(results.getByRole('link', { name: /^London/ })).toBeVisible();
    await expect(results.getByRole('link', { name: /^Tokyo/ })).toHaveCount(0);

    // a category with nothing placed yet says so honestly
    await category(page).getByRole('radio', { name: /^Sports/ }).click();
    await expect(page).toHaveURL(/\/world\?view=map&cat=sports$/);
    await expect(page.getByText('No sports stories are on the map yet.')).toBeVisible();
    await expect(node(page, 'London')).toHaveAttribute('data-state', '1');

    // keyboard: arrows move the choice (and replace the history entry instead of stacking one)
    const sports = category(page).getByRole('radio', { name: /^Sports/ });
    await sports.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/cat=music$/);
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/\/world\?view=map&cat=music$/); // the Sports entry was replaced
    await page.goBack();
    await expect(page).toHaveURL(/\/world\?view=map$/);

    // clear everything
    await page.goto('/world?view=map&cat=music&era=1940s');
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page).toHaveURL(/\/world\?view=map$/);
  });

  test('selecting a destination reveals what matches there, then everything on request', async ({ page }) => {
    await page.goto('/world?view=list&cat=music');
    await page.getByRole('region', { name: /glows?$/ }).getByRole('link', { name: /^London/ }).click();
    await expect(page).toHaveURL(/\/world\/london\?view=list&cat=music$/);
    await expect(h1(page)).toHaveText('London');
    await expect(stories(page).getByText('Only stories that match the lens.')).toBeVisible();
    await expect(stories(page).getByRole('link', { name: /WAVEMAKERS/ }).first()).toBeVisible();
    await expect(stories(page).getByRole('link', { name: /^Newspaper Train/ })).toHaveCount(0);
    await stories(page).getByRole('button', { name: /^Show all \d+/ }).click();
    await expect(stories(page).getByRole('link', { name: /^Newspaper Train/ }).first()).toBeVisible();

    // the eras present here open the Time Machine; cultural connections lead on
    const eras = page.getByRole('region', { name: 'Eras present here' });
    await expect(eras.getByRole('link', { name: /^1940s/ })).toHaveAttribute('href', '/time-machine/1940s');
    const links = page.getByRole('region', { name: 'Where London leads' });
    await expect(links.getByRole('link', { name: /^Follow the route/ }).first()).toBeVisible();
    await expect(links.getByRole('list', { name: /^Why .* is connected$/ }).first()).toBeVisible();
  });

  test('turning time changes the collection and the routes', async ({ page }) => {
    await page.goto('/world?view=map');
    await era(page).getByRole('radio', { name: /^1940s/ }).click();
    await expect(page).toHaveURL(/\/world\?view=map&era=1940s$/);
    await expect(node(page, 'London')).toHaveAttribute('data-state', '2');
    await expect(node(page, 'Coral Gables')).toHaveAttribute('data-state', '1');

    await era(page).getByRole('radio', { name: /^1950s/ }).click();
    await expect(page).toHaveURL(/era=1950s$/);
    await expect(node(page, 'Coral Gables')).toHaveAttribute('data-state', '2');
    // London: no story set in the 1950s, but movements alive then — a hollow ring, honestly labelled
    await expect(node(page, 'London')).toHaveAttribute('aria-label', /no matching stories/);

    // the strip is a radiogroup: arrows step through decades (replacing, not stacking, history)
    await era(page).getByRole('radio', { name: /^1950s/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/era=1960s$/);
    await page.goBack();
    await expect(page).toHaveURL(/era=1940s$/);

    // "stories only" removes places with nothing to watch from the list
    await page.goto('/world?view=list');
    await expect(page.getByRole('list', { name: 'Places by region' }).getByRole('link', { name: /^Tokyo\s*,/ })).toHaveCount(1);
    await page.getByRole('switch', { name: 'Stories only' }).click();
    await expect(page).toHaveURL(/\/world\?view=list&stories=only$/);
    await expect(page.getByRole('switch', { name: 'Stories only' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('list', { name: 'Places by region' }).getByRole('link', { name: /^Tokyo\s*,/ })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Places by region' }).getByRole('link', { name: /^Miami\s*,/ })).toHaveCount(1);
  });

  test('saving a story and a place from World reaches My World', async ({ page }) => {
    await page.goto('/world/london?view=list');
    await stories(page).getByRole('button', { name: 'Save Newspaper Train' }).click();
    await expect(stories(page).getByRole('button', { name: 'Remove Newspaper Train from saved' })).toHaveAttribute('aria-pressed', 'true');
    // the save flies into the My World navigation item, which answers when it lands
    await expect(page.locator('[data-nav="my-world"].is-receiving').first()).toBeAttached();

    await page.getByRole('button', { name: 'Save place' }).click();
    await expect(toast(page, 'Saved London to My World')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved place' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-world?tab=saved');
    await expect(page.getByText(/Newspaper Train/).first()).toBeVisible();
    await expect(page.getByText(/London/).first()).toBeVisible();
  });

  test('the address remembers: refresh, back from a story, follow a route, hop back on the trail', async ({ page }) => {
    await page.goto('/world/london?cat=music&view=list');
    // canonical order is restored on the next navigation; the lens is read either way
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(h1(page)).toHaveText('London');
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toHaveAttribute('aria-checked', 'true');

    // open a story from the panel, then come back to the same place, lens and panel position
    const panel = page.locator('#atlas-place');
    const story = stories(page).getByRole('link', { name: /WAVEMAKERS — motion teaser/ }).first();
    await story.scrollIntoViewIfNeeded();
    const top = await panel.evaluate((el) => el.scrollTop);
    await page.waitForTimeout(150); // the panel position is written on the next frame
    await story.click();
    await expect(page).toHaveURL(/\/watch\/wavemakers-teaser/);
    await page.goBack();
    await expect(page).toHaveURL(/\/world\/london\?cat=music&view=list$/);
    await expect(h1(page)).toHaveText('London');
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toHaveAttribute('aria-checked', 'true');
    if (top > 0) await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(top - 8);

    // follow a route: the lens and view travel with it
    await page.goto('/world/kingston?view=list&cat=music');
    await page.getByRole('link', { name: 'Follow the route London' }).first().click();
    await expect(page).toHaveURL(/\/world\/london\?route=kingston-london&view=list&cat=music$/);
    await expect(page.getByRole('region', { name: /^Following / })).toBeVisible();

    // the trail of recent places hops back
    const trail = page.getByRole('navigation', { name: 'Recent places' });
    await trail.getByRole('link', { name: 'Kingston' }).click();
    await expect(page).toHaveURL(/\/world\/kingston\?view=list&cat=music$/);
    await expect(h1(page)).toHaveText('Kingston');
    await expect(page.getByRole('navigation', { name: 'Recent places' }).getByRole('link', { name: 'London' })).toBeVisible();
  });

  test('Connections and Passport speak the new names and lead back to World', async ({ page }) => {
    await page.goto('/synapse/place/miami');
    await expect(page).toHaveTitle(/Connections/);
    await expect(page.locator('.syn-kicker')).toContainText('Connections');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'World' })).toHaveAttribute('href', '/world');
    await page.getByRole('link', { name: 'Open in World' }).first().click();
    await expect(page).toHaveURL(/\/world\/miami$/);
    await expect(h1(page)).toHaveText('Miami');

    await page.goto('/passport');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'World' })).toBeVisible();
    await expect(page.getByText(/Your World/)).toHaveCount(0);
  });
});
