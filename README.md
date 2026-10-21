# MONUMENTAL STREAMS

**Stream the world.** *Explore what you love. Discover where it lives.*

A streaming and cultural-discovery platform. Viewers watch stories, then follow their connections across people, places, creative disciplines, movements and time. Miami is the gateway.

## The concept: *The Organism*

Monumental is built as a living biomechanical machine whose nervous system carries stories between places and eras.

- **Navigation is a spine.** Each vertebra is one organ: Stream, Catalogue, Living Atlas, Chronometer, Synapse, Take Me Somewhere, Culture Passport and Your World. The spinal cord fills as you scroll, and its nodes are the page's chapters.
- **Content lives in glass specimen pods.** A pod wakes and plays its preview loop on hover or keyboard focus.
- **Connections are veins.** Ichor pulses run along them, and every link explains *why* it exists.
- **The system has a heartbeat.** It drives the breathing UI, the synthesised ambience (silent until you wake it) and the nucleus cursor. While a programme plays, the heartbeat slows and the interface recedes.

## Run it

Requirements: **Node ≥ 22.18** (tested on 24.18) and **ffmpeg/ffprobe** on PATH (only needed to rebuild media).

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The API runs on port 8787, and Vite proxies `/api`, `/stream` and `/media` to it.

The generated media (`media/`) and the source films (`sources/`) are already in this folder. To rebuild them from scratch:

```bash
npm run media:previews    # studio loops → web previews, posters, LQIP
npm run media:build       # reels + archive films → HLS ladders, MP4 fallback, captions, chapters, thumbnails
npm run media:archive-art # real poster stills + preview loops for every film
npm run globe:build       # Natural Earth land → globe dot field + 2D map paths
```

Production:

```bash
npm run build
NODE_ENV=production SESSION_SECRET=… PLAYBACK_TOKEN_SECRET=… APP_ORIGIN=https://your.host npm start
```

In production one Node process serves `dist/`, the API and protected media. Every variable is documented in `.env.example`.

## Checks

```bash
npm run typecheck        # TypeScript, whole project
npm test                 # unit tests: engine, server, player helpers…
npm run test:e2e         # Playwright journeys (reuses a running `npm run dev`)
npm run content:check    # validate the catalogue + media references
```

Latest results (21 Oct 2026, Windows 11, Chromium):

- `npm run typecheck`: 0 errors.
- `npm test`: 524 unit tests in 42 files pass.
- `npm run test:e2e`: 183 journeys pass and 8 are skipped (mobile-only on desktop and vice versa), across desktop and a Pixel 7 phone profile. They cover:
  - the API and the shell;
  - playback, resume and membership states;
  - World, the Time Machine and the eight category pages;
  - Live, My World and Home;
  - the interaction layer;
  - accessibility and responsiveness: axe WCAG 2.1 AA, overflow and 44 px touch targets at 390, 820 and 1440 px.
- A few long journeys sometimes time out when the whole suite runs in parallel against the dev server. Each passes when re-run alone.

## Navigation

Home · World (`/world`) · Time Machine (`/time-machine`) · Live · Movies · Music · Sports · Gaming · News · Fashion · Culture · Kids · My World (`/my-world`). Search, Sound, Settings and Profile are separate utility controls. Old `/atlas`, `/time` and `/you` links redirect. The destinations and how each one maps onto the catalogue are defined in `shared/sections.ts`.

## Where things are

| Path | What |
|---|---|
| `content/` | The one central catalogue: JSON with stable ids. One file per video in `content/videos/`. |
| `shared/` | Isomorphic engine: content schema, catalogue indexes, search/filters, URL state, relations, recommendations, journey planner, library merge. |
| `server/` | Express 5: auth, sessions, CSRF, entitlements, signed playback, protected streaming, library sync, Stripe billing, dev preview. |
| `src/` | React 19 client: shell + systems (sound, cursor, motion, heartbeat, previews) + feature organs. |
| `scripts/` | Media pipeline, globe builder, content check/import, screenshot helper. |
| `docs/` | `ARCHITECTURE.md`, `CONTENT.md` (content-entry guide), `MEDIA.md`, `ASSET-MANIFEST.md`, `INTEGRATIONS.md`, `ASSUMPTIONS.md`. |

## Honesty notes

- **No Monumental Original has finished episodes yet.** WAVEMAKERS, *THE STORY BEHIND THE STORY* and *Better Late Than Never* are shown as in development, planned or announced. Their teasers are labelled as illustrative motion concepts.
- **Playable items are demonstration media.** They are reels built from the studio's motion loops, plus public-domain and Creative Commons films (1905–2012). Each has its provenance, footage type, licence and, where needed, a context card.
- **Prices and premium benefits are development examples.** No real payment can happen until Stripe keys are configured; see `docs/INTEGRATIONS.md`.
