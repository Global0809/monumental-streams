import { describe, expect, it } from 'vitest';
import { billingErrorMessage, confirmState, devPreviewVisible, parseCheckout, planAction, POLL_LIMIT_MS, vaultState } from '../../src/features/membership/status.ts';
import type { PlatformConfig, SessionInfo } from '../../shared/types.ts';

const user = { id: 'u1', email: 'r@example.test', name: 'R', createdAt: '2026-10-20T00:00:00Z' };
const session = (status: SessionInfo['membership']['status'], extra: Partial<SessionInfo['membership']> = {}, signedIn = true): SessionInfo => ({
  user: signedIn ? user : null,
  membership: { status, premium: false, periodEnd: null, source: null, ...extra },
  csrf: 'x',
});
const config = (mode: PlatformConfig['billing']['mode'], dev = true, environment: PlatformConfig['environment'] = 'development'): PlatformConfig => ({
  billing: { mode, devPreviewEnabled: dev },
  sync: { mode: 'server' },
  integrations: [],
  environment,
});

describe('vaultState', () => {
  it('distinguishes loading, error, signed out and each membership status', () => {
    expect(vaultState({ status: 'loading', session: session('none') })).toBe('loading');
    expect(vaultState({ status: 'offline', session: session('none') })).toBe('error');
    expect(vaultState({ status: 'ready', session: session('none', {}, false) })).toBe('signed-out');
    expect(vaultState({ status: 'ready', session: session('past_due') })).toBe('past_due');
  });
});

describe('planAction', () => {
  const m = (s: SessionInfo['membership']['status'], source: SessionInfo['membership']['source'] = null) => session(s, { source }).membership;
  it('never offers checkout when payments are not connected', () => {
    expect(planAction('none', m('none'), config('setup-pending').billing)).toBe('unavailable');
  });
  it('asks guests to create an account first', () => {
    expect(planAction('signed-out', m('none'), config('stripe-test').billing)).toBe('account');
  });
  it('routes members to the portal and others to checkout', () => {
    const b = config('stripe-test').billing;
    expect(planAction('active', m('active', 'stripe'), b)).toBe('portal');
    expect(planAction('past_due', m('past_due', 'stripe'), b)).toBe('portal');
    expect(planAction('cancelled', m('cancelled', 'stripe'), b)).toBe('portal');
    expect(planAction('cancelled', m('cancelled', 'dev-preview'), b)).toBe('checkout');
    expect(planAction('expired', m('expired'), b)).toBe('checkout');
    expect(planAction('none', m('none'), b)).toBe('checkout');
    expect(planAction('loading', m('none'), b)).toBe('wait');
    expect(planAction('none', m('none'), null)).toBe('wait');
  });
});

describe('checkout return', () => {
  it('parses the return parameter', () => {
    expect(parseCheckout('success')).toBe('success');
    expect(parseCheckout('cancelled')).toBe('cancelled');
    expect(parseCheckout('paid')).toBeNull();
  });
  it('only reports confirmed when the server says active', () => {
    expect(confirmState('active', 0)).toBe('confirmed');
    expect(confirmState('none', 1000)).toBe('confirming');
    expect(confirmState('dev_preview', 1000)).toBe('confirming');
    expect(confirmState('none', POLL_LIMIT_MS)).toBe('unconfirmed');
  });
});

describe('dev preview visibility', () => {
  it('requires the flag and a development environment', () => {
    expect(devPreviewVisible(config('setup-pending', true))).toBe(true);
    expect(devPreviewVisible(config('setup-pending', false))).toBe(false);
    expect(devPreviewVisible(config('stripe-live', true, 'production'))).toBe(false);
    expect(devPreviewVisible(null)).toBe(false);
  });
});

describe('billingErrorMessage', () => {
  it('explains setup-pending honestly and never claims success', () => {
    expect(billingErrorMessage({ status: 503, code: 'billing_setup_pending' })).toMatch(/aren’t connected/);
    expect(billingErrorMessage({ status: 409, code: 'no_billing_account' })).toMatch(/no billing account/);
    for (const code of ['billing_setup_pending', 'billing_error', 'whatever']) expect(billingErrorMessage({ code })).not.toMatch(/success/i);
  });
});
