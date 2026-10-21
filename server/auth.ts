/**
 * Accounts and sessions.
 *
 * - Passwords: scrypt (N=2^15, r=8, p=1) with a per-user 16-byte salt, stored as
 *   `scrypt$N$r$p$salt$hash` so parameters can be raised later; compared with timingSafeEqual.
 * - Sessions: 32 random bytes in the HttpOnly `ms_sid` cookie; only sha256(token) is stored.
 *   30-day lifetime, extended (rolling) at most once a day.
 * - Errors are deliberately generic so responses do not reveal which emails have accounts.
 */
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { SessionInfo } from '../shared/types.ts';
import type { AppContext } from './context.ts';
import type { UserRow } from './db.ts';
import { entitlementFor } from './entitlements.ts';
import { HttpError, clientIp, cookie } from './http.ts';
import { enforceRateLimit } from './security.ts';

export const SESSION_COOKIE = 'ms_sid';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const SESSION_REFRESH_MS = 24 * 3600 * 1000;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAXMEM,
  });
  return timingSafeEqual(key, expected);
}

/** A real hash of a random secret: verifying against it costs the same as a real login. */
let dummyHash: Promise<string> | undefined;
const timingDecoy = () => (dummyHash ??= hashPassword(randomBytes(24).toString('base64')));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/* ───────────── per-request session state (stored on res.locals) ───────────── */

interface AuthLocals {
  user: UserRow | null;
  sessionHash: string | null;
}

function authLocals(res: Response): AuthLocals {
  return (res.locals.auth as AuthLocals | undefined) ?? { user: null, sessionHash: null };
}

export function currentUser(res: Response): UserRow | null {
  return authLocals(res).user;
}

/** Throws 401 when signed out. */
export function requireUser(res: Response): UserRow {
  const user = currentUser(res);
  if (!user) throw new HttpError(401, 'auth_required', 'Sign in to continue.');
  return user;
}

function sessionCookieOptions(ctx: AppContext) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: ctx.config.production, path: '/' };
}

/** Issues a fresh session token. Any session the request already carried is revoked (prevents fixation). */
function startSession(ctx: AppContext, res: Response, user: UserRow) {
  const previous = authLocals(res).sessionHash;
  if (previous) ctx.db.sessions.delete(previous);
  const token = randomBytes(32).toString('base64url');
  const now = ctx.now().getTime();
  const tokenHash = sha256(token);
  ctx.db.sessions.insert({ token_hash: tokenHash, user_id: user.id, created_at: now, expires_at: now + SESSION_TTL_MS, refreshed_at: now });
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(ctx), maxAge: SESSION_TTL_MS });
  res.locals.auth = { user, sessionHash: tokenHash } satisfies AuthLocals;
}

function endSession(ctx: AppContext, res: Response) {
  const { sessionHash } = authLocals(res);
  if (sessionHash) ctx.db.sessions.delete(sessionHash);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(ctx));
  res.locals.auth = { user: null, sessionHash: null } satisfies AuthLocals;
}

/** Resolves the `ms_sid` cookie to a user for every request, extending the session when due. */
export function sessionMiddleware(ctx: AppContext): RequestHandler {
  return (req, res, next) => {
    const token = cookie(req, SESSION_COOKIE);
    res.locals.auth = { user: null, sessionHash: null } satisfies AuthLocals;
    if (!token) return next();

    const now = ctx.now().getTime();
    const tokenHash = sha256(token);
    const session = ctx.db.sessions.find(tokenHash);
    const user = session && session.expires_at > now ? ctx.db.users.byId(session.user_id) : undefined;
    if (!session || !user) {
      if (session) ctx.db.sessions.delete(tokenHash);
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions(ctx));
      return next();
    }
    if (now - session.refreshed_at > SESSION_REFRESH_MS) {
      ctx.db.sessions.extend(tokenHash, now + SESSION_TTL_MS, now);
      res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(ctx), maxAge: SESSION_TTL_MS });
    }
    res.locals.auth = { user, sessionHash: tokenHash } satisfies AuthLocals;
    next();
  };
}

/** The SessionInfo contract for the current request (also guarantees a CSRF cookie). */
export function sessionInfo(ctx: AppContext, req: Request, res: Response): SessionInfo {
  const user = currentUser(res);
  return {
    user: user ? { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } : null,
    membership: entitlementFor(ctx.db, user?.id ?? null, ctx.policy, ctx.now()),
    csrf: ctx.csrf.ensure(req, res),
  };
}

/* ───────────── routes ───────────── */

const email = z
  .string({ required_error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.');

const RegisterBody = z.object({
  email,
  password: z
    .string({ required_error: 'Choose a password.' })
    .min(10, 'Use at least 10 characters for your password.')
    .max(1024, 'That password is too long.'),
  name: z.string().trim().max(80, 'Use 80 characters or fewer for your name.').optional(),
});

const LoginBody = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(1024) });

const INVALID_CREDENTIALS = 'Email or password is incorrect.';

function parseBody<T>(schema: z.ZodType<T>, body: unknown, fallbackMessage: string): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, 'invalid_request', parsed.error.issues[0]?.message ?? fallbackMessage);
  return parsed.data;
}

function limitAuth(ctx: AppContext, req: Request, res: Response, emailAddress: string) {
  const ip = clientIp(req);
  enforceRateLimit(res, [
    [ctx.limits.authPerIp, ip],
    [ctx.limits.authPerIdentity, `${ip}|${emailAddress}`],
  ]);
}

export function authRouter(ctx: AppContext) {
  const router = express.Router();
  // Compute the decoy now so even the first unknown-email login costs exactly one hash.
  void timingDecoy();

  router.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(sessionInfo(ctx, req, res));
  });

  router.post('/auth/register', async (req, res) => {
    const body = parseBody(RegisterBody, req.body, 'Check your details and try again.');
    limitAuth(ctx, req, res, body.email);
    // Hash before the existence check so both outcomes cost the same.
    const password = await hashPassword(body.password);
    const user: UserRow = {
      id: randomUUID(),
      email: body.email,
      name: body.name || body.email.split('@')[0],
      password,
      created_at: ctx.now().toISOString(),
    };
    try {
      if (ctx.db.users.byEmail(user.email)) throw new Error('exists');
      ctx.db.users.insert(user); // UNIQUE(email) also catches a concurrent duplicate
    } catch {
      throw new HttpError(400, 'registration_failed', 'We couldn’t create an account with those details. If you already have an account, sign in instead.');
    }
    startSession(ctx, res, user);
    res.status(201).json(sessionInfo(ctx, req, res));
  });

  router.post('/auth/login', async (req, res) => {
    const parsed = LoginBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(401, 'invalid_credentials', INVALID_CREDENTIALS);
    const body = parsed.data;
    limitAuth(ctx, req, res, body.email);
    const user = ctx.db.users.byEmail(body.email);
    const ok = user ? await verifyPassword(body.password, user.password) : (await verifyPassword(body.password, await timingDecoy()), false);
    if (!user || !ok) throw new HttpError(401, 'invalid_credentials', INVALID_CREDENTIALS);
    startSession(ctx, res, user);
    res.json(sessionInfo(ctx, req, res));
  });

  router.post('/auth/logout', (req, res) => {
    endSession(ctx, res);
    res.json(sessionInfo(ctx, req, res));
  });

  return router;
}
