---
name: rocambor:canvas-renderer-optimizer
description: Audit and optimize the HTML5 Canvas rendering pipeline
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Canvas Renderer Optimizer

You are optimizing the HTML5 Canvas rendering pipeline for a card game. The goal is to reduce unnecessary draw calls, eliminate redundancy between dual rendering paths, and improve frame efficiency — **without changing visual output**.

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Key constraints:
   - Canvas is fixed 1024×720 logical resolution, CSS-scaled to container
   - Card skins have procedural (`drawCard()`) + image-based (`CardImageAtlas`) modes
   - Animations: `CardPlayAnimation`, `TrickWinAnimation` (sparkle dots), `CardDealAnimation`, `ScoreChangeAnimation`
2. `client/src/canvas/renderer.ts` — Main `GameRenderer` class (~644 lines). Note:
   - `drawHandOnCanvas` / `drawTableCardsOnCanvas` flags (dual path)
   - `domPlatesEnabled` flag
   - `requestRender()` → `dirty` flag → `renderFrame()` loop
   - DPR handling and `matchMedia` listener
3. `client/src/canvas/cards.ts` — Procedural `drawCard()` function, `CardSkin` interface
4. `client/src/canvas/card-image-loader.ts` — `CardImageAtlas`, `preloadSkinImages()`
5. `client/src/canvas/card-skin-registry.ts` — Skin definitions, metadata
6. `client/src/canvas/animations.ts` — `AnimationManager`, individual animation classes
7. `client/src/canvas/table.ts` — Table background drawing
8. `client/src/canvas/players.ts` — Player names, scores, opponent card backs
9. `client/src/canvas/layout.ts` — `computeLayout()`, `cardSpread()`, `ViewportMode`
10. `client/src/canvas/suits.ts` — Suit symbol drawing
11. `client/src/screens/game.ts` — Where renderer is instantiated, DOM hand/table code

## Step 2: Analyze Dual Rendering Paths

Map the two rendering modes:

### Canvas Path
- `drawHandOnCanvas = true`: cards drawn via `drawCard()` / `CardImageAtlas` directly on canvas
- `drawTableCardsOnCanvas = true`: trick cards drawn on canvas

### DOM Path
- `drawHandOnCanvas = false`: hand cards rendered as DOM elements with CSS sprite positioning
- `drawTableCardsOnCanvas = false`: table cards rendered as DOM elements
- `domPlatesEnabled = true`: player labels as DOM overlays

Determine:
1. Which path is the **default** and which is the fallback?
2. Are both paths fully maintained, or has one fallen behind?
3. What triggers the switch between paths?
4. Can one path be removed or deprecated?

## Step 3: Identify Optimization Targets

Investigate each of these areas:

### 3a: Redundant Draw Calls
- Count `ctx.save()` / `ctx.restore()` pairs — can any be batched?
- Look for repeated `fillStyle` / `strokeStyle` assignments that could be hoisted
- Check if `drawTableBackground()` redraws static content every frame

### 3b: Card Drawing Redundancy
- `drawCard()` in `cards.ts` is procedural (slow for many cards)
- `CardImageAtlas` loads sprite sheets (fast once loaded)
- Are both ever active simultaneously? Can procedural be removed for loaded skins?
- Is there unnecessary re-drawing of cards that haven't changed?

### 3c: Render Loop Efficiency
- How often is `requestRender()` called? (Search all callsites)
- Does `dirty` flag effectively prevent no-change redraws?
- Are animations calling `requestRender()` each frame even when idle?
- Is `requestAnimationFrame` being used correctly (one per frame, not stacking)?

### 3d: DPR Listener Leaks
- Check if `matchMedia("(resolution: ...)").addEventListener` is cleaned up
- Verify all event listeners are removed in `destroy()` / `unmount()`

### 3e: Animation Manager Overhead
- Does `AnimationManager` iterate over empty arrays when no animations are active?
- Are completed animations properly cleaned up?
- Is the sparkle particle system efficient?

### 3f: Layout Recomputation
- Is `computeLayout()` called every frame or only on resize?
- Are `cardSpread()` calculations cached?

## Step 4: Apply Optimizations

Apply changes in order of impact:

### Priority 1: Static Element Caching
- Cache table background to an offscreen canvas (redraw only on resize)
- Cache player label positions (redraw only on state change)

### Priority 2: Reduce save/restore Pairs
- Batch sequential draw calls that share the same transform state
- Use `setTransform()` instead of `save()/translate()/rotate()/restore()` where possible

### Priority 3: Skip Unchanged Content
- Track which game state fields changed and only redraw affected regions
- Skip hand redraw if hand cards haven't changed
- Skip table redraw if table cards haven't changed

### Priority 4: Simplify Dual Path
- If DOM spritesheet is the primary hand rendering path, remove redundant canvas hand drawing code (or clearly gate it)
- Document which path is canonical in a comment at the top of `renderer.ts`

### Priority 5: Listener Cleanup
- Ensure all `matchMedia` listeners, `ResizeObserver`, and event listeners are removed in `destroy()`
- Audit `avatarReadyHandler` cleanup

## Step 5: Verify

1. `cd client && npx tsc --noEmit` — must compile with zero errors
2. Manually verify no visual changes (same card rendering, same animations, same layout)
3. Check that `destroy()` properly cleans up all listeners and timers

## What NOT to Do

- Do not change the canvas logical resolution (1024×720)
- Do not change card skin visual output
- Do not modify animation timing or visual effects
- Do not remove features — only optimize implementation
- Do not add external dependencies
- Do not change the public API of `GameRenderer`
