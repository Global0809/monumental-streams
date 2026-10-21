# MONUMENTAL STREAMS

**Stream the world.** *Explore what you love. Discover where it lives.*

A streaming and cultural-discovery platform. Viewers watch stories, then follow their connections across people, places, creative disciplines, movements and time. Miami is the gateway.

## The concept: *The Living Archive*

One persistent 3D world lives behind every route (`src/stage/`). Every story in the catalogue is a **seed**, a glass capsule carrying its poster. Navigating re-forms that world instead of swapping pages:

- **Home:** seeds orbit the Monumental spine, with the nine category **organs** around it.
- **World:** the seeds settle on a night globe at their real places, with Miami as the gateway.
- **Time Machine:** the seeds unspool along a helix of decades, re-sorted by the setting / made / published lens.
- **Categories:** each category's organ draws its stories in.
- **Story, Watch and My World:** a story comes forward with its connections, the world dims behind the player, and saved seeds orbit your own core.

The page stays the accessible source of truth: hovering a card lights its seed, and clicking a seed does what the card's link does. Without WebGL, or with effects off, every route still works. The full direction is in `docs/LIVING-ARCHIVE.md`.

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

GitHub Pages (static guest demo at https://global0809.github.io/monumental-streams/):

```bash
MS_BASE=/monumental-streams/ VITE_STATIC=1 npx vite build
MS_BASE=/monumental-streams/ node scripts/build-static.ts
node scripts/serve-pages.mjs
```

The last command previews `dist/` exactly as Pages serves it (base path, 404.html fallback) at http://localhost:4180/monumental-streams/. On Git Bash, set `MSYS_NO_PATHCONV=1` first so the base path isn't rewritten. Then push `dist/` to the `gh-pages` branch. The Pages build has no server: it runs in guest mode with compact 480p copies of the films, and accounts, sync and membership need the Node host.

## Checks

```bash
npm run typecheck        # TypeScript, whole project
npm test                 # unit tests: engine, server, player helpers…
npm run test:e2e         # Playwright journeys (reuses a running `npm run dev`)
npm run content:check    # validate the catalogue + media references
```

Latest results (21 Oct 2026, Windows 11, Chromium):

- `npm run typecheck`: 0 errors.
- `npm test`: 615 unit tests in 46 files pass.
- `npm run test:e2e`: 207 journeys pass and 9 are skipped (mobile-only on desktop and vice versa), across desktop and a Pixel 7 phone profile. They cover:
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
| `src/stage/` | The persistent 3D world: contract, store, layouts, the lazy Three.js engine and the procedural category organs. |
| `docs/` | `LIVING-ARCHIVE.md` (creative direction), `ART-DIRECTION.md`, `ARCHITECTURE.md`, `CONTENT.md` (content-entry guide), `MEDIA.md`, `ASSET-MANIFEST.md`, `INTEGRATIONS.md`, `ASSUMPTIONS.md`. |

## Honesty notes

- **No Monumental Original has finished episodes yet.** WAVEMAKERS, *THE STORY BEHIND THE STORY* and *Better Late Than Never* are shown as in development, planned or announced. Their teasers are labelled as illustrative motion concepts.
- **Playable items are demonstration media.** They are reels built from the studio's motion loops, plus public-domain and Creative Commons films (1905–2012). Each has its provenance, footage type, licence and, where needed, a context card.
- **Prices and premium benefits are development examples.** No real payment can happen until Stripe keys are configured; see `docs/INTEGRATIONS.md`.
