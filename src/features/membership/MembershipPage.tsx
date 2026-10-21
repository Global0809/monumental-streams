/**
 * MEMBERSHIP (under My World). Honest about everything: prices are development examples until
 * approved, only live benefits are called live, "what Premium unlocks" is computed from the
 * catalogue, and membership is only ever reported as active when the server says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { MembershipConfig, MembershipStatus, Video } from '../../../shared/types.ts';
import { useChapters } from '../../app/chapters.ts';
import { dateLabel, plural } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { auth, refreshSession, useSession } from '../../state/session.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { canAutoplay, releasePreview, requestPreview } from '../../systems/previews.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { EmptyState, Pulse, toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art, SectionHeader, VideoPod } from '../../ui/Pod.tsx';
import {
  BILLING_LABEL,
  billingErrorMessage,
  confirmState,
  devPreviewVisible,
  parseCheckout,
  planAction,
  POLL_INTERVAL_MS,
  STATUS_LABEL,
  vaultState,
  type VaultState,
} from './status.ts';
import { MyWorldCrumbs } from '../you/Crumbs.tsx';
import './membership.css';

const CHAPTERS = [
  { id: 'mem-status', label: 'Your status' },
  { id: 'mem-plans', label: 'Plans' },
  { id: 'mem-unlocks', label: 'Unlocks today' },
  { id: 'mem-benefits', label: 'Benefits' },
];

export default function MembershipPage() {
  const cat = useCatalogue();
  const sessionState = useSession();
  const { session, config } = sessionState;
  const membership = cat.payload.content.membership;
  const state = vaultState(sessionState);
  const [params, setParams] = useSearchParams();
  const checkout = parseCheckout(params.get('checkout'));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ where: 'status' | 'plans'; message: string } | null>(null);
  const plansRef = useRef<HTMLElement>(null);
  const showDev = devPreviewVisible(config);

  useChapters(showDev ? [...CHAPTERS, { id: 'mem-dev', label: 'Dev preview' }] : CHAPTERS);

  useEffect(() => {
    document.title = 'Membership · Monumental Streams';
  }, []);

  const dismissReturn = useCallback(() => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('checkout');
        n.delete('session_id');
        return n;
      },
      { replace: true },
    );
  }, [setParams]);

  const startCheckout = async (plan: string) => {
    setBusy(plan);
    setError(null);
    try {
      const { url } = await auth.checkout(plan);
      window.location.assign(url); // stay busy while the browser leaves for Stripe
    } catch (e) {
      setError({ where: 'plans', message: billingErrorMessage(e) });
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    setError(null);
    try {
      const { url } = await auth.portal();
      window.location.assign(url);
    } catch (e) {
      setError({ where: 'status', message: billingErrorMessage(e) });
      setBusy(null);
    }
  };

  const toPlans = () => {
    const el = plansRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };

  const unlocks = useMemo(() => cat.videos.filter((v) => cat.effectiveAccess(v) === 'premium'), [cat]);
  const action = planAction(state, session.membership, config?.billing ?? null);

  return (
    <div className="page mem">
      {checkout ? <CheckoutReturnBanner kind={checkout} onDismiss={dismissReturn} /> : null}

      <header className="mem-hero">
        <VaultBackdrop />
        <div className="wrap mem-hero-inner">
          <div className="mem-hero-copy">
            <MyWorldCrumbs here="Membership" tab="membership" />
            <h1 className="page-title mem-title">
              <em>Membership</em>
            </h1>
            <p className="mem-tier">{membership.tierName}</p>
            <p className="page-lede">
              Premium opens the gold-sealed stories across Monumental. This page shows exactly what that means today, what is only planned, and where your
              membership stands &mdash; it is also summarised in My World.
            </p>
          </div>
          <section id="mem-status" className="mem-status panel" aria-labelledby="mem-status-h" data-state={state}>
            <StatusPanel state={state} busy={busy} onPortal={openPortal} onPlans={toPlans} />
            {error?.where === 'status' && busy === null ? (
              <p className="form-error" role="alert">
                {error.message}
              </p>
            ) : null}
          </section>
        </div>
      </header>

      <div className="wrap">
        <section id="mem-plans" ref={plansRef} className="section mem-section" aria-labelledby="mem-plans-h">
          <SectionHeader title="Choose how to join" id="mem-plans-h">
            {config ? (
              <>
                Payments: <b className="mem-mode">{BILLING_LABEL[config.billing.mode]}</b>
              </>
            ) : (
              'Checking how payments are set up…'
            )}
          </SectionHeader>
          {config?.billing.mode === 'stripe-test' ? (
            <p className="notice mem-notice">
              <Icon name="info" size={18} />
              <span>
                <b>Stripe test mode.</b> Checkout runs in Stripe&rsquo;s test environment: no real card is charged. Use one of Stripe&rsquo;s published test cards.
              </span>
            </p>
          ) : null}
          {config?.billing.mode === 'setup-pending' ? <SetupPending plans={membership.plans} /> : null}
          <ul className="mem-plans">
            {membership.plans.map((p) => (
              <li key={p.id} className="mem-plan panel">
                <h3 className="mem-plan-name">{p.label}</h3>
                <PlanPrice text={p.displayPrice} />
                {p.provisional ? (
                  <p className="mem-provisional">
                    <Icon name="info" size={16} />
                    <span>Development example — pricing not approved</span>
                  </p>
                ) : null}
                <p className="mem-plan-note">A {p.interval === 'year' ? 'yearly' : 'monthly'} subscription that renews until you cancel.</p>
                <PlanButton
                  action={action}
                  label={p.label}
                  busy={busy === p.id}
                  disabled={busy !== null && busy !== p.id}
                  testMode={config?.billing.mode === 'stripe-test'}
                  onCheckout={() => startCheckout(p.id)}
                  onPortal={openPortal}
                  portalBusy={busy === 'portal'}
                />
              </li>
            ))}
          </ul>
          {error?.where === 'plans' && busy === null ? (
            <p className="form-error mem-plan-error" role="alert">
              {error.message}
            </p>
          ) : null}
        </section>

        <section id="mem-unlocks" className="section mem-section" aria-labelledby="mem-unlocks-h">
          <SectionHeader kicker="Computed from the catalogue" title="What Premium unlocks today" id="mem-unlocks-h">
            <UnlockSummary list={unlocks} />
          </SectionHeader>
          {unlocks.length ? (
            <ul className="grid-pods">
              {unlocks.map((v) => (
                <li key={v.id}>
                  <VideoPod
                    video={v}
                    footer={
                      v.availability.status === 'early-access' && v.availability.publicFrom ? (
                        <p className="mem-pod-note">Opens to everyone {dateLabel(v.availability.publicFrom)}</p>
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="diamond" tone="aurum" title="Nothing is behind the seal right now">
              <p>Every playable story is currently free. Premium items will appear here as soon as the catalogue has them.</p>
            </EmptyState>
          )}
        </section>

        <section id="mem-benefits" className="section mem-section" aria-labelledby="mem-benefits-h">
          <SectionHeader title="Live now, and later" id="mem-benefits-h" />
          <Benefits benefits={membership.benefits} />
          <p className="notice notice-aurum mem-note">
            <Icon name="info" size={18} />
            <span>{membership.note}</span>
          </p>
        </section>

        {showDev ? <DevPreview signedIn={!!session.user} current={session.membership.status} /> : null}
      </div>
    </div>
  );
}

/* ───────────── Hero backdrop: the vault door ───────────── */

function VaultBackdrop() {
  const cat = useCatalogue();
  const art = cat.artFor('art:premium-vault');
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || !art?.preview) return;
    let visible = false;
    const sync = () => {
      if (visible && canAutoplay()) {
        if (!v.getAttribute('src')) v.src = window.matchMedia('(max-width: 767px)').matches && art.previewSmall ? art.previewSmall : art.preview!;
        requestPreview(v);
      } else {
        releasePreview(v);
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(v);
    window.addEventListener('ms:previews', sync);
    return () => {
      io.disconnect();
      window.removeEventListener('ms:previews', sync);
      releasePreview(v);
      v.removeAttribute('src');
      v.load();
    };
  }, [art?.preview, art?.previewSmall, reduced]);

  return (
    <div className="mem-backdrop" aria-hidden="true">
      <Art art="art:premium-vault" alt="" sizes="large" eager className="mem-backdrop-art" />
      {art?.preview ? (
        <video
          ref={ref}
          className="mem-backdrop-loop"
          data-playing={playing}
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : null}
      <span className="mem-backdrop-shade" />
      {art?.provisional ? <span className="mem-art-note">Provisional art · studio concept loop</span> : null}
    </div>
  );
}

/* ───────────── Status panel ───────────── */

function StatusPanel({ state, busy, onPortal, onPlans }: { state: VaultState; busy: string | null; onPortal: () => void; onPlans: () => void }) {
  const { session } = useSession();
  const m = session.membership;
  const portalBusy = busy === 'portal';
  const [retrying, setRetrying] = useState(false);

  const head = (title: string, tone: 'ichor' | 'aurum' | 'ember' | 'plasma' | 'haem', icon: Parameters<typeof Icon>[0]['name']) => (
    <div className={`mem-status-head mem-tone-${tone}`}>
      <span className="mem-seal" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="kicker">Your status</p>
        <h2 id="mem-status-h" className="mem-status-title" tabIndex={-1}>
          {title}
        </h2>
      </div>
    </div>
  );

  let body: ReactNode;
  switch (state) {
    case 'loading':
      body = (
        <>
          {head('Checking your membership', 'plasma', 'diamond')}
          <Pulse label="Asking the server" />
        </>
      );
      break;
    case 'error':
      body = (
        <>
          {head('Membership service unreachable', 'haem', 'info')}
          <p className="mem-status-text">We couldn&rsquo;t reach the server to check your membership, so nothing can be confirmed or changed right now.</p>
          <div className="mem-actions">
            <Button
              variant="primary"
              icon="replay"
              busy={retrying}
              onClick={async () => {
                setRetrying(true);
                await refreshSession();
                setRetrying(false);
              }}
            >
              Try again
            </Button>
          </div>
        </>
      );
      break;
    case 'signed-out':
      body = (
        <>
          {head('Create an account first', 'plasma', 'user')}
          <p className="mem-status-text">
            Premium belongs to an account, not a browser. The server checks your membership every time you press play, on every device — so you need to be signed
            in before you can join. Accounts are free.
          </p>
          <div className="mem-actions">
            <ButtonLink to="/account?mode=register&next=/membership" variant="aurum" icon="user">
              Create an account
            </ButtonLink>
            <ButtonLink to="/account?mode=signin&next=/membership">Sign in</ButtonLink>
          </div>
        </>
      );
      break;
    case 'none':
      body = (
        <>
          {head('Free account', 'ichor', 'lock')}
          <p className="mem-status-text">Everything marked Free is yours. Premium pods stay sealed until you join.</p>
          <div className="mem-actions">
            <Button variant="aurum" icon="diamond" onClick={onPlans}>
              See plans
            </Button>
          </div>
        </>
      );
      break;
    case 'active':
      body = (
        <>
          {head('Premium is active', 'aurum', 'diamond')}
          <p className="mem-status-text">
            Confirmed by the server{m.periodEnd ? `. Your current period runs until ${dateLabel(m.periodEnd)}.` : '.'} Change plan, payment method or cancel in the
            billing portal.
          </p>
          <div className="mem-actions">
            <Button variant="aurum" icon="settings" onClick={onPortal} busy={portalBusy}>
              Manage membership
            </Button>
          </div>
        </>
      );
      break;
    case 'cancelled':
      body = (
        <>
          {head(m.premium ? 'Cancelled — Premium until it ends' : 'Cancelled', 'aurum', 'time')}
          <p className="mem-status-text">
            {m.premium
              ? `Your membership won’t renew. Premium stays unlocked${m.periodEnd ? ` until ${dateLabel(m.periodEnd)}` : ' until the end of the paid period'}.`
              : 'Your membership won’t renew and Premium is no longer unlocked.'}
          </p>
          <div className="mem-actions">
            {m.source === 'stripe' ? (
              <Button variant="aurum" icon="replay" onClick={onPortal} busy={portalBusy}>
                Resubscribe in the billing portal
              </Button>
            ) : (
              <Button variant="aurum" icon="replay" onClick={onPlans}>
                Resubscribe
              </Button>
            )}
          </div>
        </>
      );
      break;
    case 'past_due':
      body = (
        <>
          {head('Payment needs attention', 'ember', 'info')}
          <p className="mem-status-text">
            The last payment didn&rsquo;t go through. Premium is {m.premium ? 'still unlocked for now' : 'paused'}. Update your payment method in the billing portal to
            keep it.
          </p>
          <div className="mem-actions">
            <Button variant="aurum" icon="settings" onClick={onPortal} busy={portalBusy}>
              Update payment method
            </Button>
          </div>
        </>
      );
      break;
    case 'expired':
      body = (
        <>
          {head('Your membership has ended', 'plasma', 'lock')}
          <p className="mem-status-text">
            Premium ended{m.periodEnd ? ` on ${dateLabel(m.periodEnd)}` : ''}. Your library, history and saved stories are untouched. Rejoin any time.
          </p>
          <div className="mem-actions">
            <Button variant="aurum" icon="diamond" onClick={onPlans}>
              Rejoin
            </Button>
          </div>
        </>
      );
      break;
    case 'dev_preview':
      body = (
        <>
          {head('Development preview', 'plasma', 'spark')}
          <p className="mem-status-text">
            Development preview — no payment taken. Premium is unlocked on this development server so reviewers can check premium screens. It is not a
            membership and is never available in production.
          </p>
        </>
      );
      break;
  }

  return (
    <div className="mem-status-inner" aria-live="polite">
      {body}
      {session.user && state !== 'loading' && state !== 'error' ? (
        <p className="mem-status-foot">
          {session.user.email} · {STATUS_LABEL[m.status]} · Premium {m.premium ? 'unlocked' : 'locked'}
        </p>
      ) : null}
    </div>
  );
}

/* ───────────── Plans ───────────── */

/** "$7.99 / month" → a large amount with a quiet period; the text reads the same. */
function PlanPrice({ text }: { text?: string | null }) {
  if (!text) return <p className="mem-price mem-price-unset">Price not set</p>;
  const cut = text.indexOf('/');
  if (cut < 0) return <p className="mem-price">{text}</p>;
  return (
    <p className="mem-price">
      <span className="mem-price-amt">{text.slice(0, cut).trim()}</span> <span className="mem-price-per">/ {text.slice(cut + 1).trim()}</span>
    </p>
  );
}

function PlanButton({
  action,
  label,
  busy,
  disabled,
  testMode,
  onCheckout,
  onPortal,
  portalBusy,
}: {
  action: ReturnType<typeof planAction>;
  label: string;
  busy: boolean;
  disabled: boolean;
  testMode: boolean;
  onCheckout: () => void;
  onPortal: () => void;
  portalBusy: boolean;
}) {
  switch (action) {
    case 'wait':
      return (
        <Button variant="aurum" disabled>
          Checking…
        </Button>
      );
    case 'unavailable':
      return <p className="mem-plan-off">Checkout unavailable · payments not connected</p>;
    case 'account':
      return (
        <ButtonLink to="/account?mode=register&next=/membership" variant="aurum" icon="user">
          Create an account to join
        </ButtonLink>
      );
    case 'portal':
      return (
        <Button variant="ghost" icon="settings" onClick={onPortal} busy={portalBusy} disabled={disabled && !portalBusy}>
          Manage in the billing portal
        </Button>
      );
    case 'checkout':
      return (
        <Button variant="aurum" icon="diamond" onClick={onCheckout} busy={busy} disabled={disabled} aria-label={`Join ${label}${testMode ? ' in Stripe test mode' : ''}`}>
          {busy ? 'Opening Stripe…' : testMode ? `Join ${label.toLowerCase()} · Stripe test mode` : `Join ${label.toLowerCase()}`}
        </Button>
      );
  }
}

function SetupPending({ plans }: { plans: MembershipConfig['plans'] }) {
  return (
    <div className="mem-setup panel panel-pad" role="note" aria-label="Payments are not connected">
      <h3 className="mem-setup-title">Payments aren&rsquo;t connected yet</h3>
      <p className="muted">
        You can&rsquo;t buy a membership on this server: no payment provider is configured, so no checkout opens and nothing can be charged. To switch
        payments on, the team needs to add Stripe credentials to the server&rsquo;s <code>.env</code> (step-by-step test-mode setup is in{' '}
        <code>.env.example</code>) and restart it:
      </p>
      <ul className="mem-env">
        <li>
          <code>STRIPE_SECRET_KEY</code> <span className="muted">— a test key starts with sk_test_</span>
        </li>
        <li>
          <code>STRIPE_WEBHOOK_SECRET</code> <span className="muted">— the signing secret that lets the server verify payment confirmations</span>
        </li>
        {plans.map((p) => (
          <li key={p.id}>
            <code>{p.stripePriceEnv}</code> <span className="muted">— Stripe price id for the {p.label.toLowerCase()} plan</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnlockSummary({ list }: { list: Video[] }) {
  if (!list.length) return <>Nothing in the catalogue needs Premium today.</>;
  const early = list.filter((v) => v.availability.status === 'early-access').length;
  const originals = list.filter((v) => v.provenance === 'monumental-original').length;
  return (
    <>
      {plural(list.length - early, 'Premium story', 'Premium stories')}
      {early ? ` and ${plural(early, 'early-access window')}` : ''}.{' '}
      {originals ? `${plural(originals, 'is a Monumental Original', 'are Monumental Originals')}.` : 'All of it is demonstration media — no Monumental Originals are published yet.'}
    </>
  );
}

function Benefits({ benefits }: { benefits: MembershipConfig['benefits'] }) {
  const live = benefits.filter((b) => b.live);
  const later = benefits.filter((b) => !b.live);
  return (
    <div className="mem-benefits">
      <div className="mem-benefit-col">
        <h3 className="mem-col-title">
          <span className="mem-led mem-led-live" aria-hidden="true" /> Live now
        </h3>
        {live.length ? (
          <ul>
            {live.map((b) => (
              <li key={b.id} className="mem-benefit is-live">
                <h4>{b.title}</h4>
                <p>{b.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No benefits are live yet.</p>
        )}
      </div>
      <div className="mem-benefit-col">
        <h3 className="mem-col-title">
          <span className="mem-led" aria-hidden="true" /> Planned — not available yet
        </h3>
        {later.length ? (
          <ul>
            {later.map((b) => (
              <li key={b.id} className="mem-benefit">
                <h4>{b.title}</h4>
                <p>{b.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing else is planned yet.</p>
        )}
      </div>
    </div>
  );
}

/* ───────────── Checkout return ───────────── */

function CheckoutReturnBanner({ kind, onDismiss }: { kind: 'success' | 'cancelled'; onDismiss: () => void }) {
  const { config } = useSession();
  const [phase, setPhase] = useState<'confirming' | 'confirmed' | 'unconfirmed'>(kind === 'success' ? 'confirming' : 'unconfirmed');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (kind !== 'success') return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const tick = async () => {
      const s = await refreshSession();
      if (cancelled) return;
      const next = confirmState(s.membership.status, Date.now() - started);
      setPhase(next);
      if (next === 'confirmed') sound.play('stamp');
      if (next === 'confirming') timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, attempt]);

  if (kind === 'cancelled') {
    return (
      <div className="wrap">
        <div className="mem-return notice" role="status">
          <Icon name="info" size={18} />
          <div>
            <p>
              <b>Checkout cancelled — nothing was charged.</b> You can choose a plan again whenever you like.
            </p>
          </div>
          <button type="button" className="icon-btn btn-quiet" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className={`mem-return notice ${phase === 'confirmed' ? 'notice-aurum' : phase === 'unconfirmed' ? 'notice-ember' : ''}`} role="status" aria-live="polite">
        <Icon name={phase === 'confirmed' ? 'diamond' : 'info'} size={18} />
        <div className="mem-return-body">
          {phase === 'confirming' ? (
            <>
              <p>
                <b>Confirming with Stripe…</b> Premium switches on only when Stripe&rsquo;s signed confirmation reaches our server. This usually takes a few
                seconds.
              </p>
              <span className="mem-return-pulse" aria-hidden="true" />
            </>
          ) : phase === 'confirmed' ? (
            <p>
              <b>Premium is active.</b> The server has confirmed your membership — every gold-sealed story is open to you.
            </p>
          ) : (
            <>
              <p>
                <b>Not confirmed yet.</b> We haven&rsquo;t received Stripe&rsquo;s confirmation, so Premium isn&rsquo;t switched on. The return from checkout alone
                never activates a membership.
              </p>
              <ul className="mem-return-list">
                <li>If you completed payment, confirmation can take a little longer — check again in a minute.</li>
                <li>Make sure you&rsquo;re signed in to the same account you used at checkout.</li>
                {config?.environment === 'development' ? (
                  <li>
                    Development: Stripe webhooks must be forwarded to <code>/api/billing/webhook</code> (for example with <code>stripe listen</code>).
                  </li>
                ) : null}
              </ul>
              <div className="mem-actions">
                <Button
                  icon="replay"
                  onClick={() => {
                    setPhase('confirming');
                    setAttempt((n) => n + 1);
                  }}
                >
                  Check again
                </Button>
              </div>
            </>
          )}
        </div>
        <button type="button" className="icon-btn btn-quiet" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ───────────── Development preview ───────────── */

const DEV_STATES: { status: Exclude<MembershipStatus, 'active'>; label: string }[] = [
  { status: 'dev_preview', label: 'Dev preview (premium unlocked)' },
  { status: 'cancelled', label: 'Cancelled (premium for 7 more days)' },
  { status: 'past_due', label: 'Past due' },
  { status: 'expired', label: 'Expired' },
  { status: 'none', label: 'Back to free' },
];

function DevPreview({ signedIn, current }: { signedIn: boolean; current: MembershipStatus }) {
  const [busy, setBusy] = useState<string | null>(null);
  const set = async (status: Exclude<MembershipStatus, 'active'>, label: string) => {
    setBusy(status);
    try {
      await auth.devMembership(status);
      toast(`Development preview: membership state set to “${label}”. No payment involved.`, { tone: 'success' });
    } catch (e) {
      toast(billingErrorMessage(e), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <section id="mem-dev" className="section mem-dev" aria-labelledby="mem-dev-h">
      <h2 id="mem-dev-h" className="mem-dev-title">
        <Icon name="spark" size={16} />
        Development preview
      </h2>
      <p className="mem-dev-text">
        Shown only on this development server. It switches <b>your own</b> membership state so every screen above can be checked. No payment is taken, simulated
        or sent to Stripe, and the server refuses it in production.
      </p>
      {signedIn ? (
        <div className="mem-dev-buttons" role="group" aria-label="Set your membership state">
          {DEV_STATES.map((d) => (
            <Button key={d.status} size="md" aria-pressed={current === d.status} busy={busy === d.status} disabled={busy !== null} onClick={() => set(d.status, d.label)}>
              {d.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mem-dev-text">
          Sign in to use the development preview. <ButtonLink to="/account?mode=signin&next=/membership">Sign in</ButtonLink>
        </p>
      )}
    </section>
  );
}
