# The Living Archive — design system

The binding concept is [`LIVING-ARCHIVE.md`](LIVING-ARCHIVE.md): one living 3D world behind every route, where every story is a **seed**. This document describes how the interface (shell, navigation and shared components) carries that concept. The world itself lives in `src/stage/` and its contract is `src/stage/contract.ts`.

## Layers

| z | Layer | Where |
|---|---|---|
| 0 | **The world.** The 3D stage (`src/stage/Stage.tsx`, lazy-loaded and mounted once the first content has rendered). Behind it sits a static world drawn in CSS, and above it a legibility veil. | `src/app/StageLayer.tsx`, `src/app/world.css` |
| 1 | **The editorial layer.** The vertebral index, the phone bars, the chapter rail, `<main>` and the footer. Backgrounds are transparent so the world shows through. | `src/app/Shell.tsx`, `navigation.tsx`, `shell.css` |
| 60+ | The awakening, dialogs (menu sheet, search), toasts, the cursor. | |

- The **static world** is drawn entirely in CSS: a gradient field, a vertebral spine seen in perspective, a gold cord and a constellation of seeds. It is shown until the stage reports `ready`, and whenever `stageStore.quality === 'off'` (no WebGL, a low-tier device, or a failed stage). It re-forms with the arrangement through `data-arrangement`: a globe for World, a spine laid into a helix for Time Machine, an organ glow for a category, a gold core for My World, and dimming for focus and watch. `data-tint` carries the hue of the current destination, or of the destination being previewed.
- The **veil** darkens the editorial (left) side on desktop and the lower part of the screen on phones. It deepens to 80% while a programme plays. It never takes pointer events. The engine should listen for pointer input on `window` and ignore events whose target is interactive DOM.

## The world answers the interface

- **Default arrangements** (`src/app/arrangement.ts`, applied by `useWorldDirector` in `world.ts`). Every route gets a default before the page refines it:

  | Route | Arrangement |
  |---|---|
  | `/` | `home` |
  | `/world/:place?` | `world` |
  | `/time-machine/:decade?` with `?year&lens` | `time` |
  | `/live`, `/movies` … `/kids` | `category` |
  | `/watch/:slug` | `focus`, then `watch` while playing |
  | `/programme/:slug` | `focus` |
  | `/my-world` | `personal` |
  | anything else | `quiet` |

  The default is written in a layout effect, so the page's own `useArrangement(...)` (a passive effect) always lands after it and wins. While a page owns the arrangement, moving within that page leaves it alone.
- **Navigation preview.** Hovering (after a 90 ms intent delay) or focusing a category vertebra calls `setHighlight(videosForSection(...))`. Leaving restores the page's highlight, unless the page has changed it in the meantime.
- **Cards ⇄ seeds.** `VideoPod` calls `setHovered(id)` on pointer enter and focus, and clears it on leave and blur. It lights (`data-world-lit`) whenever `stageStore.hovered` is its id, whether that came from the DOM or from the world.
- **Search.** The story under the active palette option lights its seed.
- **Saving.** `announceSave({ id })` also calls `stageCommands.flyToCore(id, rect)`, alongside the DOM orb that flies to My World.
- **Cursor.** When the engine sets `<html data-stage-hover="seed|place|organ|vertebra">` (and optionally `data-stage-label`), the cursor shows a gold reticle with an eyebrow label (Story, Place, Category or Decade) and a name. DOM controls always win over the world beneath them.

## Navigation

- **The vertebral index** (desktop, 1180 px and up). A slim spine down the left edge holds the thirteen destinations in their fixed order. Each destination is a **vertebra**, an organic bone-white body with transverse processes that carries the section's glyph in its own hue. Labels are always visible. The current destination's vertebra is lit gold. Small gaps divide explore (Home, World, Time Machine), the categories (Live to Kids) and yours (My World). Utilities follow a hairline: Search (`/`), Sound, Settings and Profile, plus a collapse toggle that is remembered.
- **The rail** (tablet, 768–1179 px, or collapsed). The same spine with icons only. Labels surface beside the rail on hover or focus, and they stay in the DOM so every link keeps its exact name.
- **Phones.** A compact top bar holds the wordmark, Search, Sound and Profile. A bottom bar holds Home, World, Time Machine, My World and Menu; a small gold vertebra marks the current destination. The menu is a bottom sheet with all thirteen destinations and the utilities. Safe areas are respected.
- **Accessible names.** The `Main` and `Utilities` nav landmarks, `Primary` on phones, link names equal to the labels, `Profile: <name>`, and "Skip to content" as the first Tab stop (rendered before the catalogue arrives).
- While a programme plays, the index and the chapter rail recede to about 35% opacity. They return as soon as they are hovered or focused.

## Tokens (`src/styles/tokens.css`)

| Role | Token | Value |
|---|---|---|
| Night | `--night`, `--night-2`, `--plum`… | `#07060c`, `#0d0b15` |
| Glass (only over the moving world) | `--glass`, `--glass-2`, `--glass-strong`, `--veil` | |
| Hairlines | `--line`, `--line-2`; luminous rims `--rim`, `--rim-lit` | |
| Text | `--pearl`, `--lilac`, `--lilac-dim` (the smallest allowed text), `--marrow` (bone) | |
| Light | `--gold` (seed rims, current destination, the one primary action, saved), `--iris` (interaction, focus, selection, progress), `--frost` (time), `--signal` (live, outline only) | |
| Destination hues | `--hue-home` … `--hue-my-world`, `--prism` | mirrored for the engine in `src/styles/hues.ts` (a unit test keeps them equal) |
| Type | `--font-display` (Archivo Expanded), `--font-body` (Archivo), `--font-code` (JetBrains Mono) | |
| Scale | `--type-monument` (~88–168 px on desktop), `--type-title`, `--type-story`, `--type-eyebrow` 12 px, `--step--2` … `--step-6` (body is 16–17 px, UI is 14–15 px) | |
| Space | `--space-3xs` … `--space-3xl`, `--section-gap`, `--gutter` | |
| Shape | `--radius-card` 14, `--radius-panel` 20, `--radius-control` 12, `--index-w`, `--index-rail`, `--nav-h` (phone top bar), `--tabbar-h` | |
| Motion | `--ease-world` and `--t-world` (camera-like, 1.1 s), `--ease-out`, `--t-fast`/`--t-mid`/`--t-slow` (all 1 ms under reduced motion) | |

The anatomical names (`--abyss`, `--bone`, `--ichor`, `--aurum` …) remain as aliases; new code uses the semantic names.

## Type

- `.title-monument` is for route titles: Archivo Expanded at weight 330, `--type-monument`, tracking −0.04em, lit pearl.
- `.page-title` is for utility pages: the same face, a step smaller.
- `.title-story` is for story titles: weight 560.
- `h1`–`h3` use the display face at weight 560 by default, and `h4` and smaller use the body face.
- `.kicker` / `.eyebrow`: 12 px, weight 600, 0.18em tracking, uppercase, at most one per section.
- `.lede` and `.prose` set body text at 17/1.6 in a 62ch measure.
- `.timecode` uses JetBrains Mono with tabular figures.
- Emphasis inside titles is gold light, never italic.

## Components (`src/ui/ui.css`, states in `src/ui/skin.css`)

- **Seed card (`VideoPod`).** The poster sits behind a hairline luminous rim (radius 14) with the title below. The only mark on the poster is an access mark, shown only when the story is not freely watchable (Premium, Early access, Planned, Coming soon). The footage label ("Archive footage", "Illustrative" …) is plain text in the meta line, never a pill. The timecode and progress vein are kept, and so is the save toggle, which turns gold when saved. Hovering, focusing or lighting the card from the world lifts it 4 px and brightens the rim.
- **Buttons.** Radius 12. `.btn-primary` is the one gold action per view. `.btn` / `.btn-ghost` / `.btn-chrome` are hairline glass. `.btn-quiet` is text only. `.btn-aurum` is a secondary gold outline.
- **Chips** are quiet hairline toggles; selected chips take an iris tint. **Segmented controls** have a glass thumb with an iris rim that slides between options. **Tabs** have a sliding iris underline. **Switches and sliders** use iris.
- **Section header**: an optional eyebrow, a display title at weight 500 and a lilac sub. **Rows** have edge fades, a gold position vein and arrow buttons on hover.
- **Empty states** are honest: a glyph in a small vertebra ring, a title, the reason and the actions, on a faint glass slab. **Loader**: five vertebrae light up the spine in turn.
- **Dialogs** are glass slabs with radius 20; `variant="sheet"` rises from the bottom edge on phones. **Toasts** are slim glass slabs with a tone tick (gold for a success). **Panels** use glass only where they sit over the world.
- **Search palette**: a monumental input with a gold underline when focused, results with 16:9 thumbnails, matching destinations in their hue, and key hints.
- **Scrollbar**: a slim bone capsule on a transparent channel. It brightens on hover and turns gold while held.

## Cursor (`src/systems/cursor`)

A precise pearl point marks the exact hotspot, and a hairline lens follows it. Over the world the lens becomes a gold reticle with a label. On cards it is a gold ring labelled Watch or Details. Play actions get a gold ring with a notch, drag targets a capsule with chevrons that grips, and save toggles a gold rounded square. Small controls are wrapped by the lens, other links get an iris ring, and fields get the native caret. Elements opt in with `data-cursor` and `data-cursor-label`. The cursor is only mounted for fine pointers. Under reduced motion there is no spring, stretch or spin.

## The awakening (`src/app/Awakening.tsx`)

Shown on the first visit to `/` (or with `?intro=1`). The editorial layer waits while thirteen vertebrae, one per destination, drop into a spine, each flashing its hue. The gold cord then lights through them, and the wordmark settles to its final tracking. It can be skipped at any moment with Skip, Enter or Escape. "Enter with sound" is the explicit gesture that wakes website audio. Under reduced motion everything is simply there.

## Rules

1. The DOM is the truth. Every action in the world has a real link or button, and the 3D is never the only way to do something.
2. Use one gold primary action per view. Iris is for interaction and frost for time.
3. Use glass only where text sits over the moving world. Don't put boxes inside boxes.
4. Show at most one eyebrow per section and at most one access mark per card.
5. Motion is purposeful and interruptible, and becomes a cut under reduced motion. The world stops while a programme plays and when the tab is hidden.
6. Touch targets are at least 44 px, focus is always visible (an iris ring), and website sound stays off until the viewer activates it.
