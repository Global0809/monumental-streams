/**
 * Functional end-to-end journeys through the real dev stack (Vite :5173 + API :8787):
 * playback, resume, completion, premium + membership states, saving, combined search,
 * world discovery, the time machine, connections, the two original tools, sound and
 * reduced motion. Accessible locators throughout; the DOM is read directly only to
 * observe the <video> element itself.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/* ───────────── helpers ───────────── */

const skipIntro = (target: Page | BrowserContext) => target.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));

interface MediaFacts {
  t: number;
  d: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  rate: number;
}

const media = (page: Page): Promise<MediaFacts> =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video.pl-video');
    if (!v) return { t: -1, d: 0, paused: true, ended: false, muted: false, volume: 0, rate: 0 };
    return { t: v.currentTime, d: v.duration, paused: v.paused, ended: v.ended, muted: v.muted, volume: v.volume, rate: v.playbackRate };
  });

/** Wait until the element is really playing: unpaused and its clock moving past `after`. */
async function expectPlaying(page: Page, after = 0.2) {
  await expect.poll(async () => (await media(page)).paused, { timeout: 15_000 }).toBe(false);
  const start = Math.max(after, (await media(page)).t);
  await expect.poll(async () => (await media(page)).t, { timeout: 15_000 }).toBeGreaterThan(start + 0.25);
}

const player = (page: Page) => page.getByRole('region', { name: /^Video player:/ });

/** The control bar fades while playing; a mouse move over the chamber brings it back. */
async function wakeChrome(page: Page) {
  const box = await player(page).boundingBox();
  if (!box) throw new Error('player not on screen');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.32);
}

/** Press a key with focus on the player region itself (not a control inside it). */
async function playerKey(page: Page, key: string) {
  await player(page).focus();
  await page.keyboard.press(key);
}

const toast = (page: Page, text: string | RegExp) => page.locator('.toaster').getByRole('status').filter({ hasText: text });

const parseClock = (s: string) =>
  s
    .trim()
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);

const unique = () => `reviewer+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

async function register(page: Page) {
  await page.goto('/account?mode=register&next=/membership');
  await page.getByLabel('Name', { exact: true }).fill('QA Reviewer');
  await page.getByLabel('Email', { exact: true }).fill(unique());
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/membership$/);
  await expect(page.getByRole('link', { name: /^Profile: QA Reviewer/ })).toBeVisible();
}

async function setDevMembership(page: Page, label: RegExp) {
  if (!/\/membership/.test(page.url())) await page.goto('/membership');
  const group = page.getByRole('group', { name: 'Set your membership state' });
  await group.getByRole('button', { name: label }).click();
  await expect(toast(page, /Development preview: membership state set/)).toBeVisible();
  await expect(group.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
}

const guestLibrary = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ms.library.guest.v1') ?? 'null') as { progress: Record<string, { pos: number; done: boolean }> } | null);

test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/* ───────────── 1. Playback ───────────── */

test.describe('playback', () => {
  test('play, pause, seek, time, volume, speed, captions, quality, full screen and shortcuts', async ({ page }) => {
    const masterP = page.waitForResponse((r) => /\/stream\/reel-living-atlas\/master\.m3u8/.test(r.url()));
    await page.goto('/watch/reel-living-atlas');

    await test.step('start playback from the poster', async () => {
      await page.getByRole('button', { name: 'Play: The Living Atlas' }).click();
      await expectPlaying(page);
    });

    await test.step('pause from the control bar', async () => {
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Pause The Living Atlas' }).click();
      await expect.poll(async () => (await media(page)).paused).toBe(true);
      await expect(page.getByRole('button', { name: 'Play The Living Atlas' })).toBeVisible();
    });

    const seek = page.getByRole('slider', { name: 'Seek' });
    await test.step('elapsed / duration display', async () => {
      await expect(seek).toHaveAttribute('aria-valuemax', '38');
      await expect(seek).toHaveAttribute('aria-valuetext', /^0:0\d of 0:37/);
      await expect(page.locator('.pl-time')).toContainText('0:37');
    });

    await test.step('keyboard seek on the scrubber (ArrowRight = +5 s)', async () => {
      const before = (await media(page)).t;
      await seek.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await media(page)).t).toBeCloseTo(before + 5, 0);
      await expect(seek).toHaveAttribute('aria-valuenow', String(Math.round(before + 5)));
    });

    await test.step('pointer click on the scrubber seeks there', async () => {
      const box = (await seek.boundingBox())!;
      await seek.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
      const d = (await media(page)).d;
      await expect.poll(async () => Math.abs((await media(page)).t - d / 2)).toBeLessThan(1.5);
      await expect(page.locator('.pl-time')).toContainText(/0:1[89]/);
    });

    await test.step('mute and volume', async () => {
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Mute', exact: true }).click();
      await expect.poll(async () => (await media(page)).muted).toBe(true);
      await expect(page.getByRole('button', { name: 'Unmute', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Unmute', exact: true }).click();
      await expect.poll(async () => (await media(page)).muted).toBe(false);
      const volume = page.getByRole('slider', { name: 'Volume' });
      await volume.focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await media(page)).volume).toBeCloseTo(0.9, 2);
      await expect(volume).toHaveAttribute('aria-valuetext', '90%');
    });

    await test.step('speed change applies playbackRate', async () => {
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const menu = page.getByRole('menu', { name: 'Settings' });
      await expect(menu).toBeVisible();
      await menu.getByRole('menuitemradio', { name: '1.5×' }).click();
      await expect.poll(async () => (await media(page)).rate).toBe(1.5);
      await expect(menu).toBeHidden();
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toContainText('1.5×');
    });

    await test.step('quality menu lists exactly the stream’s renditions', async () => {
      const master = await (await masterP).text();
      const heights = [...master.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1])).sort((a, b) => b - a);
      expect(heights.length).toBeGreaterThan(1);
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const quality = page.getByRole('menu', { name: 'Settings' }).getByRole('group', { name: 'Quality' });
      const items = quality.getByRole('menuitemradio');
      await expect(items.first()).toContainText('Auto');
      const labels = (await items.allInnerTexts()).slice(1).map((t) => t.trim());
      expect(labels).toEqual(heights.map((h) => `${h}p`));
      // choosing one is honoured
      await quality.getByRole('menuitemradio', { name: `${heights[heights.length - 1]}p` }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('menu', { name: 'Settings' }).getByRole('menuitemradio', { name: `${heights[heights.length - 1]}p` })).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: 'Settings' })).toBeHidden();
    });

    await test.step('captions on show cue text; off hides it', async () => {
      await playerKey(page, 'Home');
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Captions', exact: true }).click();
      await page.getByRole('menu', { name: 'Captions' }).getByRole('menuitemradio', { name: /English/ }).click();
      await expect(page.getByRole('button', { name: 'Captions', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const cue = page.locator('.pl-captions .pl-cue');
      await expect(cue).toBeVisible();
      await expect(cue).toContainText(/Explore what you love|globe/i);
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Captions', exact: true }).click();
      await page.getByRole('menu', { name: 'Captions' }).getByRole('menuitemradio', { name: 'Off' }).click();
      await expect(cue).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Captions', exact: true })).toHaveAttribute('aria-pressed', 'false');
    });

    await test.step('full screen enters and exits', async () => {
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Full screen', exact: true }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await wakeChrome(page);
      await page.getByRole('button', { name: 'Exit full screen' }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    });

    await test.step('keyboard shortcuts with focus on the player: k / space, j / l, m', async () => {
      const wasPaused = (await media(page)).paused;
      await playerKey(page, 'k');
      await expect.poll(async () => (await media(page)).paused).toBe(!wasPaused);
      await page.keyboard.press(' ');
      await expect.poll(async () => (await media(page)).paused).toBe(wasPaused);
      // make sure we end up paused, at a known point, for exact J / L arithmetic
      if (!(await media(page)).paused) await page.keyboard.press('k');
      await expect.poll(async () => (await media(page)).paused).toBe(true);
      await page.keyboard.press('5'); // 50 %
      const mid = (await media(page)).t;
      expect(mid).toBeGreaterThan(15);
      await page.keyboard.press('j');
      await expect.poll(async () => (await media(page)).t).toBeCloseTo(mid - 10, 0);
      await page.keyboard.press('l');
      await expect.poll(async () => (await media(page)).t).toBeCloseTo(mid, 0);
      const muted = (await media(page)).muted;
      await page.keyboard.press('m');
      await expect.poll(async () => (await media(page)).muted).toBe(!muted);
      await expect(page.getByRole('status').filter({ hasText: /^(Muted|Sound on)$/ })).toBeVisible();
    });
  });

  test('a press on Play while the stream engine is still loading is honoured, not dropped', async ({ page }) => {
    // hls.js is loaded on demand after the grant arrives; hold it back so the poster is pressed first
    await page.route(/\/node_modules\/\.vite\/deps\/hls[^/]*\.js/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/watch/reel-stories-in-time');
    await page.getByRole('button', { name: 'Play: Stories in Time' }).click();
    await expectPlaying(page);
  });
});

/* ───────────── 2. Saved progress + resume ───────────── */

test.describe('saved progress', () => {
  test('progress is saved, offered as resume after reload, listed in Continue watching and removable', async ({ page }) => {
    await page.goto('/watch/newspaper-train-1942');
    await page.getByRole('button', { name: 'Play: Newspaper Train' }).click();
    await expectPlaying(page);
    await playerKey(page, 'l');
    await page.keyboard.press('l');
    await page.keyboard.press('k');
    await expect.poll(async () => (await media(page)).paused).toBe(true);
    const saved = (await media(page)).t;
    expect(saved).toBeGreaterThan(19);
    expect(saved).toBeLessThan(30);
    await expect.poll(async () => (await guestLibrary(page))?.progress['video:newspaper-train-1942']?.pos ?? 0).toBeGreaterThan(19);

    await page.reload();
    const resume = page.getByRole('button', { name: /^Resume from 0:2\d: Newspaper Train$/ });
    await expect(resume).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
    await resume.click();
    await expectPlaying(page, saved - 1);
    expect(Math.abs((await media(page)).t - saved)).toBeLessThan(4);
    await playerKey(page, 'k');

    await page.goto('/');
    const home = page.getByRole('region', { name: 'Continue watching' });
    await expect(home).toBeVisible();
    await expect(home.getByRole('link', { name: /Newspaper Train/ }).first()).toBeVisible();

    await page.goto('/my-world');
    await expect(page.getByRole('tab', { name: /Continue/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: /^Resume Newspaper Train at 0:2\d$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Newspaper Train from Continue watching' }).click();
    await expect(toast(page, 'Removed “Newspaper Train” from Continue watching')).toBeVisible();
    await expect(page.getByText('Nothing in progress')).toBeVisible();
    await page.waitForTimeout(400); // local adapter debounce
    await page.reload();
    await expect(page.getByText('Nothing in progress')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Continue watching' })).toHaveCount(0);
  });
});

/* ───────────── 3. Completion ───────────── */

test.describe('completion', () => {
  test('a reel played to the end shows the end card and is marked done', async ({ page }) => {
    await page.goto('/watch/reel-stories-in-time');
    await page.getByRole('button', { name: 'Play: Stories in Time' }).click();
    await expectPlaying(page);
    await playerKey(page, '9'); // 90 % — let the last seconds play out
    const end = page.getByRole('group', { name: 'Finished' });
    await expect(end).toBeVisible({ timeout: 20_000 });
    await expect(end.getByText('You reached the end')).toBeVisible();
    await expect(end.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect.poll(async () => (await guestLibrary(page))?.progress['video:reel-stories-in-time']?.done).toBe(true);

    await end.getByRole('button', { name: 'Replay' }).click();
    await expect(end).toBeHidden();
    await expectPlaying(page);
    expect((await media(page)).t).toBeLessThan(5);
    await playerKey(page, 'k');

    await page.goto('/my-world?tab=continue');
    await expect(page.getByText('Nothing in progress')).toBeVisible();
    await expect(page.getByRole('link', { name: /Resume Stories in Time/ })).toHaveCount(0);
  });
});

/* ───────────── 4. Premium + membership states ───────────── */

test.describe('premium + membership', () => {
  test('guest gate → account → dev preview plays → cancelled still plays → expired gates → honest checkout → sign out', async ({ page }) => {
    await page.goto('/watch/reel-interface-specimens');
    const gate = page.getByRole('group', { name: 'Premium' });
    await expect(gate).toBeVisible();
    await expect(gate.getByText('This story is part of Premium.')).toBeVisible();
    await expect(gate.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play: / })).toHaveCount(0);

    await register(page);
    await expect(page.getByRole('heading', { name: 'Free account' })).toBeVisible();

    await test.step('dev preview unlocks premium playback', async () => {
      await setDevMembership(page, /^Dev preview/);
      await expect(page.getByRole('heading', { name: 'Development preview', level: 2 }).first()).toBeVisible();
      await page.goto('/watch/reel-interface-specimens');
      await page.getByRole('button', { name: 'Play: Interface Specimens' }).click();
      await expectPlaying(page);
      await playerKey(page, 'k');
    });

    await test.step('cancelled keeps premium until the period ends', async () => {
      await setDevMembership(page, /^Cancelled/);
      await expect(page.getByRole('heading', { name: 'Cancelled — Premium until it ends' })).toBeVisible();
      await expect(page.getByText(/Premium stays unlocked until .*\d{4}\./)).toBeVisible();
      await page.goto('/watch/reel-interface-specimens');
      await page.getByRole('button', { name: 'Play: Interface Specimens' }).click();
      await expectPlaying(page);
      await playerKey(page, 'k');
    });

    await test.step('expired brings the gate back', async () => {
      await setDevMembership(page, /^Expired/);
      await expect(page.getByRole('heading', { name: 'Your membership has ended' })).toBeVisible();
      await page.goto('/watch/reel-interface-specimens');
      await expect(page.getByRole('group', { name: 'Premium' })).toBeVisible();
      await expect(page.getByText('This account doesn’t have Premium right now.')).toBeVisible();
      await expect(page.getByRole('button', { name: /^Play: / })).toHaveCount(0);
    });

    await test.step('checkout is honest: setup pending, no fake success', async () => {
      await page.goto('/membership');
      await expect(page.getByRole('note', { name: 'Payments are not connected' })).toBeVisible();
      await expect(page.getByText('Checkout unavailable · payments not connected').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Join / })).toHaveCount(0);
      const csrf = (await page.context().cookies()).find((c) => c.name === 'ms_csrf')?.value ?? '';
      const res = await page.request.post('/api/billing/checkout', { data: { plan: 'monthly' }, headers: { 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' } });
      expect(res.status()).toBe(503);
      expect((await res.json()).code).toBe('billing_setup_pending');
      // a forged "success" return never claims Premium
      await page.goto('/membership?checkout=success');
      await expect(page.getByText(/Confirming with Stripe|Not confirmed yet/).first()).toBeVisible();
      await expect(page.getByText('Premium is active.')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Your membership has ended' })).toBeVisible();
    });

    await test.step('sign out returns to guest', async () => {
      await page.goto('/account');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(toast(page, /^Signed out/)).toBeVisible();
      await expect(page.getByRole('link', { name: /^Profile: Guest/ })).toBeVisible();
      await page.goto('/watch/reel-interface-specimens');
      await expect(page.getByRole('group', { name: 'Premium' }).getByRole('link', { name: 'Sign in' })).toBeVisible();
    });
  });
});

/* ───────────── 5. Saved content ───────────── */

test.describe('saved content', () => {
  test('save from a pod (with Undo), list in Your World, remove, survive reload; save a place from the atlas', async ({ page }) => {
    await page.goto('/catalogue?q=coney');
    const save = page.getByRole('button', { name: 'Save Coney Island at Night' });
    await save.click();
    const saved = page.getByRole('button', { name: 'Remove Coney Island at Night from saved' });
    await expect(saved).toHaveAttribute('aria-pressed', 'true');
    const t = toast(page, 'Saved “Coney Island at Night” to My World');
    await expect(t).toBeVisible();
    await t.getByRole('button', { name: 'Undo' }).click();
    await expect(save).toHaveAttribute('aria-pressed', 'false');
    await save.click();
    await expect(saved).toBeVisible();

    await page.goto('/my-world?tab=saved');
    const remove = page.getByRole('button', { name: 'Remove Coney Island at Night from saved' }).filter({ hasText: 'Remove' });
    await expect(remove).toBeVisible();
    await page.reload();
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(toast(page, 'Removed “Coney Island at Night” from saved')).toBeVisible();
    await expect(page.getByText('No saved stories yet')).toBeVisible();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByText('No saved stories yet')).toBeVisible();

    await page.goto('/world/miami?view=list');
    await page.getByRole('button', { name: 'Save place' }).click();
    await expect(toast(page, 'Saved Miami to My World')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved place' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/my-world?tab=places');
    await expect(page.getByRole('link', { name: 'Open Miami in World' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Open Miami in World' })).toBeVisible();
  });
});

/* ───────────── 6. Search + combined filters ───────────── */

test.describe('catalogue', () => {
  test('query + interest + period + access combine in the URL, survive reload, step back, clear and relax', async ({ page }) => {
    await page.goto('/catalogue');
    const search = page.getByRole('search', { name: 'Catalogue' }).getByRole('searchbox');
    const results = page.getByRole('region', { name: /^(All stories|Results)$/ });
    const pod = (title: string) => results.getByRole('link', { name: new RegExp(`^${title}`) }).first();
    const interests = page.getByRole('group', { name: /^Interests/ });
    const setIn = page.getByRole('group', { name: /^Set in/ });
    const access = page.getByRole('radiogroup', { name: 'Access' });

    await search.fill('train');
    await expect(page).toHaveURL(/\/catalogue\?q=train$/);
    await interests.getByRole('button', { name: /^Documentary/ }).click();
    await expect(page).toHaveURL(/\?q=train&interest=documentary$/);
    await setIn.getByRole('button', { name: /^1940s/ }).click();
    await expect(page).toHaveURL(/\?q=train&interest=documentary&period=1940s$/);
    await access.getByRole('radio', { name: /^Free/ }).click();
    await expect(page).toHaveURL(/\?q=train&interest=documentary&period=1940s&access=free$/);

    const check = async () => {
      await expect(search).toHaveValue('train');
      await expect(interests.getByRole('button', { name: /^Documentary/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(setIn.getByRole('button', { name: /^1940s/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(access.getByRole('radio', { name: /^Free/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.srch-count')).toHaveText(/^1 story$/);
      await expect(pod('Newspaper Train')).toBeVisible();
    };
    await check();
    await page.reload();
    await check();

    await page.goBack();
    await expect(page).toHaveURL(/\?q=train&interest=documentary&period=1940s$/);
    await expect(access.getByRole('radio', { name: /^All/ })).toHaveAttribute('aria-checked', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\?q=train&interest=documentary$/);
    await expect(setIn.getByRole('button', { name: /^1940s/ })).toHaveAttribute('aria-pressed', 'false');
    await page.goForward();
    await page.goForward();
    await check();

    // impossible: nothing premium in this combination → relaxations that work
    await access.getByRole('radio', { name: /^Premium/ }).click();
    await expect(page).toHaveURL(/access=premium/);
    await expect(page.getByText('Nothing matches all of that')).toBeVisible();
    const relax = page.getByRole('button', { name: /^Include free titles → 1 story$/ });
    await expect(relax).toBeVisible();
    await relax.click();
    await expect(page).not.toHaveURL(/access=/);
    await expect(pod('Newspaper Train')).toBeVisible();

    await page.getByRole('group', { name: 'Active filters' }).getByRole('button', { name: 'Clear all' }).click();
    await expect(page).toHaveURL(/\/catalogue$/);
    await expect(search).toHaveValue('');
    await expect(interests.getByRole('button', { name: /^Documentary/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: 'All stories' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(0);
  });
});

/* ───────────── 7. World discovery ───────────── */

test.describe('atlas', () => {
  test('list view by keyboard → Miami panel → up close → neighbourhood → route → back → refresh → map view', async ({ page }) => {
    await page.goto('/world?view=list');
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Find a place').fill('miami');
    const miami = page.getByRole('list', { name: 'Places by region' }).getByRole('link', { name: /^Miami\s*,\s*City\s*,/ });
    await miami.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/world\/miami\?view=list$/);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText('Miami');
    await expect(page.locator('.atlas-place .atlas-kicker').first()).toContainText('City');
    const crumbs = page.getByRole('navigation', { name: 'Where this is' });
    await expect(crumbs.getByRole('link', { name: 'World' })).toBeVisible();
    await expect(crumbs.getByRole('link', { name: 'Florida' })).toBeVisible();
    await expect(crumbs.getByRole('link', { name: 'Miami-Dade County' })).toBeVisible();
    const stories = page.getByRole('region', { name: /^Stories here/ });
    await expect(stories.getByRole('listitem').first()).toBeVisible();

    await page.getByRole('button', { name: 'Miami, up close', exact: true }).click();
    const upClose = page.locator('#atlas-miami');
    await expect(upClose).toBeInViewport();
    await upClose.getByRole('link', { name: /^Little Havana, Neighbourhood in Miami/ }).click();
    await expect(page).toHaveURL(/\/world\/little-havana\?view=list$/);
    await expect(h1).toHaveText('Little Havana');

    await page.getByRole('link', { name: 'Follow the route Havana' }).first().click();
    await expect(page).toHaveURL(/\/world\/havana\?route=havana-little-havana&view=list$/);
    await expect(h1).toHaveText('Havana');
    await expect(page.getByRole('region', { name: /^Following Cuban exile/ })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/world\/little-havana\?view=list$/);
    await expect(h1).toHaveText('Little Havana');
    await page.reload();
    await expect(h1).toHaveText('Little Havana');
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');

    await page.goto('/world?view=map');
    const stage = page.getByRole('region', { name: 'Flat map of the world' });
    await expect(stage).toBeVisible();
    await expect(stage.locator('svg').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Map' })).toHaveAttribute('aria-checked', 'true');
  });
});

/* ───────────── 8. Time machine ───────────── */

test.describe('time machine', () => {
  test('decade results, lenses, dial by keyboard, empty decade and unsupported era', async ({ page }) => {
    await page.goto('/time-machine/1940s');
    const stories = page.getByRole('region', { name: /^Stories (set|made|published) in/ });
    const pod = (title: string) => stories.getByRole('link', { name: new RegExp(`^${title}`) }).first();
    await expect(page.getByRole('heading', { name: 'Stories set in the 1940s' })).toBeVisible();
    await expect(pod('Newspaper Train')).toBeVisible();
    await expect(pod('Democracy at Work in Rural Puerto Rico')).toBeVisible();

    const lens = page.getByRole('radiogroup', { name: 'Lens' });
    await lens.getByRole('radio', { name: /^Published/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=published$/);
    await expect(page.getByText('No stories published in the 1940s yet')).toBeVisible();
    await expect(pod('Newspaper Train')).toHaveCount(0);

    await lens.getByRole('radio', { name: /^Made in/ }).click();
    await expect(page).toHaveURL(/\/time-machine\/1940s\?lens=made$/);
    await expect(page.getByRole('heading', { name: 'Stories made in the 1940s' })).toBeVisible();
    await expect(pod('Newspaper Train')).toBeVisible();

    const dial = page.getByRole('slider', { name: 'Decade', exact: true });
    await dial.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/time-machine\/1950s\?lens=made$/);
    await expect(page.getByRole('heading', { name: 'Stories made in the 1950s' })).toBeVisible();
    await expect(pod('Roads to Romance')).toBeVisible();
    await expect(pod('Newspaper Train')).toHaveCount(0);
    await expect(dial).toHaveAttribute('aria-valuetext', /1950s/);
    await expect(dial).toBeFocused();

    await page.goto('/time-machine/2010s');
    await expect(page.getByText('No stories set in the 2010s yet')).toBeVisible();
    await expect(page.getByText(/The nearest decade.* with stories/)).toBeVisible();
    const nearest = page.getByRole('link', { name: /^1960s · \d+ stor(y|ies)$/ });
    await nearest.click();
    await expect(page).toHaveURL(/\/time-machine\/1960s$/);
    await expect(pod('Apollo 11')).toBeVisible();

    await page.goto('/time-machine/1850s');
    await expect(page.getByRole('heading', { name: /This era isn’t in the archive/ })).toBeVisible();
    await expect(page.getByText(/The archive covers the 1900s to the 2020s/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the 1900s' })).toHaveAttribute('href', /\/time-machine\/1900s$/);
  });
});

/* ───────────── 9. Connections + original tools ───────────── */

test.describe('connections + original tools', () => {
  test('synapse lists explained connections; a node opens and Back returns', async ({ page }) => {
    await page.goto('/synapse/place/miami');
    const why = page.locator('#syn-why');
    await expect(why).toContainText(/\d+ connections? across \d+ kinds?/);
    await expect(why.getByRole('list', { name: 'Why this is here' }).first()).toBeVisible();
    await expect(why.getByRole('list', { name: 'Why this is here' }).first().getByRole('listitem').first()).not.toBeEmpty();
    const node = why.getByRole('link', { name: /^Connections for / }).first();
    const label = ((await node.getAttribute('aria-label')) ?? '').replace(/^Connections for /, '');
    await node.click();
    await expect(page).not.toHaveURL(/\/synapse\/place\/miami$/);
    await expect(page).toHaveURL(/\/synapse\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(label.slice(0, 12));
    await page.goBack();
    await expect(page).toHaveURL(/\/synapse\/place\/miami$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Miami');
  });

  test('Take Me Somewhere: knobs by keyboard, GO, plan fits the budget, start and save the journey', async ({ page }) => {
    await page.goto('/somewhere');
    const time = page.getByRole('slider', { name: 'Time' });
    const before = await time.getAttribute('aria-valuetext');
    await time.focus();
    await page.keyboard.press('ArrowRight');
    await expect(time).not.toHaveAttribute('aria-valuetext', before ?? '');
    const interest = page.getByRole('slider', { name: 'Interest' });
    await interest.focus();
    await page.keyboard.press('ArrowRight');
    await expect(interest).not.toHaveAttribute('aria-valuetext', /any/i);

    await page.getByRole('button', { name: /^GO/ }).click();
    await expect(page).toHaveURL(/\/somewhere\?.*minutes=\d+.*seed=\d+/);
    const itinerary = page.getByRole('region', { name: /./ }).filter({ has: page.locator('#tms-itinerary-title') });
    await expect(itinerary.locator('.tms-meter-total')).toBeVisible();
    const total = parseClock(await itinerary.locator('.tms-meter-total').innerText());
    const budget = parseClock((await itinerary.locator('.tms-meter-label .mono').first().innerText()).replace(/^\s*of\s*/, ''));
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(budget);
    const title = (await page.locator('#tms-itinerary-title').innerText()).trim();

    await page.getByRole('button', { name: 'Save journey' }).click();
    await expect(toast(page, `Saved “${title}” to My World`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved journey' })).toHaveAttribute('aria-pressed', 'true');

    const start = page.getByRole('link', { name: 'Start journey' });
    await expect(start).toHaveAttribute('href', /^\/watch\/[a-z0-9-]+\?queue=/);
    await start.click();
    await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+\?queue=/);
    await expect(player(page)).toBeVisible();

    await page.goto('/my-world?tab=journeys');
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('Culture Passport: build with the combobox, save, share URL restores it, and watching ≥60% earns a stamp', async ({ page, context }) => {
    await page.goto('/passport?stops=');
    const combo = page.getByRole('combobox', { name: 'Add a stop' });
    const order = page.getByRole('list', { name: 'Stops in order' });
    await combo.fill('London');
    await expect(page.getByRole('listbox', { name: 'Places' }).getByRole('option').first()).toContainText('London');
    await combo.press('Enter');
    await expect(order.getByRole('listitem')).toHaveCount(1);
    await expect(order).toContainText('London');
    await combo.fill('Puerto Rico');
    await expect(page.getByRole('listbox', { name: 'Places' }).getByRole('option').first()).toContainText('Puerto Rico');
    await combo.press('ArrowDown');
    await combo.press('ArrowUp');
    await combo.press('Enter');
    await expect(order.getByRole('listitem')).toHaveCount(2);
    await page.getByLabel('Journey title').fill('QA passport trail');
    await expect(page).toHaveURL(/stops=london,puerto-rico/);
    await expect(page).toHaveURL(/title=QA(\+|%20)passport(\+|%20)trail/);

    const actions = page.locator('.pp-build-actions');
    await actions.getByRole('button', { name: 'Save journey' }).click();
    await expect(toast(page, 'Saved “QA passport trail” to My World')).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
    const shareUrl = page.url();

    const other = await context.newPage();
    await other.goto(shareUrl);
    await expect(other.getByRole('heading', { name: 'QA passport trail', level: 2 })).toBeVisible();
    await expect(other.getByRole('list', { name: 'Stops in order' }).getByRole('listitem')).toHaveCount(2);
    await expect(other.getByRole('list', { name: 'Stops in order' }).getByRole('listitem').first()).toContainText('London');
    await other.close();

    await page.goto('/my-world?tab=journeys');
    await expect(page.getByText('QA passport trail').first()).toBeVisible();

    // Newspaper Train is set in London: 65 % watched → London stamped
    await page.goto('/watch/newspaper-train-1942');
    await page.getByRole('button', { name: 'Play: Newspaper Train' }).click();
    await expectPlaying(page);
    const seek = page.getByRole('slider', { name: 'Seek' });
    await wakeChrome(page);
    const box = (await seek.boundingBox())!;
    await seek.click({ position: { x: box.width * 0.65, y: box.height / 2 } });
    await expect(toast(page, 'Passport stamp earned: London')).toBeVisible({ timeout: 20_000 });
    await playerKey(page, 'k');

    await page.goto(shareUrl);
    await expect(page.locator('.pp-progress')).toContainText(/1\s*of 2 stamps/);
    await expect(page.locator('.pp-stamps')).toContainText(/Stamped/);
  });
});

/* ───────────── 10. Sound ───────────── */

test.describe('sound', () => {
  test('starts off; toggle sets aria-pressed; playback sets watching + ducks; pause returns to roaming', async ({ page }) => {
    await page.goto('/watch/reel-living-atlas');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-state', 'roaming');
    const off = page.getByRole('button', { name: 'Turn website sound on' });
    await expect(off).toHaveAttribute('aria-pressed', 'false');
    await off.click();
    await expect(page.getByRole('button', { name: 'Turn website sound off' })).toHaveAttribute('aria-pressed', 'true');

    const ducked = () => page.evaluate(async () => (await import('/src/systems/sound/engine.ts' as string)).soundStore.get().ducked as boolean);
    expect(await ducked()).toBe(false);
    await page.getByRole('button', { name: 'Play: The Living Atlas' }).click();
    await expectPlaying(page);
    await expect(html).toHaveAttribute('data-state', 'watching');
    expect(await ducked()).toBe(true);
    await playerKey(page, 'k');
    await expect(html).toHaveAttribute('data-state', 'roaming');
    expect(await ducked()).toBe(false);
  });
});

/* ───────────── 11. Reduced motion ───────────── */

test.describe('reduced motion', () => {
  test('the awakening is static and the end card has no countdown', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/');
    const intro = page.getByRole('dialog', { name: /monumental/i });
    await expect(intro).toBeVisible();
    // straight to the final frame: no pulse → reveal sequence, no looping membrane video
    await expect(page.locator('.awakening')).toHaveAttribute('data-stage', 'ready');
    await expect(page.locator('.awakening video')).toHaveCount(0);
    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect as KeyframeEffect | null)?.target instanceof Element && document.querySelector('.awakening')?.contains((a.effect as KeyframeEffect).target as Element)).length,
    );
    expect(running).toBe(0);
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(intro).toBeHidden();

    await page.goto('/watch/reel-living-atlas');
    await page.getByRole('button', { name: 'Play: The Living Atlas' }).click();
    await expectPlaying(page);
    await playerKey(page, '9');
    const end = page.getByRole('group', { name: 'Finished' });
    await expect(end).toBeVisible({ timeout: 20_000 });
    await expect(end.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect(end.getByText(/Up next in \d/)).toHaveCount(0);
    await expect(end.getByRole('button', { name: 'Cancel autoplay' })).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/watch\/reel-living-atlas$/);
    await ctx.close();
  });
});

/* ───────────── 12. The world answers: story, programme, search ───────────── */

/**
 * The living world's state, read from the very stage store the app uses (dev builds): the
 * engine's QA handle when the 3D stage runs, otherwise the module at the URL the app loaded it
 * from (a hot-updated module carries a ?t= stamp, and a bare import would be a second copy).
 */
const stageCall = (page: Page, hover?: string | null) =>
  page.evaluate(
    async ({ set, hovered }) => {
      type Facts = { arrangement: { kind: string; video?: string; programme?: string; related?: string[] }; highlight: string[] | null; hovered: string | null };
      type Store = { get(): Facts; set(fn: (s: Facts) => Facts): void };
      const handle = (window as unknown as { __stage?: { store?: Store } }).__stage?.store;
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/stage\/store\.ts(\?|$)/.test(n)) ?? '/src/stage/store.ts';
      const store: Store = handle ?? (await import(url)).stageStore;
      if (set) store.set((s) => (s.hovered === hovered ? s : { ...s, hovered }));
      const s = store.get();
      return { arrangement: s.arrangement, highlight: s.highlight, hovered: s.hovered };
    },
    { set: hover !== undefined, hovered: hover ?? null },
  );
const stage = (page: Page) => stageCall(page);
/** A seed under the pointer in the world (what the engine writes when the pointer meets a seed). */
const worldHover = (page: Page, id: string | null) => stageCall(page, id);

test.describe('the world answers', () => {
  test('a story holds the world in focus: its ring is Up next + related, cards and seeds light each other, playing dims the world and the frame takes the stage', async ({ page }) => {
    await page.goto('/watch/kingston-1920');
    await expect(page.getByRole('heading', { level: 1, name: 'Kingston Jamaica' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Viewer context' })).toContainText('Context before you watch');
    await expect.poll(async () => (await stage(page)).arrangement.kind).toBe('focus');
    const focus = (await stage(page)).arrangement;
    expect(focus.video).toBe('video:kingston-1920');

    // the ring is exactly the stories offered below: Up next first, then the related seed cards
    const nextCard = page.getByRole('complementary', { name: 'Up next' }).getByRole('link').first();
    const nextId = `video:${((await nextCard.getAttribute('href')) ?? '').replace(/^\/watch\//, '').replace(/\?.*$/, '')}`;
    const pods = page.locator('#watch-related .pod');
    const podIds = await pods.evaluateAll((els) => els.map((e) => e.getAttribute('data-seed') ?? ''));
    expect(podIds.length).toBeGreaterThan(0);
    expect(focus.related).toEqual([nextId, ...podIds]);

    // card → seed: hovering Up next lights its seed (and filament); leaving lets go
    await nextCard.hover();
    await expect.poll(async () => (await stage(page)).hovered).toBe(nextId);
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await stage(page)).hovered).toBe(null);
    // seed → card: a seed under the pointer in the world lights its card
    await worldHover(page, podIds[0]);
    await expect(pods.first()).toHaveAttribute('data-world-lit');
    await worldHover(page, nextId);
    await expect(nextCard).toHaveAttribute('data-world-lit');
    await worldHover(page, null);
    await expect(nextCard).not.toHaveAttribute('data-world-lit');

    // save → the story is kept (and its seed flies into My World)
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(toast(page, 'Saved “Kingston Jamaica” to My World')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // play → the world turns to `watch` (dims, stops) and the frame takes the stage
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Play: Kingston Jamaica' }).click();
    await expectPlaying(page);
    await expect.poll(async () => (await stage(page)).arrangement.kind).toBe('watch');
    await expect(page.locator('.story')).toHaveAttribute('data-mode', 'theatre');
    // pause → the focus comes back; the frame keeps the stage
    await playerKey(page, 'k');
    await expect.poll(async () => (await stage(page)).arrangement).toEqual(focus);
    await expect(page.locator('.story')).toHaveAttribute('data-mode', 'theatre');
  });

  test('a programme holds its episodes in focus and lights them; rows and seeds light each other; status stays honest', async ({ page }) => {
    const payload = (await (await page.request.get('/api/catalogue')).json()) as { content: { videos: { id: string; programme?: string }[] } };
    const episodes = payload.content.videos.filter((v) => v.programme === 'programme:open-archive').map((v) => v.id);
    expect(episodes.length).toBeGreaterThan(2);

    await page.goto('/programme/open-archive');
    await expect(page.getByRole('heading', { level: 1, name: 'Open Archive' })).toBeVisible();
    await expect(page.getByRole('note', { name: 'What exists today' })).toContainText(/Available/);
    await expect.poll(async () => (await stage(page)).arrangement.programme).toBe('programme:open-archive');
    const s = await stage(page);
    expect(s.arrangement.kind).toBe('focus');
    expect([...(s.highlight ?? [])].sort()).toEqual([...episodes].sort());
    // the one gold action plays the seed in front
    await expect(page.getByRole('link', { name: 'Play from the start' })).toHaveAttribute('href', `/watch/${(s.arrangement.video ?? '').replace(/^video:/, '')}`);

    const rows = page.locator('#prog-episodes .prog-ep');
    const idOf = async (i: number) => `video:${((await rows.nth(i).locator('.prog-ep-title a').getAttribute('href')) ?? '').replace(/^\/watch\//, '')}`;
    const third = await idOf(2);
    await rows.nth(2).hover();
    await expect.poll(async () => (await stage(page)).hovered).toBe(third);
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await stage(page)).hovered).toBe(null);
    const fourth = await idOf(3);
    await worldHover(page, fourth);
    await expect(rows.nth(3)).toHaveAttribute('data-world-lit');
    await worldHover(page, null);

    // nothing published yet: said plainly, nothing lit, no play action
    await page.goto('/programme/better-late-than-never');
    await expect(page.getByRole('note', { name: 'What exists today' })).toContainText('Announced');
    await expect(page.locator('#prog-episodes').getByText('Nothing to play yet')).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Play|Watch)/ })).toHaveCount(0);
    await expect.poll(async () => (await stage(page)).arrangement.programme).toBe('programme:better-late-than-never');
    expect((await stage(page)).highlight).toBeNull();
  });

  test('search lights the stories that match in the world, nothing when nothing matches; cards and collections answer', async ({ page }) => {
    await page.goto('/search');
    await expect.poll(async () => (await stage(page)).arrangement.kind).toBe('quiet');
    expect((await stage(page)).highlight).toBeNull();

    // hovering a collection lights its stories; leaving gives the field back
    await page.locator('.srch-quick-link').first().hover();
    await expect.poll(async () => (await stage(page)).highlight?.length ?? 0).toBeGreaterThan(0);
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await stage(page)).highlight).toBeNull();

    // a query: exactly its results are lit (and still after a reload — the URL holds it)
    const search = page.getByRole('search', { name: 'Catalogue' }).getByRole('searchbox');
    await search.fill('train');
    await expect(page).toHaveURL(/\/search\?q=train$/);
    const pods = page.locator('.srch-grid .pod');
    await expect(pods.first()).toBeVisible();
    // lit seeds === the result cards (polled together: the results settle a beat after typing)
    const litMatchesCards = async () => {
      const lit = [...((await stage(page)).highlight ?? [])].sort().join();
      const cards = (await pods.evaluateAll((els) => els.map((e) => e.getAttribute('data-seed') ?? ''))).sort().join();
      return !!lit && lit === cards;
    };
    await expect.poll(litMatchesCards).toBe(true);
    await page.reload();
    await expect(search).toHaveValue('train');
    await expect.poll(litMatchesCards).toBe(true);

    // card ⇄ seed
    const first = pods.first();
    const firstId = (await first.getAttribute('data-seed')) ?? '';
    await first.hover();
    await expect.poll(async () => (await stage(page)).hovered).toBe(firstId);
    await page.mouse.move(2, 2);
    await worldHover(page, firstId);
    await expect(first).toHaveAttribute('data-world-lit');
    await worldHover(page, null);

    // nothing matches → no story is lit; clearing gives every story back
    await search.fill('zzzzqx');
    await expect(page.getByText('Nothing matches all of that')).toBeVisible();
    const none = (await stage(page)).highlight;
    expect(none).not.toBeNull();
    const all = (await (await page.request.get('/api/catalogue')).json()) as { content: { videos: { id: string }[] } };
    expect(all.content.videos.some((v) => (none ?? []).includes(v.id))).toBe(false);
    await page.getByRole('search', { name: 'Catalogue' }).getByRole('button', { name: 'Clear the search' }).click();
    await expect.poll(async () => (await stage(page)).highlight).toBeNull();
  });

  test('a collection gathers its stories in the world and lights them all', async ({ page }) => {
    await page.goto('/collection/miami-gateway');
    await expect(page.getByRole('heading', { level: 1, name: 'Miami: The Gateway' })).toBeVisible();
    const pods = page.locator('#coll-stories .pod');
    await expect(pods.first()).toBeVisible();
    const cards = await pods.evaluateAll((els) => els.map((e) => e.getAttribute('data-seed') ?? ''));
    await expect.poll(async () => (await stage(page)).arrangement.kind).toBe('focus');
    const s = await stage(page);
    expect([s.arrangement.video, ...(s.arrangement.related ?? [])]).toEqual(cards);
    expect([...(s.highlight ?? [])].sort()).toEqual([...cards].sort());
    // the rule opens in Search as live filters
    await page.getByRole('link', { name: 'Open in Search with these filters' }).click();
    await expect(page).toHaveURL(/\/search\?place=miami-dade-county$/);
    await expect(page.locator('.srch-count')).toHaveText(`${cards.length} ${cards.length === 1 ? 'story' : 'stories'}`);
  });

  test('a story’s first screen holds its title and a visible Play @mobile', async ({ page }) => {
    await page.goto('/watch/newspaper-train-1942');
    await expect(page.getByRole('button', { name: 'Play: Newspaper Train' })).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1, name: 'Newspaper Train' })).toBeInViewport();
  });
});

