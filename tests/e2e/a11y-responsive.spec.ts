/**
 * Responsive + accessibility sweep. For every primary route at phone (390), tablet (820) and
 * desktop (1440) widths:
 *   (a) no horizontal page overflow — measured with the body's `overflow-x: clip` safety net
 *       lifted, so content that is merely hidden past the right edge is caught too;
 *   (b) axe (WCAG 2.0/2.1 A + AA) has no serious/critical violations (moderate ones are logged).
 *       The body's decorative radial glows (<= 7% alpha over --abyss) and grain overlay are
 *       flattened to plain --abyss for this step only: otherwise axe reports every text node's
 *       contrast as "incomplete" (background gradient) and silently checks nothing;
 *   (c) exactly one <h1>;
 *   (d) on the touch widths (390 phone, 820 tablet), every visible interactive element offers a >= 44×44 CSS px hit area
 *       (pseudo-element hit-area extensions count), unless it is an inline text link in prose.
 *
 * Runs with reduced motion so entrance/breathing animations are settled and contrast results
 * are deterministic. It sets its own viewport sizes (phone and tablet also emulate touch, so
 * the design system's (pointer: coarse) target sizes apply), so run it in the desktop project only.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/catalogue',
  '/catalogue?q=miami&access=free',
  '/watch/newspaper-train-1942',
  '/watch/reel-interface-specimens',
  '/watch/wavemakers-pr-ny-london',
  '/programme/wavemakers-pr-ny-london',
  '/programme/better-late-than-never',
  '/collection/open-archive',
  '/world',
  '/world/miami',
  '/world?view=list',
  '/time-machine/1940s',
  '/synapse/movement/hip-hop-origins',
  '/somewhere?minutes=30&seed=7',
  '/passport',
  '/live',
  '/my-world',
  '/my-world?tab=places',
  '/my-world?tab=settings',
  '/membership',
  '/account?mode=register',
  '/about',
  '/nope',
];

// Phone and tablet widths emulate touch, so the design system's (pointer: coarse) target sizes apply.
const WIDTHS = [
  { width: 390, height: 844, touch: true, mobile: true },
  { width: 820, height: 1180, touch: true, mobile: false },
  { width: 1440, height: 900, touch: false, mobile: false },
];

const MIN_HIT = 44;

test.use({ reducedMotion: 'reduce' });
test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ms.awakened.v1', '1'));
});

async function settle(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'load' });
  await page.locator('main h1').first().waitFor({ state: 'attached', timeout: 20_000 });
  // let lazy organs, fonts and late layout (images, the atlas fallback) settle
  await page.waitForFunction(() => !document.querySelector('main .pulse[role="status"]'), null, { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

function overflowReport(page: Page, width: number) {
  return page.evaluate((configured) => {
    const body = document.body;
    const prev = body.style.overflowX;
    body.style.overflowX = 'visible';
    // isMobile can widen the layout viewport to fit overflowing content, so measure against the configured width
    const vw = Math.min(window.innerWidth, configured);
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (scrollWidth > vw + 1) {
      // find the outermost elements that stick out past the right edge and are not
      // inside a scroll/clip container
      const clipped = (el: Element) => {
        for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox !== 'visible') return true;
        }
        return false;
      };
      for (const el of Array.from(body.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        if (clipped(el)) continue;
        const parent = el.parentElement;
        if (parent && parent.getBoundingClientRect().right > vw + 1 && !clipped(parent) && parent !== body) continue;
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
        offenders.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)}`);
        if (offenders.length >= 8) break;
      }
    }
    body.style.overflowX = prev;
    return { scrollWidth, innerWidth: vw, offenders };
  }, width);
}

function hitAreaReport(page: Page, min: number) {
  return page.evaluate((MIN) => {
    const sel = 'a[href], button, [role=button], input:not([type=hidden]), select, [role=slider], [role=tab]';
    const px = (v: string) => (v.endsWith('px') ? parseFloat(v) : NaN);
    const out: string[] = [];
    const seen = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[inert], [aria-hidden="true"], dialog:not([open]), .sr-only')) continue;
      // content inside a closed <details> (content-visibility: hidden) is neither shown nor focusable
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue; // visually hidden (sr-only, off-canvas)
      if (r.bottom < -window.scrollY || r.right < 0) continue; // parked off-screen (skip link)
      // an input wrapped by its label: the label is the hit area
      let w = r.width;
      let h = r.height;
      if (el.matches('input') && el.closest('label')) {
        const lr = el.closest('label')!.getBoundingClientRect();
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
      }
      // pseudo-element hit-area extensions: an absolutely positioned ::before/::after (negative
      // inset on the control, or a "stretched link" covering its whole card) is part of the target
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === 'none' || ps.content === 'normal' || ps.position !== 'absolute' || ps.pointerEvents === 'none') continue;
        let cb: Element | null = el;
        while (cb && cb !== document.body && getComputedStyle(cb).position === 'static' && getComputedStyle(cb).transform === 'none') cb = cb.parentElement;
        const cr = (cb ?? document.body).getBoundingClientRect();
        const [t, rr, b, l] = [px(ps.top), px(ps.right), px(ps.bottom), px(ps.left)];
        const pw = !Number.isNaN(l) && !Number.isNaN(rr) ? cr.width - l - rr : px(ps.width);
        const ph = !Number.isNaN(t) && !Number.isNaN(b) ? cr.height - t - b : px(ps.height);
        if (!Number.isNaN(pw)) w = Math.max(w, pw);
        if (!Number.isNaN(ph)) h = Math.max(h, ph);
      }
      if (w >= MIN - 0.5 && h >= MIN - 0.5) continue;
      // inline text links inside running prose are exempt (WCAG 2.5.8 inline exception): a
      // paragraph, or a list item whose sentence is clearly longer than the link itself
      if (el.tagName === 'A' && cs.display === 'inline') {
        const block = el.closest('p, li, dd, figcaption, blockquote');
        const linkLen = (el.textContent ?? '').trim().length;
        if (block && (!block.matches('li') || (block.textContent ?? '').trim().length >= linkLen + 24)) continue;
      }
      const clsOf = (n: Element) => (typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      let ctx = el.parentElement;
      while (ctx && !clsOf(ctx)) ctx = ctx.parentElement;
      const cls = clsOf(el);
      const name = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
      out.push(`${ctx ? '.' + clsOf(ctx) + ' > ' : ''}${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${name}" ${Math.round(w)}×${Math.round(h)}`);
    }
    return out;
  }, min);
}

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.mobile });

    for (const route of ROUTES) {
      test(`${route} @ ${vp.width}`, async ({ page }, info) => {
        test.setTimeout(90_000);
        await settle(page, route);

        // (a) horizontal overflow
        const ov = await overflowReport(page, vp.width);
        expect.soft(ov.scrollWidth, `horizontal overflow at ${vp.width}px: ${ov.offenders.join(' | ')}`).toBeLessThanOrEqual(ov.innerWidth + 1);

        // (c) one h1
        const h1s = await page.locator('h1').allTextContents();
        expect.soft(h1s.length, `h1 count (found: ${h1s.map((t) => JSON.stringify(t.trim().slice(0, 40))).join(', ')})`).toBe(1);

        // (d) touch targets on touch screens (phone + tablet)
        if (vp.touch) {
          const small = await hitAreaReport(page, MIN_HIT);
          if (small.length) info.annotations.push({ type: 'small-targets', description: small.join('\n') });
          expect.soft(small, `targets smaller than ${MIN_HIT}×${MIN_HIT}`).toEqual([]);
        }

        // (b) axe — flatten the body's decorative gradient so contrast is actually measured
        await page.addStyleTag({ content: 'body{background:var(--abyss)!important}body::before{display:none!important}' });
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.cursor') // decorative organic cursor layer
          .analyze();
        const severe = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        const moderate = results.violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');
        if (moderate.length) {
          console.log(`[a11y moderate] ${route} @ ${vp.width}: ${moderate.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`);
        }
        const summary = severe.map(
          (v) =>
            `${v.impact} ${v.id}: ${v.help}\n` +
            v.nodes
              .slice(0, 6)
              .map((n) => `    ${n.target.join(' ')}${v.id === 'color-contrast' ? ` — ${(n.any[0]?.message ?? '').replace(/\s+/g, ' ').slice(0, 140)}` : ''}`)
              .join('\n'),
        );
        expect.soft(summary, 'serious/critical axe violations').toEqual([]);
      });
    }
  });
}
