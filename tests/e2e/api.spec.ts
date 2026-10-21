/**
 * Server journeys through the real HTTP stack: catalogue, search, entitlements, signed
 * playback, protected streaming, accounts, library sync, CSRF and membership states.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const unique = () => `reviewer+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;

async function csrf(request: APIRequestContext) {
  await request.get('/api/session');
  const cookies = await request.storageState();
  return cookies.cookies.find((c) => c.name === 'ms_csrf')?.value ?? '';
}

async function post(request: APIRequestContext, path: string, data?: unknown) {
  const token = await csrf(request);
  return request.post(path, { data, headers: { 'X-CSRF-Token': token, Origin: 'http://localhost:5173' } });
}

test.describe('catalogue + search', () => {
  test('catalogue payload exposes public media facts only', async ({ request }) => {
    const res = await request.get('/api/catalogue');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.content.videos.length).toBeGreaterThan(5);
    const json = JSON.stringify(body);
    expect(json).not.toContain('protected');
    expect(json).not.toContain('master.m3u8');
    const etag = res.headers()['etag'];
    expect(etag).toBeTruthy();
    const again = await request.get('/api/catalogue', { headers: { 'If-None-Match': etag } });
    expect(again.status()).toBe(304);
  });

  test('combined filters narrow results and suggest relaxations', async ({ request }) => {
    const all = await (await request.get('/api/search')).json();
    const free = await (await request.get('/api/search?access=free')).json();
    expect(free.total).toBeLessThanOrEqual(all.total);
    const impossible = await (await request.get('/api/search?q=zzzzqx&access=premium')).json();
    expect(impossible.total).toBe(0);
    const diacritics = await (await request.get('/api/search?q=loiza')).json();
    expect(diacritics.entities.some((e: { label: string }) => /Loíza/.test(e.label))).toBeTruthy();
  });
});

test.describe('playback entitlements', () => {
  test('free video issues a signed stream that serves a rewritten playlist and segments', async ({ request }) => {
    const res = await post(request, '/api/playback/reel-living-atlas');
    expect(res.ok()).toBeTruthy();
    const p = await res.json();
    expect(p.hls).toMatch(/\/stream\/reel-living-atlas\/master\.m3u8\?t=/);
    const master = await request.get(p.hls);
    expect(master.ok()).toBeTruthy();
    const text = await master.text();
    expect(text).toContain('#EXTM3U');
    const variant = text.split('\n').find((l) => l && !l.startsWith('#'))!;
    expect(variant).toContain('?t=');
    const v = await request.get(new URL(variant, new URL(p.hls, 'http://localhost:5173')).pathname + '?' + variant.split('?')[1]);
    expect(v.ok()).toBeTruthy();
    const seg = (await v.text()).split('\n').find((l) => l.endsWith('.ts') || l.includes('.ts?'))!;
    expect(seg).toContain('?t=');
    // tampered token is refused
    const tampered = p.hls.replace(/t=([^&]+)/, (_: string, t: string) => `t=${t.slice(0, -3)}abc`);
    expect((await request.get(tampered)).status()).toBeGreaterThanOrEqual(400);
    // path traversal is refused
    const traversal = await request.get(p.hls.replace('master.m3u8', '..%2F..%2Fmanifest.json'));
    expect(traversal.status()).toBeGreaterThanOrEqual(400);
  });

  test('premium video is gated for guests, unlocked by the dev preview, re-locked when expired', async ({ request }) => {
    const gated = await post(request, '/api/playback/reel-interface-specimens');
    expect(gated.status()).toBe(403);
    expect((await gated.json()).code).toBe('premium_required');

    const reg = await post(request, '/api/auth/register', { name: 'Reviewer', email: unique(), password: 'correct horse battery' });
    expect(reg.ok()).toBeTruthy();
    expect((await reg.json()).membership.premium).toBe(false);
    expect((await post(request, '/api/playback/reel-interface-specimens')).status()).toBe(403);

    const preview = await post(request, '/api/dev/membership', { status: 'dev_preview' });
    expect(preview.ok()).toBeTruthy();
    const session = await preview.json();
    expect(session.membership.premium).toBe(true);
    expect(session.membership.source).toBe('dev-preview');
    const ok = await post(request, '/api/playback/reel-interface-specimens');
    expect(ok.ok()).toBeTruthy();

    const expired = await post(request, '/api/dev/membership', { status: 'expired' });
    expect((await expired.json()).membership.premium).toBe(false);
    expect((await post(request, '/api/playback/reel-interface-specimens')).status()).toBe(403);

    const cancelled = await post(request, '/api/dev/membership', { status: 'cancelled' });
    const c = await cancelled.json();
    expect(c.membership.status).toBe('cancelled');
    expect(c.membership.premium).toBe(true); // access continues until period end
  });

  test('planned original is listed but not playable', async ({ request }) => {
    const res = await post(request, '/api/playback/wavemakers-pr-ny-london');
    expect([404, 409]).toContain(res.status());
  });

  test('billing reports setup-pending without keys and never pretends to charge', async ({ request }) => {
    const cfg = await (await request.get('/api/config')).json();
    if (cfg.billing.mode !== 'setup-pending') test.skip(true, 'Stripe keys configured');
    await post(request, '/api/auth/register', { name: 'Reviewer', email: unique(), password: 'correct horse battery' });
    const res = await post(request, '/api/billing/checkout', { plan: 'monthly' });
    expect(res.status()).toBe(503);
    expect((await res.json()).code).toBe('billing_setup_pending');
  });
});

test.describe('accounts + sync', () => {
  test('CSRF is enforced on mutating requests', async ({ request }) => {
    await request.get('/api/session');
    const res = await request.post('/api/auth/login', { data: { email: 'x@example.test', password: 'whatever-123' }, headers: { Origin: 'http://localhost:5173' } });
    expect(res.status()).toBe(403);
  });

  test('library merges across two devices, removals win', async ({ playwright }) => {
    const email = unique();
    const a = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
    const b = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
    await post(a, '/api/auth/register', { name: 'Device A', email, password: 'correct horse battery' });
    await post(b, '/api/auth/login', { email, password: 'correct horse battery' });
    const t = Date.now();
    const lib = (patch: Record<string, unknown>) => ({ version: 1, progress: {}, saved: {}, savedPlaces: {}, journeys: {}, history: [], interests: {}, stamps: {}, prefs: {}, updatedAt: t, ...patch });
    const putA = await a.put('/api/me/library', {
      data: { library: lib({ saved: { 'video:reel-living-atlas': { at: t } }, progress: { 'video:reel-stories-in-time': { pos: 12, dur: 30.2, at: t, done: false } } }) },
      headers: { 'X-CSRF-Token': await csrf(a), Origin: 'http://localhost:5173' },
    });
    expect(putA.ok()).toBeTruthy();
    const putB = await b.put('/api/me/library', {
      data: { library: lib({ saved: { 'video:reel-living-atlas': { at: t + 1000, removed: true }, 'video:wavemakers-teaser': { at: t + 1000 } } }) },
      headers: { 'X-CSRF-Token': await csrf(b), Origin: 'http://localhost:5173' },
    });
    const merged = (await putB.json()).library;
    expect(merged.saved['video:reel-living-atlas'].removed).toBe(true);
    expect(merged.saved['video:wavemakers-teaser']).toBeTruthy();
    expect(merged.progress['video:reel-stories-in-time'].pos).toBe(12);
    const fromA = (await (await a.get('/api/me/library')).json()).library;
    expect(fromA.saved['video:wavemakers-teaser']).toBeTruthy();
    await a.dispose();
    await b.dispose();
  });
});
