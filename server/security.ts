/**
 * Transport-level protections: security headers (strict CSP), CSRF defence and a small
 * in-memory rate limiter.
 *
 * CSRF uses a *signed* double-submit cookie: `ms_csrf` = nonce.HMAC(SESSION_SECRET, nonce),
 * readable by JS, echoed in the X-CSRF-Token header. The signature stops a sibling
 * subdomain from planting a forged cookie; the Origin check rejects cross-site requests
 * outright. Stripe's webhook is mounted ahead of this check (server/index.ts) because it is
 * authenticated by its own signature.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { HttpError, cookie } from './http.ts';

export const CSRF_COOKIE = 'ms_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:", // hls.js runs its transmuxer in a blob: worker
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
].join('; ');

export function securityHeaders(production: boolean): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Origin of the request as the browser declared it (Origin, else Referer), or null. */
function declaredOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin && origin !== 'null') return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Same-origin means: the configured APP_ORIGIN, or the host this request was addressed to
 * (covers the Vite dev proxy and direct access to the API port). The scheme is ignored for
 * the host comparison so TLS-terminating proxies without TRUST_PROXY still work.
 */
export function isSameOrigin(req: Request, appOrigin: string): boolean {
  const origin = declaredOrigin(req);
  if (!origin) return false;
  if (origin === appOrigin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

export interface Csrf {
  /** Returns the request's valid CSRF token, issuing a fresh cookie when missing or invalid. */
  ensure(req: Request, res: Response): string;
  /** Middleware: rejects mutating requests without a matching token and same-origin Origin. */
  protect(appOrigin: string): RequestHandler;
}

export function createCsrf(secret: string, secureCookie: boolean): Csrf {
  const sign = (nonce: string) => createHmac('sha256', secret).update(`csrf:${nonce}`).digest('base64url');
  const valid = (token: string | undefined): token is string => {
    if (!token) return false;
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    return safeEqual(token.slice(dot + 1), sign(token.slice(0, dot)));
  };

  return {
    ensure(req, res) {
      const existing = cookie(req, CSRF_COOKIE);
      if (valid(existing)) return existing;
      const nonce = randomBytes(18).toString('base64url');
      const token = `${nonce}.${sign(nonce)}`;
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false, // the client reads it to echo in X-CSRF-Token
        sameSite: 'lax',
        secure: secureCookie,
        path: '/',
        maxAge: 30 * 24 * 3600 * 1000,
      });
      return token;
    },
    protect(appOrigin) {
      return (req, _res, next) => {
        if (!MUTATING.has(req.method)) return next();
        if (!isSameOrigin(req, appOrigin)) {
          return next(new HttpError(403, 'origin_rejected', 'This request did not come from the Monumental Streams app.'));
        }
        const header = req.get(CSRF_HEADER);
        const stored = cookie(req, CSRF_COOKIE);
        if (!header || !valid(stored) || !safeEqual(header, stored)) {
          return next(new HttpError(403, 'csrf_failed', 'Security check failed. Refresh the page and try again.'));
        }
        next();
      };
    },
  };
}

export interface RateLimiter {
  /** Counts one hit for `key`; returns whether it is allowed and seconds until the window resets. */
  hit(key: string, now?: number): { allowed: boolean; retryAfter: number };
}

/** Fixed-window counter per key. In-memory, per process — adequate for a single node. */
export function createRateLimiter(windowMs: number, max: number): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;
  return {
    hit(key, now = Date.now()) {
      if (now - lastSweep > windowMs) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        lastSweep = now;
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count++;
      return { allowed: w.count <= max, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
    },
  };
}

/** Throws a 429 HttpError (and sets Retry-After) when any of the given limiter/key pairs is exhausted. */
export function enforceRateLimit(res: Response, checks: [RateLimiter, string][]) {
  for (const [limiter, key] of checks) {
    const { allowed, retryAfter } = limiter.hit(key);
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a moment and try again.', { retryAfter });
    }
  }
}
