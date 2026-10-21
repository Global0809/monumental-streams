import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { billingMode, statusFromSubscription, verifyStripeSignature } from '../../server/billing.ts';
import { createClient, startTestServer, uniqueEmail, type TestServer } from '../fixtures/server/harness.ts';

const WEBHOOK_SECRET = 'whsec_test_fixture_secret';
const STRIPE_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY: 'price_monthly_fixture',
};
const nowSeconds = () => Math.floor(Date.now() / 1000);

function signedHeader(payload: string, secret = WEBHOOK_SECRET, t = nowSeconds()) {
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

describe('billing configuration', () => {
  it('derives the mode from the keys present', () => {
    const none = { secretKey: null, webhookSecret: null, priceMonthly: null, priceYearly: null };
    expect(billingMode(none)).toBe('setup-pending');
    expect(billingMode({ ...none, secretKey: 'sk_test_x', webhookSecret: 'whsec' })).toBe('setup-pending'); // no price
    expect(billingMode({ ...none, secretKey: 'sk_test_x', webhookSecret: 'whsec', priceYearly: 'price_y' })).toBe('stripe-test');
    expect(billingMode({ ...none, secretKey: 'sk_live_x', webhookSecret: 'whsec', priceMonthly: 'price_m' })).toBe('stripe-live');
  });

  it('maps subscription states to membership states', () => {
    const end = 1_900_000_000;
    const iso = new Date(end * 1000).toISOString();
    const sub = (over: object) => ({ id: 'sub', customer: 'cus', status: 'active', current_period_end: end, ...over });
    expect(statusFromSubscription(sub({}))).toEqual({ status: 'active', periodEnd: iso });
    expect(statusFromSubscription(sub({ status: 'trialing' }))).toEqual({ status: 'active', periodEnd: iso });
    expect(statusFromSubscription(sub({ cancel_at_period_end: true }))).toEqual({ status: 'cancelled', periodEnd: iso });
    expect(statusFromSubscription(sub({ status: 'past_due' }))?.status).toBe('past_due');
    expect(statusFromSubscription(sub({ status: 'unpaid' }))?.status).toBe('past_due');
    expect(statusFromSubscription(sub({ status: 'canceled' }))?.status).toBe('expired');
    expect(statusFromSubscription(sub({ status: 'incomplete_expired' }))?.status).toBe('expired');
    expect(statusFromSubscription(sub({ status: 'incomplete' }))).toBeNull();
    // Newer API versions report the period end on subscription items.
    expect(statusFromSubscription({ id: 's', customer: 'c', status: 'active', items: { data: [{ current_period_end: end }] } })).toEqual({
      status: 'active',
      periodEnd: iso,
    });
  });
});

describe('Stripe signature verification', () => {
  const body = Buffer.from('{"id":"evt_1"}');
  const t = 1_800_000_000;
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.`).update(body).digest('hex');

  it('accepts a valid signature among several v1 values (secret rotation)', () => {
    expect(verifyStripeSignature(`t=${t},v1=${'0'.repeat(64)},v1=${sig}`, body, 'whsec_x', t + 10)).toBe(true);
  });

  it('rejects wrong secrets, altered bodies, stale timestamps and junk headers', () => {
    expect(verifyStripeSignature(`t=${t},v1=${sig}`, body, 'whsec_other', t)).toBe(false);
    expect(verifyStripeSignature(`t=${t},v1=${sig}`, Buffer.from('{"id":"evt_2"}'), 'whsec_x', t)).toBe(false);
    expect(verifyStripeSignature(`t=${t},v1=${sig}`, body, 'whsec_x', t + 301)).toBe(false);
    expect(verifyStripeSignature(`t=${t},v0=${sig}`, body, 'whsec_x', t)).toBe(false);
    expect(verifyStripeSignature(undefined, body, 'whsec_x', t)).toBe(false);
    expect(verifyStripeSignature('garbage', body, 'whsec_x', t)).toBe(false);
  });
});

describe('billing when Stripe is not configured', () => {
  let srv: TestServer;
  beforeAll(async () => {
    srv = await startTestServer();
  });
  afterAll(async () => {
    await srv.close();
  });

  it('reports setup-pending and answers 503 without taking payment', async () => {
    const config = await (await fetch(`${srv.url}/api/config`)).json();
    expect(config.billing.mode).toBe('setup-pending');
    expect(config.integrations.find((i: { id: string }) => i.id === 'stripe').status).toBe('not-configured');

    const c = createClient(srv.url);
    await c.register(uniqueEmail());
    for (const path of ['/api/billing/checkout', '/api/billing/portal']) {
      const res = await c.post(path, { plan: 'monthly' });
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('billing_setup_pending');
    }
    const hook = await fetch(`${srv.url}/api/billing/webhook`, { method: 'POST', body: '{}' });
    expect(hook.status).toBe(503);
  });
});

describe('billing with Stripe test keys', () => {
  let srv: TestServer;
  const calls: { method: string; url: string; body: URLSearchParams; auth: string | null }[] = [];
  const periodEnd = nowSeconds() + 30 * 24 * 3600;
  let subscriptionState: Record<string, unknown> = {};

  /** Stands in for api.stripe.com. */
  const stripeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? 'GET', url, body: new URLSearchParams(String(init?.body ?? '')), auth: headers.get('authorization') });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url === 'https://api.stripe.com/v1/checkout/sessions') return json(200, { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (url === 'https://api.stripe.com/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    if (url === 'https://api.stripe.com/v1/subscriptions/sub_1') return json(200, subscriptionState);
    return json(404, { error: { type: 'invalid_request_error', message: 'No such resource' } });
  };

  let member: ReturnType<typeof createClient>;
  let userId: string;
  let eventSeq = 0;

  const sendEvent = async (type: string, object: unknown, options: { id?: string; created?: number } = {}) => {
    const event = { id: options.id ?? `evt_${++eventSeq}`, type, created: options.created ?? nowSeconds() + eventSeq, data: { object } };
    const payload = JSON.stringify(event);
    // No Origin and no CSRF token: the webhook is authenticated by its signature alone.
    const res = await fetch(`${srv.url}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': signedHeader(payload) },
      body: payload,
    });
    return { res, event, body: await res.json() };
  };
  const membership = async () => (await member.session()).membership;

  beforeAll(async () => {
    srv = await startTestServer({ env: STRIPE_ENV, fetch: stripeFetch });
    member = createClient(srv.url);
    userId = (await (await member.register(uniqueEmail('payer'))).json()).user.id;
  });
  afterAll(async () => {
    await srv.close();
  });

  it('reports stripe-test mode honestly', async () => {
    const config = await (await fetch(`${srv.url}/api/config`)).json();
    expect(config.billing.mode).toBe('stripe-test');
    expect(config.integrations.find((i: { id: string }) => i.id === 'stripe')).toMatchObject({ status: 'connected' });
  });

  it('creates a subscription Checkout Session for the signed-in user', async () => {
    const anon = createClient(srv.url);
    await anon.session();
    expect((await anon.post('/api/billing/checkout', { plan: 'monthly' })).status).toBe(401);

    const res = await member.post('/api/billing/checkout', { plan: 'monthly' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const call = calls.at(-1)!;
    expect(call.method).toBe('POST');
    expect(call.auth).toBe('Bearer sk_test_fixture');
    expect(call.body.get('mode')).toBe('subscription');
    expect(call.body.get('line_items[0][price]')).toBe('price_monthly_fixture');
    expect(call.body.get('client_reference_id')).toBe(userId);
    expect(call.body.get('customer_email')).toMatch(/^payer-/);
    expect(call.body.get('success_url')).toBe('http://app.example.test/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}');
    expect(call.body.get('cancel_url')).toBe('http://app.example.test/membership?checkout=cancelled');

    expect((await member.post('/api/billing/checkout', { plan: 'yearly' })).status).toBe(400); // no yearly price set
    expect((await member.post('/api/billing/checkout', { plan: 'lifetime' })).status).toBe(400);
    // The redirect back from Checkout grants nothing by itself.
    expect(await membership()).toMatchObject({ status: 'none', premium: false });
  });

  it('rejects webhooks with a bad, missing or stale signature', async () => {
    const payload = JSON.stringify({ id: 'evt_bad', type: 'customer.subscription.deleted', created: nowSeconds(), data: { object: {} } });
    const post = (sig?: string) =>
      fetch(`${srv.url}/api/billing/webhook`, { method: 'POST', headers: sig ? { 'stripe-signature': sig } : {}, body: payload });
    expect((await post()).status).toBe(400);
    expect((await post(signedHeader(payload, 'whsec_wrong'))).status).toBe(400);
    expect((await post(signedHeader(payload, WEBHOOK_SECRET, nowSeconds() - 301))).status).toBe(400);
    expect((await post(signedHeader(`${payload} `))).status).toBe(400);
    expect(srv.app.ctx.db.billingEvents.has('evt_bad')).toBe(false);
  });

  it('activates membership from checkout.session.completed using the live subscription', async () => {
    subscriptionState = { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false };
    const session = { object: 'checkout.session', mode: 'subscription', client_reference_id: userId, customer: 'cus_1', subscription: 'sub_1' };
    const { res, event } = await sendEvent('checkout.session.completed', session, { id: 'evt_checkout' });
    expect(res.status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: 'https://api.stripe.com/v1/subscriptions/sub_1' });
    expect(await membership()).toEqual({
      status: 'active',
      premium: true,
      periodEnd: new Date(periodEnd * 1000).toISOString(),
      source: 'stripe',
    });
    expect(srv.app.ctx.db.memberships.get(userId)).toMatchObject({ stripe_customer: 'cus_1', stripe_subscription: 'sub_1' });

    // Premium playback now works.
    expect((await member.post('/api/playback/premium-film')).status).toBe(200);
    // Members are sent to the portal instead of a second checkout.
    expect((await member.post('/api/billing/checkout', { plan: 'monthly' })).status).toBe(409);

    // Redelivery of the same event is acknowledged but not re-applied.
    const callsBefore = calls.length;
    const replay = await fetch(`${srv.url}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': signedHeader(JSON.stringify(event)) },
      body: JSON.stringify(event),
    });
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(calls.length).toBe(callsBefore);
  });

  it('follows subscription lifecycle events, idempotently and in order', async () => {
    const cancelAt = periodEnd;
    const cancelled = await sendEvent(
      'customer.subscription.updated',
      { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, current_period_end: cancelAt },
      { id: 'evt_cancel' },
    );
    expect(cancelled.res.status).toBe(200);
    expect(await membership()).toMatchObject({ status: 'cancelled', premium: true, periodEnd: new Date(cancelAt * 1000).toISOString() });

    // Replaying the original checkout event must not resurrect "active".
    const checkoutReplay = JSON.stringify({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: nowSeconds(),
      data: { object: { mode: 'subscription', client_reference_id: userId, subscription: 'sub_1' } },
    });
    await fetch(`${srv.url}/api/billing/webhook`, { method: 'POST', headers: { 'stripe-signature': signedHeader(checkoutReplay) }, body: checkoutReplay });
    expect((await membership()).status).toBe('cancelled');

    await sendEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'past_due', current_period_end: periodEnd });
    expect(await membership()).toMatchObject({ status: 'past_due', premium: false });

    // An older event delivered late is ignored.
    await sendEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd }, { created: 1 });
    expect((await membership()).status).toBe('past_due');

    await sendEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd });
    expect(await membership()).toMatchObject({ status: 'active', premium: true });

    // Invoice payloads from older and newer API versions both resolve the subscription.
    await sendEvent('invoice.payment_failed', { customer: 'cus_1', subscription: 'sub_1' });
    expect(await membership()).toMatchObject({ status: 'past_due', premium: false });
    await sendEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: periodEnd });
    await sendEvent('invoice.payment_failed', { customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_1' } } });
    expect((await membership()).status).toBe('past_due');

    const deleted = await sendEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', status: 'canceled', ended_at: nowSeconds() });
    expect(deleted.body).toEqual({ received: true });
    expect(await membership()).toMatchObject({ status: 'expired', premium: false, source: 'stripe' });
    expect((await member.post('/api/playback/premium-film')).status).toBe(403);
  });

  it('acknowledges events it does not act on', async () => {
    const unrelated = await sendEvent('customer.subscription.updated', { id: 'sub_unknown', customer: 'cus_unknown', status: 'active' });
    expect(unrelated.res.status).toBe(200);
    const other = await sendEvent('charge.succeeded', { id: 'ch_1' });
    expect(other.res.status).toBe(200);
  });

  it('opens the billing portal for customers only', async () => {
    const res = await member.post('/api/billing/portal');
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(calls.at(-1)?.body.get('customer')).toBe('cus_1');
    expect(calls.at(-1)?.body.get('return_url')).toBe('http://app.example.test/you?tab=membership');

    const stranger = createClient(srv.url);
    await stranger.register(uniqueEmail());
    const none = await stranger.post('/api/billing/portal');
    expect(none.status).toBe(409);
    expect((await none.json()).code).toBe('no_billing_account');
  });

  it('turns Stripe API failures into 502 without recording the event (so Stripe retries)', async () => {
    const payload = {
      mode: 'subscription',
      client_reference_id: userId,
      customer: 'cus_1',
      subscription: 'sub_missing', // the stub answers 404
    };
    const { res } = await sendEvent('checkout.session.completed', payload, { id: 'evt_retry_me' });
    expect(res.status).toBe(502);
    expect(srv.app.ctx.db.billingEvents.has('evt_retry_me')).toBe(false);
  });
});
