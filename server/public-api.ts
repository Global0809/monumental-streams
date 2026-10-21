/**
 * Read-only public endpoints: health, platform config (with honest integration status),
 * the catalogue payload, server-side search and maintained activity.
 */
import express from 'express';
import { searchCatalogue } from '../shared/search.ts';
import type { ActivityItem, PlatformConfig } from '../shared/types.ts';
import { discoveryFromParams } from '../shared/url-state.ts';
import { billingMode } from './billing.ts';
import type { AppContext } from './context.ts';
import { devPreviewEnabled } from './dev-preview.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** End of an ISO date or datetime, in epoch ms. Date-only values last the whole UTC day. */
function endOf(value: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59.999Z`) : Date.parse(value);
}

/** Maintained items are shown until they end; an event without an end date lasts its start day. */
export function isInDate(item: ActivityItem, now: Date): boolean {
  const until = item.ends ?? (item.kind === 'event' ? item.starts : undefined);
  if (!until) return true;
  const end = endOf(until);
  return Number.isNaN(end) || end >= now.getTime();
}

export function platformConfig(ctx: AppContext): PlatformConfig {
  const { raw } = ctx.content;
  const mode = billingMode(ctx.config.stripe);
  const inDate = raw.activity.filter((a) => isInDate(a, ctx.now())).length;

  const stripeDetail: Record<typeof mode, string> = {
    'stripe-test': 'Stripe test mode: Checkout and signed webhooks are live; no real money moves.',
    'stripe-live': 'Stripe live mode: Checkout and signed webhooks are live.',
    'setup-pending':
      'Not configured. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and a price id to enable Checkout; until then upgrades show “setup pending” and no payment can be taken.',
  };

  return {
    billing: { mode, devPreviewEnabled: devPreviewEnabled(ctx) },
    sync: { mode: 'server' },
    integrations: [
      { id: 'stripe', name: 'Stripe billing', status: mode === 'setup-pending' ? 'not-configured' : 'connected', detail: stripeDetail[mode] },
      { id: 'accounts', name: 'Accounts & sync', status: 'connected', detail: 'Monumental server · SQLite' },
      {
        id: 'activity',
        name: 'Current activity feed',
        status: 'not-connected',
        detail: `No live feed is connected. Activity comes from the maintained file content/activity.json (${plural(raw.activity.length, 'item')}, ${inDate} in date).`,
      },
      {
        id: 'weather',
        name: 'Weather',
        status: 'not-connected',
        detail: 'No weather service is connected; mood suggestions never claim live conditions.',
      },
      raw.external.length
        ? {
            id: 'external',
            name: 'External availability',
            status: 'connected',
            detail: `${plural(raw.external.length, 'hand-verified listing')} maintained in content/external.json.`,
          }
        : {
            id: 'external',
            name: 'External availability',
            status: 'not-connected',
            detail: 'No availability service is connected and content/external.json has no entries.',
          },
      {
        id: 'email',
        name: 'Transactional email',
        status: 'not-configured',
        detail: 'No email provider is configured, so password reset and email verification are not available yet.',
      },
    ],
    environment: ctx.config.production ? 'production' : 'development',
  };
}

/** True when an If-None-Match header lists the given strong ETag (weak comparison, `*` matches). */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((t) => {
    const tag = t.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

export function publicApiRouter(ctx: AppContext) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  router.get('/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(platformConfig(ctx));
  });

  router.get('/catalogue', (req, res) => {
    const etag = `"${ctx.content.version}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (etagMatches(req.get('if-none-match'), etag)) {
      res.status(304).end();
      return;
    }
    res.type('application/json').send(ctx.content.json);
  });

  router.get('/search', (req, res) => {
    const cat = ctx.content.catalogue;
    const q = req.originalUrl.indexOf('?');
    const state = discoveryFromParams(new URLSearchParams(q >= 0 ? req.originalUrl.slice(q + 1) : ''), cat);
    const result = searchCatalogue(cat, state, ctx.now());
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      total: result.total,
      results: result.results.map((r) => ({ id: r.video.id, score: r.score, matched: r.matched })),
      entities: result.entities, // { id, kind, label, score } — already lightweight
      facets: result.facets,
      relaxations: result.relaxations,
    });
  });

  router.get('/activity', (_req, res) => {
    const { raw, catalogue } = ctx.content;
    const now = ctx.now();
    const items = raw.activity
      .filter((a) => isInDate(a, now))
      .sort((a, b) => (a.starts ?? '9999').localeCompare(b.starts ?? '9999') || b.verifiedAt.localeCompare(a.verifiedAt));
    const external = raw.external.filter((e) => catalogue.get(e.video));
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ items, external });
  });

  return router;
}
