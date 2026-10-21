import { describe, expect, it } from 'vitest';
import { authErrorMessage, emailError, nameError, parseMode, passwordError, safeNext, validate } from '../../src/features/account/validate.ts';

describe('account validation', () => {
  it('checks email format', () => {
    expect(emailError('')).toMatch(/Enter your email/);
    expect(emailError('nope')).toMatch(/like name@example.com/);
    expect(emailError('a@b')).not.toBeNull();
    expect(emailError(' reviewer+1@example.test ')).toBeNull();
  });

  it('requires 10+ character passwords', () => {
    expect(passwordError('', 'register')).toMatch(/at least 10/);
    expect(passwordError('short', 'register')).toMatch(/5 more/);
    expect(passwordError('short', 'signin')).toMatch(/typo/);
    expect(passwordError('long-enough-pass', 'register')).toBeNull();
  });

  it('requires a name of 80 characters or fewer when registering', () => {
    expect(nameError('  ')).not.toBeNull();
    expect(nameError('x'.repeat(81))).toMatch(/80/);
    expect(nameError('Ada')).toBeNull();
    expect(validate({ name: '', email: 'a@b.co', password: 'abcdefghij' }, 'signin')).toEqual({});
    expect(Object.keys(validate({ name: '', email: 'bad', password: '' }, 'register')).sort()).toEqual(['email', 'name', 'password']);
  });

  it('parses the mode', () => {
    expect(parseMode('register')).toBe('register');
    expect(parseMode('signin')).toBe('signin');
    expect(parseMode('evil')).toBe('signin');
    expect(parseMode(null)).toBe('signin');
  });
});

describe('safeNext', () => {
  it('allows same-origin app paths', () => {
    expect(safeNext('/membership')).toBe('/membership');
    expect(safeNext('/my-world?tab=saved#x')).toBe('/my-world?tab=saved#x');
  });
  it('rejects anything that could leave the app', () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', 'evil', '/\nx', '']) {
      expect(safeNext(bad)).toBe('/my-world');
    }
    expect(safeNext(null)).toBe('/my-world');
    expect(safeNext('/account?mode=signin')).toBe('/my-world');
  });
});

describe('authErrorMessage', () => {
  it('maps server codes to generic copy', () => {
    expect(authErrorMessage({ status: 401, code: 'invalid_credentials' }, 'signin')).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ status: 429, code: 'rate_limited' }, 'signin')).toMatch(/Too many/);
    expect(authErrorMessage({ status: 0, code: 'network' }, 'register')).toMatch(/connection/);
    expect(authErrorMessage({ status: 500, code: 'http_500' }, 'register')).toMatch(/create your account/);
  });
});
