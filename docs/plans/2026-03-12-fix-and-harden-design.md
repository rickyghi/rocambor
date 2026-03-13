# Fix & Harden Review — Rocambor Web Game

**Date:** 2026-03-12
**Scope:** Bug fixes + defensive hardening (Option B)
**Goal:** Ship a more robust game without changing gameplay or UI

---

## Priority 1: Gameplay Bugs

### Bug 1 — Exchange card validation (SERVER, MEDIUM)

**File:** `room.ts` ~line 1004
**Problem:** Cards discarded by ID match without verifying they exist in the player's hand. If a card ID doesn't match, it's silently skipped — but the talon still draws `count` cards, corrupting hand size.
**Fix:** Validate every discarded card ID exists in the hand before proceeding. If any are invalid, reject the entire exchange action.

### Bug 2 — NaN in score delta application (SERVER, MEDIUM)

**File:** `room.ts` ~line 1270
**Problem:** `Object.entries(scoreResult.deltas)` converts keys via `Number(seatStr)` without validation. A non-numeric key produces `NaN`, corrupting the scores object.
**Fix:** Parse with `parseInt`, validate result with `Number.isNaN()`, and skip/log invalid entries.

### Bug 3 — Pending play card not cleared on illegal move (CLIENT, LOW-MEDIUM)

**File:** `game.ts` ~line 331-381
**Problem:** When a user taps an illegal card, `showInvalidAction()` fires but `pendingPlayCard` isn't reset. The old pending card stays visually selected.
**Fix:** Clear `pendingPlayCard` inside the illegal-move branch before showing the error.

### Bug 4 — Canvas context non-null assertion (CLIENT, LOW)

**File:** `game.ts` ~line 83
**Problem:** `getContext("2d")!` without fallback. If context is unavailable, the game crashes.
**Fix:** Check for null, show a user-facing error message if context creation fails.

### Bug 5 — DOM probe not cleaned on error (CLIENT, LOW)

**File:** `card-sprites.ts` ~line 110-127
**Problem:** `hasRenderableBackground()` appends a probe element to the DOM, but if `getComputedStyle()` throws, the element leaks.
**Fix:** Wrap in try/finally to guarantee cleanup.

---

## Priority 2: Hardening

### Harden 1 — Log persistence errors (SERVER)

**File:** `room.ts` ~lines 1285, 1328
**Problem:** `.catch(() => {})` silently eats DB errors.
**Fix:** Replace with `.catch(err => console.error("persistence error:", err))`.

### Harden 2 — Guard hand access in exchange limits (SERVER)

**File:** `room.ts` ~line 1075
**Problem:** `this.hands[seat].length` throws if `hands[seat]` is undefined.
**Fix:** Add optional chaining: `this.hands[seat]?.length ?? 0`.

### Harden 3 — Wrap DB writes in transactions (SERVER)

**File:** `persistence.ts`
**Problem:** `saveMatchResult` does multiple independent queries. Partial failure leaves inconsistent stats.
**Fix:** Wrap in a database transaction so all writes succeed or all roll back.

### Harden 4 — PlayerId preservation in reconnect (SERVER)

**File:** `server.ts` ~line 229
**Problem:** `reservation.playerId || playerId` swaps identity if stored ID is falsy.
**Fix:** Always prefer the reservation's original ID when it exists (use nullish coalescing `??`).

### Harden 5 — Restrict CORS to production domain (SERVER)

**File:** `server.ts` ~line 27
**Problem:** `Access-Control-Allow-Origin: *` is too permissive for production.
**Fix:** Use env-based origin: `*` in dev, `https://rocambor.app` in production.

### Harden 6 — Canvas renderer cleanup guard (CLIENT)

**File:** `renderer.ts` ~line 74-81
**Problem:** DPR media query listener leaks if `destroy()` isn't called on abnormal unmount.
**Fix:** Add a `removeEventListener` guard and consider using `AbortController` for cleanup.

### Harden 7 — Modal focus restoration safety (CLIENT)

**File:** `modal.ts` ~line 140
**Problem:** `previousFocus?.focus()` may fail if the element was removed from DOM.
**Fix:** Check `document.contains(previousFocus)` before calling `.focus()`.

### Harden 8 — Silent localStorage fallback (CLIENT)

**File:** `storage.ts`
**Problem:** When localStorage is unavailable (private browsing), writes silently fail.
**Fix:** Wrap in try/catch, use in-memory fallback, and show a one-time toast warning.

---

## Implementation Strategy

- **Approach:** Fix bugs first (Priority 1), then hardening (Priority 2)
- **Testing:** Each fix gets a targeted test. Server fixes use existing test suite; client fixes get manual verification via preview
- **Deployment:** Ship as a single batch after all 152 existing tests still pass + new tests pass
- **Estimated scope:** ~13 small, focused changes across ~10 files
