/**
 * Personal library sync for signed-in users (the client's ServerAdapter).
 *
 * PUT never overwrites blindly: the incoming library is migrated to the current shape and
 * merged with the stored one via shared/library.ts (last-write-wins per entry, tombstones),
 * so two devices syncing concurrently both keep their changes. The merged result is
 * returned for the client to adopt.
 */
import express from 'express';
import { mergeLibraries, migrateLibrary } from '../shared/library.ts';
import type { Library } from '../shared/types.ts';
import { requireUser } from './auth.ts';
import type { AppContext } from './context.ts';
import { HttpError } from './http.ts';

/** Larger than the default API body limit: a library carries history, progress and journeys. */
export const LIBRARY_BODY_LIMIT = '256kb';

export function libraryRouter(ctx: AppContext) {
  const router = express.Router();
  router.use('/me/library', express.json({ limit: LIBRARY_BODY_LIMIT }));

  const stored = (userId: string): Library | null => {
    const row = ctx.db.libraries.get(userId);
    return row ? migrateLibrary(JSON.parse(row.json)) : null;
  };

  router.get('/me/library', (_req, res) => {
    const user = requireUser(res);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ library: stored(user.id) });
  });

  router.put('/me/library', (req, res) => {
    const user = requireUser(res);
    const body: unknown = req.body;
    const candidate = typeof body === 'object' && body !== null ? (body as { library?: unknown }).library : undefined;
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new HttpError(400, 'invalid_request', 'Expected a JSON body of the form { "library": { … } }.');
    }
    const incoming = migrateLibrary(candidate);
    // Synchronous read-merge-write: atomic with respect to other requests on this process.
    const current = stored(user.id);
    const merged = current ? mergeLibraries(current, incoming) : incoming;
    ctx.db.libraries.put(user.id, JSON.stringify(merged), ctx.now().getTime());
    res.setHeader('Cache-Control', 'no-store');
    res.json({ library: merged });
  });

  return router;
}
