/**
 * Time Machine journeys — real outcomes of moving through time:
 *   · choosing a year narrows the stories to those whose recorded setting includes it, and the
 *     address (/time-machine/1940s?year=1942) survives reload, Back and direct entry (/1942);
 *   · a category chip in the field notes filters the stories; lens + category persist in the URL;
 *   · an empty year offers the nearest years with stories and the real stories closest in time;
 *   · saving a story from the Time Machine lands it in My World;
 *   · a movement chosen in the field notes opens on the span timeline; a place opens in World and
 *     Back returns to the same place in time; pointing at the lineage lights its thread.
 * Archive data used: Newspaper Train (set 1940–41, made 1942), Democracy at Work in Rural Puerto
 * Rico (set 1941–42, made 1942), Roads to Romance (set 1950).
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

const stories = (page: Page) => page.getByRole('region', { name: /stories (set|made|published) in/i });
const story = (page: Page, title: string) => stories(page).getByRole('link', { name: new RegExp(`^${title}`) }).first();
const years = (page: Page) => page.getByRole('radiogroup', { name: 'Year' });
const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });

test.describe('Time Machine', () => {
  test('a year narrows the stories to settings that include it; reload, Back and /1942 restore it', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    await expect(page.getByRole('heading', { name: 'Stories set in the 1940s' })).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(years(page).getByRole('radio', { name: /^Whole decade/ })).toHaveAttribute('aria-checked', 'true');

    // 1942: only the Puerto Rico film's setting (1941–42) includes it; the Blitz (1940–41) does not
    await years(page).getByRole('radio', { name: '1942, 1 story' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The year 1942');
    await expect(page.getByRole('heading', { name: 'Stories set in 1942' })).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Decade dial' })).toHaveAttribute('aria-valuetext', /^1940s/);

    // keyboard: one step back settles on 1941, where both settings meet
    await years(page).getByRole('radio', { name: /^1942/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1941$/);
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();

    await page.reload();
    await expect(years(page).getByRole('radio', { name: /^1941/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'Stories set in 1941' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);

    // the active filter pill clears the year back to the whole decade
    await page.getByRole('list', { name: 'Active filters' }).getByRole('button', { name: /^Clear year 1942/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s$/);
    await expect(story(page, 'Newspaper Train')).toBeVisible();

    // a bare year is a direct address too
    await page.goto('/time-machine/1942');
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The year 1942');
  });

  test('a category chip filters the stories; lens and category persist through reload', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    const cats = page.getByRole('group', { name: /Categories present/ });
    await cats.getByRole('button', { name: /^Film/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?interest=film$/);
    await expect(page.getByRole('heading', { name: 'Film stories set in the 1940s' })).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toHaveCount(0);
    await expect(cats.getByRole('button', { name: /^Film/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'Active filters' }).getByRole('button', { name: 'Remove category Film' })).toBeVisible();

    await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /^Made in/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made&interest=film$/);
    await expect(page.getByRole('heading', { name: 'Film stories made in the 1940s' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Film stories made in the 1940s' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /^Made in/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('group', { name: /Categories present/ }).getByRole('button', { name: /^Film/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Remove category Film' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made$/);
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
  });

  test('an empty year offers the nearest years and the real stories closest in time', async ({ page }) => {
    await page.goto('/time-machine/1940s?year=1945');
    await expect(page.getByText('No stories set in 1945 yet')).toBeVisible();
    await expect(page.getByText(/The nearest years with stories are 1942 \(1\) and 1950 \(1\)/)).toBeVisible();
    const closest = page.getByRole('group', { name: 'Closest in time' });
    await expect(closest.getByRole('link', { name: /^Democracy at Work in Rural Puerto Rico/ })).toBeVisible();
    await expect(closest.getByText('3 years earlier')).toBeVisible();

    await page.getByRole('link', { name: '1950 · 1' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1950s\?year=1950$/);
    await expect(story(page, 'Roads to Romance')).toBeVisible();
  });

  test('saving a story from the Time Machine lands it in My World', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    await stories(page).getByRole('button', { name: 'Save Newspaper Train to My World' }).click();
    await expect(toast(page, 'Saved “Newspaper Train” to My World')).toBeVisible();
    await expect(stories(page).getByRole('button', { name: 'Remove Newspaper Train from My World' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-world?tab=saved');
    await expect(page.getByRole('tabpanel').getByText('Newspaper Train').first()).toBeVisible();
  });

  test('a movement opens on the timeline; a place opens in World and Back returns; the lineage lights a thread', async ({ page }) => {
    await page.goto('/time-machine/1970s');
    const movements = page.getByRole('group', { name: /Movements active/ });
    const more = movements.getByRole('button', { name: /more$/ });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(movements.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
    await movements.getByRole('button', { name: /^Hip hop's origins/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1970s\?movement=hip-hop-origins$/);
    const detail = page.getByRole('article', { name: "Hip hop's origins" });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('link', { name: 'Open connections' })).toHaveAttribute('href', '/synapse/movement/hip-hop-origins');

    await page.getByRole('group', { name: /Places involved/ }).getByRole('button', { name: /more$/ }).click();
    await page.getByRole('group', { name: /Places involved/ }).getByRole('link', { name: /^The Bronx/ }).click();
    await expect(page).toHaveURL(/\/world\/the-bronx/);
    await page.goBack();
    await expect(page).toHaveURL(/\/time-machine\/1970s\?movement=hip-hop-origins$/);
    await expect(page.getByRole('article', { name: "Hip hop's origins" })).toBeVisible();

    const lineage = page.locator('#tm-lineage');
    await lineage.scrollIntoViewIfNeeded();
    const root = lineage.getByRole('link', { name: /^Sound-system culture/ }).first();
    await root.hover();
    await expect(root).toHaveAttribute('data-lit', 'on');
    await expect(lineage.locator('.tm-vein-path[data-lit="on"]').first()).toBeAttached();
  });
});

/* ───────────── Fit and accessibility of the Time Machine's own content, in its richer states ───────────── */

const STATES = ['/time-machine/1940s?year=1942&interest=documentary', '/time-machine/1970s?year=1974&lens=made', '/time-machine/2020s?lens=published&year=2026', '/time-machine/1850s'];
const FIT = [
  { width: 390, height: 844, touch: true, mobile: true },
  { width: 820, height: 1180, touch: true, mobile: false },
  { width: 1440, height: 900, touch: false, mobile: false },
];

for (const vp of FIT) {
  test.describe(`Time Machine fits ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.mobile, reducedMotion: 'reduce' });

    test(`richer states: no overflow, one h1, 44px targets on touch, no serious axe issues in main @ ${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      const { default: AxeBuilder } = await import('@axe-core/playwright');
      for (const route of STATES) {
        await page.goto(route);
        await page.locator('main h1').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);

        const fit = await page.evaluate((w) => {
          document.body.style.overflowX = 'visible';
          return { scroll: document.documentElement.scrollWidth, vw: Math.min(window.innerWidth, w) };
        }, vp.width);
        expect.soft(fit.scroll, `${route}: horizontal overflow`).toBeLessThanOrEqual(fit.vw + 1);
        expect.soft(await page.locator('h1').count(), `${route}: one h1`).toBe(1);

        if (vp.touch) {
          const small = await page.evaluate(() => {
            const out: string[] = [];
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('main a[href], main button, main [role=slider], main [role=radio]'))) {
              if (el.closest('[aria-hidden="true"], .sr-only') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue;
              const r = el.getBoundingClientRect();
              if (r.width <= 2 || r.height <= 2) continue;
              const after = getComputedStyle(el, '::after');
              const stretched = after.content !== 'none' && after.content !== 'normal' && after.position === 'absolute';
              if (stretched || (r.width >= 43.5 && r.height >= 43.5)) continue;
              const cs = getComputedStyle(el);
              if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p, li, dd')) continue; // inline links in prose
              out.push(`${el.className || el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
            return out;
          });
          expect.soft(small, `${route}: touch targets under 44px`).toEqual([]);
        }

        await page.addStyleTag({ content: 'body{background:var(--abyss)!important}body::before{display:none!important}' });
        const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const severe = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
        expect.soft(severe, `${route}: serious axe violations in main`).toEqual([]);
      }
    });
  });
}

/* ───────────── Phone: the same outcomes by touch ───────────── */

test.describe('Time Machine on a phone @mobile', () => {
  test('tap a year on the scrolling strand, filter by category, save — all by touch', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.goto('/time-machine/1940s');
    const y1942 = years(page).getByRole('radio', { name: '1942, 1 story' });
    await y1942.scrollIntoViewIfNeeded();
    await y1942.tap();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(y1942).toHaveAttribute('aria-checked', 'true');
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);

    await page.getByRole('group', { name: /Categories present/ }).getByRole('button', { name: /^Culture/ }).tap();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942&interest=culture$/);
    await expect(page.getByRole('heading', { name: 'Culture stories set in 1942' })).toBeVisible();

    const save = stories(page).getByRole('button', { name: 'Save Democracy at Work in Rural Puerto Rico to My World' });
    await save.tap();
    await expect(stories(page).getByRole('button', { name: 'Remove Democracy at Work in Rural Puerto Rico from My World' })).toHaveAttribute('aria-pressed', 'true');
  });
});
