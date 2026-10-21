/**
 * POST /api/dev/membership {status} — development-only membership switcher so reviewers can
 * exercise every membership state without taking a payment.
 *
 * The router is only mounted when DEV_PREVIEW_MEMBERSHIP is on and NODE_ENV is not
 * production (config forces the flag off in production); the handler re-checks both, and
 * entitlements ignore 'dev-preview' rows whenever the preview is off.
 */
import express from 'express';
import { z } from 'zod';
import { requireUser, sessionInfo } from './auth.ts';
import type { AppContext } from './context.ts';
import { HttpError } from './http.ts';

const DAY_MS = 24 * 3600 * 1000;

const Body = z.object({ status: z.enum(['dev_preview', 'cancelled', 'expired', 'past_due', 'none']) });

export function devPreviewEnabled(ctx: Pick<AppContext, 'config'>): boolean {
  return ctx.config.devPreviewMembership && !ctx.config.production;
}

export function devPreviewRouter(ctx: AppContext) {
  const router = express.Router();

  router.post('/dev/membership', (req, res) => {
    if (!devPreviewEnabled(ctx)) throw new HttpError(404, 'not_found', 'Not found.');
    const user = requireUser(res);
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'invalid_request', 'status must be one of dev_preview, cancelled, expired, past_due, none.');
    const { status } = parsed.data;

    const now = ctx.now().getTime();
    const periodEnd: Record<typeof status, string | null> = {
      dev_preview: null,
      cancelled: new Date(now + 7 * DAY_MS).toISOString(), // still premium for a week
      expired: new Date(now - DAY_MS).toISOString(),
      past_due: new Date(now).toISOString(),
      none: null,
    };
    const existing = ctx.db.memberships.get(user.id);
    ctx.db.memberships.save({
      user_id: user.id,
      status,
      source: status === 'none' ? null : 'dev-preview',
      period_end: periodEnd[status],
      // Keep any real Stripe linkage so switching back and forth never orphans a customer.
      stripe_customer: existing?.stripe_customer ?? null,
      stripe_subscription: existing?.stripe_subscription ?? null,
      stripe_event_at: existing?.stripe_event_at ?? null,
      updated_at: now,
    });
    res.json(sessionInfo(ctx, req, res));
  });

  return router;
}
