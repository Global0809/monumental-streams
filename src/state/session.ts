/**
 * Session + platform configuration. The server is the authority for identity and
 * entitlements; the client only mirrors SessionInfo and never decides premium access.
 */
import type { MembershipStatus, PlatformConfig, SessionInfo } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { createStore, useStore } from '../lib/store.ts';

export interface SessionState {
  status: 'loading' | 'ready' | 'offline';
  session: SessionInfo;
  config: PlatformConfig | null;
}

const SIGNED_OUT: SessionInfo = {
  user: null,
  membership: { status: 'none', premium: false, periodEnd: null, source: null },
  csrf: '',
};

export const sessionStore = createStore<SessionState>({ status: 'loading', session: SIGNED_OUT, config: null });

export async function refreshSession(): Promise<SessionInfo> {
  try {
    const [session, config] = await Promise.all([
      api<SessionInfo>('/api/session'),
      sessionStore.get().config ? Promise.resolve(sessionStore.get().config!) : api<PlatformConfig>('/api/config'),
    ]);
    sessionStore.set({ status: 'ready', session, config });
    return session;
  } catch {
    sessionStore.set((s) => ({ ...s, status: 'offline' }));
    return sessionStore.get().session;
  }
}

function accept(session: SessionInfo) {
  sessionStore.set((s) => ({ ...s, status: 'ready', session }));
  return session;
}

export const auth = {
  signIn: (email: string, password: string) =>
    api<SessionInfo>('/api/auth/login', { method: 'POST', body: { email, password } }).then(accept),
  register: (name: string, email: string, password: string) =>
    api<SessionInfo>('/api/auth/register', { method: 'POST', body: { name, email, password } }).then(accept),
  signOut: () => api<SessionInfo>('/api/auth/logout', { method: 'POST' }).then(accept),
  /** Development preview only: the server refuses this in production. No payment is involved. */
  devMembership: (status: Exclude<MembershipStatus, 'active'>) =>
    api<SessionInfo>('/api/dev/membership', { method: 'POST', body: { status } }).then(accept),
  checkout: (plan: string) => api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { plan } }),
  portal: () => api<{ url: string }>('/api/billing/portal', { method: 'POST' }),
};

export const useSession = () => useStore(sessionStore);
