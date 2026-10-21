/**
 * Server configuration from environment variables (see .env.example for documentation).
 *
 * - `.env` in the working directory is loaded with process.loadEnvFile when present; real
 *   environment variables always win over the file.
 * - Development auto-generates SESSION_SECRET / PLAYBACK_TOKEN_SECRET and persists them in
 *   DATA_DIR/dev-secrets.json so sessions and playback tokens survive restarts.
 * - Production refuses to start without both secrets, and the dev membership preview is
 *   forced off regardless of DEV_PREVIEW_MEMBERSHIP.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type Env = Record<string, string | undefined>;

export interface StripeConfig {
  secretKey: string | null;
  webhookSecret: string | null;
  priceMonthly: string | null;
  priceYearly: string | null;
}

export interface ServerConfig {
  env: 'development' | 'production' | 'test';
  production: boolean;
  port: number;
  host: string;
  /** Public origin of the web app (used for Origin checks and Stripe redirect URLs). */
  appOrigin: string;
  sessionSecret: string;
  playbackTokenSecret: string;
  dataDir: string;
  mediaDir: string;
  contentDir: string;
  distDir: string;
  stripe: StripeConfig;
  /** Dev-only membership switcher (POST /api/dev/membership). Always false in production. */
  devPreviewMembership: boolean;
  /** Passed to Express 'trust proxy'. */
  trustProxy: boolean | number | string;
  /** Non-fatal configuration notes, logged once at startup. */
  warnings: string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const MIN_SECRET_LENGTH = 32;

const str = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

function parseBool(name: string, v: string | undefined, fallback: boolean): boolean {
  const t = str(v)?.toLowerCase();
  if (t === null || t === undefined) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(t)) return true;
  if (['0', 'false', 'no', 'off'].includes(t)) return false;
  throw new ConfigError(`${name} must be true or false (got "${v}")`);
}

function parsePort(v: string | undefined): number {
  const t = str(v);
  if (t === null) return 8787;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new ConfigError(`PORT must be an integer 0–65535 (got "${v}")`);
  return n;
}

function parseTrustProxy(v: string | undefined): boolean | number | string {
  const t = str(v);
  if (t === null) return false;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^\d+$/.test(t)) return Number(t);
  return t; // e.g. "loopback, 10.0.0.0/8"
}

function parseOrigin(name: string, v: string): string {
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
    return u.origin;
  } catch {
    throw new ConfigError(`${name} must be an absolute http(s) origin such as https://streams.example (got "${v}")`);
  }
}

interface DevSecrets {
  sessionSecret: string;
  playbackTokenSecret: string;
}

/** Reads (or creates) DATA_DIR/dev-secrets.json. Development only. */
function devSecrets(dataDir: string): DevSecrets {
  const file = path.join(dataDir, 'dev-secrets.json');
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DevSecrets>;
    if (typeof parsed.sessionSecret === 'string' && typeof parsed.playbackTokenSecret === 'string') {
      return { sessionSecret: parsed.sessionSecret, playbackTokenSecret: parsed.playbackTokenSecret };
    }
  }
  const fresh: DevSecrets = {
    sessionSecret: randomBytes(32).toString('base64url'),
    playbackTokenSecret: randomBytes(32).toString('base64url'),
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(fresh, null, 2)}\n`, { mode: 0o600 });
  return fresh;
}

export interface LoadConfigOptions {
  /** Environment to read. Defaults to process.env (after loading `.env` when present). */
  env?: Env;
  /** Base directory for relative paths and the `.env` file. Defaults to process.cwd(). */
  cwd?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): ServerConfig {
  const cwd = options.cwd ?? process.cwd();
  let env = options.env;
  if (!env) {
    const envFile = path.join(cwd, '.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    env = process.env;
  }

  const warnings: string[] = [];
  const nodeEnv = str(env.NODE_ENV);
  const mode: ServerConfig['env'] = nodeEnv === 'production' ? 'production' : nodeEnv === 'test' ? 'test' : 'development';
  const production = mode === 'production';
  // MS_API_PORT wins so a dev launcher that exports PORT for the web server cannot collide with the API.
  const port = parsePort(env.MS_API_PORT ?? (process.argv.includes('--dev-api') ? '8787' : env.PORT));
  const dir = (v: string | undefined, fallback: string) => path.resolve(cwd, str(v) ?? fallback);
  const dataDir = dir(env.DATA_DIR, './data');

  let appOrigin: string;
  const rawOrigin = str(env.APP_ORIGIN);
  if (rawOrigin) appOrigin = parseOrigin('APP_ORIGIN', rawOrigin);
  else if (production) {
    appOrigin = `http://localhost:${port}`;
    warnings.push(`APP_ORIGIN is not set; assuming ${appOrigin}. Set it to the public https origin in production.`);
  } else appOrigin = 'http://localhost:5173';

  let sessionSecret = str(env.SESSION_SECRET);
  let playbackTokenSecret = str(env.PLAYBACK_TOKEN_SECRET);
  if (production) {
    const missing = [!sessionSecret && 'SESSION_SECRET', !playbackTokenSecret && 'PLAYBACK_TOKEN_SECRET'].filter(Boolean);
    if (missing.length) throw new ConfigError(`Refusing to start in production without ${missing.join(' and ')}.`);
    for (const [name, value] of [['SESSION_SECRET', sessionSecret], ['PLAYBACK_TOKEN_SECRET', playbackTokenSecret]] as const) {
      if (value!.length < MIN_SECRET_LENGTH) throw new ConfigError(`${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
    }
  } else if (!sessionSecret || !playbackTokenSecret) {
    const generated = devSecrets(dataDir);
    sessionSecret ??= generated.sessionSecret;
    playbackTokenSecret ??= generated.playbackTokenSecret;
  }

  const devPreviewRequested = parseBool('DEV_PREVIEW_MEMBERSHIP', env.DEV_PREVIEW_MEMBERSHIP, !production);
  if (production && devPreviewRequested) warnings.push('DEV_PREVIEW_MEMBERSHIP is ignored in production.');

  return {
    env: mode,
    production,
    port,
    host: str(env.HOST) ?? (production ? '0.0.0.0' : '127.0.0.1'),
    appOrigin,
    sessionSecret: sessionSecret!,
    playbackTokenSecret: playbackTokenSecret!,
    dataDir,
    mediaDir: dir(env.MEDIA_DIR, './media'),
    contentDir: dir(env.CONTENT_DIR, './content'),
    distDir: dir(env.DIST_DIR, './dist'),
    stripe: {
      secretKey: str(env.STRIPE_SECRET_KEY),
      webhookSecret: str(env.STRIPE_WEBHOOK_SECRET),
      priceMonthly: str(env.STRIPE_PRICE_MONTHLY),
      priceYearly: str(env.STRIPE_PRICE_YEARLY),
    },
    devPreviewMembership: devPreviewRequested && !production,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    warnings,
  };
}
