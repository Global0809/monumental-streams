/**
 * Deterministic catalogue for journeys that assert exact counts or empty states.
 *
 * The real catalogue grows (that is the point of the data-driven design), so specs that were
 * written against the original 17-title preview catalogue pin that snapshot inside the browser:
 * titles added later are filtered out of GET /api/catalogue for this page only — the server and
 * its data are untouched. Optional `tags` add interests to real titles to prove that a category
 * fills itself the moment a title carries its interest.
 */
import type { Page } from '@playwright/test';

/** Demonstration titles added after the original preview catalogue (category media, Oct 2026). */
export const LATER_TITLES = new Set([
  'video:big-buck-bunny',
  'video:caminandes-llama-drama',
  'video:caminandes-llamigos',
  'video:zero-ad-agni-trailer',
  'video:minetest-first-minutes',
  'video:senators-world-series-1924',
  'video:veldloop-1922',
  'video:world-series-1959',
  'video:worlds-fair-1964',
  'video:royal-tour-1939',
  'video:courier-satellite-1960',
  'video:fashions-rome-1964',
  'video:fashion-week-1951',
  'video:cotton-fashion-1958',
]);

export async function pinPreviewCatalogue(page: Page, tags: Record<string, string[]> = {}) {
  await page.route('**/api/catalogue', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.content.videos = json.content.videos.filter((v: { id: string }) => !LATER_TITLES.has(v.id));
    for (const v of json.content.videos) for (const [tag, ids] of Object.entries(tags)) if (ids.includes(v.id)) v.categories.push(tag);
    json.version = `${json.version}-preview17`;
    await route.fulfill({ response: res, json });
  });
}
