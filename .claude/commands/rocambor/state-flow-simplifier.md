---
name: rocambor:state-flow-simplifier
description: Add slice-based subscriptions to reduce unnecessary UI re-renders
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# State Flow Simplifier

You are refactoring the client-side state management to add targeted subscriptions. The current system fires every listener on any state change. Your goal is to add `subscribeSlice()` for fine-grained updates — **without breaking existing subscribers**.

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Note the observer pattern and screen architecture
2. `client/src/state.ts` — The `ClientState` class. Note:
   - `subscribe(listener)` adds to a `Set<StateListener>` and returns an unsubscribe function
   - `notify()` fires all listeners on every `update()` or `setSeat()` call
   - Fields: `game`, `hand`, `mySeat`, `selectedCards`, `roomCode`
3. `client/src/screens/game.ts` — The monolith game screen. Find:
   - The single `state.subscribe()` call
   - What state fields each section reads (phase, turn, hand, tricks, scores, table, etc.)
   - How often the subscription fires vs how much actually changes
4. `client/src/ui/controls.ts` — The controls module. Find:
   - Its `state.subscribe()` call
   - What fields it actually depends on (phase, turn, mySeat, contract)
5. `client/src/screens/home.ts` — Simpler screen, check its subscription pattern
6. `client/src/screens/lobby.ts` — Another consumer of state
7. `client/src/connection.ts` — Where `state.update()` is called from server messages

## Step 2: Map Subscription Waste

For `game.ts`, catalog which state fields each visual concern reads:

| Visual Concern | State Fields Read |
|---|---|
| Phase banner | `game.phase` |
| Header/HUD | `game.turn`, `game.turnDeadline`, `game.phase`, scores |
| Hand dock | `hand`, `selectedCards`, `game.phase` |
| Trick overlay | `game.table`, `game.playOrder`, `game.trickWinner` |
| Opponent strip | `game.handsCount`, `game.players`, `game.turn` |
| Canvas renderer | Nearly everything (called via `requestRender()`) |
| Controls | `game.phase`, `game.turn`, `mySeat`, `game.contract` |

Currently, a single subscription triggers ALL of these on EVERY state change, even when only one field changed.

## Step 3: Add `subscribeSlice()` to `ClientState`

Edit `client/src/state.ts` to add:

```typescript
subscribeSlice<T>(
  selector: (state: ClientState) => T,
  listener: (slice: T, state: ClientState) => void,
  isEqual?: (a: T, b: T) => boolean
): () => void
```

Implementation:
1. Store `{ selector, listener, isEqual, prev }` in a separate set/array
2. In `notify()`, for each slice subscriber:
   - Call `selector(this)` to get current value
   - Compare with `prev` using `isEqual` (default: `===` for primitives, shallow object compare for objects)
   - If different, call `listener(newValue, this)` and update `prev`
3. Return an unsubscribe function

### Shallow Compare Helper

Add a `shallowEqual(a: T, b: T): boolean` function:
- If `a === b`, return true
- If either is not an object, return false
- Compare all own keys for `===` equality

### Convenience Helpers

Add typed convenience methods:

```typescript
onPhaseChange(cb: (phase: string) => void): () => void {
  return this.subscribeSlice(s => s.game?.phase, (phase) => { if (phase) cb(phase); });
}

onTurnChange(cb: (turn: SeatIndex | null) => void): () => void {
  return this.subscribeSlice(s => s.game?.turn ?? null, cb);
}

onHandChange(cb: (hand: Card[]) => void): () => void {
  return this.subscribeSlice(s => s.hand, cb);
}

onScoresChange(cb: (scores: Record<number, number>) => void): () => void {
  return this.subscribeSlice(
    s => s.game?.scores ?? null,
    (scores) => { if (scores) cb(scores); },
    shallowEqual
  );
}
```

## Step 4: Refactor Game Screen Subscriptions

In `game.ts` (or the decomposed game modules if `game-screen-decomposer` has run):

1. Replace the single broad `state.subscribe()` with targeted subscriptions:
   - Phase banner: `state.onPhaseChange(phase => this.updatePhaseBanner(phase))`
   - Header: `state.subscribeSlice(s => ({ turn: s.game?.turn, phase: s.game?.phase, scores: s.game?.scores }), ...)`
   - Hand dock: `state.onHandChange(hand => this.renderHand(hand))`
   - Trick overlay: `state.subscribeSlice(s => s.game?.table, ...)`
   - Controls: `state.subscribeSlice(s => ({ phase: s.game?.phase, turn: s.game?.turn, mySeat: s.mySeat }), ...)`

2. Keep ONE broad subscription for the canvas renderer (it reads many fields and uses its own `dirty` flag optimization)

3. Store all unsubscribe functions and call them in `unmount()`

## Step 5: Refactor Controls

In `client/src/ui/controls.ts`:

1. Replace its `state.subscribe()` with `state.subscribeSlice()` using only the fields it reads
2. This should dramatically reduce how often controls re-evaluate

## Step 6: Backward Compatibility

- Keep the existing `subscribe()` method unchanged — it still works for callers that want all updates
- `subscribeSlice()` is opt-in, not a replacement
- All existing screens that use `subscribe()` continue to work without modification
- Only refactor the heaviest subscribers (game screen, controls)

## Step 7: Verify

1. `cd client && npx tsc --noEmit` — must compile with zero errors
2. Test in browser: all game UI updates correctly (phase transitions, hand changes, trick display, scoring)
3. Verify unmount cleanup: no leaked subscriptions after navigating away from game screen

## What NOT to Do

- Do not remove the existing `subscribe()` method
- Do not change `GameState` or server protocol types
- Do not modify the `connection.ts` state update flow
- Do not introduce external state management libraries (Redux, Zustand, etc.)
- Do not change game logic or rules
