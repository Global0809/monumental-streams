# Product assumptions (reversible)

Decisions taken where the brief was silent. Each one is isolated in data or config, so it can be changed without touching the code.

| # | Assumption | Where to change it |
|---|---|---|
| 1 | **Planned originals are free.** The opening WAVEMAKERS chapter is marked `access: free`, because an opening campaign is usually meant to reach the widest audience. | `content/videos/wavemakers-pr-ny-london.json` |
| 2 | **Premium is shown with demonstration items only.** *Interface Specimens* and *Tears of Steel* are premium. *The Organism* reel has an early-access window: premium members now, everyone from 1 Dec 2026. These are examples, labelled as such, and not business decisions. | `content/videos/*.json` (`access`, `availability`) |
| 3 | **Prices are development examples.** "$7.99 / month" and "$79 / year" are marked `provisional: true` and labelled "Development example — pricing not approved" wherever they appear. | `content/membership.json` |
| 4 | **Only real benefits are listed as live.** These are unlocking premium items and early-access windows. Early access to future Originals is listed as "later". | `content/membership.json` → `benefits[].live` |
| 5 | **Valid ID's biography stays at the facts in the brief.** His record is `provisional: true`, has no places of origin and uses no approved imagery. | `content/people.json` |
| 6 | **The intro shows only on a first visit to `/`.** Deep links and returning visitors skip it; `/?intro=1` replays it. | `src/features/entry/Awakening.tsx` |
| 7 | **Website audio is off by default.** It always needs an explicit gesture, even if the viewer turned it on during an earlier visit. A breathing hint invites them to wake it. | `src/systems/sound/engine.ts` |
| 8 | **A story counts as "watched" at 95% and earns a passport stamp at 60%.** | `shared/library.ts` (`PROGRESS_DONE_RATIO`), the player |
| 9 | **Signing in merges the guest library into the account.** The guest copy is then cleared, so shared devices stay clean. | `src/state/library.ts` (`attachAdapter`) |
| 10 | **The Time Machine covers 1900s–2020s.** Earlier eras appear as movement context only (for example, bomba's 17th-century roots) and are labelled as such. | `content/periods.json` |
| 11 | **Archive films carry context cards.** These cover dated or colonial framing and omissions such as Jim Crow segregation. They are part of the content record, not UI copy. | `content/videos/*.json` → `context` |
| 12 | **"Expanding" destinations are honest placeholders.** Tokyo, Rio de Janeiro, Lagos, Seoul and Mexico City are mapped but have no stories, which shows how the atlas grows. | `content/places.json` → `status` |
| 13 | **The studio loops are provisional art.** They stand in for programme posters and previews until approved artwork exists. Swapping a file stem in `content/art.json` replaces them everywhere. | `content/art.json`, `docs/MEDIA.md` |
| 14 | **The demonstration reels' audio is a generated ambient score.** It is labelled in captions and credits. The studio loops themselves are silent. | `content/media-sources.json` |
| 15 | **No live activity, weather or external-availability data is shown.** None is maintained or connected yet. The schema and endpoints are ready. | `content/activity.json`, `content/external.json`, `/api/activity` |
