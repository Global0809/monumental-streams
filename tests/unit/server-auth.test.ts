import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/auth.ts';
import { createClient, startTestServer, uniqueEmail, type TestServer } from '../fixtures/server/harness.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.close();
});

const PASSWORD = 'correct horse battery';

describe('password hashing', () => {
  it('uses a per-user salt and verifies in constant time', async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword('wrong password!', a)).toBe(false);
    expect(await verifyPassword(PASSWORD, 'garbage')).toBe(false);
  });
});

describe('session lifecycle', () => {
  it('GET /api/session issues a readable CSRF cookie and reports a signed-out visitor', async () => {
    const c = createClient(srv.url);
    const res = await c.get('/api/session');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const info = await res.json();
    expect(info).toEqual({
      user: null,
      membership: { status: 'none', premium: false, periodEnd: null, source: null },
      csrf: c.jar.get('ms_csrf'),
    });
    const cookie = res.headers.getSetCookie().find((l) => l.startsWith('ms_csrf='))!;
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    // A second call reuses the existing valid token instead of rotating it.
    const again = await c.get('/api/session');
    expect(again.headers.getSetCookie()).toEqual([]);
    expect((await again.json()).csrf).toBe(info.csrf);
  });

  it('registers, keeps the session, logs out and logs back in', async () => {
    const c = createClient(srv.url);
    const email = uniqueEmail('Mixed');
    const reg = await c.register(`  ${email.toUpperCase()} `, PASSWORD, 'Ada');
    expect(reg.status).toBe(201);
    const sidCookie = reg.headers.getSetCookie().find((l) => l.startsWith('ms_sid='))!;
    expect(sidCookie).toMatch(/HttpOnly/i);
    expect(sidCookie).toMatch(/SameSite=Lax/i);
    expect(sidCookie).toMatch(/Max-Age=2592000/);
    expect(sidCookie).not.toMatch(/Secure/i); // Secure only in production
    const info = await reg.json();
    expect(info.user).toMatchObject({ email: email.toLowerCase(), name: 'Ada' });
    expect(new Date(info.user.createdAt).toString()).not.toBe('Invalid Date');

    // Only sha256(token) is stored server-side.
    const token = c.jar.get('ms_sid')!;
    const row = srv.app.ctx.db.sessions.find(createHash('sha256').update(token).digest('hex'));
    expect(row?.user_id).toBe(info.user.id);
    expect(srv.app.ctx.db.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token)).toEqual({ n: 0 });

    expect((await c.session()).user.id).toBe(info.user.id);

    const out = await c.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect((await out.json()).user).toBeNull();
    expect(c.jar.has('ms_sid')).toBe(false);
    expect(srv.app.ctx.db.sessions.find(createHash('sha256').update(token).digest('hex'))).toBeUndefined();
    expect((await c.session()).user).toBeNull();

    const login = await c.post('/api/auth/login', { email: email.toLowerCase(), password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await login.json()).user.id).toBe(info.user.id);
    expect(c.jar.get('ms_sid')).not.toBe(token); // a fresh token every login
  });

  it('a stolen-but-revoked session token no longer authenticates', async () => {
    const c = createClient(srv.url);
    await c.register(uniqueEmail());
    const token = c.jar.get('ms_sid')!;
    await c.post('/api/auth/logout');
    const replay = createClient(srv.url);
    replay.jar.set('ms_sid', token);
    expect((await replay.session()).user).toBeNull();
  });
});

describe('generic errors (no account enumeration)', () => {
  it('rejects a duplicate registration without confirming the account exists', async () => {
    const email = uniqueEmail();
    expect((await createClient(srv.url).register(email)).status).toBe(201);
    const dup = await createClient(srv.url).register(email);
    expect(dup.status).toBe(400);
    const body = await dup.json();
    expect(body.code).toBe('registration_failed');
    expect(body.message).not.toMatch(/exists|taken|already registered/i);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const email = uniqueEmail();
    const c = createClient(srv.url);
    await c.register(email);
    const wrong = await c.post('/api/auth/login', { email, password: 'not the password' });
    const unknown = await c.post('/api/auth/login', { email: uniqueEmail('nobody'), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('validates registration input', async () => {
    const short = await createClient(srv.url).register(uniqueEmail(), 'short');
    expect(short.status).toBe(400);
    expect((await short.json()).message).toMatch(/at least 10 characters/);
    const bad = await createClient(srv.url).register('not-an-email');
    expect((await bad.json()).code).toBe('invalid_request');
  });

  it('answers malformed JSON with 400 invalid_json', async () => {
    const c = createClient(srv.url);
    await c.session();
    const res = await c.request('POST', '/api/auth/login', { body: '{"email":', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_json');
  });
});

describe('CSRF and Origin protection', () => {
  it('rejects a mutating request without the X-CSRF-Token header', async () => {
    const c = createClient(srv.url);
    await c.session();
    const res = await c.post('/api/auth/login', { email: 'a@b.cd', password: PASSWORD }, { csrf: false });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('csrf_failed');
  });

  it('rejects a header that does not match the cookie', async () => {
    const c = createClient(srv.url);
    await c.session();
    const res = await c.post('/api/auth/logout', undefined, { csrf: false, headers: { 'x-csrf-token': 'nope.nope' } });
    expect((await res.json()).code).toBe('csrf_failed');
  });

  it('rejects a self-consistent but unsigned cookie/header pair (cookie tossing)', async () => {
    const c = createClient(srv.url);
    c.jar.set('ms_csrf', 'attacker.forged');
    const res = await c.post('/api/auth/logout');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('csrf_failed');
  });

  it('rejects cross-site and Origin-less mutations even with a valid token', async () => {
    const c = createClient(srv.url);
    await c.session();
    const cross = await c.post('/api/auth/logout', undefined, { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
    expect((await cross.json()).code).toBe('origin_rejected');
    const none = await c.post('/api/auth/logout', undefined, { origin: null });
    expect((await none.json()).code).toBe('origin_rejected');
  });

  it('accepts the configured APP_ORIGIN', async () => {
    const c = createClient(srv.url);
    await c.session();
    const res = await c.post('/api/auth/logout', undefined, { origin: 'http://app.example.test' });
    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('allows 10 login attempts per ip+email per 15 minutes, then 429 with Retry-After', async () => {
    const c = createClient(srv.url);
    await c.session();
    const email = uniqueEmail('limited');
    for (let i = 0; i < 10; i++) {
      expect((await c.post('/api/auth/login', { email, password: 'wrong password' })).status).toBe(401);
    }
    const blocked = await c.post('/api/auth/login', { email, password: 'wrong password' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await blocked.json()).code).toBe('rate_limited');
    // A different email from the same address is still allowed.
    expect((await c.post('/api/auth/login', { email: uniqueEmail(), password: 'wrong password' })).status).toBe(401);
  });
});

describe('security headers', () => {
  it('sends a strict CSP and hardening headers', async () => {
    const res = await fetch(`${srv.url}/api/health`);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("form-action 'self' https://checkout.stripe.com");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('strict-transport-security')).toBeNull(); // production only
  });
});
