/**
 * ACCOUNT — sign in, create an account, or see who you are. An account is what lets
 * My World travel between devices and what Premium attaches to; guests lose nothing,
 * because the guest library merges into the account automatically.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { dateLabel } from '../../lib/format.ts';
import { auth, refreshSession, useSession } from '../../state/session.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import { Pulse, toast } from '../../ui/feedback.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { STATUS_LABEL } from '../membership/status.ts';
import { MyWorldCrumbs } from '../you/Crumbs.tsx';
import { authErrorMessage, parseMode, PASSWORD_MIN, safeNext, validate, type FormValues, type Mode } from './validate.ts';
import './account.css';

export default function AccountPage() {
  const { session, status } = useSession();
  const [params] = useSearchParams();
  const mode = parseMode(params.get('mode'));

  useEffect(() => {
    document.title = `${session.user ? 'Your account' : mode === 'register' ? 'Create an account' : 'Sign in'} · Monumental Streams`;
  }, [session.user, mode]);

  if (status === 'loading') {
    return (
      <div className="page wrap acct">
        <h1 className="sr-only">Account</h1>
        <Pulse label="Checking your session" />
      </div>
    );
  }
  return session.user ? <SignedIn /> : <AuthForms mode={mode} />;
}

/* ───────────── Backdrop: the living membrane behind the glass ───────────── */

function Backdrop() {
  return (
    <div className="acct-backdrop" aria-hidden="true">
      <Art art="art:living-membrane" alt="" sizes="large" eager className="acct-backdrop-art" />
      <span className="acct-backdrop-shade" />
    </div>
  );
}

/* ───────────── What an account adds ───────────── */

function Why({ signedIn }: { signedIn: boolean }) {
  const items: { icon: IconName; title: string; body: ReactNode }[] = [
    {
      icon: 'synapse',
      title: 'My World on every device',
      body: 'Continue watching, saved stories and places, journeys, history, interests and settings sync to your account.',
    },
    {
      icon: 'diamond',
      title: 'Needed for Premium',
      body: 'A membership belongs to an account. The server checks it every time you press play, wherever you are signed in.',
    },
    {
      icon: 'check',
      title: signedIn ? 'Your guest library came with you' : 'Nothing you saved is lost',
      body: signedIn
        ? 'Whatever this browser held as a guest merged into your account when you signed in.'
        : 'Everything you saved as a guest in this browser merges into the account automatically.',
    },
    {
      icon: 'info',
      title: 'What isn’t here yet',
      body: (
        <>
          There&rsquo;s no email verification or password reset yet — both need a transactional email provider, which isn&rsquo;t connected. See{' '}
          <Link to="/about#about-integrations">integration status</Link>.
        </>
      ),
    },
  ];
  return (
    <aside className="acct-why" aria-labelledby="acct-why-h">
      <h2 id="acct-why-h" className="acct-why-title">
        What an account adds
      </h2>
      <ul className="acct-why-list">
        {items.map((it) => (
          <li key={it.title}>
            <span className="acct-why-node" aria-hidden="true">
              <Icon name={it.icon} size={18} />
            </span>
            <div>
              <h3 className="acct-why-item">{it.title}</h3>
              <p className="muted">{it.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ───────────── Sign in / register ───────────── */

function AuthForms({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { status } = useSession();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [values, setValues] = useState<FormValues>({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formId = useId();

  // Switching mode starts a fresh attempt (keeps what was typed).
  useEffect(() => {
    setSubmitted(false);
    setTouched({});
    setServerError(null);
  }, [mode]);

  const errors = validate(values, mode);
  const visible = (k: keyof FormValues) => (submitted || touched[k] ? errors[k] : undefined);
  const set = (k: keyof FormValues) => (v: string) => setValues((s) => ({ ...s, [k]: v }));
  const blur = (k: keyof FormValues) => () => setTouched((t) => ({ ...t, [k]: true }));

  const switchHref = (m: Mode) => {
    const p = new URLSearchParams();
    p.set('mode', m);
    if (next) p.set('next', next);
    return `/account?${p}`;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const errs = validate(values, mode);
    const first = (['name', 'email', 'password'] as const).find((k) => errs[k]);
    if (first) {
      sound.play('error');
      document.getElementById(`acct-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const s =
        mode === 'register' ? await auth.register(values.name.trim(), values.email.trim(), values.password) : await auth.signIn(values.email.trim(), values.password);
      sound.play('activate');
      const name = s.user?.name ?? '';
      toast(mode === 'register' ? `Welcome, ${name}. Your account is ready and My World now syncs across devices.` : `Welcome back, ${name}.`, { tone: 'success' });
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      setServerError(authErrorMessage(err, mode));
      setBusy(false);
      sound.play('error');
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  const register = mode === 'register';

  return (
    <div className="page acct">
      <Backdrop />
      <div className="wrap acct-stage">
        <section className="acct-card panel" aria-labelledby="acct-title">
          <MyWorldCrumbs here={register ? 'Create an account' : 'Sign in'} />
          <h1 id="acct-title" className="page-title acct-title">
            {register ? (
              <>
                Create an <em>account</em>
              </>
            ) : (
              <>
                Welcome <em>back</em>
              </>
            )}
          </h1>
          <p className="acct-switch">
            {register ? 'Already have an account?' : 'New to Monumental?'}{' '}
            <Link to={switchHref(register ? 'signin' : 'register')} replace>
              {register ? 'Sign in instead' : 'Create a free account'}
            </Link>
          </p>

          {status === 'offline' ? (
            <p className="notice acct-notice-attn">
              <Icon name="info" size={18} />
              <span>
                The account service can&rsquo;t be reached right now.{' '}
                <button type="button" className="acct-inline-btn" onClick={() => void refreshSession()}>
                  Try again
                </button>
              </span>
            </p>
          ) : null}

          <form id={formId} className="acct-form" noValidate onSubmit={submit} aria-describedby={serverError ? 'acct-server-error' : undefined}>
            {serverError ? (
              <p id="acct-server-error" ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
                {serverError}
              </p>
            ) : null}
            {register ? (
              <Field
                id="acct-name"
                label="Name"
                value={values.name}
                onChange={set('name')}
                onBlur={blur('name')}
                error={visible('name')}
                autoComplete="name"
                hint="How we greet you. Up to 80 characters."
              />
            ) : null}
            <Field
              id="acct-email"
              label="Email"
              type="email"
              inputMode="email"
              value={values.email}
              onChange={set('email')}
              onBlur={blur('email')}
              error={visible('email')}
              autoComplete={register ? 'email' : 'username'}
              spellCheck={false}
            />
            <Field
              id="acct-password"
              label="Password"
              type={show ? 'text' : 'password'}
              value={values.password}
              onChange={set('password')}
              onBlur={blur('password')}
              error={visible('password')}
              autoComplete={register ? 'new-password' : 'current-password'}
              hint={register ? `At least ${PASSWORD_MIN} characters. A short phrase is easier to remember than symbols.` : undefined}
              spellCheck={false}
              after={
                <button type="button" className="acct-reveal" aria-pressed={show} aria-controls="acct-password" onClick={() => setShow((v) => !v)}>
                  <span aria-hidden="true">{show ? 'Hide' : 'Show'}</span>
                  <span className="sr-only">{show ? 'Hide password' : 'Show password'}</span>
                </button>
              }
            />
            {register && values.password ? <Strength value={values.password} /> : null}
            <Button type="submit" variant="primary" size="lg" busy={busy} disabled={busy} iconAfter="arrow" className="acct-submit">
              {busy ? (register ? 'Creating your account…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}
            </Button>
            <p className="acct-fine muted">
              {register
                ? 'Free. No payment details needed. Your guest library in this browser merges in automatically.'
                : 'Forgotten your password? Reset isn’t available yet — it needs an email provider that isn’t connected.'}
            </p>
          </form>
        </section>
        <Why signedIn={false} />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  after,
  type = 'text',
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error?: string;
  hint?: string;
  after?: ReactNode;
  type?: string;
  autoComplete?: string;
  inputMode?: 'email' | 'text';
  spellCheck?: boolean;
}) {
  const described = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field acct-field ${after ? 'has-after' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="acct-input-wrap">
        <input
          id={id}
          name={id.replace('acct-', '')}
          className="input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          required
          autoCapitalize="off"
          {...rest}
        />
        {after}
      </div>
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="acct-field-error" id={`${id}-err`}>
          <Icon name="info" size={14} /> {error}
        </p>
      ) : null}
    </div>
  );
}

/** A length meter (not a promise of security): purely about reaching the minimum and beyond. */
function Strength({ value }: { value: string }) {
  const pct = Math.min(100, (value.length / (PASSWORD_MIN * 2)) * 100);
  const ok = value.length >= PASSWORD_MIN;
  return (
    <div className={`acct-meter ${ok ? 'is-ok' : ''}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────────── Signed in ───────────── */

function SignedIn() {
  const { session, config } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = session.user!;
  const email = config?.integrations.find((i) => i.id === 'email');
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '·';

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signOut();
      sound.play('close');
      toast('Signed out. This browser now shows its own guest library; your account keeps everything.', { tone: 'success' });
    } catch (e) {
      setError((e as { status?: number }).status === 0 ? 'The connection dropped. Check your network and try again.' : 'We couldn’t sign you out just now. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="page acct">
      <Backdrop />
      <div className="wrap acct-stage">
        <section className="acct-card panel" aria-labelledby="acct-profile-h">
          <MyWorldCrumbs here="Account" />
          <h1 className="page-title acct-title">
            Your <em>account</em>
          </h1>
          <div className="acct-profile-head">
            <span className="acct-avatar display" aria-hidden="true">
              {initials}
            </span>
            <div>
              <h2 id="acct-profile-h" className="acct-name">
                {user.name}
              </h2>
              <p className="acct-email">{user.email}</p>
            </div>
          </div>
          <dl className="acct-facts">
            <div>
              <dt>Member since</dt>
              <dd>{dateLabel(user.createdAt)}</dd>
            </div>
            <div>
              <dt>Membership</dt>
              <dd>
                {STATUS_LABEL[session.membership.status]}
                {session.membership.premium ? ' · Premium unlocked' : ''}
              </dd>
            </div>
            <div>
              <dt>My World</dt>
              <dd>Synced to this account</dd>
            </div>
          </dl>
          <div className="acct-actions">
            <ButtonLink to="/my-world" variant="primary" icon="user">
              My World
            </ButtonLink>
            <ButtonLink to="/membership" icon="diamond">
              Membership
            </ButtonLink>
            <Button onClick={signOut} busy={busy} disabled={busy} icon="arrow">
              {busy ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {email?.status !== 'connected' ? (
            <div className="notice acct-note">
              <Icon name="info" size={18} />
              <p>
                <b>Password reset</b> needs a transactional email provider, which isn&rsquo;t configured yet. Until then a forgotten password can&rsquo;t be reset
                from the app, so keep yours safe. See <Link to="/about#about-integrations">integration status</Link>.
              </p>
            </div>
          ) : null}
          <p className="acct-fine muted">Signing out returns this browser to an empty guest library. Your account keeps everything.</p>
        </section>
        <Why signedIn />
      </div>
    </div>
  );
}
