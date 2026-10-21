/**
 * Time Machine journeys — real outcomes of moving through time:
 *   · the year scrubber (role=slider) narrows the stories to those whose recorded setting
 *     includes the year, and the address (/time-machine/1940s?year=1942) survives reload, Back and
 *     direct entry (/1942); the keyboard steps through years;
 *   · a category chip filters the stories; lens + category persist in the URL (?cat= is accepted);
 *   · an empty year offers the nearest years with stories, the real stories closest in time, and
 *     still shows its context;
 *   · saving a story from the Time Machine lands it in My World;
 *   · a movement opens in context; a place opens in World and Back returns; the lineage lights a thread;
 *   · the living world answers: the arrangement follows the decade / year / lens, filters change
 *     the highlighted seeds, scrubbing previews in the world before it commits, clicking a vertebra
 *     (decadeActivate) travels, and the world's hovered seed lights its card (and back).
 * Archive data used: Newspaper Train (set 1940–41, made 1942), Democracy at Work in Rural Puerto
 * Rico (set 1941–42, made 1942), Roads to Romance (set 1950).
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ms.awakened.v1', '1');
    // the stage-store module is found among the loaded modules (dev server): keep every entry
    performance.setResourceTimingBufferSize(5000);
  });
});

const stories = (page: Page) => page.getByRole('region', { name: /stories (set|made|published) in/i });
const story = (page: Page, title: string) => stories(page).getByRole('link', { name: new RegExp(`^${title}`) }).first();
const decades = (page: Page) => page.getByRole('slider', { name: 'Decade' });
const years = (page: Page) => page.getByRole('slider', { name: 'Year' });
const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });

/* ───────────── The living world's store, read the way the page writes it (dev server) ───────────── */

interface StageView {
  arrangement: { kind: string; decade?: number; year?: number; lens?: string };
  highlight: string[] | null;
  hovered: string | null;
}

/** Run `fn` against the app's own stage-store module (the same instance the page uses). */
async function withStage<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ({ fn, arg }) => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => /\/src\/stage\/store\.ts(\?|$)/.test(n));
      const mod = await import(/* @vite-ignore */ url ?? '/src/stage/store.ts');
      return new Function('mod', 'arg', fn)(mod, arg);
    },
    { fn, arg },
  );
}
const stageNow = (page: Page) => withStage<StageView>(page, 'const s = mod.stageStore.get(); return { arrangement: s.arrangement, highlight: s.highlight, hovered: s.hovered };');
const seedIds = async (page: Page) => (await stories(page).locator('article[data-seed]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seed')))).filter((x): x is string => !!x);

test.describe('Time Machine', () => {
  test('the year scrubber narrows the stories to settings that include it; reload, Back and /1942 restore it', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    await expect(page.getByRole('heading', { name: 'Stories set in the 1940s' })).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(years(page)).toHaveAttribute('aria-valuetext', /^Whole 1940s — 2 stories/);
    await expect(decades(page)).toHaveAttribute('aria-valuetext', /^1940s — 2 stories/);

    // 1942: only the Puerto Rico film's setting (1941–42) includes it; the Blitz (1940–41) does not
    await years(page).locator('[data-stop="1942"]').click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The year 1942');
    await expect(page.getByRole('heading', { name: 'Stories set in 1942' })).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);
    await expect(years(page)).toHaveAttribute('aria-valuetext', '1942 — 1 story');
    await expect(decades(page)).toHaveAttribute('aria-valuetext', /^1940s/);

    // keyboard: one step back settles on 1941, where both settings meet
    await years(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(years(page)).toHaveAttribute('aria-valuetext', /^1941/);
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1941$/);
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();

    await page.reload();
    await expect(years(page)).toHaveAttribute('aria-valuetext', '1941 — 2 stories');
    await expect(page.getByRole('heading', { name: 'Stories set in 1941' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);

    // back to the whole decade from beside the stories
    await stories(page).getByRole('button', { name: 'Show the whole 1940s' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s$/);
    await expect(story(page, 'Newspaper Train')).toBeVisible();

    // the decade scrubber by keyboard: a step and Enter travel to the next decade (history push)
    await decades(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/time-machine\/1950s$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The 1950s');

    // a bare year is a direct address too
    await page.goto('/time-machine/1942');
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The year 1942');
  });

  test('a category chip filters the stories; lens and category persist through reload', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    const cats = page.getByRole('group', { name: 'Categories present' });
    await cats.getByRole('button', { name: /^Film/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?interest=film$/);
    await expect(page.getByRole('heading', { name: 'Film stories set in the 1940s' })).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toHaveCount(0);
    await expect(cats.getByRole('button', { name: /^Film/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Made in' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made&interest=film$/);
    await expect(page.getByRole('heading', { name: 'Film stories made in the 1940s' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Film stories made in the 1940s' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Made in' })).toHaveAttribute('aria-checked', 'true');
    await expect(cats.getByRole('button', { name: /^Film/ })).toHaveAttribute('aria-pressed', 'true');

    await cats.getByRole('button', { name: /^All/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made$/);
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();

    // ?cat= is a shorthand that settles on the canonical ?interest=
    await page.goto('/time-machine/1940s?cat=film');
    await expect(page).toHaveURL(/\/time-machine\/1940s\?interest=film$/);
    await expect(page.getByRole('heading', { name: 'Film stories set in the 1940s' })).toBeVisible();
  });

  test('an empty year offers the nearest years, the real stories closest in time, and its context', async ({ page }) => {
    await page.goto('/time-machine/1940s?year=1945');
    await expect(page.getByText('No stories set in 1945 yet')).toBeVisible();
    await expect(page.getByText(/The nearest years with stories are 1942 \(1\) and 1950 \(1\)/)).toBeVisible();
    const closest = page.getByRole('group', { name: 'Closest in time' });
    await expect(closest.getByRole('link', { name: /^Democracy at Work in Rural Puerto Rico/ })).toBeVisible();
    await expect(closest.getByText('3 years earlier')).toBeVisible();
    // the first screen still offers a story to watch: the closest one, named as such
    await expect(page.getByText('Closest in time · 3 years earlier')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Watch Democracy at Work in Rural Puerto Rico' })).toBeVisible();
    // the context of an empty year is still there
    await expect(page.getByRole('heading', { name: '1945 in context' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Movements active' }).getByRole('button').first()).toBeVisible();

    await page.getByRole('link', { name: '1950 · 1 story' }).click();
    await expect(page).toHaveURL(/\/time-machine\/1950s\?year=1950$/);
    await expect(story(page, 'Roads to Romance')).toBeVisible();
  });

  test('saving a story from the Time Machine lands it in My World', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    await stories(page).getByRole('button', { name: 'Save Newspaper Train' }).click();
    await expect(toast(page, 'Saved “Newspaper Train” to My World')).toBeVisible();
    await expect(stories(page).getByRole('button', { name: 'Remove Newspaper Train from saved' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/my-world?tab=saved');
    await expect(page.getByRole('tabpanel').getByText('Newspaper Train').first()).toBeVisible();
  });

  test('a movement opens in context; a place opens in World and Back returns; the lineage lights a thread', async ({ page }) => {
    await page.goto('/time-machine/1970s');
    const movements = page.getByRole('group', { name: 'Movements active' });
    await movements.getByRole('button', { name: /^Hip hop's origins/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1970s\?movement=hip-hop-origins$/);
    const detail = page.getByRole('article', { name: "Hip hop's origins" });
    await expect(detail).toBeVisible();
    await expect(movements.getByRole('button', { name: /^Hip hop's origins/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByRole('link', { name: 'Open connections' })).toHaveAttribute('href', '/synapse/movement/hip-hop-origins');

    // every movement across the clock, and back to the ones alive then
    await page.getByRole('button', { name: /^All \d+ movements$/ }).click();
    await expect(page.getByRole('group', { name: 'Every movement' }).getByRole('button', { name: /^Bomba/ })).toBeVisible();
    await page.getByRole('button', { name: 'Only the 1970s' }).click();
    await expect(page.getByRole('group', { name: 'Movements active' })).toBeVisible();

    const places = page.getByRole('group', { name: 'Places involved' });
    const more = places.getByRole('button', { name: /more$/ });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(places.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
    await places.getByRole('link', { name: /^The Bronx/ }).click();
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

/* ───────────── The living world answers the page (and the page answers the world) ───────────── */

test.describe('Time Machine ⇄ the living world', () => {
  test('the helix follows the decade, year and lens; filters change the highlighted seeds', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    await expect(story(page, 'Newspaper Train')).toBeVisible();
    const all = await seedIds(page);
    expect(all).toHaveLength(2);

    await expect.poll(async () => (await stageNow(page)).arrangement).toEqual({ kind: 'time', decade: 1940 });
    await expect.poll(async () => [...((await stageNow(page)).highlight ?? [])].sort()).toEqual([...all].sort());

    // a category filter is a real outcome in the world: only its seeds stay lit
    await page.getByRole('group', { name: 'Categories present' }).getByRole('button', { name: /^Film/ }).click();
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toHaveCount(0);
    const film = await seedIds(page);
    expect(film).toHaveLength(1);
    await expect.poll(async () => (await stageNow(page)).highlight).toEqual(film);

    // the lens re-sorts the helix
    await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Made in' }).click();
    await expect.poll(async () => (await stageNow(page)).arrangement).toEqual({ kind: 'time', decade: 1940, lens: 'made' });

    // a year narrows the camera and the lit seeds to that year
    await page.goto('/time-machine/1940s?year=1942');
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    const y1942 = await seedIds(page);
    expect(y1942).toHaveLength(1);
    await expect.poll(async () => (await stageNow(page)).arrangement).toEqual({ kind: 'time', decade: 1940, year: 1942 });
    await expect.poll(async () => (await stageNow(page)).highlight).toEqual(y1942);

    // an empty year lights the stories closest to it
    await page.goto('/time-machine/1940s?year=1945');
    const closest = page.getByRole('group', { name: 'Closest in time' });
    await expect(closest.getByRole('link', { name: /^Democracy at Work in Rural Puerto Rico/ })).toBeVisible();
    const near = await closest.locator('article[data-seed]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seed')));
    expect(near.length).toBeGreaterThan(0);
    await expect.poll(async () => (await stageNow(page)).highlight).toEqual(near);
  });

  test('scrubbing previews in the world before it commits; a vertebra click travels', async ({ page }) => {
    await page.goto('/time-machine/1940s?lens=made');
    await expect(decades(page)).toBeVisible();

    // press on the 1940s and drag to the 1970s: the world travels while the URL waits for the release
    const from = (await decades(page).locator('[data-stop="1940s"]').boundingBox())!;
    const to = (await decades(page).locator('[data-stop="1970s"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 12, { steps: 6 });
    await expect(decades(page)).toHaveAttribute('aria-valuetext', /^1970s/);
    await expect.poll(async () => (await stageNow(page)).arrangement).toEqual({ kind: 'time', decade: 1970, lens: 'made' });
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made$/);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/time-machine\/1970s\?lens=made$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The 1970s');

    // clicking a vertebra of the helix in the world (decadeActivate) travels there, keeping the lens
    const handled = await withStage<boolean>(page, "return mod.emitStage('decadeActivate', { decade: 1920 });");
    expect(handled).toBe(true);
    await expect(page).toHaveURL(/\/time-machine\/1920s\?lens=made$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The 1920s');
    await page.goBack();
    await expect(page).toHaveURL(/\/time-machine\/1970s\?lens=made$/);
  });

  test('a seed under the pointer in the world lights its card, and a card lights its seed', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    const card = stories(page).locator('article[data-seed]').first();
    const id = (await card.getAttribute('data-seed'))!;

    await withStage(page, 'mod.setHovered(arg);', id);
    await expect(card).toHaveAttribute('data-world-lit', 'true');
    await expect(page.locator(`.tm-lead[data-seed="${id}"]`)).toHaveAttribute('data-world-lit', 'true');
    await withStage(page, 'mod.setHovered(null);');
    await expect(card).not.toHaveAttribute('data-world-lit');

    await card.hover();
    await expect.poll(async () => (await stageNow(page)).hovered).toBe(id);
  });
});

/* ───────────── Connections (the synapse page) take the focus arrangement ───────────── */

test.describe('Connections ⇄ the living world', () => {
  test('an entity draws the stories of its web into focus and lights them; a story comes forward itself', async ({ page }) => {
    await page.goto('/synapse/place/miami');
    const cards = page.locator('#syn-stories article[data-seed]');
    await expect(cards.first()).toBeVisible();
    const ids = (await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-seed')))).filter((x): x is string => !!x);
    expect(ids.length).toBeGreaterThan(0);
    await expect.poll(async () => (await stageNow(page)).arrangement).toEqual({ kind: 'focus', related: ids });
    await expect.poll(async () => (await stageNow(page)).highlight).toEqual(ids);

    // a story row in the text alternative lights its seed; the world's seed lights the row back
    const row = page.locator('#syn-why li.syn-link[data-seed]').first();
    const rid = (await row.getAttribute('data-seed'))!;
    await row.hover();
    await expect.poll(async () => (await stageNow(page)).hovered).toBe(rid);
    await page.mouse.move(2, 2);
    await withStage(page, 'mod.setHovered(arg);', rid);
    await expect(row).toHaveAttribute('data-world-lit', 'true');
    await withStage(page, 'mod.setHovered(null);');

    // travelling to a story's connections brings its own seed forward, linked to its web
    await row.getByRole('link', { name: /^Connections for / }).click();
    await expect(page).toHaveURL(/\/synapse\/video\//);
    await expect.poll(async () => {
      const a = (await stageNow(page)).arrangement as { kind: string; video?: string };
      return `${a.kind}|${a.video}`;
    }).toBe(`focus|${rid}`);
    await expect.poll(async () => (await stageNow(page)).highlight?.[0]).toBe(rid);
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
  test('the first screen offers a story to watch; tap a year, filter by category, save — all by touch', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await page.goto('/time-machine/1940s');
    // no atmosphere-only first screen: the title, the story to start with and its Watch action are in view
    const watch = page.getByRole('link', { name: /^(Watch|Preview) / }).first();
    await expect(watch).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();

    const y1942 = years(page).locator('[data-stop="1942"]');
    await y1942.scrollIntoViewIfNeeded();
    await y1942.tap();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942$/);
    await expect(years(page)).toHaveAttribute('aria-valuetext', '1942 — 1 story');
    await expect(story(page, 'Democracy at Work in Rural Puerto Rico')).toBeVisible();
    await expect(story(page, 'Newspaper Train')).toHaveCount(0);

    await page.getByRole('group', { name: 'Categories present' }).getByRole('button', { name: /^Culture/ }).tap();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?year=1942&interest=culture$/);
    await expect(page.getByRole('heading', { name: 'Culture stories set in 1942' })).toBeVisible();

    const save = stories(page).getByRole('button', { name: 'Save Democracy at Work in Rural Puerto Rico' });
    await save.tap();
    await expect(stories(page).getByRole('button', { name: 'Remove Democracy at Work in Rural Puerto Rico from saved' })).toHaveAttribute('aria-pressed', 'true');
  });
});
