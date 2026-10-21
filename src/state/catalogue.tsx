/**
 * Catalogue provider. Fetches the single content payload once, builds the shared indexes,
 * and keeps a sessionStorage copy so refreshes render instantly (stale-while-revalidate).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { buildCatalogue, type Catalogue } from '../../shared/catalogue.ts';
import type { CataloguePayload } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

const CACHE_KEY = 'ms.catalogue.v1';
const Ctx = createContext<Catalogue | null>(null);

function readCache(): CataloguePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CataloguePayload) : null;
  } catch {
    return null;
  }
}

function writeCache(p: CataloguePayload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    /* quota or privacy mode — the network copy still works */
  }
}

export function CatalogueProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error: string | null; retry: () => void }) => ReactNode }) {
  const [cat, setCat] = useState<Catalogue | null>(() => {
    const cached = readCache();
    return cached ? buildCatalogue(cached) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    api<CataloguePayload>('/api/catalogue', { signal: ac.signal })
      .then((payload) => {
        writeCache(payload);
        setCat((prev) => (prev && prev.version === payload.version ? prev : buildCatalogue(payload)));
        setError(null);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'The catalogue could not be reached.');
      });
    return () => ac.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  if (!cat) return <>{fallback({ error, retry })}</>;
  return <Ctx.Provider value={cat}>{children}</Ctx.Provider>;
}

export function useCatalogue(): Catalogue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCatalogue must be used inside <CatalogueProvider>');
  return c;
}
