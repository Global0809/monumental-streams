/**
 * Dependencies shared by every route module. Built once in createApp; tests can inject
 * `now` (clock) and `fetch` (Stripe API) to exercise time- and network-dependent paths.
 */
import type { ServerConfig } from './config.ts';
import type { LoadedContent } from './content.ts';
import type { AppDatabase } from './db.ts';
import type { EntitlementPolicy } from './entitlements.ts';
import type { Logger } from './log.ts';
import type { Csrf, RateLimiter } from './security.ts';

export interface AppContext {
  config: ServerConfig;
  db: AppDatabase;
  content: LoadedContent;
  csrf: Csrf;
  logger: Logger;
  policy: EntitlementPolicy;
  limits: {
    authPerIdentity: RateLimiter; // ip + email
    authPerIp: RateLimiter; // backstop against spraying many emails from one address
    playback: RateLimiter; // ip
  };
  now: () => Date;
  fetch: typeof fetch;
}
