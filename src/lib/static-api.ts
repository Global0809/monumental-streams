/**
 * Static hosting mode (GitHub Pages). There is no Node server, so this shim answers the API
 * in the browser from files baked at build time (scripts/build-static.ts):
 *   /api/catalogue  → static/catalogue.json
 *   /api/playback   → static/playback.json (direct MP4 files; premium stays locked)
 *   /api/session, /api/config, /api/activity → guest / static answers
 *   accounts, sync, billing → an honest "needs the full server" error
 * It also prefixes the site's base path onto absolute /data and /media URLs.
 * Enabled only when built with VITE_STATIC=1.
 */
const BASE = import.meta.env.BASE_URL; // e.g. "/monumental-streams/"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let playback: Promise<Record<string, { mp4: string; captions: unknown[]; chapters?: string; thumbnails?: string; premium: boolean }>> | null = null;

const NEEDS_SERVER = {
  code: 'static_demo',
  message: 'Accounts, sync and payments need the full Monumental server. This GitHub Pages demo runs in guest mode — your library is kept in this browser.',
};

export function installStaticApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return realFetch(input, init);
    const p = url.pathname;
    if (p.startsWith('/data/') || p.startsWith('/media/')) return realFetch(BASE + p.slice(1) + url.search, init);
    if (!p.startsWith('/api/')) return realFetch(input, init);

    const method = (init?.method ?? 'GET').toUpperCase();
    if (p === '/api/catalogue') return realFetch(`${BASE}static/catalogue.json`);
    if (p === '/api/session') return json(200, { user: null, membership: { status: 'none', premium: false, periodEnd: null, source: null }, csrf: '' });
    if (p === '/api/config')
      return json(200, {
        billing: { mode: 'setup-pending', devPreviewEnabled: false },
        sync: { mode: 'server' },
        environment: 'production',
        integrations: [
          { id: 'hosting', name: 'Static demo (GitHub Pages)', status: 'connected', detail: 'Guest mode: everything plays and saves in this browser. Accounts, sync and Premium need the Node server.' },
          { id: 'stripe', name: 'Stripe billing', status: 'not-configured', detail: 'No payment can be taken.' },
          { id: 'activity', name: 'Current activity feed', status: 'not-connected', detail: 'No maintained activity yet.' },
        ],
      });
    if (p === '/api/activity') return json(200, { items: [], external: [] });
    if (p.startsWith('/api/playback/') && method === 'POST') {
      playback ??= realFetch(`${BASE}static/playback.json`).then((r) => r.json());
      const map = await playback;
      const key = decodeURIComponent(p.slice('/api/playback/'.length));
      const entry = map[key] ?? map[`video:${key}`];
      if (!entry) return json(409, { code: 'unavailable', message: 'This title has no published media yet.' });
      if (entry.premium) return json(403, { code: 'premium_required', signedIn: false, message: 'Premium titles need an account on the full server.' });
      return json(200, { mp4: entry.mp4, captions: entry.captions, chapters: entry.chapters, thumbnails: entry.thumbnails, expiresAt: new Date(Date.now() + 864e5).toISOString() });
    }
    if (p === '/api/me/library') return json(401, { code: 'signed_out' });
    if (p.startsWith('/api/billing')) return json(503, { code: 'billing_setup_pending', message: 'Payments are not connected.' });
    return json(503, NEEDS_SERVER);
  };
}
