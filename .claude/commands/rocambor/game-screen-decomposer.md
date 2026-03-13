---
name: rocambor:game-screen-decomposer
description: Decompose the 1412-line game.ts monolith into focused modules
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
---

# Game Screen Decomposer

You are refactoring the largest file in the client codebase. Your goal is to break `client/src/screens/game.ts` (~1400 lines) into a directory of focused modules **without changing any behavior**.

## Step 1: Read Context

Read these files first to understand the architecture:

1. `CLAUDE.md` — Pay attention to:
   - Game screen uses **dark panels** (`.panel-felt`), NOT ivory
   - Canvas is fixed 1024x720, CSS-scaled
   - Screen interface: `mount()` / `unmount()`
   - Component classes: `.btn-gold-plaque`, `.btn-ghost-felt`, `.panel-felt`
2. `client/src/router.ts` — The `Screen` interface contract
3. `client/src/screens/game.ts` — The full monolith. Map out logical sections.
4. `client/src/ui/controls.ts` — Dependency (423 lines, handles auction/play controls)
5. `client/src/canvas/renderer.ts` — Dependency (644 lines, canvas rendering)
6. `client/src/state.ts` — State subscription pattern

## Step 2: Map the Monolith

Identify the natural seams in `game.ts`. The file typically contains:

- **Member declarations** (~50 lines): DOM element references, timers, flags
- **mount/unmount** (~100 lines): HTML template, event binding, subscriptions
- **State subscription handler** (~30 lines): The broad `state.subscribe()` that triggers 8+ updates
- **Header/HUD updates** (~80 lines): `updateHeader()`, `updateMobileSummary()`
- **Phase banner** (~60 lines): `updatePhaseBanner()`, auction banner timer
- **Hand rendering** (~120 lines): DOM spritesheet cards, `renderDomCardLayers()`, card selection
- **Trick overlay** (~80 lines): `showTrickOverlay()`, timer management
- **Opponent strip** (~60 lines): `updateMobileOpponents()`, `renderHeroPlates()`
- **Canvas interaction** (~40 lines): Click, mousemove, touch handlers
- **Sound triggers** (~30 lines): Phase-based sound effects
- **Resize handling** (~30 lines): Viewport mode detection

## Step 3: Create Module Directory

Create `client/src/screens/game/` with these files:

### `GameScreen.ts` — Orchestrator (target: <250 lines)
- Implements the `Screen` interface (`mount`, `unmount`)
- Owns the HTML template string
- Creates and wires all sub-modules via constructor injection
- Manages the single state subscription, dispatching to sub-modules
- Handles resize and cleanup

### `GameHeader.ts` — Header bar and HUD
- Extracts: `updateHeader()`, `updateMobileSummary()`, header ticker interval
- Receives: container element refs, state accessor, profile manager
- Manages its own timer cleanup

### `GameHand.ts` — Hand dock and card interaction
- Extracts: `renderDomCardLayers()` (hand portion), `configureSpritesheetMode()`, card click handlers, card selection logic
- Receives: hand layer element, state accessor, connection manager
- Handles both DOM sprite and canvas fallback paths

### `TrickOverlay.ts` — Trick display
- Extracts: trick overlay show/hide, timer, `trackTrickFeedFromState()`
- Receives: trick layer element, renderer reference
- Manages its own overlay timer cleanup

### `OpponentStrip.ts` — Mobile opponents and hero plates
- Extracts: `updateMobileOpponents()`, `renderHeroPlates()`
- Receives: container elements, state accessor

### `PhaseBanner.ts` — Phase transition banner
- Extracts: `updatePhaseBanner()`, auction banner timer, phase transition detection
- Receives: banner element, state accessor
- Manages its own timer cleanup

### `index.ts` — Re-export
```typescript
export { GameScreen } from "./GameScreen";
```

## Step 4: Implementation Rules

1. **Constructor injection only** — Each module receives the DOM elements and services it needs. No module accesses global state or imports `AppContext` directly.

2. **Each module owns its timers** — Every `setInterval`/`setTimeout` must be stored and cleared in a `destroy()` method. The orchestrator calls `destroy()` on all modules during `unmount()`.

3. **Preserve the HTML template** — The HTML string stays in `GameScreen.ts`. After inserting it, the orchestrator queries for elements and passes them to sub-modules.

4. **Dark theme compliance** — All panels use `.panel-felt` / dark semi-transparent backgrounds. Text uses `var(--text-on-panel)` (ivory). Do NOT introduce ivory panels on the game screen.

5. **Keep existing CSS** — Do not modify `game.css`. The class names and IDs in the HTML must remain identical.

6. **Maintain event order** — State subscription dispatches to sub-modules in the same order as the current monolith to avoid rendering glitches.

## Step 5: Update Imports

Update `client/src/router.ts` (or wherever `GameScreen` is imported from) to use the new path:
```typescript
import { GameScreen } from "./screens/game";
```

## Step 6: Verify

1. Run `cd client && npx tsc --noEmit` — must pass with zero errors
2. Check that no circular imports were introduced: `npx madge --circular client/src/screens/game/`
3. Verify the old `client/src/screens/game.ts` file is deleted (replaced by the directory)
4. Count total lines across the new modules — should roughly equal the original ~1400 lines

## What NOT to Do

- Do not change any game logic or phase handling behavior
- Do not rename CSS classes or HTML IDs
- Do not modify `controls.ts`, `renderer.ts`, or `state.ts`
- Do not introduce new npm dependencies
- Do not change the canvas rendering pipeline
