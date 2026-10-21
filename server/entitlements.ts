/**
 * Membership → entitlement. The single place that decides whether someone is premium.
 *
 *   premium = active
 *           | cancelled and periodEnd still in the future
 *           | dev_preview while the dev preview is enabled (never in production)
 *
 * Rows written by the dev preview are ignored entirely when the preview is off, so a
 * development database copied to production can never grant access.
 */
import type { SessionInfo } from '../shared/types.ts';
import type { AppDatabase, MembershipRow } from './db.ts';

export type Entitlement = SessionInfo['membership'];

export interface EntitlementPolicy {
  devPreviewEnabled: boolean;
  production: boolean;
}

export const NO_MEMBERSHIP: Entitlement = { status: 'none', premium: false, periodEnd: null, source: null };

export function computeEntitlement(row: MembershipRow | undefined, policy: EntitlementPolicy, now: Date): Entitlement {
  if (!row) return NO_MEMBERSHIP;
  const previewAllowed = policy.devPreviewEnabled && !policy.production;
  if (row.source === 'dev-preview' && !previewAllowed) return NO_MEMBERSHIP;

  const periodEnd = row.period_end;
  const base = { periodEnd, source: row.source };
  switch (row.status) {
    case 'active':
      return { ...base, status: 'active', premium: true };
    case 'cancelled': {
      const stillPaid = periodEnd !== null && new Date(periodEnd).getTime() > now.getTime();
      // A cancelled membership whose paid period has run out is, truthfully, expired.
      return stillPaid ? { ...base, status: 'cancelled', premium: true } : { ...base, status: 'expired', premium: false };
    }
    case 'dev_preview':
      return { ...base, status: 'dev_preview', premium: previewAllowed };
    case 'past_due':
    case 'expired':
      return { ...base, status: row.status, premium: false };
    default:
      return { ...NO_MEMBERSHIP, source: row.source };
  }
}

export function entitlementFor(db: AppDatabase, userId: string | null, policy: EntitlementPolicy, now: Date): Entitlement {
  return userId ? computeEntitlement(db.memberships.get(userId), policy, now) : NO_MEMBERSHIP;
}
