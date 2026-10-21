# Monumental Streams: content guide

This guide is for anyone adding or editing what viewers see: videos, programmes, places,
movements, people and collections. The contract behind every field is `shared/types.ts`;
validation lives in `shared/schema.ts`. If this guide and `types.ts` ever disagree,
`types.ts` wins.

## 1. The model: one catalogue, linked by id

Everything on the platform comes from one catalogue of JSON records in `content/`.
Screens never keep their own copy of catalogue text; they query the catalogue. Each
record has a stable, prefixed **id** and, for most kinds, a **slug** used in URLs.

| File | Kind | Id prefix | Example id |
|---|---|---|---|
| `content/videos/<slug>.json` | One video per file (filename = slug) | `video:` | `video:reel-living-atlas` |
| `content/programmes.json` | Series, chapters, campaigns, demonstration series | `programme:` | `programme:wavemakers` |
| `content/places.json` | Countries down to venues, in a parent chain | `place:` | `place:little-havana` |
| `content/periods.json` | Decades, 1900s–2020s | `period:` | `period:1970s` |
| `content/movements.json` | Cultural movements with real dates and lineage | `movement:` | `movement:hip-hop-origins` |
| `content/people.json` | Presenters, artists, historical figures | `person:` | `person:dj-kool-herc` |
| `content/categories.json` | Interests (music, film, documentary …) | `interest:` | `interest:music` |
| `content/themes.json` | Themes (diaspora, setbacks, rhythm …) | `theme:` | `theme:diaspora` |
| `content/routes.json` | Cultural connections between two places | `route:` | `route:kingston-london` |
| `content/collections.json` | Rule-based or hand-picked collections | `collection:` | `collection:miami-gateway` |
| `content/art.json` | Artwork registry (swappable files) | `art:` | `art:wavemakers-lines` |
| `content/membership.json` | One object: tier name, plans, benefits | — | — |
| `content/activity.json`, `content/external.json` | Maintained, dated editorial data (empty until someone maintains it) | — | — |
| `content/media-sources.json` | How playable media is built (owned by the media pipeline) | `media:` | `media:reel-living-atlas` |

Rules that never change:

- **Ids are permanent.** Other records, saved libraries and shared links point at them.
  Fix a typo in a title, never in an id.
- **Slugs** are lowercase kebab-case and unique within their kind. An id is always
  `prefix:` + slug.
- **Relationships are ids only.** A video says `"places": ["place:wynwood"]`; it never
  repeats Wynwood's name or summary.
- **Facts must be true.** Every date, coordinate, place hierarchy and historical claim must
  be correct. If a fact is uncertain, leave it out or phrase it cautiously ("c. 1970s").
  Never invent biographies, episodes, quotes, venues, release dates or prices.

## 2. Adding a video: a complete example

The record below is a **fictional placeholder** for illustration only. It is not in the
catalogue, and `video:example-new-story` must never be added.

```json
{
  "id": "video:example-new-story",
  "slug": "example-new-story",
  "title": "Example: A Night on Calle Ocho",
  "kind": "short",
  "programme": "programme:example-series",
  "order": 1,
  "summary": "One line that says what this is and why it is worth your time.",
  "description": "One or more paragraphs in the platform voice: confident, cultural, warm, and exact about what the viewer will actually see.\n\nSay plainly if anything is illustrative, reconstructed or a demonstration.",
  "categories": ["interest:music", "interest:culture"],
  "places": ["place:little-havana"],
  "periods": ["period:1980s"],
  "movements": ["movement:cuban-exile-miami"],
  "themes": ["theme:community", "theme:diaspora"],
  "moods": ["lively", "late"],
  "people": [{ "person": "person:example-musician", "role": "Featured musician" }],
  "setting": { "from": 1980, "to": 1989, "label": "1980s" },
  "published": "2026-11-01",
  "access": "free",
  "availability": { "status": "available" },
  "footage": ["contemporary", "archive"],
  "provenance": "public-domain",
  "media": "media:example-new-story",
  "art": "art:placeholder",
  "credits": {
    "licence": "Public domain (US, pre-1930 publication)",
    "attribution": "Exact attribution text to display",
    "sourceUrl": "https://example.org/source"
  },
  "notes": ["Optional editorial line used when explaining connections."]
}
```

Field by field:

| Field | Required | What to put there |
|---|---|---|
| `id`, `slug` | yes | `video:` + slug. The file must be named `<slug>.json`. |
| `title` | yes | As it should appear on screen. |
| `kind` | yes | `episode`, `feature`, `short`, `teaser`, `reel` or `archive-film`. |
| `programme` | no | The series, chapter or demonstration series it belongs to. Chapters roll up into their parent series automatically. |
| `season`, `order` | no | Position in the programme (order 1 = first; teasers use 0). Drives "next up". |
| `summary` | yes | One line. Weighted in search. |
| `description` | yes | Paragraphs separated by `\n\n`. Weighted in search. |
| `categories` | yes | Interest ids. Drives the interest filter, interest pages and recommendations. |
| `places` | yes | The most specific place ids that apply (`place:wynwood`, not `place:miami`). Parents are implied. Use `[]` if it is not about a place. |
| `periods` | yes | Period ids that the **setting** overlaps. Use `[]` when `setting` is `null`. |
| `movements` | no | Movement ids the story is genuinely about. |
| `themes` | yes | Theme ids. |
| `moods` | yes | Any of `chill`, `lively`, `curious`, `late` (used by Take Me Somewhere). |
| `people` | no | Person ids with the role they play *in this video*. |
| `setting` | yes | When the story takes place, or `null` for timeless or abstract work. See section 4. |
| `made` | no | Year the work was originally made (archive films). |
| `published` | yes | ISO date it was published on Monumental Streams. |
| `access`, `availability` | yes | See section 6. |
| `footage` | yes | Honest labels for what is on screen. See section 5. |
| `provenance` | yes | Where the work comes from. See section 5. |
| `media` | no | Media id produced by the media pipeline. **Leave it out** for planned programming that does not exist yet; the video is then listed but not playable. |
| `art` | yes | An art id from `content/art.json`. See section 7. |
| `credits` | for licensed media | Exact licence and attribution for public-domain or Creative Commons work. Copy them from the matching `content/media-sources.json` entry. |
| `context` | no | A short, plain context card shown before playback: dated framing, omissions, sensitive material. Leave it out when nothing needs saying. See section 9. |
| `notes` | no | Short "why it matters" lines. |

Never author a runtime. Duration is measured from the encoded file by the media build and
read from `media/manifest.json`; the duration filter, journey planner and player all use the
measured value.

## 3. How relationships put a video everywhere

Once a video file validates, nothing else needs editing. Its ids make it appear on its own:

- **Search** (`shared/search.ts`): full text over the title, programme, people, places
  (including aliases such as "Calle Ocho" or "El Barrio"), movements, periods, interests,
  themes, summary and description, with title matches weighted highest. Filters match
  interests, places (a place includes everything inside it, so `place:miami` finds a video
  tagged `place:wynwood`), periods (by historical setting), access, duration (measured),
  provenance and "playable now".
- **Atlas** (`/atlas/:place`): the video appears on its places and on every ancestor
  (Wynwood → Miami → Miami-Dade County → Florida → United States). Routes touching those
  places, and movements and people tied to them, appear alongside.
- **Time machine** (`/time/:period`): the video appears in every decade its `setting`
  overlaps. The "published" lens orders by `published` instead.
- **Synapse** (`/synapse/:kind/:slug`): explainable connections to any other record:
  same place, places in the same family, places joined by a route, overlapping years, a
  shared movement or a movement's lineage (`influences`), shared people, interests, themes,
  programme and series order, and mood. Every connection carries a human-readable reason.
- **Recommendations** (`shared/recommend.ts`): built from the viewer's interests, history,
  saves and passport stamps through the same connection reasons.
- **Rule collections**: a collection with a `rule` (for example
  `{ "places": ["place:miami-dade-county"] }`) picks up every matching video automatically.
  Rules use **ids**, never slugs.

The better the tags, the better the connections. Tag what the video is genuinely about,
and nothing it merely mentions.

## 4. Setting is not published

- `setting` is **when the story takes place**: a film about the 1973 Sedgwick Avenue
  party has `{ "from": 1973, "to": 1973 }` even if it was made in 2026. The time machine and
  the period filter use the setting.
- `published` is **when it went up on Monumental Streams** (ISO date). "Newest" sorting and
  the time machine's published lens use it.
- `made` (optional) is when an archive work was originally produced.
- Use `"setting": null` for work with no historical moment, such as motion design, teasers
  and demonstration reels, and then leave `periods` empty.

## 5. Footage labels and provenance

**Footage** says what the viewer is looking at. Use every label that applies:

| Label | Meaning |
|---|---|
| `archive` | Genuine historical footage |
| `commentary` | Presenter, interview or talking-head material |
| `reconstruction` | A staged re-creation of past events |
| `illustrative` | Motion design or artwork depicting ideas, not events |
| `fiction` | Narrative fiction |
| `contemporary` | Present-day documentary footage |

**Provenance** says where the work comes from:

| Provenance | Meaning | Search filter |
|---|---|---|
| `monumental-original` | A finished Monumental Original programme. **None exist yet.** | Monumental Originals |
| `studio-concept` | Monumental studio motion design (the preview loops, reels and teasers) | Studio concepts |
| `public-domain` | Demonstration media in the public domain | Public-domain archive |
| `creative-commons` | Demonstration media under a Creative Commons licence | Open cinema |

Demonstration media (studio concepts, public-domain and Creative Commons films) shows how the
platform works while original programming is produced. It must never be presented as a
Monumental Original. Planned originals, such as the WAVEMAKERS chapter, are listed with
`provenance: "monumental-original"`, **no `media`**, `footage: []` and
`availability.status: "planned"`. Their programmes carry a plain `statusNote` saying what
exists today. Teasers made by the studio for an original are `studio-concept` +
`illustrative`, and their description says plainly that they are not programme footage.

## 6. Access and availability

`access` is the level a video settles at: `free` or `premium`.
`availability.status` says whether, and for whom, it plays now:

| Status | Plays? | Notes |
|---|---|---|
| `available` | Yes, at its `access` level | |
| `early-access` | Premium members now; everyone at its `access` level from `publicFrom` | Requires `publicFrom` |
| `coming-soon` | Not until `publicFrom` | Requires `publicFrom` |
| `planned` | No | No date. Use for programming in development. |
| `unavailable` | No | Withdrawn, missing media, or a draft from `content:add` |

A video is only playable when its `media` exists in the media manifest **and** its
availability allows it. `availability.note` is shown to viewers. Use it to be honest, for
example "Demonstration of premium gating: the access level is an example, not a business
decision."

## 7. Artwork

Content never points at image files. It points at an art id, and `content/art.json` maps
each id to a file **stem**:

```json
{ "id": "art:wavemakers-lines", "stem": "17-wavemakers-lines", "alt": "…", "kind": "studio-loop", "provisional": true, "credit": "Monumental studio motion concept (preview loop)" }
```

The server resolves a stem to `media/public/posters/<stem>-1280.webp`, `-640.webp`,
`-lqip.txt` and, for loops, `media/public/previews/<stem>-720.mp4` and `-480.mp4`
(or the entries in `media/art.json` written by the media build). If no files exist it falls
back to a neutral gradient, so a missing image never breaks a page.

To replace artwork, for example when approved WAVEMAKERS imagery arrives:

1. Produce files for a new stem (`scripts/build-previews.sh` for loops), or replace the files
   behind an existing stem.
2. Point the art record at the new stem, update `alt` to describe the new image accurately,
   and set `provisional` to `false` once the client has approved it.
3. Every video, programme, person and collection using that art id updates at once.

All current art is provisional studio motion design. `art:placeholder` exists for new
records that do not have art yet.

## 8. Importing a finished video file

```sh
npm run content:add -- --file path/to/film.mp4 --slug example-new-story --title "Example: A Night on Calle Ocho"
```

Optional flags: `--programme programme:x`, `--access free|premium` (default `free`),
`--kind feature|episode|short|teaser|reel|archive-film` (default `feature`),
`--captions file.srt|file.vtt` with `--captions-lang en`, `--licence "…"`,
`--attribution "…"`, `--source-url https://…`, `--provenance public-domain|creative-commons`,
`--art art:x` (default `art:placeholder`) and `--dry-run`, which validates everything and
prints what would be written without touching disk.

The command copies the file to `sources/library/<slug>.<ext>` (and captions to
`content/captions/`), adds a `media:<slug>` entry to `content/media-sources.json`, writes a
skeleton `content/videos/<slug>.json`, builds the media and prints the remaining steps. The
skeleton's placeholders start with `TODO:` and its availability is `unavailable`, so nothing
reaches viewers until an editor has:

1. written the summary and description and filled in categories, places, periods, themes,
   moods, setting, footage and order or programme;
2. recorded the exact licence and attribution in both `content/media-sources.json` and the
   video's `credits`;
3. pointed `art` at real artwork;
4. set `availability.status` to `available` (or `coming-soon` with `publicFrom`);
5. run `npm run content:check`.

Studio reels and teasers composed from the preview loops are defined as `reel` entries in
`content/media-sources.json` and built with `npm run media:build`.

## 9. Archive and open-cinema films

Public-domain films (the Open Archive) and Creative Commons films (Open Cinema) need extra
care, because they were made by other people, for other purposes, at other times.

**Sources.** Keep each film's downloads in `sources/archive/<slug>/` (`source.mp4` or
`source.webm`, plus any caption file). Each film has one `file` entry in
`content/media-sources.json`, with the id `media:archive-<slug>` for public-domain films or
`media:open-cinema-<slug>` for Creative Commons films:

```json
{
  "id": "media:archive-newspaper-train-1942",
  "type": "file",
  "title": "Newspaper Train (1942)",
  "source": "sources/archive/newspaper-train-1942/source.webm",
  "captions": [
    { "lang": "en", "label": "English (captions)", "kind": "captions", "src": "sources/archive/newspaper-train-1942/captions.en.vtt", "default": true }
  ],
  "licence": "Public domain (UK Crown copyright expired)",
  "attribution": "Newspaper Train (1942). Len Lye, Realist Film Unit, for the UK Ministry of Information. Via Wikimedia Commons.",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:NEWSPAPER_TRAIN_(1942).webm",
  "provenance": "public-domain",
  "notes": "Where the copy came from, what was done to it, and anything unverified."
}
```

Then build it with `npm run media:build -- --only media:archive-<slug>`. The build measures
duration and only encodes renditions at or below the source height. The video's `credits`
repeat the entry's `licence`, `attribution` and `sourceUrl` exactly.

**Attribution.** Creative Commons films must carry the attribution text their makers
require, character for character (for example
`Tears of Steel – (CC) Blender Foundation | mango.blender.org – CC BY 3.0`). NASA footage is
credited "NASA/Kennedy Space Center", and nothing may suggest NASA endorses the platform.

**Silent films.** Many archive copies of silent films carry an added soundtrack or an empty
audio track. Never present added music of unknown origin as part of the film. Strip the
audio into a new file and point `source` at it, and say so in `notes`:

```sh
ffmpeg -i sources/archive/<slug>/source.webm -map 0:v:0 -an -c:v copy sources/archive/<slug>/source-silent.mp4
```

The asset is then reported as having no audio, and the player treats it as silent.

**Captions.** Label captions honestly. Machine-generated, unreviewed captions are labelled
exactly `English (auto-generated, unreviewed)` and are not marked `default`. Human-made
captions are `English (captions)`, and official subtitle files are `English (official
subtitles)` with `kind: "subtitles"`. If no usable captions exist, say so in the
description rather than shipping bad ones.

**Dates.** `setting` is what the film depicts, and `made` is when it was made. When a year
is uncertain, give the setting a range and a label (`{ "from": 1954, "to": 1956, "label":
"c. 1955" }`) and leave `made` out rather than guessing.

**Places.** Tag where the film was actually shot, as specifically as the evidence allows
(`place:launch-complex-39a`, not `place:miami`). A film shot in a real city but set in an
invented world, such as Tears of Steel, can carry the city; pure fantasy carries none.

**Context cards.** Add `context` when a film's framing could mislead or hurt today's viewer:
a booster film that shows only white visitors, a colonial travelogue, wartime propaganda, an
advertisement. Write it plainly and briefly: who made it, for what purpose, and what it
leaves out or shows. Mild language or genre violence goes in the description instead.

**Descriptions** say what the film is (an actuality film, a government film, a booster film,
an advertisement) and that it is demonstration media, not a Monumental Original.

## 10. Validation

```sh
npm run content:check
```

This loads the content exactly as the server does and reports record counts, what is
playable now, coverage per decade, and every problem. It exits non-zero on errors, so it
can gate CI.

- **Errors** block publishing: a field of the wrong shape, an id without its prefix, a
  duplicate id or slug, a reference to a record that does not exist or is the wrong kind, a
  place or programme parent cycle, or a range that ends before it starts.
- **Warnings** never block, but read them: a video with no media yet (expected for planned
  programming), an early-access or coming-soon video without `publicFrom`, a period tag
  that does not overlap the setting, two videos at the same position in a programme,
  provisional artwork, and places marked `active` with no videos set in them yet.

## 11. Other records, briefly

- **Places** form an administrative chain through `parent` (neighbourhood → city → county →
  state → country). Use the correct `kind`, the ISO 3166-1 alpha-2 `country` code of the area
  itself (Puerto Rico is `PR`, with no parent, because it is an unincorporated territory),
  WGS84 `coords` of the centre to four decimals, and `aliases` for names people search for.
  Miami and Miami Beach are separate cities in Miami-Dade County: South Beach belongs to
  Miami Beach, not Miami. `status` is `active` where stories, movements, routes, people or
  programmes refer to the place, and `expanding` for places mapped for future stories.
  `facts` carry a short `source` note.
- **Movements** need real start and end years (`end: null` = ongoing), the places where they
  happened, and `influences` pointing at earlier movements (the lineage the synapse
  follows).
- **People**: `historical` figures get short factual summaries only. Presenters and artists
  whose biographies are not yet approved are marked `provisional: true` and say only what
  has been approved.
- **Routes** join two places with a `kind` (`migration`, `influence`, `exchange`,
  `programme`) and real years. Programme routes describe planned journeys and say so.
- **Programmes** always carry a `statusNote`: a plain statement of what exists today.
- **Collections** prefer a `rule` over hand-picked `items`, so they grow by themselves.
- **Activity** and **external** listings are only for maintained, dated, verified data.
  Leave them empty rather than guessing.
