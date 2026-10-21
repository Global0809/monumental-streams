import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rewritePlaylist, signPlaybackToken, verifyPlaybackToken } from '../../server/playback.ts';
import { FAKE_SEGMENT, createClient, startTestServer, uniqueEmail, type TestClient, type TestServer } from '../fixtures/server/harness.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.close();
});

interface PlaybackResponse {
  hls?: string;
  mp4: string;
  captions: { src: string }[];
  chapters?: string;
  expiresAt: string;
}

async function play(c: TestClient, ref: string) {
  if (!c.jar.has('ms_csrf')) await c.session();
  return c.post(`/api/playback/${encodeURIComponent(ref)}`);
}

const tokenOf = (url: string) => new URL(url, 'http://x').searchParams.get('t')!;

/** Raw GET that bypasses WHATWG URL normalisation (so "../" reaches the server verbatim). */
function rawGet(pathname: string): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(srv.url);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path: pathname }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

describe('playback tokens', () => {
  const secret = 'unit-test-secret';
  const now = 1_800_000_000;

  it('round-trips claims and rejects tampering, wrong secrets and expiry', () => {
    const token = signPlaybackToken(secret, { m: 'media:a', s: 'anon', p: 0, e: now + 60 });
    expect(verifyPlaybackToken(secret, token, now)).toEqual({ ok: true, claims: { m: 'media:a', s: 'anon', p: 0, e: now + 60 } });
    expect(verifyPlaybackToken('other-secret', token, now)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyPlaybackToken(secret, token, now + 60)).toEqual({ ok: false, reason: 'expired' });

    // Re-encode the payload as premium for another media id, keeping the original signature.
    const [, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ m: 'media:b', s: 'anon', p: 1, e: now + 60 })).toString('base64url')}.${sig}`;
    expect(verifyPlaybackToken(secret, forged, now)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyPlaybackToken(secret, 'not-a-token', now)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rewrites URI lines and URI attributes but never absolute URLs', () => {
    const out = rewritePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nseg.m4s?x=1\nhttps://cdn.example/a.ts\n//cdn.example/b.ts\n', 'TOK');
    expect(out).toBe('#EXTM3U\n#EXT-X-MAP:URI="init.mp4?t=TOK"\n#EXTINF:4,\nseg.m4s?x=1&t=TOK\nhttps://cdn.example/a.ts\n//cdn.example/b.ts\n');
  });
});

describe('free playback', () => {
  it('returns signed stream URLs for a free video by slug or id', async () => {
    const c = createClient(srv.url);
    const res = await play(c, 'free-film');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as PlaybackResponse;
    expect(body.hls).toMatch(/^\/stream\/free-film\/master\.m3u8\?t=[\w-]+\.[\w-]+$/);
    expect(body.mp4).toMatch(/^\/stream\/free-film\/360\.mp4\?t=/);
    expect(body.captions[0].src).toBe('/media/public/captions/free-film.en.vtt');
    expect(body.chapters).toBe('/media/public/captions/free-film.chapters.vtt');
    const ttl = Date.parse(body.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(4 * 3600_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(4 * 3600_000);
    const claims = verifyPlaybackToken(srv.app.ctx.config.playbackTokenSecret, tokenOf(body.mp4), Math.floor(Date.now() / 1000));
    expect(claims).toMatchObject({ ok: true, claims: { m: 'media:free-film', s: 'anon', p: 0 } });

    expect((await play(c, 'video:free-film')).status).toBe(200);
  });

  it('answers 404 for unknown videos and 409 for videos without playable media', async () => {
    const c = createClient(srv.url);
    const unknown = await play(c, 'no-such-video');
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).code).toBe('not_found');
    expect((await play(c, 'place:miami')).status).toBe(404); // ids of other kinds are not videos
    const planned = await play(c, 'planned-film');
    expect(planned.status).toBe(409);
    expect((await planned.json()).code).toBe('unavailable');
  });

  it('serves the HLS ladder with every URI carrying the token', async () => {
    const c = createClient(srv.url);
    const { hls } = (await (await play(c, 'free-film')).json()) as PlaybackResponse;
    const token = tokenOf(hls!);

    const master = await fetch(`${srv.url}${hls}`);
    expect(master.status).toBe(200);
    expect(master.headers.get('content-type')).toMatch(/^application\/vnd\.apple\.mpegurl/);
    expect(master.headers.get('cache-control')).toMatch(/^private/);
    const text = await master.text();
    expect(text).toContain(`URI="subs/en.m3u8?t=${token}"`);
    expect(text).toContain(`\n360/index.m3u8?t=${token}`);
    expect(text).toContain('\nhttps://cdn.example.invalid/720/index.m3u8\n'); // foreign host: untouched
    for (const line of text.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('https://'))) {
      expect(line).toContain(`t=${token}`);
    }

    const variantUrl = new URL(`360/index.m3u8?t=${token}`, `${srv.url}${hls}`);
    const variant = await (await fetch(variantUrl)).text();
    expect(variant).toContain(`seg0.ts?t=${token}`);

    const seg = await fetch(new URL(`seg0.ts?t=${token}`, variantUrl));
    expect(seg.status).toBe(200);
    expect(seg.headers.get('content-type')).toBe('video/mp2t');
    expect(seg.headers.get('cache-control')).toMatch(/^private/);
    expect(seg.headers.get('content-encoding')).toBeNull();
    expect(Buffer.from(await seg.arrayBuffer())).toEqual(FAKE_SEGMENT);
  });

  it('supports Range requests on segments and MP4', async () => {
    const c = createClient(srv.url);
    const { mp4, hls } = (await (await play(c, 'free-film')).json()) as PlaybackResponse;
    const seg = await fetch(`${srv.url}/stream/free-film/360/seg0.ts?t=${tokenOf(hls!)}`, { headers: { range: 'bytes=0-9' } });
    expect(seg.status).toBe(206);
    expect(seg.headers.get('content-range')).toBe(`bytes 0-9/${FAKE_SEGMENT.length}`);
    expect(Buffer.from(await seg.arrayBuffer())).toEqual(FAKE_SEGMENT.subarray(0, 10));

    const video = await fetch(`${srv.url}${mp4}`, { headers: { range: 'bytes=0-6' } });
    expect(video.status).toBe(206);
    expect(video.headers.get('content-type')).toBe('video/mp4');
    expect(await video.text()).toBe('FIXTURE');
  });
});

describe('stream token enforcement', () => {
  let token: string;
  beforeAll(async () => {
    token = tokenOf(((await (await play(createClient(srv.url), 'free-film')).json()) as PlaybackResponse).mp4);
  });

  const status = async (url: string) => {
    const res = await fetch(`${srv.url}${url}`);
    return { status: res.status, code: (await res.json()).code as string };
  };

  it('requires a token', async () => {
    expect(await status('/stream/free-film/360.mp4')).toEqual({ status: 403, code: 'invalid_token' });
  });

  it('rejects a tampered token', async () => {
    const flipped = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    expect(await status(`/stream/free-film/360.mp4?t=${flipped}`)).toEqual({ status: 403, code: 'invalid_token' });
    const [body] = token.split('.');
    expect(await status(`/stream/free-film/360.mp4?t=${body}.${'x'.repeat(43)}`)).toEqual({ status: 403, code: 'invalid_token' });
  });

  it('rejects an expired token', async () => {
    const expired = signPlaybackToken(srv.app.ctx.config.playbackTokenSecret, {
      m: 'media:free-film',
      s: 'anon',
      p: 0,
      e: Math.floor(Date.now() / 1000) - 1,
    });
    expect(await status(`/stream/free-film/360.mp4?t=${expired}`)).toEqual({ status: 403, code: 'token_expired' });
  });

  it('rejects a token issued for different media', async () => {
    expect(await status(`/stream/premium-film/360.mp4?t=${token}`)).toEqual({ status: 403, code: 'invalid_token' });
  });

  it('rejects path traversal in every encoding', async () => {
    for (const p of [
      `/stream/free-film/../../not-public.txt?t=${token}`,
      `/stream/free-film/..%2f..%2fnot-public.txt?t=${token}`,
      `/stream/free-film/..%5c..%5cnot-public.txt?t=${token}`,
      `/stream/free-film/%2e%2e/%2e%2e/not-public.txt?t=${token}`,
      `/stream/..%2f..%2fnot-public.txt/x.mp4?t=${token}`,
      `/stream/free-film/.hidden.mp4?t=${token}`,
    ]) {
      const res = await rawGet(p);
      expect(res.status, p).toBe(400);
      expect(JSON.parse(res.body).code, p).toBe('bad_path');
    }
  });

  it('only serves media file types', async () => {
    expect((await fetch(`${srv.url}/stream/free-film/master.txt?t=${token}`)).status).toBe(404);
  });
});

describe('premium playback and the dev membership preview', () => {
  it('requires membership, then grants it via dev preview, bound to the member’s session', async () => {
    const anon = createClient(srv.url);
    const anonRes = await play(anon, 'premium-film');
    expect(anonRes.status).toBe(403);
    expect(await anonRes.json()).toMatchObject({ code: 'premium_required', signedIn: false });

    const member = createClient(srv.url);
    await member.register(uniqueEmail('member'));
    const denied = await play(member, 'premium-film');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'premium_required', signedIn: true });

    const upgraded = await member.post('/api/dev/membership', { status: 'dev_preview' });
    expect(upgraded.status).toBe(200);
    expect((await upgraded.json()).membership).toEqual({ status: 'dev_preview', premium: true, periodEnd: null, source: 'dev-preview' });

    const granted = await play(member, 'premium-film');
    expect(granted.status).toBe(200);
    const { hls, mp4 } = (await granted.json()) as PlaybackResponse;
    const claims = verifyPlaybackToken(srv.app.ctx.config.playbackTokenSecret, tokenOf(mp4), Math.floor(Date.now() / 1000));
    expect(claims).toMatchObject({ ok: true, claims: { m: 'media:premium-film', p: 1 } });

    expect((await member.get(hls!)).status).toBe(200);
    expect((await member.get(mp4)).status).toBe(200);
    // The same URL without the member's session, or with someone else's, is refused.
    expect((await fetch(`${srv.url}${mp4}`)).status).toBe(403);
    const other = createClient(srv.url);
    await other.register(uniqueEmail('other'));
    expect((await other.get(mp4)).status).toBe(403);

    // Lapsing membership revokes outstanding premium URLs immediately.
    const expired = await member.post('/api/dev/membership', { status: 'expired' });
    expect((await expired.json()).membership).toMatchObject({ status: 'expired', premium: false, source: 'dev-preview' });
    const revoked = await member.get(mp4);
    expect(revoked.status).toBe(403);
    expect((await revoked.json()).code).toBe('premium_required');

    // Cancelled keeps premium until the period end (+7 days in the preview).
    const cancelled = await (await member.post('/api/dev/membership', { status: 'cancelled' })).json();
    expect(cancelled.membership).toMatchObject({ status: 'cancelled', premium: true });
    expect(Date.parse(cancelled.membership.periodEnd)).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    expect((await member.get(mp4)).status).toBe(200);

    for (const s of ['past_due', 'none'] as const) {
      const r = await (await member.post('/api/dev/membership', { status: s })).json();
      expect(r.membership).toMatchObject({ status: s, premium: false });
    }
  });

  it('validates the dev membership request', async () => {
    const anon = createClient(srv.url);
    await anon.session();
    expect((await anon.post('/api/dev/membership', { status: 'dev_preview' })).status).toBe(401);
    const user = createClient(srv.url);
    await user.register(uniqueEmail());
    expect((await user.post('/api/dev/membership', { status: 'active' })).status).toBe(400); // real "active" needs Stripe
  });
});

describe('dev preview disabled', () => {
  let off: TestServer;
  beforeAll(async () => {
    off = await startTestServer({ env: { DEV_PREVIEW_MEMBERSHIP: 'false' } });
  });
  afterAll(async () => {
    await off.close();
  });

  it('does not mount the switcher and ignores preview rows already in the database', async () => {
    const c = createClient(off.url);
    const info = await (await c.register(uniqueEmail())).json();
    const res = await c.post('/api/dev/membership', { status: 'dev_preview' });
    expect(res.status).toBe(404);
    expect((await (await fetch(`${off.url}/api/config`)).json()).billing.devPreviewEnabled).toBe(false);

    off.app.ctx.db.memberships.save({
      user_id: info.user.id,
      status: 'dev_preview',
      source: 'dev-preview',
      period_end: null,
      stripe_customer: null,
      stripe_subscription: null,
      stripe_event_at: null,
      updated_at: Date.now(),
    });
    expect((await c.session()).membership).toMatchObject({ status: 'none', premium: false });
    expect((await play(c, 'premium-film')).status).toBe(403);
  });
});
