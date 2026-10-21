# Integrations: what works now, and what is waiting for credentials

Monumental's own viewing, discovery and personal experience works on its own. Nothing below is needed for the app to run.

## Working now (no credentials needed)

| Capability | Implementation |
|---|---|
| Accounts | `server/auth.ts`: email + password, scrypt hashes with a per-user salt, HttpOnly `ms_sid` session cookie (stored as a SHA-256 hash), CSRF double-submit cookie plus Origin check, in-memory rate limits. |
| Cross-device library sync | `GET/PUT /api/me/library`. The server merges with `mergeLibraries` (last writer wins per entry; removals use tombstones). Guests keep their library in `localStorage` only, and the app labels that clearly. |
| Server-authorised entitlements | `server/entitlements.ts` decides premium access. `POST /api/playback/:id` issues HMAC-signed, four-hour stream tokens. `/stream/*` checks the token on every playlist and segment. Premium tokens also need the same live session. |
| Membership states | `none`, `active`, `cancelled` (premium until period end), `past_due`, `expired`, `dev_preview`. |
| Development preview | `POST /api/dev/membership` lets a signed-in reviewer move through every state **without any payment**. It is enabled only outside production with `DEV_PREVIEW_MEMBERSHIP=true`, and is always off in production. The UI shows it in a separate, clearly marked DEV panel. |

## Waiting for credentials

| Integration | Status | What to provide |
|---|---|---|
| **Stripe subscriptions** | Code is complete: Checkout Session, Customer Portal, and signature-verified webhooks for `checkout.session.completed`, `customer.subscription.*` and `invoice.payment_failed`, with idempotent processing. Without keys the app reports `billing.mode = setup-pending` and takes no payment. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` and/or `STRIPE_PRICE_YEARLY`. Step-by-step test-mode setup is in `.env.example`. Not yet run against real Stripe test keys; it is exercised with signed fixture payloads in `tests/unit/server-*.test.ts`. |
| **Transactional email** | Not configured. Password reset and email verification need a provider. | A provider API key (e.g. Postmark, SES or Resend), then a small adapter in `server/auth.ts`. |
| **Current activity feed** (events, releases, live status) | Not connected. `/api/activity` serves only maintained, in-date items from `content/activity.json`, which is currently empty, so the UI shows nothing. | A maintained editorial file, or an events API adapter that writes the same `ActivityItem` shape. |
| **External availability** (where content can be found elsewhere) | Not connected. `content/external.json` is empty. | Verified entries (`video`, `service`, `url`, `verifiedAt`) or a provider adapter. |
| **Weather / venue status** | Not connected and not shown anywhere. | An adapter behind `/api/activity`; the UI already hides modules that have no data. |
| **Analytics, admin, creator portal, editorial workflow** | Out of scope for this phase. Content is JSON with stable ids, so a CMS can write the same files or feed an importer. | — |

## Replacing the persistence layer

* **Client:** `src/state/library.ts` exposes a `LibraryAdapter` interface (`load`, `save`). Implement it for any backend and call `attachAdapter`.
* **Server:** `server/db.ts` uses Node's built-in `node:sqlite`. Swapping in Postgres means re-implementing the small repository functions in `server/db.ts`, `server/auth.ts`, `server/library.ts` and `server/entitlements.ts`.
* **Rate limits** are kept in memory per process. With more than one instance, move them to a shared store such as Redis.
