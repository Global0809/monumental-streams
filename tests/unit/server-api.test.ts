import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CataloguePayload, PlatformConfig } from '../../shared/types.ts';
import { createClient, startTestServer, type TestServer } from '../fixtures/server/harness.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.close();
});

const getJson = async <T>(path: string, init?: RequestInit) => {
  const res = await fetch(`${srv.url}${path}`, init);
  return { res, body: (await res.json()) as T };
};

describe('GET /api/health and /api/config', () => {
  it('reports health', async () => {
    expect((await getJson('/api/health')).body).toEqual({ ok: true });
  });

  it('describes integrations honestly', async () => {
    const { body } = await getJson<PlatformConfig>('/api/config');
    expect(body.environment).toBe('development');
    expect(body.sync).toEqual({ mode: 'server' });
    expect(body.billing).toEqual({ mode: 'setup-pending', devPreviewEnabled: true });
    const byId = Object.fromEntries(body.integrations.map((i) => [i.id, i]));
    expect(byId.stripe.status).toBe('not-configured');
    expect(byId.accounts).toMatchObject({ name: 'Accounts & sync', status: 'connected', detail: 'Monumental server · SQLite' });
    expect(byId.activity.status).toBe('not-connected');
    expect(byId.activity.detail).toContain('content/activity.json (2 items, 1 in date)');
    expect(byId.weather.status).toBe('not-connected');
    expect(byId.external.status).toBe('not-connected'); // fixture external.json is empty
    expect(byId.email.status).toBe('not-configured');
    expect(byId.email.detail).toMatch(/password reset/);
  });
});

describe('GET /api/catalogue', () => {
  it('serves the normalised payload without protected media paths', async () => {
    const res = await fetch(`${srv.url}/api/catalogue`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const text = await res.text();
    const payload = JSON.parse(text) as CataloguePayload;
    expect(res.headers.get('etag')).toBe(`"${payload.version}"`);
    expect(payload.version).toMatch(/^[0-9a-f]{12}$/);
    expect(payload.content.videos.map((v) => v.id).sort()).toEqual(['video:free-film', 'video:planned-film', 'video:premium-film']);
    expect('art' in payload.content).toBe(false);

    // Media: only referenced assets, only public facts.
    expect(Object.keys(payload.media).sort()).toEqual(['media:free-film', 'media:premium-film']);
    expect(payload.media['media:free-film']).toEqual({
      duration: 12,
      renditions: [{ height: 360, width: 640, bandwidth: 400000, label: '360p' }],
      captions: [{ lang: 'en', label: 'English', kind: 'captions', src: '/media/public/captions/free-film.en.vtt', default: true }],
      chapters: '/media/public/captions/free-film.chapters.vtt',
      hasAudio: false,
    });
    expect(text).not.toContain('360.mp4');
    expect(text).not.toContain('master.m3u8');

    // Art: registry entry, file convention, then neutral fallback.
    expect(payload.art['art:listed']).toEqual({
      poster: '/media/public/posters/listed-1280.webp',
      posterSmall: '/media/public/posters/listed-640.webp',
      lqip: 'data:image/webp;base64,UklGRg==',
      preview: '/media/public/previews/listed-720.mp4',
      alt: 'Listed in media/art.json',
      provisional: false,
    });
    expect(payload.art['art:conventional']).toMatchObject({
      poster: '/media/public/posters/conventional-1280.webp',
      posterSmall: '/media/public/posters/conventional-640.webp',
      lqip: 'data:image/webp;base64,Q09OVg==',
      previewSmall: '/media/public/previews/conventional-480.mp4',
    });
    expect(payload.art['art:conventional'].preview).toBeUndefined();
    expect(payload.art['art:missing'].poster).toMatch(/^data:image\/svg\+xml,/);
    expect(payload.art['art:missing'].lqip).toMatch(/^data:image\/svg\+xml,/);
  });

  it('answers 304 when If-None-Match carries the current version', async () => {
    const etag = (await fetch(`${srv.url}/api/catalogue`)).headers.get('etag')!;
    expect((await fetch(`${srv.url}/api/catalogue`, { headers: { 'if-none-match': etag } })).status).toBe(304);
    expect((await fetch(`${srv.url}/api/catalogue`, { headers: { 'if-none-match': `W/${etag}` } })).status).toBe(304);
    expect((await fetch(`${srv.url}/api/catalogue`, { headers: { 'if-none-match': '"stale"' } })).status).toBe(200);
  });

  it('compresses the payload for clients that accept it', async () => {
    const res = await fetch(`${srv.url}/api/catalogue`, { headers: { 'accept-encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });
});

describe('GET /api/search', () => {
  type SearchBody = {
    total: number;
    results: { id: string; score: number; matched: string[] }[];
    facets: { access: { free: number; premium: number } };
    relaxations: unknown[];
  };

  it('returns ids, scores and match reasons — never whole videos', async () => {
    const { body } = await getJson<SearchBody>('/api/search?q=free');
    expect(body.results[0].id).toBe('video:free-film');
    expect(Object.keys(body.results[0]).sort()).toEqual(['id', 'matched', 'score']);
    expect(typeof body.results[0].score).toBe('number');
    expect(body.facets.access).toBeDefined();
    expect(Array.isArray(body.relaxations)).toBe(true);
  });

  it('applies URL filters with place hierarchy (Miami includes Wynwood)', async () => {
    const miami = (await getJson<SearchBody>('/api/search?place=miami')).body.results.map((r) => r.id);
    expect(miami).toEqual(expect.arrayContaining(['video:free-film', 'video:premium-film']));
    const premium = (await getJson<SearchBody>('/api/search?access=premium')).body;
    expect(premium.results.map((r) => r.id)).toEqual(['video:premium-film']);
    expect(premium.total).toBe(1);
  });
});

describe('GET /api/activity', () => {
  it('returns maintained items that are still in date', async () => {
    const { body } = await getJson<{ items: { id: string }[]; external: unknown[] }>('/api/activity');
    expect(body.items.map((i) => i.id)).toEqual(['activity:current-screening']);
    expect(body.external).toEqual([]);
  });
});

describe('routing', () => {
  it('answers unknown API routes with JSON 404 (GET and POST)', async () => {
    const { res, body } = await getJson<{ code: string }>('/api/nope');
    expect(res.status).toBe(404);
    expect(body.code).toBe('not_found');
    const c = createClient(srv.url);
    await c.session();
    expect((await c.post('/api/nope', {})).status).toBe(404);
  });

  it('serves public media with a one-day cache', async () => {
    const res = await fetch(`${srv.url}/media/public/captions/free-film.en.vtt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await res.text()).toMatch(/^WEBVTT/);
    expect((await fetch(`${srv.url}/media/public/nothing-here.webp`)).status).toBe(404);
  });

  it('never serves protected media or manifests from the public path', async () => {
    expect((await fetch(`${srv.url}/media/public/../manifest.json`)).status).toBe(404);
    expect((await fetch(`${srv.url}/media/protected/free-film/360.mp4`)).status).toBe(404);
  });

  it('explains itself at / in development instead of serving a client', async () => {
    const res = await fetch(`${srv.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('http://app.example.test');
    expect((await fetch(`${srv.url}/watch/free-film`)).status).toBe(404);
  });
});
