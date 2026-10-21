/**
 * Small HTTP helpers shared by the route modules: a typed error that the central error
 * handler turns into `{ code, message }` JSON, and a dependency-free cookie parser.
 */
import type { Request } from 'express';

/** Throw (or pass to next) from any handler; rendered as `status { code, message, ...extra }`. */
export class HttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message?: string, extra?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Parses a Cookie header. Malformed pairs are skipped; the first occurrence of a name wins. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function cookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

/** Client address as Express sees it (honours TRUST_PROXY via app 'trust proxy'). */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
