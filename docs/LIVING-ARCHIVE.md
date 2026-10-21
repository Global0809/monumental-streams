# The Living Archive — creative direction

## Concept

Monumental Streams is **one living world**. The whole catalogue exists at once as a field of **seeds**: luminous biomechanical capsules, each carrying its story's poster inside a glass membrane. Behind every route there is the same persistent 3D stage (`src/stage/`). Navigating does not replace a page under a decorative layer; it **re-forms the world**:

| Route | Arrangement | What the world does |
|---|---|---|
| Home | `home` constellation | Seeds orbit the **Monumental spine**: a tall, slowly turning biomechanical column of vertebrae and light. The nine category **organs** hang around it like orbiting sculptures, each surrounded by its own stories. The featured story's seed floats nearest the camera. |
| World | `world` globe | The constellation collapses onto a night globe. Seeds settle at their real places, routes become arcs, and Miami glows as the gateway. Selecting a place flies the camera there. |
| Time Machine | `time` helix | Seeds unspool along a vertebral helix: one vertebra per decade, years along its length. Changing the era travels the camera along the spine; the setting / made / published lens re-sorts the seeds. |
| Category | `category` chamber | That category's **organ** fills the scene: a unique procedural sculpture. Its stories gather around it; everything else recedes into haze. Switching category migrates the seeds visibly. |
| Story / programme | `focus` | Its seed comes forward; related seeds connect to it with light filaments. Following a connection travels along the filament. |
| Watch | `watch` | The world dims and recedes behind the player, and its motion stops. Programme audio has priority. |
| My World | `personal` | Your saved seeds orbit your own **core**. Saving anywhere sends the seed flying into that core. |
| Utility pages | `quiet` | A calm, low-intensity field. |

The DOM remains the semantic and accessible source of truth: real headings, lists, links and buttons. The world mirrors it and both directions respond:
- Hovering or focusing a card lights its seed.
- Hovering a seed highlights its card.
- Clicking a seed does exactly what the matching link does.

Search, direct navigation and quick viewing never depend on the 3D. With no WebGL, or effects turned off, every route still works and still looks designed.

## Visual identity

- **Night:** deep violet-black (`--night`). The world is lit, not painted.
- **Light:**
  - Seeds carry warm **champagne gold** rim light (`--gold`).
  - Interaction and focus use **iris lavender** (`--iris`).
  - Time uses **frost** (`--frost`).
- **Category signatures:** each category has one hue, within the palette, used by its organ and its accents:
  - Movies: amber
  - Music: iris
  - Sports: coral-rose
  - Gaming: frost cyan
  - News: pearl white
  - Fashion: rose-gold
  - Culture: verdigris
  - Kids: soft pastel prism
  - Live: signal red, shown only as an outline while nothing is live
- **Materials:**
  - Glass membranes with Fresnel rims.
  - Bone-white vertebrae with subtle subsurface warmth.
  - Thin luminous filaments.
  - No flat UI screenshots used as artwork.
- **Type:**
  - Archivo Expanded (`--font-display`) at 300–400 for monumental route titles (clamp ~88–168px, tracking −0.04em). The same face at 500–600 for story titles.
  - Archivo (`--font-body`) for text: 17px/1.6 body, 14–15px UI.
  - Eyebrows are 12px, 600 weight, 0.18em tracking, uppercase, at most one per section.
  - Timecodes use JetBrains Mono with tabular numbers.
- **Composition:**
  - Content sits in an editorial column over the world: left-aligned, generous margins, strong hierarchy.
  - The world occupies the open side and the depth behind.
  - Only one primary gold action per view.
  - Statistics and explanations are supporting text, never headline material.
- **Cards:**
  - A card is a poster with a hairline luminous rim (radius 14px) and its title below. No pill clutter or stacked badges: one access mark at most.
  - No boxes inside boxes. Glass panels appear only where text sits over the moving world and needs legibility.

## Behaviour and sound

- **Camera moves:**
  - Purposeful, eased over 0.9–1.4s and interruptible: a new arrangement retargets mid-flight.
  - Under reduced motion they become instant cuts.
- **Feedback:**
  - Hover is a soft tick.
  - Selecting is a tendon click.
  - A new arrangement plays a low swell.
  - Saving plays a chime while the seed flies into the core.
  - Website sound stays off until activated.
- **Performance and fallback:**
  - The stage renders only while something moves, caps idle at 30 fps, and pauses when the tab is hidden or the player is active.
  - It halves its density and DPR on mid-tier devices and falls back to a static gradient field on low-tier devices or when WebGL is unavailable.

## Mobile

- The world sits behind content at reduced density.
- The first screen always contains the featured story's title and a visible **Play** action, with no atmosphere-only screens.
- Navigation is a bottom bar (Home, World, Time Machine, My World, Menu). The menu holds all thirteen destinations plus the utilities.
