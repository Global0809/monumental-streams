/**
 * Asks the server for a playback grant. The server alone decides entitlement; this hook
 * only mirrors its answer as a state the player can render. Grants are refreshed before
 * they expire and on demand (a stream request refused its token).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Video } from '../../../../shared/types.ts';
import { api, ApiError } from '../../../lib/api.ts';
import type { PlaybackData } from './engine.ts';

export type SourceState =
  | { status: 'planned' }
  | { status: 'loading' }
  | { status: 'ready'; data: PlaybackData }
  | { status: 'gate'; signedIn: boolean; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string; offline: boolean };

const REFRESH_LEAD_MS = 60_000;

function toState(err: unknown): SourceState {
  if (err instanceof ApiError) {
    if (err.status === 403 && err.code === 'premium_required') return { status: 'gate', signedIn: err.body.signedIn === true, message: err.message };
    if (err.status === 409 || err.code === 'unavailable') return { status: 'unavailable', message: err.message };
    if (err.status === 404) return { status: 'missing', message: err.message };
    if (err.status === 0) return { status: 'error', message: err.message, offline: true };
    if (err.status === 429) return { status: 'error', message: 'Too many playback requests in a short time. Wait a moment, then try again.', offline: false };
    return { status: 'error', message: err.message || 'The stream could not be prepared.', offline: false };
  }
  return { status: 'error', message: 'The stream could not be prepared.', offline: false };
}

export function usePlaybackSource(video: Video, identityKey: string) {
  const hasMedia = !!video.media;
  const [state, setState] = useState<SourceState>(hasMedia ? { status: 'loading' } : { status: 'planned' });
  const [attempt, setAttempt] = useState(0);
  const inflight = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const request = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<boolean> => {
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      if (mode === 'initial') setState({ status: 'loading' });
      try {
        const data = await api<PlaybackData>(`/api/playback/${encodeURIComponent(video.slug)}`, { method: 'POST', signal: ac.signal });
        if (ac.signal.aborted) return false;
        setState({ status: 'ready', data });
        return true;
      } catch (err) {
        if (ac.signal.aborted || (err as Error).name === 'AbortError') return false;
        setState(toState(err));
        return false;
      }
    },
    [video.slug],
  );

  useEffect(() => {
    if (!hasMedia) {
      setState({ status: 'planned' });
      return;
    }
    void request('initial');
    return () => inflight.current?.abort();
  }, [hasMedia, request, attempt]);

  // Signing in or upgrading elsewhere in the app: ask again if we were refused.
  const firstIdentity = useRef(true);
  useEffect(() => {
    if (firstIdentity.current) {
      firstIdentity.current = false;
      return;
    }
    const s = stateRef.current.status;
    if (hasMedia && (s === 'gate' || s === 'error' || s === 'unavailable')) void request('initial');
  }, [identityKey, hasMedia, request]);

  // Renew the grant shortly before it lapses.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const expires = Date.parse(state.data.expiresAt);
    if (!Number.isFinite(expires)) return;
    const wait = Math.min(2 ** 31 - 1, Math.max(5_000, expires - Date.now() - REFRESH_LEAD_MS));
    const id = window.setTimeout(() => void request('refresh'), wait);
    return () => window.clearTimeout(id);
  }, [state, request]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const refresh = useCallback(() => request('refresh'), [request]);
  return { state, retry, refresh };
}
