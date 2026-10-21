/**
 * Category pages: one engine, eight presentation families. These journeys prove real outcomes:
 * choosing a category changes the collection, facets / search / sort change it and live in the
 * URL, saving updates My World, places and eras open World and the Time Machine, empty
 * categories are honest — and fill themselves the moment a title carries their interest.
 */
import { expect, test, type Page } from '@playwright/test';
import { pinPreviewCatalogue } from './snapshot.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

/** Visible titles of the result cards, in order (the link's first text node, without its spoken suffix). */
const titles = (page: Page) => page.locator('main .cat-results article h3 a').evaluateAll((els) => els.map((a) => (a.firstChild?.textContent ?? '').trim()));
const toolbar = (page: Page, label: string) => page.getByRole('search', { name: `Filter ${label}` });

/** Tag real catalogue videos with an interest inside this browser only (the API is untouched). */
const tagInBrowser = (page: Page, tags: Record<string, string[]>) => pinPreviewCatalogue(page, tags);

test.describe('category pages', () => {
  // These journeys assert exact counts and empty states: pin the original 17-title catalogue.
  test.beforeEach(async ({ page }) => {
    await pinPreviewCatalogue(page);
  });

  test('navigation and the in-page switcher change the collection, keeping the switcher focused', async ({ page }) => {
    await page.goto('/movies');
    await expect(page.getByRole('heading', { level: 1, name: 'Movies' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^Movies/ })).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => titles(page)).toContain('Sintel');

    // primary navigation
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Music', exact: true }).click();
    await expect(page).toHaveURL(/\/music$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Music' })).toBeVisible();
    await expect.poll(() => titles(page)).toContain('WAVEMAKERS — motion teaser');
    expect(await titles(page)).not.toContain('Sintel');
    // a primary-navigation change moves focus to the new page's heading
    await expect(page.locator('main h1')).toBeFocused();

    // the category switcher inside the page
    const switcher = page.getByRole('navigation', { name: 'Categories' });
    const culture = switcher.getByRole('link', { name: /^Culture \d+ titles$/ });
    await culture.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/culture$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Culture' })).toBeVisible();
    const current = page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^Culture/ });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current).toBeFocused();
    await expect.poll(() => titles(page)).toContain('Kingston Jamaica');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Music' })).toBeVisible();
  });

  test('facets, search and sort change the results and live in the URL (Back undoes a filter)', async ({ page }) => {
    await page.goto('/movies');
    const tools = toolbar(page, 'Movies');
    await expect.poll(async () => (await titles(page)).length).toBe(6);

    await tools.getByRole('button', { name: /^Fiction\s*\d+$/ }).click();
    await expect(page).toHaveURL(/\?facet=fiction$/);
    await expect.poll(() => titles(page)).toEqual(['Sintel', 'Tears of Steel']);
    await expect(tools.getByRole('button', { name: /^Fiction\s*\d+$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(tools.getByRole('button', { name: 'Remove filter Fiction' })).toBeVisible();
    await expect(tools.locator('.cat-showing')).toContainText('of 6 titles');

    await page.goBack();
    await expect(page).toHaveURL(/\/movies$/);
    await expect.poll(async () => (await titles(page)).length).toBe(6);

    // sort by era: the 1905 films lead
    await tools.getByLabel('Sort Movies').selectOption('era-old');
    await expect(page).toHaveURL(/sort=era-old/);
    await expect.poll(async () => (await titles(page))[0]).toBe('Coney Island at Night');

    // search within the category (URL follows after a pause)
    await tools.getByRole('searchbox', { name: 'Search within Movies' }).fill('newspaper');
    await expect.poll(() => titles(page)).toEqual(['Newspaper Train']);
    await expect(page).toHaveURL(/q=newspaper/);
    await page.reload();
    await expect(tools.getByRole('searchbox', { name: 'Search within Movies' })).toHaveValue('newspaper');
    await expect.poll(() => titles(page)).toEqual(['Newspaper Train']);

    // no match → honest relaxation
    await tools.getByRole('searchbox', { name: 'Search within Movies' }).fill('zzzzqx');
    await expect(page.getByRole('heading', { name: /No Movies titles match “zzzzqx”/ })).toBeVisible();
    await page.getByRole('button', { name: 'Clear “zzzzqx”' }).click();
    await expect.poll(async () => (await titles(page)).length).toBe(6);
  });

  test('the marquee follows the filmstrip selection', async ({ page }) => {
    await page.goto('/movies');
    const strip = page.getByRole('group', { name: 'Choose the film on the screen' });
    await strip.getByRole('button', { name: /Show Coney Island at Night on the screen/ }).click();
    await expect(page.locator('.cine-title')).toHaveText('Coney Island at Night');
    await expect(strip.getByRole('button', { name: /Coney Island at Night/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: 'Watch Coney Island at Night' })).toBeVisible();
  });

  test('saving a title flies it into My World and My World lists it', async ({ page }) => {
    await page.goto('/movies');
    const save = page.locator('main .cat-results').getByRole('button', { name: 'Save Sintel' });
    await save.click();
    await expect(page.locator('.toaster').getByText('Saved “Sintel” to My World')).toBeVisible();
    await expect(page.locator('main .cat-results').getByRole('button', { name: 'Remove Sintel from My World' })).toHaveAttribute('aria-pressed', 'true');
    // the orb lands on the My World navigation item
    await expect(page.locator('[data-nav="my-world"].is-receiving')).toHaveCount(1, { timeout: 4000 });
    await expect(page.locator('[data-nav="my-world"]').first()).toContainText('1');
    // persisted, then visible in My World
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ms.library.guest.v1') ?? '')).toContain('video:sintel');
    await page.goto('/my-world?tab=saved');
    await expect(page.locator('main').getByRole('link', { name: /Sintel/ }).first()).toBeVisible();
  });

  test('places and eras follow the filters and open World and the Time Machine', async ({ page }) => {
    await page.goto('/culture');
    const ctx = page.locator('#cat-context');
    await expect(ctx.getByRole('link', { name: /^Kingston/ })).toBeVisible();
    await toolbar(page, 'Culture').getByRole('button', { name: /^Art\s*\d+$/ }).click();
    await expect(page).toHaveURL(/facet=art/);
    await expect(ctx.getByRole('link', { name: /^Kingston/ })).toHaveCount(0);
    await page.goBack();
    await expect(ctx.getByRole('link', { name: /^Kingston/ })).toBeVisible();

    await ctx.getByRole('link', { name: /^1940s: \d+ titles? — open in the Time Machine$/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s/);
    await page.goBack();
    await ctx.getByRole('link', { name: /^Kingston/ }).click();
    await expect(page).toHaveURL(/\/world\/kingston/);
  });

  test('Music groups by artist or scene, and the grouping is shareable', async ({ page }) => {
    await page.goto('/music');
    const tools = toolbar(page, 'Music');
    await expect(page.getByRole('region', { name: /^Valid ID, \d+ titles?$/ })).toBeVisible();
    await tools.getByRole('radio', { name: 'Scene' }).click();
    await expect(page).toHaveURL(/group=scene/);
    await expect(page.getByRole('region', { name: /^Valid ID/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Scenes' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sound-system culture/ })).toHaveAttribute('href', /\/synapse\/movement\//);
  });

  test('an empty category is honest: its purpose, no invented titles, real related links', async ({ page }) => {
    await page.goto('/fashion');
    await expect(page.getByRole('heading', { level: 1, name: 'Fashion' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No Fashion titles are published yet.' })).toBeVisible();
    await expect(page.getByText('What this space is for')).toBeVisible();
    await expect(page.getByText(/appears here automatically/)).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(0);
    // genuinely related: the carnival movement is tagged Fashion in the catalogue
    await expect(page.getByRole('link', { name: /Notting Hill Carnival/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore the World' })).toBeVisible();
    // the counts say so too
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^Fashion 0 titles$/ })).toHaveAttribute('aria-current', 'page');

    await page.goto('/kids');
    await expect(page.getByRole('heading', { name: 'No Kids titles are published yet.' })).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(0);
  });

  test('empty categories fill themselves when a title carries their interest (data-driven)', async ({ page }) => {
    await tagInBrowser(page, { 'interest:sport': ['video:newspaper-train-1942', 'video:roads-to-romance'], 'interest:news': ['video:newspaper-train-1942'] });
    await page.goto('/sports');
    await expect(page.getByRole('heading', { name: /No Sports titles/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Fixtures' })).toBeVisible();
    await expect.poll(() => titles(page)).toEqual(expect.arrayContaining(['Newspaper Train', 'Roads to Romance: Coral Gables']));
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^Sports 2 titles$/ })).toBeVisible();

    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^News 1 title$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'News' })).toBeVisible();
    // broadsheet: dates and sources up front
    const lead = page.locator('.lead');
    await expect(lead.getByRole('heading', { name: 'Newspaper Train' })).toBeVisible();
    await expect(lead.getByText('Len Lye, Realist Film Unit, for the UK Ministry of Information')).toBeVisible();
    await expect(lead.getByText('Filmed')).toBeVisible();
  });

  test('no horizontal overflow on phone, tablet and desktop widths', async ({ page }) => {
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/movies', '/music', '/culture', '/sports']) {
        await page.goto(route);
        await expect(page.locator('main h1')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('reduced motion: everything still works and the visuals stand still', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    await ctx.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/music');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await toolbar(page, 'Music').getByRole('radio', { name: 'Everything' }).click();
    await expect(page).toHaveURL(/group=all/);
    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: /^Movies/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Movies' })).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

/* ───────────── accessibility sweep: all eight pages at phone, tablet and desktop ───────────── */

const CATEGORY_ROUTES = ['/movies', '/music', '/sports', '/gaming', '/news', '/fashion', '/culture', '/kids'];
const SWEEP_WIDTHS = [
  { width: 390, height: 844, touch: true, mobile: true },
  { width: 820, height: 1180, touch: true, mobile: false },
  { width: 1440, height: 900, touch: false, mobile: false },
];

/** Visible interactive elements smaller than 44×44 (a stretched-link ::after counts as the target). */
function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button, main input, main select, main [role=radio]'))) {
      if (el.closest('[aria-hidden="true"], .sr-only')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      let w = r.width;
      let h = r.height;
      const label = el.matches('input, select') ? el.closest('label') : null;
      if (label) {
        const lr = label.getBoundingClientRect();
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
      }
      const after = getComputedStyle(el, '::after');
      if (after.content !== 'none' && after.position === 'absolute' && el.closest('.cc')) continue; // whole-card link
      if (w >= 43.5 && h >= 43.5) continue;
      out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(w)}×${Math.round(h)}`);
    }
    return out;
  });
}

test.describe('category accessibility sweep', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const vp of SWEEP_WIDTHS) {
    test.describe(`${vp.width}px`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.mobile });
      for (const route of CATEGORY_ROUTES) {
        test(`${route} @ ${vp.width}`, async ({ page }) => {
          await page.goto(route);
          await expect(page.locator('main h1')).toHaveCount(1);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(500);
          if (vp.touch) expect.soft(await smallTargets(page), 'targets under 44×44').toEqual([]);
          const { default: AxeBuilder } = await import('@axe-core/playwright');
          await page.addStyleTag({ content: 'body{background:var(--night)!important}body::before{display:none!important}' });
          // the page itself (the shared shell has its own sweep in a11y-responsive.spec.ts)
          const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.cursor').analyze();
          const severe = results.violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
          expect.soft(severe, 'serious/critical axe violations').toEqual([]);
        });
      }
    });
  }
});
