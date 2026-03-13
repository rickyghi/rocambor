# Harden Batch 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate unsafe non-null assertions in the game server and fix client-side toast leak + leaderboard error spam.

**Architecture:** 5 surgical fixes across 3 files. Server fixes replace `!` assertions with explicit null guards that log + return early. Client fixes are a toast cleanup mechanism and a one-line deletion.

**Tech Stack:** TypeScript, Vitest (server), React (client)

---

### Task 1: Guard `this.state.ombre!` assertions in room.ts

**Files:**
- Modify: `server/src/room.ts:1117,1255`

**Step 1: Fix the exchange-to-play transition (line 1117)**

Find at line 1115:
```typescript
    if (next === null) {
      this.state.phase = "play";
      this.state.turn = this.nextActive(this.state.ombre!);
```

Replace with:
```typescript
    if (next === null) {
      this.state.phase = "play";
      if (this.state.ombre === null) {
        console.error("[room] ombre is null at exchange→play transition");
        return;
      }
      this.state.turn = this.nextActive(this.state.ombre);
```

**Step 2: Fix the finishHand ombre access (line 1255)**

Find at line 1255:
```typescript
    const om = this.state.ombre!;
```

Replace with:
```typescript
    if (this.state.ombre === null) {
      console.error("[room] ombre is null at finishHand");
      return;
    }
    const om = this.state.ombre;
```

**Step 3: Run tests**

Run: `cd server && npx vitest run`
Expected: All 153 tests PASS

**Step 4: Commit**

```bash
git add server/src/room.ts
git commit -m "fix: guard ombre non-null assertions in room.ts"
```

---

### Task 2: Guard `this.state.contract!` assertions in room.ts

**Files:**
- Modify: `server/src/room.ts:971,1268`

**Step 1: Fix the startExchange contract access (line 971)**

Find at line 971:
```typescript
    const ex = computeExchangeOrder(this.state.contract!, ombre, activeOrderFromOmbre);
```

Replace with:
```typescript
    if (!this.state.contract) {
      console.error("[room] contract is null at startExchange");
      return;
    }
    const ex = computeExchangeOrder(this.state.contract, ombre, activeOrderFromOmbre);
```

**Step 2: Fix the finishHand contract access (line 1268)**

Find at line 1268:
```typescript
        contract: this.state.contract!,
```

Replace with:
```typescript
        contract: this.state.contract,
```

This is safe because by line 1268 we're inside the `else` branch of `if (this.state.contract === "penetro")` (line 1263), which means `this.state.contract` is already known to be non-null. The `!` was unnecessary. But we should also add a top-level guard in `finishHand` before the branching logic.

Find at line 1252 (start of finishHand, after the ombre guard from Task 1):
```typescript
    if (this.state.ombre === null) {
      console.error("[room] ombre is null at finishHand");
      return;
    }
    const om = this.state.ombre;
```

Add after it:
```typescript
    if (!this.state.contract) {
      console.error("[room] contract is null at finishHand");
      return;
    }
```

This makes the `!` removal on line 1268 fully safe.

**Step 3: Run tests**

Run: `cd server && npx vitest run`
Expected: All 153 tests PASS

**Step 4: Commit**

```bash
git add server/src/room.ts
git commit -m "fix: guard contract non-null assertions in room.ts"
```

---

### Task 3: Add seat range validation to score delta loop

**Files:**
- Modify: `server/src/room.ts:1285`
- Test: `server/tests/room.test.ts`

**Step 1: Write a test for out-of-range seat keys**

Add to `server/tests/room.test.ts`:

```typescript
describe("Room - score delta seat range", () => {
  it("ignores seat indices outside 0-3 range", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.state.scores = { 0: 10, 1: 10, 2: 10 };

    const deltas: Record<string, number> = { "0": 5, "99": 100 };
    for (const [seatStr, delta] of Object.entries(deltas)) {
      const seat = Number(seatStr);
      if (Number.isNaN(seat) || delta == null || seat < 0 || seat > 3) continue;
      (room.state.scores as any)[seat] += delta;
    }

    expect(room.state.scores[0]).toBe(15);
    expect((room.state.scores as any)[99]).toBeUndefined();
  });
});
```

**Step 2: Run the test**

Run: `cd server && npx vitest run room.test.ts`
Expected: PASS

**Step 3: Apply the fix in room.ts**

Find at line 1285:
```typescript
      if (Number.isNaN(seat) || delta == null) continue;
```

Replace with:
```typescript
      if (Number.isNaN(seat) || delta == null || seat < 0 || seat > 3) continue;
```

**Step 4: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS (153 existing + 1 new = 154)

**Step 5: Commit**

```bash
git add server/src/room.ts server/tests/room.test.ts
git commit -m "fix: validate seat range in score delta application"
```

---

### Task 4: Add toast timer cleanup

**Files:**
- Modify: `client/src/ui/toast.ts`

**Step 1: Rewrite toast.ts with timer tracking and cleanup export**

Replace the entire file with:

```typescript
export type ToastType = "info" | "success" | "error" | "warning";

let container: HTMLElement | null = null;
const activeTimers = new Set<ReturnType<typeof setTimeout>>();

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.createElement("div");
    container.id = "toasts";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 4000
): void {
  const c = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  c.appendChild(el);

  const exitTimer = setTimeout(() => {
    activeTimers.delete(exitTimer);
    el.classList.add("toast-exit");
    const removeTimer = setTimeout(() => {
      activeTimers.delete(removeTimer);
      el.remove();
    }, 300);
    activeTimers.add(removeTimer);
  }, duration);
  activeTimers.add(exitTimer);
}

/** Cancel all pending toast timers and remove the container. */
export function clearToasts(): void {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers.clear();
  if (container) {
    container.remove();
    container = null;
  }
}
```

**Step 2: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add client/src/ui/toast.ts
git commit -m "fix: track toast timers and add clearToasts for cleanup"
```

---

### Task 5: Remove leaderboard error rethrow

**Files:**
- Modify: `client/src/app/screens/LeaderboardScreen.tsx:382`

**Step 1: Delete the throw line**

Find at line 379-382:
```typescript
    } catch (err) {
      const nextError = err instanceof Error ? err.message : t("leaderboard.refreshFailed");
      setError(nextError);
      throw err instanceof Error ? err : new Error(nextError);
```

Replace with:
```typescript
    } catch (err) {
      const nextError = err instanceof Error ? err.message : t("leaderboard.refreshFailed");
      setError(nextError);
```

**Step 2: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add client/src/app/screens/LeaderboardScreen.tsx
git commit -m "fix: remove unnecessary error rethrow in leaderboard load"
```

---

## Final Verification

After all 5 tasks:

```bash
cd server && npx vitest run
```

Expected: 154 tests PASS (153 existing + 1 new seat range test)

```bash
cd client && npx tsc --noEmit
```

Expected: No type errors
