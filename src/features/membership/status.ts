/**
 * Pure membership helpers shared by the Membership page (/membership) and My World's summary card.
 * The server decides entitlement; these only translate what it reports into words and
 * into which action the viewer can take next. Unit-tested in tests/unit/mem-status.test.ts.
 */
import type { MembershipStatus, PlatformConfig, SessionInfo } from '../../../shared/types.ts';

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  none: 'Free account',
  active: 'Premium · active',
  cancelled: 'Premium · cancelled',
  past_due: 'Payment past due',
  expired: 'Membership ended',
  dev_preview: 'Development preview',
};

export type VaultState = 'loading' | 'error' | 'signed-out' | MembershipStatus;

export function vaultState(s: { status: 'loading' | 'ready' | 'offline'; session: SessionInfo }): VaultState {
  if (s.status === 'loading') return 'loading';
  if (s.status === 'offline') return 'error';
  if (!s.session.user) return 'signed-out';
  return s.session.membership.status;
}

/** What the plan buttons should do for this viewer. */
export type PlanAction = 'wait' | 'account' | 'checkout' | 'portal' | 'unavailable';

export function planAction(state: VaultState, membership: SessionInfo['membership'], billing: PlatformConfig['billing'] | null): PlanAction {
  if (state === 'loading' || state === 'error' || !billing) return 'wait';
  if (billing.mode === 'setup-pending') return 'unavailable';
  if (state === 'signed-out') return 'account';
  if (state === 'active' || state === 'past_due') return 'portal';
  // A Stripe subscription that is cancelled but still running is resumed in the portal.
  if (state === 'cancelled' && membership.source === 'stripe') return 'portal';
  return 'checkout';
}

export function devPreviewVisible(config: PlatformConfig | null): boolean {
  return !!config && config.billing.devPreviewEnabled && config.environment === 'development';
}

export const BILLING_LABEL: Record<PlatformConfig['billing']['mode'], string> = {
  'stripe-test': 'Stripe · test mode',
  'stripe-live': 'Stripe · live',
  'setup-pending': 'Not connected · setup pending',
};

export type CheckoutReturn = 'success' | 'cancelled' | null;

export function parseCheckout(v: string | null): CheckoutReturn {
  return v === 'success' || v === 'cancelled' ? v : null;
}

export const POLL_INTERVAL_MS = 2000;
export const POLL_LIMIT_MS = 30_000;

/** After a Stripe redirect: only a server-reported 'active' status counts as confirmed. */
export function confirmState(status: MembershipStatus | undefined, elapsedMs: number): 'confirmed' | 'confirming' | 'unconfirmed' {
  if (status === 'active') return 'confirmed';
  return elapsedMs >= POLL_LIMIT_MS ? 'unconfirmed' : 'confirming';
}

/** Viewer-safe wording for billing / membership API failures. */
export function billingErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { status?: number; code?: string };
  switch (e.code) {
    case 'billing_setup_pending':
      return 'Payments aren’t connected on this server yet, so no checkout or billing portal is available. Nothing was charged.';
    case 'no_billing_account':
      return 'There’s no billing account to manage yet. Memberships set in the development preview have no Stripe billing behind them.';
    case 'already_member':
      return 'You already have a membership. Manage it from the billing portal instead.';
    case 'plan_unavailable':
      return 'That plan isn’t offered on this server yet.';
    case 'auth_required':
      return 'Your session has ended. Sign in again to continue.';
    case 'rate_limited':
      return 'Too many attempts in a short time. Wait a moment and try again.';
    case 'csrf_failed':
    case 'origin_rejected':
      return 'A security check failed. Refresh the page and try again.';
    case 'network':
      return 'The connection dropped. Check your network and try again.';
    case 'billing_error':
      return 'The payment provider couldn’t be reached. Nothing was charged — please try again later.';
    default:
      return e.status === 0 ? 'The connection dropped. Check your network and try again.' : 'Something went wrong. Please try again.';
  }
}
