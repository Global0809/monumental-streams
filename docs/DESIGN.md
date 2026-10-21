# Chrome Bloom · Gold — design language

The approved direction is `design-directions/a-chrome-bloom.png`. It is drawn from the studio's own brand-chrome and living-membrane loops: deep violet night, glossy lavender chrome, soft iridescent light, and big confident type. It is futuristic and biomechanical, but it reads as a cinematic streaming platform, never as a dashboard.

## Principles

1. **Imagery leads.** Every screen opens on large imagery: full-bleed heroes, or large 26px-radius cards. Text that sits on an image gets a scrim. A card is an image with an unboxed caption below it, not a bordered box.
2. **Few, big words.** Display type is Archivo Expanded (the variable font's width axis pinned at 125%): light 300–500 weights at hero sizes, 600–700 for titles, with tight tracking (−0.02 to −0.04em). Body and UI text is Archivo at normal width, 15–18px, in `--lilac`, with headings in `--pearl`. One family in two widths keeps the system refined and consistent.
3. **Calm.** At most one eyebrow label (`.kicker`) per section. No monospace except timecodes (`--font-code`). Labels and buttons are in sentence case. No HUD decoration: no telemetry strips, rivets, tick rulers, bracket corners, dashed animated lines or ribbed bezels, unless a line carries meaning (a route, a progress bar).
4. **Glass, sparingly.** Grouped controls and information sit on glass panels (`.panel`: translucent white, blur, 1px `--line`, 28px radius). Content does not.
5. **One gold action per view.** The primary action is `.btn-primary`, a champagne-gold metal pill with dark text. Active navigation and selected filters use the same gold. Everything else is a glass pill (`.btn` / `.btn-chrome`); lavender `--iris` marks focus, progress and links.
6. **Space.** Sections sit 80–120px apart on desktop. Grids use 20–28px gaps. Generous padding throughout.
7. **Soft motion.** Lifts of about 4px, slow fades and gentle parallax. All of it stops under reduced motion.

## Tokens (`src/styles/tokens.css`)

| Role | Token | Value |
|---|---|---|
| Page | `--night` / `--night-2` | `#0a0811` / `#100c1a` |
| Raised | `--plum` / `--plum-2` / `--plum-3` | `#17121f` / `#1e1829` / `#2a2238` |
| Glass | `--glass` / `--glass-2` / `--glass-strong` | white 5.5% / 9% / plum 72% |
| Hairline | `--line` / `--line-2` | lavender 12% / 22% |
| Text | `--pearl` / `--lilac` / `--lilac-dim` | `#f3effc` / `#cdc5e4` / `#a79dc4` (the smallest text allowed) |
| Accent | `--iris` (`--iris-2`, `--iris-deep`, `--iris-glow`) | `#b3a3ff`: focus, progress, links, free |
| Time / history | `--frost` | `#9fdcff` |
| Premium | `--gold` | `#f2d6a2` |
| Attention | `--rose`; errors `--danger` | `#ff9fc8` / `#ff7a8f` |
| Metal | `--gold-chrome`, `--gold-fill` (+ `--on-gold`), `--chrome`, `--chrome-soft`, `--pearl-fill` | gradients |
| Type | `--font-display` (Archivo Expanded), `--font-body` (Archivo), `--font-code` (JetBrains Mono) | |
| Shape | `--radius-card` 26, `--radius-panel` 28, `--radius-control` 16, `--radius-pill` | |

The older anatomical names (`--abyss`, `--bone`, `--ichor`, `--plasma`, `--aurum`, `--font-serif`, `--font-mono` …) are aliases of the tokens above. New code uses the new names.

## Signature elements

- **The bloom:** fixed violet and lavender light behind the page (`body::before`).
- **Chrome wordmark and H1s:** the `--chrome` gradient clipped to text.
- **Glass sidebar** with the client's thirteen destinations and a separate utility group. A liquid highlight glides to the item under the pointer or focus; the current destination glows gold. On tablets it becomes an icon rail; on phones, a top bar, a floating tab bar and a full menu.
- **Reactive layer** (`src/systems/reactive.ts`): specular light that follows the pointer, card tilt, magnetic controls, press ripples, scroll reveals and the gold orb that flies into My World when something is saved. It stands down for touch, reduced motion and low-tier devices.
- **Living-membrane imagery:** the studio loops as heroes. Preview loops wake on hover or focus.
- **Nucleus cursor** (lavender ring), **synthesised sound** (off until woken), the **awakening intro**, and the **3D globe**. All of these are restyled into this palette.
