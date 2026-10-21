# Media pipeline

Everything playable on Monumental Streams is generated from files in `sources/` and the
definitions in `content/media-sources.json`. Nothing under `media/` is edited by hand; it can be
deleted and rebuilt at any time.

```
sources/previews/*.mp4 ──► scripts/build-previews.sh ──► media/public/previews, posters  (loop art)
                                     │
content/media-sources.json ──────────┼──► scripts/build-media.ts ──► media/protected/<slug>/   HLS + MP4 (token-gated)
content/captions/*.vtt|srt           │                               media/public/captions|chapters|thumbs
sources/library/* (finished films)   │                               media/manifest.json, media/art.json
                                     │                               docs/ASSET-MANIFEST.md
node_modules/world-atlas ────────────┴──► scripts/build-globe.ts ──► public/data/globe-dots.json, land-paths.json
```

Requirements: Node ≥ 22.18 (scripts run with native type stripping) and `ffmpeg`/`ffprobe` 7+ on
`PATH` (built with libx264, libwebp and the `aevalsrc`/`anoisesrc` lavfi sources, as all common
builds are). Nothing is downloaded.

## Commands

| Command | What it does |
|---|---|
| `npm run media:previews` | Web-weight loop derivatives: `media/public/previews/<stem>-720.mp4`, `-480.mp4`, `media/public/posters/<stem>-1280.webp`, `-640.webp`, `-lqip.txt`. Skips files that already exist. |
| `npm run media:build` | Builds every asset in `content/media-sources.json` that changed since the last build, then rewrites `media/manifest.json`, `media/art.json` and `docs/ASSET-MANIFEST.md`. |
| `npm run media:build -- --only media:reel-living-atlas` | Builds one asset (repeatable or comma-separated). |
| `npm run media:build -- --force` | Rebuilds even if nothing changed. |
| `npm run media:build -- --verify-only` | Builds nothing; re-checks every built asset (playlists parse, every segment exists, each rendition probes at the right size, fallback and public tracks exist). |
| `npm run media:build -- --keep-work` | Keeps `media/.work/<slug>/` (score WAV, mezzanine, rendition MP4s) for debugging. |
| `npm run globe:build` | Regenerates the globe dot lattice and the flat-map land path. |
| `npm run content:add -- --file … --slug … --title …` | Imports a finished video (see [Adding a programme](#adding-a-programme-or-film)). |

Builds are incremental: each asset's definition, source files, caption files and the code of the
encoding modules (`scripts/lib/{compose,encode,hls,reel,score,vtt}.ts`) are hashed into
`media/.build-state.json`. Up to three assets build in parallel. Each asset is built in
`media/.work/<slug>/`, verified, and only then swapped into place, so a failed build never leaves a
half-written asset and the previous version keeps serving.

## Asset definitions — `content/media-sources.json`

An array of two kinds of entry. Ids are stable (`media:<slug>`); videos in `content/videos/*.json`
point at them with `"media": "media:<slug>"`, and output files are named by `<slug>`.

**`reel`** — composed from studio motion loops with an original generated score.

| Field | Meaning |
|---|---|
| `id`, `title` | `media:<slug>`; a working title (the viewer-facing title lives on the video). |
| `loops` | Loop stems in order, e.g. `"15-miami-isometric"`. |
| `repeat` | Optional. Plays each loop this many times back to back (seamless, no transition). |
| `captions` | `[{ lang, label, kind, src, default? }]`, `src` a project-relative `.vtt`/`.srt`. |
| `chapters` | `true` writes one chapter per loop. |
| `score` | `{ seed, root: A\|C\|D\|E\|F\|G, mood: dark\|bright }` — same values, same audio. |
| `provenance` | Always `"studio-concept"`. |
| `notes` | Editorial notes (appear nowhere in the app). |

**`file`** — a finished video file (archive film, open movie, a delivered Monumental programme).

| Field | Meaning |
|---|---|
| `source` | Project-relative path, normally `sources/library/<slug>.<ext>`. |
| `trim` | Optional `{ start, end }` in seconds; captions are shifted to match. |
| `captions` | Optional, as above. SRT is converted to WebVTT. |
| `licence`, `attribution`, `sourceUrl?` | Exactly as they must be displayed. |
| `provenance` | `"public-domain"` or `"creative-commons"`. |
| `notes` | Where the file came from, what was checked. |

The file is validated with zod (`scripts/lib/media-sources.ts`) before anything is encoded.

## How an asset is built

1. **Source.** A `file` asset uses its file (with `trim`). A `reel` is composed first into a 1080p
   mezzanine (H.264 CRF 13, AAC 160 kb/s):
   * loops are conformed to the first loop's size and rate and joined with **0.6 s crossfades**
     (`xfade=fade`); repeats of the same loop are not crossfaded;
   * the **score** is synthesised with ffmpeg lavfi only (`scripts/lib/score.ts`): one sustained
     7th chord per loop (sine + triangle partials, slight stereo detune, slow shimmer and swell) over
     a sine sub-bass, chords crossfaded exactly where the picture crossfades; soft metallic ticks
     (inharmonic partials, fast decay) starting at 1 s; band-passed pink-noise "breath"; slow
     tremolo, short echo, gentle low-pass, 1 s fade-in and 1.5 s fade-out. It is rendered to the
     exact sample length of the picture and loudness-matched to **−16 LUFS integrated, −1.5 dBTP**
     with two-pass linear `loudnorm` (measured values are stored in `media/.build-state.json`).
2. **Renditions.** One decode feeds every rung of the ladder below that is not taller than the
   source (never upscaled; a source under 360p is encoded at its own height). Interlaced sources are
   deinterlaced (`bwdif`), non-square pixels are made square, rotation is honoured.
3. **HLS.** Each rendition is split into a VOD playlist `media/protected/<slug>/<height>/index.m3u8`
   with 4 s MPEG-TS segments `seg-NNN.ts`.
4. **Master playlist** `media/protected/<slug>/master.m3u8`, written by the script with
   `BANDWIDTH` (peak segment bit rate), `AVERAGE-BANDWIDTH`, `RESOLUTION`, `CODECS` (the avc1
   profile/level string read from the encoded stream's `avcC` box, plus `mp4a.40.2` when there is
   audio) and `FRAME-RATE`. The fallback rendition is listed first because players start on the
   first variant; the rest follow highest to lowest.
5. **Progressive fallback** `media/protected/<slug>/720.mp4` — the highest rendition ≤ 720p, with
   `+faststart` (so a source below 720p yields e.g. `480.mp4`; the manifest has the exact name).
6. **Public tracks** — captions, chapters and thumbnails (below).
7. **Verification** — every playlist parses, every segment exists and is non-empty, each variant
   lasts the measured duration (±0.25 s) and probes as H.264 at the expected size, and every public
   file referenced by the manifest exists. Only then is the asset published.

### Encoding ladder

| Rung | Size (16:9) | Profile | Level (30 fps) | Video | Audio |
|---|---|---|---|---|---|
| 1080p | 1920×1080 | High | 4.0 | CRF 21, max 4.5 Mb/s (VBV 9 Mb) | AAC-LC 128 kb/s stereo 48 kHz |
| 720p | 1280×720 | High | 3.1 | CRF 22, max 2.5 Mb/s | same |
| 480p | 854×480 | Main | 3.1 | CRF 23, max 1.2 Mb/s | same |
| 360p | 640×360 | Main | 3.0 | CRF 24, max 0.7 Mb/s | same |

All renditions: x264 `preset slow`, yuv420p, keyframes every 2 s (`-g`/`-keyint_min` = 2 × fps,
`-sc_threshold 0`, plus forced keyframes at exact 2 s multiples for fractional frame rates), so
segment boundaries line up across renditions. The level is the lowest that fits the rendition's
size, frame rate and bit-rate cap (a 60 fps source gets 4.2 / 3.2), and x264 caps reference frames
to it. Widths follow the source's display aspect ratio (a 4:3 film gives 640×480, 480×360).

### Delivery

* `media/protected/**` is never served directly. `POST /api/playback/:videoId` checks entitlement
  and returns signed URLs; `GET /stream/:mediaId/*?t=token` serves files from
  `media/protected/<slug>/` and rewrites playlists so every segment URI carries the token. Segments
  are MPEG-TS (no `EXT-X-MAP` init segment), so only segment lines need rewriting.
* The manifest stores protected paths relative to `media/protected/`
  (`hls: "<slug>/master.m3u8"`, `mp4: "<slug>/720.mp4"`); they never reach the client.
* Every asset has both an HLS package and a progressive MP4, so a player can use hls.js where
  Media Source Extensions exist, native HLS in Safari, and the MP4 when neither works.

### Captions, chapters, thumbnails

| Output | URL | Notes |
|---|---|---|
| Captions | `/media/public/captions/<slug>.<lang>.vtt` (`.descriptions.vtt` for described tracks) | WebVTT. SRT converted; `file` trims applied; cues clipped to the measured end (cues wholly outside are dropped and reported). Reel captions must fit the timeline exactly — an overrun fails the build. |
| Chapters | `/media/public/chapters/<slug>.vtt` | Reels: one cue per loop titled from the stem (`scripts/lib/loops.ts`), boundaries in the middle of each crossfade. |
| Thumbnails | `/media/public/thumbs/<slug>.vtt` + `<slug>.webp` | One 160×90 tile every max(2, ⌈duration/100⌉) s, grid as square as possible; cue text is `/media/public/thumbs/<slug>.webp#xywh=x,y,160,90`. |

### Outputs that describe the media

* **`media/manifest.json`** — `Record<mediaId, MediaAsset>` exactly as in `shared/types.ts`:
  measured `duration` (ffprobe on the fallback MP4, seconds to 3 decimals — this is the runtime
  the catalogue shows), top `width`/`height`, `hasAudio`, `renditions` (measured width/height and
  average bit rate), `hls`, `mp4`, `captions`, `chapters`, `thumbnails`, and a `source` note.
* **`media/art.json`** — `Record<stem, { poster, posterSmall, lqip, preview?, previewSmall? }>` for
  every stem with a `<stem>-1280.webp` in `media/public/posters`; `lqip` is the data URI itself.
  Content art records (`content/art.json`, `art:*` ids) point at these stems.
* **`docs/ASSET-MANIFEST.md`** — generated inventory: every asset with sources, provenance and
  licence, attribution, duration, renditions and bit rates, file locations and sizes, plus the
  studio loops with their derived files and which reels use them.

## Reel captions

Reel captions (`content/captions/<slug>.en.vtt`) are authored against the composed timeline. With
8 s loops and a 0.6 s crossfade, loop *i* (0-based) starts at `8·i − 0.6·i` and a reel of *n* loops
lasts `8·n − 0.6·(n − 1)` seconds (5 loops = 37.6 s, 4 loops = 30.2 s; a single loop with
`repeat: 2` = 16 s). Conventions used in the current files:

* On-screen text is quoted exactly as it appears; anything else is described in brackets, e.g.
  `[A glass globe of light dots turns inside a ring of screens]`. Never invent text that is not on
  screen.
* Score cues match what the generator really does: `[Low synth swell]` at 0 s, `[Soft metallic
  ticks]` once the pulse starts, `[The chord shifts]` at each loop change, `[Breathy noise swells
  and fades]` mid-reel, `[Music fades out]` for the final 1.5 s.
* Cues change at loop boundaries (the start of each crossfade) and never overlap.

If you change a reel's loops or order, re-time its captions (the build rejects cues that run past
the end, but cannot tell that a description no longer matches the picture).

## Replacing provisional loops and art

The studio loops are provisional (`provenance: "studio-concept"`, `provisional: true` on their art
records). To replace one:

1. Put the new file in `sources/previews/` with the same name pattern
   `MS_preview_NN_<name>_1920x1080_30fps_8s_loop.mp4` (same name to replace, a new `NN_<name>` to add).
2. Delete the old derivatives for that stem (`media/public/previews/<stem>-*.mp4`,
   `media/public/posters/<stem>-*`) — `build-previews.sh` skips files that exist — then run
   `npm run media:previews`.
3. Run `npm run media:build`. Reels that use the loop rebuild automatically (their input hash
   changed), and `media/art.json` picks up new stems.
4. Re-check those reels' captions against the new picture (see above) and update the art record's
   `alt` text in `content/art.json`; set `provisional: false` once the client approves it.

To give a programme or video approved still artwork instead of a loop, add an art record in
`content/art.json` whose `stem` names files in `media/public/posters/` (`<stem>-1280.webp`,
`<stem>-640.webp`, `<stem>-lqip.txt`; previews optional) and point the content's `art` at it.

## Adding a programme or film

The quickest route is the importer:

```
npm run content:add -- --file path/to/film.mp4 --slug subway-1905 --title "Interior N.Y. Subway, 14th St. to 42nd St." \
  --programme programme:open-archive --access free --kind archive-film \
  --captions path/to/film.srt --licence "Public domain (US, pre-1930 publication)" \
  --attribution "American Mutoscope & Biograph, 1905. Library of Congress." --source-url https://…
```

It validates everything first (`--dry-run` stops there and prints what it would write), then copies
the file to `sources/library/<slug>.<ext>` and the captions to `content/captions/`, appends a `file`
entry to `content/media-sources.json`, writes a schema-valid skeleton `content/videos/<slug>.json`
(placeholder text marked `TODO:`, empty lists, `art: "art:placeholder"` unless `--art`, availability
`unavailable` until an editor completes it), builds the media and prints the remaining steps.
Other options: `--captions-lang` (default `en`), `--provenance` (inferred from the licence),
`--art art:x`.

To add one by hand: copy the file into `sources/library/`, add the `file` entry, run
`npm run media:build -- --only media:<slug>`, then write the video record (see `docs/CONTENT.md`) and
run `npm run content:check`.

When a finished Monumental programme replaces a studio reel, keep the reel's `id` and change the
entry to `type: "file"` — every video pointing at that media id plays the new file after a build.
Set `provenance` on the video record accordingly.

Keep large films out of git: store them with your media masters and copy them into
`sources/library/` before building (only `sources/archive/` is git-ignored today).

## Globe data — `scripts/build-globe.ts`

Source: Natural Earth 1:110m land via `world-atlas` (public domain), converted with
`topojson-client`.

* **`public/data/globe-dots.json`** — `{ spacing, points }`. An approximately equal-area lattice:
  rows `spacing` degrees apart (1.0976°, the closest value to 1.1° that divides 180°), each row
  holding `round(360·cos(lat)/spacing)` evenly spaced points; only points on land are kept.
  `points` is a flat `[lat, lon, lat, lon, …]` array rounded to 0.01°. Currently 9,870 dots, 119 KB.
* **`public/data/land-paths.json`** — `{ viewBox: "0 0 360 180", d }`, an SVG path in
  equirectangular projection (`x = lon + 180`, `y = 90 − lat`), 0.01° precision, ~62 KB. Fill it
  with `fill-rule="evenodd"` so lakes such as the Caspian stay open.

Geometry notes (`scripts/lib/geo.ts`): rings that jump across ±180° are unwrapped, tested and
clipped against ±360° copies, so Chukotka and Fiji appear on both edges of the flat map and get
dots; Antarctica, which winds around the pole, is closed through the pole. The land test is
even-odd over all rings, so holes are respected. Pass `--spacing 1.5` for a sparser lattice.

## Troubleshooting

* **"… ends at 31.2s, after the media ends (30.2s)"** — a reel caption no longer fits its timeline;
  re-time the captions (see [Reel captions](#reel-captions)).
* **A build fails part-way** — the previous version of that asset is untouched. Re-run with
  `--keep-work --only <id>` and inspect `media/.work/<slug>/`.
* **Players stall on a variant** — run `npm run media:build -- --verify-only`.
* **Disk** — six assets (2 min 47 s of reels) take about 205 MB; `docs/ASSET-MANIFEST.md` lists
  sizes per asset.

## Archive film artwork (real stills)

Demonstration films never borrow the studio's concept art. `npm run media:archive-art`
(`scripts/build-archive-art.sh`) takes a poster still and a silent 8-second preview loop from a
chosen moment of each film (a fraction of its runtime, picked by eye from contact sheets) and
writes them next to the studio art as stem `still-<slug>`:
`media/public/posters/still-<slug>-{1280,640}.webp`, `-lqip.txt` and
`media/public/previews/still-<slug>-{720,480}.mp4`. Non-square sample aspect ratios are
corrected first (e.g. the 1920 Kingston film is 720×480 NTSC DV at 4:3, flagged 8:9 SAR).
Register each stem in `content/art.json` as `kind: "still"`, `provisional: false`, and point
the video's `art` at it. To change a frame, edit the slug:fraction table in the script and run
it with `--force`.
