/**
 * Stripe billing over plain HTTPS (form-encoded requests to https://api.stripe.com/v1; no SDK).
 *
 * Configured only when STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and at least one price id are
 * present; otherwise the mode is 'setup-pending' and checkout/portal answer 503.
 *
 * Membership state changes ONLY through verified webhooks — the Checkout success redirect
 * never grants anything. Webhooks are verified (HMAC-SHA256 over `t.rawBody`, 300 s
 * tolerance, constant-time compare), deduplicated by event id, and guarded against
 * out-of-order delivery using each event's `created` time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import type { MembershipStatus, PlatformConfig } from '../shared/types.ts';
import { requireUser } from './auth.ts';
import type { StripeConfig } from './config.ts';
import type { AppContext } from './context.ts';
import type { MembershipRow } from './db.ts';
import { entitlementFor } from './entitlements.ts';
import { HttpError } from './http.ts';

export type BillingMode = PlatformConfig['billing']['mode'];

export function billingMode(stripe: StripeConfig): BillingMode {
  if (!stripe.secretKey || !stripe.webhookSecret || !(stripe.priceMonthly || stripe.priceYearly)) return 'setup-pending';
  return /^(sk|rk)_test_/.test(stripe.secretKey) ? 'stripe-test' : 'stripe-live';
}

const SETUP_PENDING = () =>
  new HttpError(503, 'billing_setup_pending', 'Membership payments are not set up on this server yet. No payment can be taken.');

/* ───────────── signature verification ───────────── */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Verifies a `Stripe-Signature` header (t=…,v1=…[,v1=…]) against the raw request body. */
export function verifyStripeSignature(header: string | undefined, payload: Buffer, secret: string, nowSeconds: number): boolean {
  if (!header) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex'));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/* ───────────── Stripe API ───────────── */

type Expandable = string | { id: string } | null | undefined;
const idOf = (v: Expandable): string | null => (typeof v === 'string' ? v : (v?.id ?? null));

interface StripeSubscription {
  id: string;
  customer: Expandable;
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number; // API versions before 2025-03-31
  items?: { data?: { current_period_end?: number }[] }; // newer API versions
  ended_at?: number | null;
  metadata?: Record<string, string>;
}

interface StripeCheckoutSession {
  mode?: string;
  client_reference_id?: string | null;
  customer?: Expandable;
  subscription?: Expandable;
}

interface StripeInvoice {
  customer?: Expandable;
  subscription?: Expandable; // older API versions
  parent?: { subscription_details?: { subscription?: Expandable } | null } | null; // newer API versions
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: unknown };
}

async function stripeRequest<T>(ctx: AppContext, method: 'GET' | 'POST', pathname: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const url = `https://api.stripe.com/v1${pathname}${method === 'GET' && query ? `?${query}` : ''}`;
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${ctx.config.stripe.secretKey}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: method === 'POST' ? query : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    ctx.logger.error(`Stripe ${method} ${pathname} failed`, err);
    throw new HttpError(502, 'billing_error', 'The payment provider could not be reached. Please try again.');
  }
  const json = (await response.json().catch(() => ({}))) as T & { error?: { type?: string; message?: string } };
  if (!response.ok) {
    ctx.logger.error(`Stripe ${method} ${pathname} → ${response.status}`, { type: json.error?.type, message: json.error?.message });
    throw new HttpError(502, 'billing_error', 'The payment provider rejected the request. Please try again later.');
  }
  return json;
}

/* ───────────── event → membership ───────────── */

interface StatusChange {
  status: MembershipStatus;
  /** undefined = keep the stored period end. */
  periodEnd?: string | null;
}

interface MembershipUpdate {
  userId: string;
  eventAt: number;
  /** State fetched live from Stripe is newer than any event, so it bypasses the ordering guard. */
  authoritative: boolean;
  change: StatusChange | null;
  customer?: string | null;
  subscription?: string | null;
}

const isoFromSeconds = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/** Maps a Stripe subscription to our membership status; null = leave unchanged (payment not settled yet). */
export function statusFromSubscription(sub: StripeSubscription): StatusChange | null {
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return sub.cancel_at_period_end || sub.cancel_at
        ? { status: 'cancelled', periodEnd: isoFromSeconds(sub.cancel_at ?? periodEnd) }
        : { status: 'active', periodEnd: isoFromSeconds(periodEnd) };
    case 'past_due':
    case 'unpaid':
    case 'paused': // trial ended without a payment method: no access until payment resumes
      return { status: 'past_due', periodEnd: isoFromSeconds(periodEnd) };
    case 'canceled':
    case 'incomplete_expired':
      return { status: 'expired', periodEnd: isoFromSeconds(sub.ended_at ?? periodEnd) };
    default: // 'incomplete': first payment still pending
      return null;
  }
}

function userForSubscription(ctx: AppContext, sub: StripeSubscription): string | null {
  const metaUser = sub.metadata?.user_id;
  if (metaUser && ctx.db.users.byId(metaUser)) return metaUser;
  const bySubscription = ctx.db.memberships.byStripeSubscription(sub.id);
  if (bySubscription) return bySubscription.user_id;
  const customer = idOf(sub.customer);
  return (customer && ctx.db.memberships.byStripeCustomer(customer)?.user_id) || null;
}

/** Works out what an event means for a membership. Async because checkout completion fetches the subscription. */
async function planUpdate(ctx: AppContext, event: StripeEvent): Promise<MembershipUpdate | null> {
  const eventAt = event.created;
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
      const userId = session.client_reference_id;
      const subscriptionId = idOf(session.subscription);
      if (session.mode !== 'subscription' || !userId || !subscriptionId) return null;
      if (!ctx.db.users.byId(userId)) {
        ctx.logger.warn(`Stripe checkout for unknown user ${userId} (event ${event.id}) — ignored`);
        return null;
      }
      const sub = await stripeRequest<StripeSubscription>(ctx, 'GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      return {
        userId,
        eventAt,
        authoritative: true,
        change: statusFromSubscription(sub),
        customer: idOf(session.customer) ?? idOf(sub.customer),
        subscription: sub.id,
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as StripeSubscription;
      const userId = userForSubscription(ctx, sub);
      if (!userId) return null;
      const change: StatusChange | null =
        event.type === 'customer.subscription.deleted'
          ? { status: 'expired', periodEnd: isoFromSeconds(sub.ended_at) ?? new Date(eventAt * 1000).toISOString() }
          : statusFromSubscription(sub);
      return { userId, eventAt, authoritative: false, change, customer: idOf(sub.customer), subscription: sub.id };
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoice;
      const subscriptionId = idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
      const customer = idOf(invoice.customer);
      const row =
        (subscriptionId && ctx.db.memberships.byStripeSubscription(subscriptionId)) ||
        (customer && ctx.db.memberships.byStripeCustomer(customer)) ||
        undefined;
      if (!row) return null;
      return { userId: row.user_id, eventAt, authoritative: false, change: { status: 'past_due' } };
    }
    default:
      return null;
  }
}

function applyUpdate(ctx: AppContext, update: MembershipUpdate) {
  const existing = ctx.db.memberships.get(update.userId);
  const stale = !update.authoritative && existing?.stripe_event_at != null && update.eventAt < existing.stripe_event_at;
  if (stale) {
    ctx.logger.info(`Stripe event older than current state for user ${update.userId} — ignored`);
    return;
  }
  const change = update.change;
  const row: MembershipRow = {
    user_id: update.userId,
    status: change?.status ?? existing?.status ?? 'none',
    source: change ? 'stripe' : (existing?.source ?? 'stripe'),
    period_end: change && change.periodEnd !== undefined ? change.periodEnd : (existing?.period_end ?? null),
    stripe_customer: update.customer ?? existing?.stripe_customer ?? null,
    stripe_subscription: update.subscription ?? existing?.stripe_subscription ?? null,
    stripe_event_at: Math.max(existing?.stripe_event_at ?? 0, update.eventAt),
    updated_at: ctx.now().getTime(),
  };
  ctx.db.memberships.save(row);
}

/* ───────────── routes ───────────── */

/** POST /api/billing/webhook — mount BEFORE express.json so the raw body is available. */
export function webhookHandlers(ctx: AppContext): RequestHandler[] {
  const handler: RequestHandler = async (req, res) => {
    const secret = ctx.config.stripe.webhookSecret;
    if (billingMode(ctx.config.stripe) === 'setup-pending' || !secret) throw SETUP_PENDING();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const nowSeconds = Math.floor(ctx.now().getTime() / 1000);
    if (!verifyStripeSignature(req.get('stripe-signature'), raw, secret, nowSeconds)) {
      throw new HttpError(400, 'invalid_signature', 'Webhook signature verification failed.');
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as StripeEvent;
    } catch {
      throw new HttpError(400, 'invalid_json', 'Webhook body is not JSON.');
    }
    if (typeof event?.id !== 'string' || typeof event.type !== 'string' || typeof event.created !== 'number' || !event.data) {
      throw new HttpError(400, 'invalid_event', 'Webhook body is not a Stripe event.');
    }
    if (ctx.db.billingEvents.has(event.id)) {
      res.json({ received: true, duplicate: true });
      return;
    }
    // If planning throws (e.g. Stripe unreachable) nothing is recorded, so Stripe retries later.
    const update = await planUpdate(ctx, event);
    const duplicate = ctx.db.transaction(() => {
      if (ctx.db.billingEvents.has(event.id)) return true; // a concurrent delivery won the race
      if (update) applyUpdate(ctx, update);
      ctx.db.billingEvents.record(event.id, event.type, ctx.now().getTime());
      return false;
    });
    res.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
  };
  return [express.raw({ type: () => true, limit: '1mb' }), handler];
}

const CheckoutBody = z.object({ plan: z.enum(['monthly', 'yearly']) });

export function billingRouter(ctx: AppContext) {
  const router = express.Router();
  const mode = billingMode(ctx.config.stripe);
  const origin = ctx.config.appOrigin;

  router.post('/billing/checkout', async (req, res) => {
    if (mode === 'setup-pending') throw SETUP_PENDING();
    const user = requireUser(res);
    const parsed = CheckoutBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Choose a monthly or yearly plan.');
    const price = parsed.data.plan === 'monthly' ? ctx.config.stripe.priceMonthly : ctx.config.stripe.priceYearly;
    if (!price) throw new HttpError(400, 'plan_unavailable', 'That plan is not offered yet.');

    const entitlement = entitlementFor(ctx.db, user.id, ctx.policy, ctx.now());
    if (entitlement.premium && entitlement.source === 'stripe') {
      throw new HttpError(409, 'already_member', 'You already have a membership. Manage it from your account.');
    }
    const customer = ctx.db.memberships.get(user.id)?.stripe_customer;
    const session = await stripeRequest<{ url: string }>(ctx, 'POST', '/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      ...(customer ? { customer } : { customer_email: user.email }),
      'metadata[user_id]': user.id,
      'subscription_data[metadata][user_id]': user.id,
      success_url: `${origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/membership?checkout=cancelled`,
    });
    res.json({ url: session.url });
  });

  router.post('/billing/portal', async (_req, res) => {
    if (mode === 'setup-pending') throw SETUP_PENDING();
    const user = requireUser(res);
    const customer = ctx.db.memberships.get(user.id)?.stripe_customer;
    if (!customer) throw new HttpError(409, 'no_billing_account', 'There is no billing account to manage yet.');
    const session = await stripeRequest<{ url: string }>(ctx, 'POST', '/billing_portal/sessions', {
      customer,
      return_url: `${origin}/you?tab=membership`,
    });
    res.json({ url: session.url });
  });

  return router;
}
