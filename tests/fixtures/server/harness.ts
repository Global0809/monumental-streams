/**
 * Test harness for the server: boots createApp on an ephemeral port with a temp DATA_DIR and
 * a temp copy of the fixture media root, plus a tiny cookie-jar HTTP client that behaves like
 * the browser app (same-origin Origin header, X-CSRF-Token echo).
 */
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../server/config.ts';
import { createApp, type MonumentalApp } from '../../../server/index.ts';
import { silentLogger, type Logger } from '../../../server/log.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_CONTENT = path.join(here, 'content');
export const FIXTURE_MEDIA = path.join(here, 'media-root');

/** Bytes of the fake MPEG-TS segment written for every fixture media id (0x47 = TS sync byte). */
export const FAKE_SEGMENT = Buffer.from(Array.from({ length: 376 }, (_, i) => (i % 188 === 0 ? 0x47 : i % 256)));

export interface TestServer {
  url: string;
  app: MonumentalApp;
  root: string;
  mediaDir: string;
  close(): Promise<void>;
}

export interface StartOptions {
  env?: Record<string, string>;
  now?: () => Date;
  fetch?: typeof fetch;
  logger?: Logger;
  /** Extra files written (relative to the temp root) before the app starts, e.g. a dist/ build. */
  files?: Record<string, string>;
}

export async function startTestServer(options: StartOptions = {}): Promise<TestServer> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-server-test-'));
  const mediaDir = path.join(root, 'media');
  await cp(FIXTURE_MEDIA, mediaDir, { recursive: true });
  for (const key of ['free-film', 'premium-film']) {
    await writeFile(path.join(mediaDir, 'protected', key, '360', 'seg0.ts'), FAKE_SEGMENT);
  }
  for (const [rel, text] of Object.entries(options.files ?? {})) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), text);
  }

  const config = loadConfig({
    cwd: root,
    env: {
      NODE_ENV: 'test',
      DATA_DIR: path.join(root, 'data'),
      MEDIA_DIR: mediaDir,
      CONTENT_DIR: FIXTURE_CONTENT,
      DIST_DIR: path.join(root, 'dist'),
      APP_ORIGIN: 'http://app.example.test',
      ...options.env,
    },
  });
  const app = await createApp({ config, logger: options.logger ?? silentLogger, now: options.now, fetch: options.fetch });
  const server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    app,
    root,
    mediaDir,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Send X-CSRF-Token from the jar (default true for mutating requests). */
  csrf?: boolean;
  /** Origin header for mutating requests; null omits it. Defaults to the server's own origin. */
  origin?: string | null;
}

/** Browser-like client: keeps cookies, sends Origin + CSRF header on mutating requests. */
export function createClient(baseUrl: string) {
  const jar = new Map<string, string>();

  async function request(method: string, pathname: string, options: RequestOptions = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const mutating = method !== 'GET' && method !== 'HEAD';
    if (mutating) {
      const origin = options.origin === undefined ? baseUrl : options.origin;
      if (origin) headers.origin = origin;
      const csrf = jar.get('ms_csrf');
      if ((options.csrf ?? true) && csrf) headers['x-csrf-token'] = csrf;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }
    const res = await fetch(`${baseUrl}${pathname}`, { method, headers, body, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value || /expires=Thu, 01 Jan 1970/i.test(line) || /max-age=0\b/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  }

  return {
    jar,
    request,
    get: (p: string, o?: RequestOptions) => request('GET', p, o),
    post: (p: string, body?: unknown, o?: RequestOptions) => request('POST', p, { ...o, body }),
    put: (p: string, body?: unknown, o?: RequestOptions) => request('PUT', p, { ...o, body }),
    /** GET /api/session — the app does this first to obtain the CSRF cookie. */
    async session() {
      const res = await request('GET', '/api/session');
      return res.json();
    },
    async register(email: string, password = 'correct horse battery', name = 'Tester') {
      if (!jar.has('ms_csrf')) await this.session();
      return request('POST', '/api/auth/register', { body: { email, password, name } });
    },
  };
}

export type TestClient = ReturnType<typeof createClient>;

let counter = 0;
/** Unique email per call, so tests sharing a server never collide. */
export const uniqueEmail = (tag = 'user') => `${tag}-${Date.now().toString(36)}-${counter++}@example.test`;
