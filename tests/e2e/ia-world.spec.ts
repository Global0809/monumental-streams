/**
 * World — real outcomes of exploring: a category re-lights the map, the lists and the living
 * world (the stage highlight), choosing a place reveals what matches there and turns the
 * globe to it, turning time changes the collection, saving reaches My World, and the address
 * remembers the whole exploration (refresh, back from a story, the recent-places trail).
 *
 * The world is driven through the shared stage store, so its outcomes are asserted on the
 * store itself (the same module instance the app uses in dev) — no WebGL needed. Map and list
 * views keep the 2D assertions deterministic.
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

interface StageSnapshot {
  arrangement: { kind: string; place?: string; route?: string };
  highlight: string[] | null;
  hoveredPlace: string | null;
}
/**
 * The app's own stage store module. Vite serves a hot-updated module under a new `?t=` URL, so
 * the exact URL the app loaded is taken from the resource timeline — a bare import could
 * create a second, empty instance.
 */
const STORE = `(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\/src\\/stage\\/store\\.ts(\\?|$)/.test(n));
  return import(urls[urls.length - 1] ?? '/src/stage/store.ts');
})()`;
/** The living world's state, read from the app's stage store. */
const stage = (page: Page) =>
  page.evaluate(async (src) => {
    const m = await (0, eval)(src);
    const s = m.stageStore.get();
    return { arrangement: s.arrangement, highlight: s.highlight, hoveredPlace: s.hoveredPlace } as StageSnapshot;
  }, STORE);
/** Act inside the world as the engine would. */
const emitPlace = (page: Page, id: string) =>
  page.evaluate(
    async ([src, place]) => {
      const m = await (0, eval)(src);
      return m.emitStage('placeActivate', { id: place }) as boolean;
    },
    [STORE, id] as const,
  );
const hoverPlaceInWorld = (page: Page, id: string | null) =>
  page.evaluate(
    async ([src, place]) => {
      const m = await (0, eval)(src);
      m.stageStore.set((s: { hoveredPlace: string | null }) => ({ ...s, hoveredPlace: place }));
    },
    [STORE, id] as const,
  );

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
    // the column ranks the places that light up
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

  test('the lens lights the living world: matching seeds are the stage highlight, clearing restores everything', async ({ page }) => {
    await pinPreviewCatalogue(page);
    await page.goto('/world');
    await expect(h1(page)).toHaveText('World');
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world' });
    expect((await stage(page)).highlight).toBeNull();

    await category(page).getByRole('radio', { name: /^Music/ }).click();
    await expect(page).toHaveURL(/\/world\?cat=music$/);
    // exactly the stories the column calls matches glow in the world
    const matches = page.getByRole('region', { name: 'Stories that match' });
    await expect(matches.getByRole('link', { name: /WAVEMAKERS/ }).first()).toBeVisible();
    await expect.poll(async () => (await stage(page)).highlight?.length ?? 0).toBeGreaterThan(0);
    const lit = (await stage(page)).highlight!;
    expect(lit).toContain('video:wavemakers-teaser');
    expect(lit).not.toContain('video:newspaper-train-1942');
    await expect(page.locator('.atlas-sum')).toContainText(`${lit.length} ${lit.length === 1 ? 'story' : 'stories'} match`);

    // turning time narrows the glow further; clearing lights the whole world again
    await era(page).getByRole('radio', { name: /^1940s/ }).click();
    await expect(page).toHaveURL(/cat=music&era=1940s$/);
    await expect.poll(async () => JSON.stringify((await stage(page)).highlight)).not.toBe(JSON.stringify(lit));
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page).toHaveURL(/\/world$/);
    await expect.poll(async () => (await stage(page)).highlight).toBeNull();
  });

  test('selecting a place turns the globe there; a place clicked on the globe opens here with the lens; following a route frames its arc', async ({ page }) => {
    await page.goto('/world?cat=music');
    // from the column: the camera's arrangement follows the URL
    await page.getByRole('region', { name: /glows?$/ }).getByRole('link', { name: /^London/ }).click();
    await expect(page).toHaveURL(/\/world\/london\?cat=music$/);
    await expect(h1(page)).toHaveText('London');
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:london' });

    // from the world: a click on a place in the globe keeps the lens and adds one history entry
    expect(await emitPlace(page, 'place:kingston')).toBe(true);
    await expect(page).toHaveURL(/\/world\/kingston\?cat=music$/);
    await expect(h1(page)).toHaveText('Kingston');
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:kingston' });

    // Follow: the route's arc lights and the camera frames it
    await page.getByRole('link', { name: 'Follow the route London' }).first().click();
    await expect(page).toHaveURL(/\/world\/london\?route=kingston-london&cat=music$/);
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:london', route: 'route:kingston-london' });
    await expect(page.getByRole('region', { name: /^Following / }).getByText('Lit on the globe')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/world\/kingston\?cat=music$/);
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:kingston' });
  });

  test('places answer both ways: rows light the globe, the globe lights rows and previews the place', async ({ page }) => {
    await page.goto('/world');
    const results = page.getByRole('region', { name: 'Where the stories are' });
    const london = results.getByRole('link', { name: /^London/ });

    // DOM → world
    await london.hover();
    await expect.poll(async () => (await stage(page)).hoveredPlace).toBe('place:london');
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await stage(page)).hoveredPlace).toBeNull();
    await london.focus();
    await expect.poll(async () => (await stage(page)).hoveredPlace).toBe('place:london');
    await london.blur();
    await expect.poll(async () => (await stage(page)).hoveredPlace).toBeNull();

    // world → DOM: the place under the pointer on the globe lights its row and is previewed
    await hoverPlaceInWorld(page, 'place:london');
    await expect(london).toHaveAttribute('data-world-lit', 'true');
    const globe = (await page.locator('.atlas').getAttribute('data-view')) === 'globe';
    if (globe) {
      const peek = page.locator('.atlas-peek');
      await expect(peek).toBeVisible();
      await expect(peek).toContainText('London');
      await expect(peek).toContainText(/\d+ stor(y|ies)/);
    }
    await hoverPlaceInWorld(page, null);
    await expect(london).not.toHaveAttribute('data-world-lit', 'true');
    await expect(page.locator('.atlas-peek')).toHaveCount(0);
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

    // one gold action: watch what is here
    await expect(page.getByRole('link', { name: /^Watch / })).toHaveAttribute('href', /^\/watch\//);

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

    // open a story from the column, then come back to the same place, lens and scroll position
    const story = stories(page).getByRole('link', { name: /WAVEMAKERS — motion teaser/ }).first();
    await story.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 240);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const top = await page.evaluate(() => window.scrollY);
    await story.click();
    await expect(page).toHaveURL(/\/watch\/wavemakers-teaser/);
    await page.goBack();
    await expect(page).toHaveURL(/\/world\/london\?cat=music&view=list$/);
    await expect(h1(page)).toHaveText('London');
    await expect(category(page).getByRole('radio', { name: /^Music/ })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top - 40);

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

  test('Passport turns the world to the next stop and lights every story along the journey', async ({ page }) => {
    await page.goto('/passport?stops=london,kingston&title=QA%20world%20trail');
    await expect(page.getByRole('heading', { name: 'QA world trail', level: 2 })).toBeVisible();
    // nothing stamped yet: the globe faces the first stop, and the stories of every stop glow
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:london' });
    const lit = (await stage(page)).highlight ?? [];
    expect(lit).toContain('video:newspaper-train-1942');

    // "Show on the globe" flies the camera to that stop
    await page.getByRole('button', { name: 'Show on the globe: Kingston' }).click();
    await expect(page.getByRole('button', { name: /^On the globe: Kingston/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:kingston' });
    // a stop clicked on the globe is focused in place, without leaving the passport
    expect(await emitPlace(page, 'place:london')).toBe(true);
    await expect(page).toHaveURL(/\/passport\?/);
    await expect.poll(async () => (await stage(page)).arrangement).toEqual({ kind: 'world', place: 'place:london' });
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

test.describe('World on a phone @mobile', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
  });

  test('the first screen holds the place and a Watch action; the lens folds behind Filter and still lights the world', async ({ page }) => {
    await page.goto('/world/miami');
    await expect(h1(page)).toHaveText('Miami');
    const watch = page.getByRole('link', { name: /^Watch / });
    await expect(watch).toBeInViewport();
    await expect(h1(page)).toBeInViewport();

    // the lens is folded: one toggle, then the same radios as on the desktop
    await expect(category(page)).toBeHidden();
    const toggle = page.getByRole('button', { name: /^Filter/ });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await category(page).getByRole('radio', { name: /^Music/ }).tap();
    await expect(page).toHaveURL(/\/world\/miami\?cat=music$/);
    await expect.poll(async () => (await stage(page)).highlight?.length ?? 0).toBeGreaterThan(0);

    // the list is one tap away and lands under the controls, not past the whole place
    await page.getByRole('radiogroup', { name: 'World view' }).getByRole('radio', { name: 'List' }).tap();
    await expect(page).toHaveURL(/\/world\/miami\?view=list&cat=music$/);
    await expect(page.getByLabel('Find a place')).toBeVisible();
  });
});
