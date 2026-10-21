/**
 * Account form rules (mirrors the server's: email ≤ 254, password 10–1024, name ≤ 80) and
 * the post-sign-in redirect guard. Pure — unit-tested in tests/unit/acct-validate.test.ts.
 */

export type Mode = 'signin' | 'register';

export const parseMode = (v: string | null): Mode => (v === 'register' ? 'register' : 'signin');

export const PASSWORD_MIN = 10;

// Deliberately permissive: one @, something before it, a dot in the domain, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter your email address.';
  if (t.length > 254 || !EMAIL_RE.test(t)) return 'Enter an email address like name@example.com.';
  return null;
}

export function passwordError(v: string, mode: Mode): string | null {
  if (!v) return mode === 'register' ? `Choose a password of at least ${PASSWORD_MIN} characters.` : 'Enter your password.';
  if (v.length > 1024) return 'That password is too long.';
  if (v.length < PASSWORD_MIN)
    return mode === 'register'
      ? `Use at least ${PASSWORD_MIN} characters (${PASSWORD_MIN - v.length} more).`
      : `Passwords here are at least ${PASSWORD_MIN} characters — check for a typo.`;
  return null;
}

export function nameError(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter the name you’d like us to use.';
  if (t.length > 80) return 'Use 80 characters or fewer.';
  return null;
}

export interface FormValues {
  name: string;
  email: string;
  password: string;
}

export function validate(values: FormValues, mode: Mode): Partial<Record<keyof FormValues, string>> {
  const out: Partial<Record<keyof FormValues, string>> = {};
  if (mode === 'register') {
    const n = nameError(values.name);
    if (n) out.name = n;
  }
  const e = emailError(values.email);
  if (e) out.email = e;
  const p = passwordError(values.password, mode);
  if (p) out.password = p;
  return out;
}

/**
 * Where to go after signing in: only same-origin app paths. Rejects absolute URLs,
 * protocol-relative "//host", backslash tricks, control characters and the account page itself.
 */
export function safeNext(next: string | null | undefined, fallback = '/my-world'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const base = 'https://monumental.invalid';
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    if (u.pathname === '/account') return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

/** Viewer-safe wording for auth failures — never echoes raw server detail. */
export function authErrorMessage(err: unknown, mode: Mode): string {
  const e = (err ?? {}) as { status?: number; code?: string };
  switch (e.code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'registration_failed':
      return 'We couldn’t create an account with those details. If you already have an account, sign in instead.';
    case 'invalid_request':
      return 'Some details weren’t accepted. Check the fields and try again.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'csrf_failed':
    case 'origin_rejected':
      return 'A security check failed. Refresh the page and try again.';
    case 'network':
      return 'The connection dropped. Check your network and try again.';
    default:
      if (e.status === 0) return 'The connection dropped. Check your network and try again.';
      return mode === 'register' ? 'We couldn’t create your account just now. Please try again.' : 'We couldn’t sign you in just now. Please try again.';
  }
}
