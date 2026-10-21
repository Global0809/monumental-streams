# Art direction — the organ family

Category artwork on Monumental Streams is **generated, not screenshotted**. Every category (and
Live) has an **organ**: an original procedural biomechanical sculpture that lives in the 3D stage
(`src/stage/organs/`) and is rendered into the category's poster artwork by the same code. The
stage, the category chamber and the posters therefore always show the same object. Interface
mock-ups are never used as artwork (see [Artwork review](#artwork-review)).

The concept is set out in [LIVING-ARCHIVE.md](LIVING-ARCHIVE.md). This document covers the
organs: what they are, how they are built, and how to re-render them.

## One family

All nine organs are built from the same four materials (`src/stage/organs/kit.ts`). That shared
set is what makes them one species:

| Material | Look | Used for |
|---|---|---|
| **Bone** | Warm bone-white (`#e4d9c7`) with a wrapped studio key from the upper left, warm subsurface light at the terminator, a fine porous grain, and a Fresnel rim in the organ's hue. Shadows sink into a violet plum (`#231b31`), never black. | Vertebrae, tendons, hoops, drums and every structural part |
| **Glass membrane** | Mostly clear when seen face-on and bright at grazing angles (Fresnel rim), with a faint thin-film sheen and an optional inner core light | Lenses, drum skins, ribbons, drapery, bubbles, polyps |
| **Filament** | Thin additive tubes with pulses of light travelling along them | Strings, seams, synapses, speed lines, outlines |
| **Glow** | Soft billboard halos | Cores, tips, sparks |

Shared rules:

- **Vertebrae everywhere.** Each organ carries at least one vertebral element, built from the same lathe vertebra (`geometry.ts → vertebra()`): a spine, a collar, an axle, a stalk or a socket.
- **Lit, not painted.** Materials are self-lit in view space, so an organ is modelled the same way from any camera and needs no scene lights. They honour scene fog (linear or exp²) and the renderer's tone mapping and output colour space.
- **Calm by default.** Motion is slow (sway, drift, breathing). *Energy* (0 → 1), from hover, focus or the active category, is the only thing that makes an organ livelier. Each organ's pose is a pure function of (time, energy), so a frozen clock under reduced motion renders a still.
- **No text, no logos and no fake data in the sculptures.** News ribbons carry abstract lines of type, never real words.

## Palette per category

Hues come from the Chrome Bloom palette (`src/styles/tokens.css`). The source of truth is `ORGAN_PALETTE` in `src/stage/organs/palette.ts`:

| Category | Signature hue | Deep companion | Organ |
|---|---|---|---|
| Live | signal red `#ff5468`, **outline only** | `#5c1622` | The Dormant Beacon |
| Movies | amber `#ffb45e` | `#a8501c` | The Aperture |
| Music | iris `#b3a3ff` | `#5b44d6` | The Resonator |
| Sports | coral-rose `#ff8d84` | `#b8364a` | The Kinetic Heart |
| Gaming | frost cyan `#86e3ff` | `#2a7fb8` | The Bloom Lattice |
| News | pearl white `#f3effc` | `#8f93b8` | The Press |
| Fashion | rose-gold `#f2b8a2` | `#a8585a` | The Atelier Form |
| Culture | verdigris `#72d8bd` | `#1f7c6c` | The Growth |
| Kids | soft pastel prism (`#ffc4df #c9b8ff #a9e4ff #fff0b0 #b8f2d2`) | `#b39cff` | The Bubble Garden |
| Home, World, Time Machine, My World | gold, iris, frost, gold | — | A neutral seed core (glass capsule with a vertebral collar) |

## The organs

| Organ | Form | Energy (hover / active) |
|---|---|---|
| **Live — The Dormant Beacon** | A teardrop glass membrane on a vertebral stalk, inside a lantern cage of bone meridians around an **unlit** bone core, with two still rings around it | Only brightens the red outline slightly. Nothing pulses, rotates or broadcasts, because there is no live signal to show. A unit test enforces this. |
| **Movies — The Aperture** | An iris diaphragm of shingled bone blades in a vertebral collar, an amber lens membrane glowing through the opening, a ribbed lens barrel behind it, and a tilted reel of filmstrip vertebrae (frames with sprocket holes and lit amber cells) orbiting it | Opens the iris, speeds up the reel and brightens the projected light |
| **Music — The Resonator** | A vertebral spine with a harp-like bone arm, a fan of luminous sinew strings, a tendon coiled around the spine, and three glass drum membranes in bone hoops | Strings vibrate and the membranes ripple in standing waves |
| **Sports — The Kinetic Heart** | A seamed bone ball inside a coral glass membrane, beating ("lub-dub"), circled by braided tendon arcs with coral speed trails, above a bowl of arena ribs | Raises the heart rate (52 → 104 bpm) and spins the arcs faster |
| **Gaming — The Bloom Lattice** | A hollow sphere of voxels (bone blocks with glowing edges, frost glass blocks, a few lit cells) around a bright core, threaded by lattice filaments | The lattice opens like a flower, with voxels swirling outward |
| **News — The Press** | A grooved printing drum with toothed gears on a vertebral axle, pearl paper ribbons with abstract columns of type, and an antenna mast whose bulb emits broadcast rings | Turns the drum faster, lifts the ribbons and quickens the broadcast |
| **Fashion — The Atelier Form** | A spine mannequin: a vertebral column on a stand inside a crinoline cage of hoops and boning, a bodice of woven luminous fibres, a clavicle bar and a rose-gold glass drape falling into a train | Lifts the drape and quickens the light in the weave |
| **Culture — The Growth** | A branching coral or neuron of tapering bone rising from a vertebral socket, with a verdigris patina toward the tips, glass polyps, synapse filaments, and signals travelling up the branches | Brightens the signals and the synapses |
| **Kids — The Bubble Garden** | A chunky spiral banded in pastel candy colours on a cloud of round pebbles, with iridescent soap bubbles and twinkling sparks. Everything is round and nothing moves fast. | Bubbles bob and drift a little livelier |

## Using an organ

```ts
import { createOrgan } from '../organs/index.ts';
const organ = createOrgan('music', { quality: 'webgl' }); // or 'lite'
scene.add(organ.object);          // centred, fitted to a unit sphere (organ.radius === 1)
organ.update(seconds, energy);    // energy 0..1, eased internally
organ.dispose();                  // frees every geometry and material and detaches the object
```

- `object.userData.view` holds the organ's preferred presentation angle (`{ yaw, pitch }`), and `object.userData.triangles` holds its triangle count.
- **Budgets:** under 32k triangles each at `webgl` (the heaviest is about 27.5k), under 12k at `lite`, and at most 17 draw calls. Repeated parts are instanced. `lite` keeps every silhouette but uses cheaper vertebrae, fewer segments, and fewer strands, ribbons and bubbles.
- **No textures and no network:** everything is generated from code, deterministically (seeded), so every device builds the same sculpture.
- `tests/unit/stage-organs.test.ts` checks that every organ builds, animates, fits its sphere and stays within budget, that `lite` is lighter, that dispose releases everything, that a frozen clock gives a still pose, that Live stays dormant, and that the palette and artwork wiring are correct.

## Re-rendering the artwork

The posters are rendered from the organs themselves, by `tools/organ-render.html`. The page loads `tools/organ-render.ts`, which uses `src/stage/organs/harness.ts`. It shows a pure scene: the organ, the brand night with a soft haze of the organ's hue, drifting motes and a gentle bloom. It has no UI.

1. Start the dev server: `npm run dev` (or only `npm run dev:web`).
2. Preview any organ: `http://localhost:5173/tools/organ-render.html?organ=movies&w=1600&h=900`. Add `&animate=1` to watch it move, `&energy=1` to see it energised, `&quality=lite` for the light version, or use `?organ=all` for a 3×3 review sheet of all nine.
3. Render the posters:

   ```sh
   node --disable-warning=ExperimentalWarning scripts/render-organs.ts            # all nine
   node --disable-warning=ExperimentalWarning scripts/render-organs.ts --only kids,live
   node --disable-warning=ExperimentalWarning scripts/render-organs.ts --review shots/organs   # PNGs only
   ```

   For each organ the script renders 1600×900 at 2× pixel density, then writes `media/public/posters/organ-<id>-1280.webp`, `-640.webp` and `-lqip.txt`. These follow the same conventions as `scripts/build-previews.sh`. It then refreshes `media/art.json`. The moment and energy of each still are set in `POSES` in the script; Live is always rendered at energy 0.
4. Check the content: `npm run content:check`.

The organs have no motion loop (a `preview` mp4). Cards show the still poster, and the living version is the organ in the stage itself.

## Artwork registry

Each organ render is registered in `content/art.json` as `art:organ-<id>`, with stem `organ-<id>`, `kind: "generated"`, `provisional: false`, the credit "Monumental generative artwork", and alt text that describes what the image shows. `SECTIONS[*].art` in `shared/sections.ts` points every category and Live at its organ.

## Artwork review

The studio loops include several **interface mock-ups**: screens with headings, chips, panels or phone frames. These are honest for the studio reels that demonstrate the interface. They are not honest as artwork for stories, programmes or collections. They were replaced as follows:

| Where | Was | Now | Why |
|---|---|---|---|
| Live, Music (section art) | `art:sound-aurora` (sound settings panel) | `art:organ-live`, `art:organ-music` | UI mock-up → the category organ |
| Movies (section art) | `art:catalogue-player` (catalogue UI) | `art:organ-movies` | UI mock-up → the category organ |
| Sports, Gaming, News, Fashion, Kids (section art) | a film still from one title | `art:organ-<id>` | One title's still no longer stands in for a whole category |
| Culture (section art) | `art:story-paper` (THE STORY BEHIND THE STORY title card) | `art:organ-culture` | That title art belongs to its own programme, not to the whole category |
| Programme *Better Late Than Never* | `art:sound-aurora` | `art:organ-music` | UI mock-up → the Music organ (an artist campaign with no artwork of its own yet) |
| Programme *Open Archive* | `art:time-machine` (UI with decade cards) | `art:still-coney-island-1905` | A real frame from a film in the programme |
| Programme *Open Cinema* | `art:bauhaus-categories` | `art:still-sintel` | A real frame from a film in the programme |
| Collection *Free to Watch* | `art:catalogue-player` | `art:still-apollo-11-1969` | A real frame from a free film |
| Collection *Open Archive* | `art:time-machine` | `art:still-nyc-subway-1905` | A real frame from a film in the collection |
| Collection *Open Cinema* | `art:bauhaus-categories` | `art:still-tears-of-steel` | A real frame from a film in the collection |
| Collection *Miami: The Gateway* | `art:miami-isometric` (map UI with pins and chips) | `art:still-roads-to-romance` | Coral Gables, Miami-Dade, 1950: a real frame from a Miami-Dade film |
| Collection *Before 1950* | `art:deco-atlas` (city cards UI) | `art:still-kingston-1920` | A real frame from a film set in the 1920s |

These are kept on purpose: `art:wavemakers-lines` (WAVEMAKERS title art), `art:story-paper` (THE STORY BEHIND THE STORY title art), `art:living-membrane` (Studio Specimens, which are studio concepts) and `art:brand-chrome` (Monumental Originals logotype).

Some UI mock-up loops are still in use outside this lane: `art:time-machine` (the Time Machine section and the *Stories in Time* reel), `art:living-atlas` (the World section), `art:culture-passport` (My World) and `art:catalogue-player` (the *Interface Specimens* reel, where showing the interface is the point). Those are other lanes' decisions. If wanted, renders of the neutral seed core for Home, World, Time Machine and My World can be added to the same script: the harness already accepts `?organ=home`, `world`, `time-machine` and `my-world`.
