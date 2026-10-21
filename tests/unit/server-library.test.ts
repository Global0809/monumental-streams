import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyLibrary } from '../../shared/library.ts';
import type { Library } from '../../shared/types.ts';
import { createClient, startTestServer, uniqueEmail, type TestClient, type TestServer } from '../fixtures/server/harness.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.close();
});

const library = (patch: Partial<Library>): Library => ({ ...emptyLibrary(), ...patch });

async function signedIn(): Promise<TestClient> {
  const c = createClient(srv.url);
  await c.register(uniqueEmail('lib'));
  return c;
}

describe('/api/me/library', () => {
  it('requires a signed-in user', async () => {
    const c = createClient(srv.url);
    await c.session();
    expect((await c.get('/api/me/library')).status).toBe(401);
    const put = await c.put('/api/me/library', { library: emptyLibrary() });
    expect(put.status).toBe(401);
    expect((await put.json()).code).toBe('auth_required');
  });

  it('starts empty, then merges each device’s changes instead of overwriting', async () => {
    const c = await signedIn();
    expect(await (await c.get('/api/me/library')).json()).toEqual({ library: null });

    const deviceA = library({
      saved: { 'video:free-film': { at: 1000 } },
      progress: { 'video:free-film': { pos: 30, dur: 120, at: 1000, done: false } },
      updatedAt: 1000,
    });
    const first = await c.put('/api/me/library', { library: deviceA });
    expect(first.status).toBe(200);
    expect((await first.json()).library.saved).toEqual({ 'video:free-film': { at: 1000 } });

    // Device B never saw A's changes; it saves something else and has newer progress.
    const deviceB = library({
      saved: { 'video:premium-film': { at: 2000 } },
      progress: { 'video:free-film': { pos: 90, dur: 120, at: 3000, done: false } },
      updatedAt: 3000,
    });
    const merged = (await (await c.put('/api/me/library', { library: deviceB })).json()).library as Library;
    expect(merged.saved).toEqual({ 'video:free-film': { at: 1000 }, 'video:premium-film': { at: 2000 } });
    expect(merged.progress['video:free-film'].pos).toBe(90);
    expect(merged.updatedAt).toBe(3000);

    // A newer tombstone removes the save everywhere; a stale write cannot bring it back.
    await c.put('/api/me/library', { library: library({ saved: { 'video:free-film': { at: 4000, removed: true } } }) });
    await c.put('/api/me/library', { library: library({ saved: { 'video:free-film': { at: 1500 } } }) });
    const stored = (await (await c.get('/api/me/library')).json()).library as Library;
    expect(stored.saved['video:free-film']).toEqual({ at: 4000, removed: true });
    expect(stored.saved['video:premium-film']).toEqual({ at: 2000 });
  });

  it('keeps libraries separate per account', async () => {
    const a = await signedIn();
    const b = await signedIn();
    await a.put('/api/me/library', { library: library({ savedPlaces: { 'place:miami': { at: 5 } } }) });
    expect(await (await b.get('/api/me/library')).json()).toEqual({ library: null });
  });

  it('repairs malformed input through migrateLibrary and rejects bodies without a library', async () => {
    const c = await signedIn();
    const res = await c.put('/api/me/library', { library: { saved: ['video:free-film'], history: 'nonsense', prefs: 42 } });
    expect(res.status).toBe(200);
    const lib = (await res.json()).library as Library;
    expect(lib.version).toBe(1);
    expect(lib.saved).toEqual({ 'video:free-film': { at: 0 } });
    expect(lib.history).toEqual([]);
    expect(lib.prefs).toEqual(emptyLibrary().prefs);

    expect((await c.put('/api/me/library', { notALibrary: true })).status).toBe(400);
    expect((await c.put('/api/me/library', { library: [] })).status).toBe(400);
  });

  it('accepts up to 256 kb (more than other endpoints) and rejects larger bodies', async () => {
    const c = await signedIn();
    const history = (n: number) => Array.from({ length: n }, (_, i) => ({ video: `video:padding-${'x'.repeat(40)}-${i}`, at: i }));
    const medium = JSON.stringify({ library: library({ history: history(1500) }) });
    expect(medium.length).toBeGreaterThan(64 * 1024);
    expect(medium.length).toBeLessThan(256 * 1024);
    expect((await c.put('/api/me/library', medium)).status).toBe(200);

    const huge = JSON.stringify({ library: library({ history: history(6000) }) });
    expect(huge.length).toBeGreaterThan(256 * 1024);
    const res = await c.put('/api/me/library', huge);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('payload_too_large');

    // Other endpoints keep the small default limit.
    const login = await c.post('/api/auth/login', JSON.stringify({ email: 'a@b.cd', password: 'x'.repeat(64 * 1024) }));
    expect(login.status).toBe(413);
  });
});
