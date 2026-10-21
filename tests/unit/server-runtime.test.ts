import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../server/config.ts';
import { ContentError, loadContent } from '../../server/content.ts';
import { computeEntitlement } from '../../server/entitlements.ts';
import type { MembershipRow } from '../../server/db.ts';
import { FIXTURE_CONTENT, FIXTURE_MEDIA, createClient, startTestServer, uniqueEmail, type TestServer } from '../fixtures/server/harness.ts';

const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);

const temps: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-runtime-test-'));
  temps.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('refuses to start in production without both secrets, or with short ones', async () => {
    const cwd = await tempDir();
    expect(() => loadConfig({ cwd, env: { NODE_ENV: 'production' } })).toThrow(/SESSION_SECRET and PLAYBACK_TOKEN_SECRET/);
    expect(() => loadConfig({ cwd, env: { NODE_ENV: 'production', SESSION_SECRET: SECRET_A } })).toThrow(ConfigError);
    expect(() => loadConfig({ cwd, env: { NODE_ENV: 'production', SESSION_SECRET: 'short', PLAYBACK_TOKEN_SECRET: SECRET_B } })).toThrow(
      /at least 32 characters/,
    );
    expect(existsSync(path.join(cwd, 'data', 'dev-secrets.json'))).toBe(false);
  });

  it('forces the dev membership preview off in production', async () => {
    const cwd = await tempDir();
    const config = loadConfig({
      cwd,
      env: { NODE_ENV: 'production', SESSION_SECRET: SECRET_A, PLAYBACK_TOKEN_SECRET: SECRET_B, DEV_PREVIEW_MEMBERSHIP: 'true' },
    });
    expect(config.production).toBe(true);
    expect(config.devPreviewMembership).toBe(false);
    expect(config.host).toBe('0.0.0.0');
    expect(config.warnings.join('\n')).toMatch(/DEV_PREVIEW_MEMBERSHIP is ignored/);
  });

  it('generates and persists development secrets in DATA_DIR', async () => {
    const cwd = await tempDir();
    const first = loadConfig({ cwd, env: {} });
    expect(first).toMatchObject({ env: 'development', port: 8787, host: '127.0.0.1', devPreviewMembership: true, appOrigin: 'http://localhost:5173' });
    expect(first.dataDir).toBe(path.join(cwd, 'data'));
    const stored = JSON.parse(readFileSync(path.join(cwd, 'data', 'dev-secrets.json'), 'utf8'));
    expect(stored.sessionSecret).toBe(first.sessionSecret);
    const second = loadConfig({ cwd, env: {} });
    expect(second.playbackTokenSecret).toBe(first.playbackTokenSecret);
    expect(first.sessionSecret).not.toBe(first.playbackTokenSecret);
  });

  it('validates values and parses TRUST_PROXY', async () => {
    const cwd = await tempDir();
    const base = { SESSION_SECRET: SECRET_A, PLAYBACK_TOKEN_SECRET: SECRET_B };
    expect(() => loadConfig({ cwd, env: { ...base, PORT: 'eighty' } })).toThrow(/PORT/);
    expect(() => loadConfig({ cwd, env: { ...base, APP_ORIGIN: 'not a url' } })).toThrow(/APP_ORIGIN/);
    expect(() => loadConfig({ cwd, env: { ...base, DEV_PREVIEW_MEMBERSHIP: 'maybe' } })).toThrow(/DEV_PREVIEW_MEMBERSHIP/);
    expect(loadConfig({ cwd, env: { ...base, APP_ORIGIN: 'https://streams.example/some/path' } }).appOrigin).toBe('https://streams.example');
    expect(loadConfig({ cwd, env: { ...base, TRUST_PROXY: '1' } }).trustProxy).toBe(1);
    expect(loadConfig({ cwd, env: { ...base, TRUST_PROXY: 'true' } }).trustProxy).toBe(true);
    expect(loadConfig({ cwd, env: { ...base, TRUST_PROXY: 'loopback' } }).trustProxy).toBe('loopback');
  });
});

describe('computeEntitlement', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const row = (over: Partial<MembershipRow>): MembershipRow => ({
    user_id: 'u',
    status: 'none',
    source: 'stripe',
    period_end: null,
    stripe_customer: null,
    stripe_subscription: null,
    stripe_event_at: null,
    updated_at: 0,
    ...over,
  });
  const dev = { devPreviewEnabled: true, production: false };
  const prod = { devPreviewEnabled: true, production: true };

  it('grants premium for active, in-period cancelled and enabled dev preview only', () => {
    expect(computeEntitlement(undefined, dev, now)).toEqual({ status: 'none', premium: false, periodEnd: null, source: null });
    expect(computeEntitlement(row({ status: 'active' }), dev, now).premium).toBe(true);
    expect(computeEntitlement(row({ status: 'cancelled', period_end: '2026-06-02T00:00:00Z' }), dev, now)).toMatchObject({
      status: 'cancelled',
      premium: true,
    });
    expect(computeEntitlement(row({ status: 'cancelled', period_end: '2026-05-31T00:00:00Z' }), dev, now)).toMatchObject({
      status: 'expired',
      premium: false,
    });
    expect(computeEntitlement(row({ status: 'past_due' }), dev, now).premium).toBe(false);
    expect(computeEntitlement(row({ status: 'dev_preview', source: 'dev-preview' }), dev, now).premium).toBe(true);
  });

  it('ignores every dev-preview row in production, including "cancelled"', () => {
    expect(computeEntitlement(row({ status: 'dev_preview', source: 'dev-preview' }), prod, now).premium).toBe(false);
    const cancelled = row({ status: 'cancelled', source: 'dev-preview', period_end: '2026-07-01T00:00:00Z' });
    expect(computeEntitlement(cancelled, prod, now)).toEqual({ status: 'none', premium: false, periodEnd: null, source: null });
    expect(computeEntitlement(cancelled, { devPreviewEnabled: false, production: false }, now).premium).toBe(false);
    expect(computeEntitlement(row({ status: 'active' }), prod, now).premium).toBe(true);
  });
});

describe('content loading', () => {
  async function brokenCopy(mutate: (dir: string) => Promise<void>) {
    const dir = await tempDir();
    await cp(FIXTURE_CONTENT, dir, { recursive: true });
    await mutate(dir);
    return dir;
  }

  it('builds a payload with a stable version', async () => {
    const a = await loadContent({ contentDir: FIXTURE_CONTENT, mediaDir: FIXTURE_MEDIA });
    const b = await loadContent({ contentDir: FIXTURE_CONTENT, mediaDir: FIXTURE_MEDIA });
    expect(a.version).toBe(b.version);
    expect(a.catalogue.isPlayable(a.catalogue.get('video:free-film') as never)).toBe(true);
    expect(Object.keys(a.media)).toEqual(['media:free-film', 'media:premium-film']);
    expect(a.warnings.some((w) => w.includes('media:unreferenced'))).toBe(true);
  });

  it('reports invalid JSON with the file name', async () => {
    const dir = await brokenCopy((d) => writeFile(path.join(d, 'places.json'), '[{"id": "place:x",'));
    const err = await loadContent({ contentDir: dir, mediaDir: FIXTURE_MEDIA }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect((err as ContentError).errors[0]).toMatch(/^content\/places\.json: invalid JSON/);
  });

  it('reports schema and reference errors readably', async () => {
    const dir = await brokenCopy(async (d) => {
      const file = path.join(d, 'videos', 'free-film.json');
      const video = JSON.parse(await readFile(file, 'utf8'));
      await writeFile(file, JSON.stringify({ ...video, places: ['place:atlantis'] }));
      await rm(path.join(d, 'membership.json'));
    });
    const err = (await loadContent({ contentDir: dir, mediaDir: FIXTURE_MEDIA }).catch((e: unknown) => e)) as ContentError;
    expect(err).toBeInstanceOf(ContentError);
    expect(err.errors).toContain('content/membership.json not found.');
    const withMembership = await brokenCopy(async (d) => {
      const file = path.join(d, 'videos', 'free-film.json');
      const video = JSON.parse(await readFile(file, 'utf8'));
      await writeFile(file, JSON.stringify({ ...video, places: ['place:atlantis'] }));
    });
    const refErr = (await loadContent({ contentDir: withMembership, mediaDir: FIXTURE_MEDIA }).catch((e: unknown) => e)) as ContentError;
    expect(refErr.message).toContain('video:free-film');
    expect(refErr.errors.join('\n')).toContain('place:atlantis');
  });

  it('content:check prints a report and exits non-zero on errors', async () => {
    const run = (contentDir: string) =>
      spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/content-check.ts', '--content', contentDir, '--media', FIXTURE_MEDIA], {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
      });
    const ok = run(FIXTURE_CONTENT);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('Playable now: 2 of 3');
    expect(ok.stdout).toContain('Period coverage');
    expect(ok.stdout).toContain('✓ Content is valid.');

    const broken = await brokenCopy((d) => writeFile(path.join(d, 'themes.json'), '{"not": "an array"}'));
    const bad = run(broken);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('content/themes.json must contain a JSON array.');
  });
});

describe('production mode', () => {
  let srv: TestServer;
  beforeAll(async () => {
    srv = await startTestServer({
      env: { NODE_ENV: 'production', SESSION_SECRET: SECRET_A, PLAYBACK_TOKEN_SECRET: SECRET_B, DEV_PREVIEW_MEMBERSHIP: 'true' },
      files: {
        'dist/index.html': '<!doctype html><title>Monumental Streams</title><div id="root"></div>',
        'dist/assets/app-1a2b3c.js': 'console.log("app")',
      },
    });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('serves the client with immutable assets and an uncached SPA fallback', async () => {
    const page = await fetch(`${srv.url}/watch/free-film?t=30`);
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(await page.text()).toContain('<div id="root">');
    const asset = await fetch(`${srv.url}/assets/app-1a2b3c.js`);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${srv.url}/assets/missing.js`)).status).toBe(404);
    const api = await fetch(`${srv.url}/api/unknown`);
    expect(api.headers.get('content-type')).toMatch(/json/);
    expect(api.status).toBe(404);
    expect(page.headers.get('strict-transport-security')).toMatch(/max-age=31536000/);
  });

  it('marks cookies Secure and makes the dev preview unreachable', async () => {
    const config = await (await fetch(`${srv.url}/api/config`)).json();
    expect(config.environment).toBe('production');
    expect(config.billing.devPreviewEnabled).toBe(false);

    const c = createClient(srv.url);
    const reg = await c.register(uniqueEmail('prod'));
    expect(reg.headers.getSetCookie().find((l) => l.startsWith('ms_sid='))).toMatch(/Secure/);
    const dev = await c.post('/api/dev/membership', { status: 'dev_preview' });
    expect(dev.status).toBe(404);
    expect((await c.session()).membership.premium).toBe(false);
  });
});
