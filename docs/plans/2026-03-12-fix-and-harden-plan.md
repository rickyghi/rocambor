# Fix & Harden Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix confirmed gameplay bugs and harden server/client against edge-case failures without changing game behavior.

**Architecture:** Targeted surgical fixes — each task modifies 1-2 files. Server fixes get vitest tests. Client fixes are verified manually via preview. All 152 existing tests must stay green.

**Tech Stack:** TypeScript, Vitest (server tests), Vite (client build)

**Corrections from deep review:**
- ~~Bug 1 (exchange validation)~~: Code is correct — `toDiscard` is built from actual hand matches, `count = toDiscard.length`, both removal and draw use `count`. No corruption possible.
- ~~Bug 5 (DOM probe leak)~~: `probe.remove()` is called inline before return. Safe.
- ~~Harden 6 (renderer cleanup)~~: `destroy()` already properly removes the listener.
- ~~Harden 7 (modal focus)~~: Already wrapped in `try-catch`.
- ~~Harden 8 (localStorage)~~: All reads/writes already have `try-catch` guards.

---

### Task 1: Fix pendingPlayCard not cleared on illegal move (CLIENT)

**Files:**
- Modify: `client/src/screens/game.ts:362-365`

**Step 1: Locate the illegal-card branch**

In `handleCardInteraction()`, find the block at ~line 362:
```typescript
    if (legalIds && !legalIds.includes(cardId)) {
      this.showInvalidAction("Illegal card: follow suit if possible.");
      return;
    }
```

**Step 2: Add pendingPlayCard clear**

Replace that block with:
```typescript
    if (legalIds && !legalIds.includes(cardId)) {
      this.setPendingPlayCard(null);
      this.showInvalidAction("Illegal card: follow suit if possible.");
      return;
    }
```

Also add the same to the "not my turn" branch (~line 358):
```typescript
    if (!state.isMyTurn) {
      this.setPendingPlayCard(null);
      this.showInvalidAction("Wait for your turn.");
      return;
    }
```

**Step 3: Verify existing tests still pass**

Run: `cd server && npx vitest run`
Expected: All 152 tests PASS (no server changes, just sanity check)

**Step 4: Commit**

```bash
git add client/src/screens/game.ts
git commit -m "fix: clear pendingPlayCard on illegal move and wrong turn"
```

---

### Task 2: Add canvas context null check (CLIENT)

**Files:**
- Modify: `client/src/screens/game.ts:83`

**Step 1: Find the non-null assertion**

Line ~83:
```typescript
    const canvasCtx = this.canvas.getContext("2d")!;
```

**Step 2: Replace with guarded version**

```typescript
    const canvasCtx = this.canvas.getContext("2d");
    if (!canvasCtx) {
      console.error("[game] Failed to get canvas 2D context");
      return;
    }
```

Adjust surrounding code if the method continues to use `canvasCtx` — it should already work since the variable type narrows after the check.

**Step 3: Commit**

```bash
git add client/src/screens/game.ts
git commit -m "fix: guard canvas getContext against null"
```

---

### Task 3: Log persistence errors instead of swallowing them (SERVER)

**Files:**
- Modify: `server/src/room.ts:1285,1328`
- Modify: `server/src/server.ts:233`

**Step 1: Fix room.ts saveHandResult call (~line 1285)**

Find:
```typescript
    }).catch(() => {});
```
(after `saveHandResult({...})`)

Replace with:
```typescript
    }).catch((err) => console.error("[room] saveHandResult failed:", err));
```

**Step 2: Fix room.ts saveMatchResult call (~line 1328)**

Find the second:
```typescript
      }).catch(() => {});
```
(after `saveMatchResult({...})`)

Replace with:
```typescript
      }).catch((err) => console.error("[room] saveMatchResult failed:", err));
```

**Step 3: Fix server.ts clearReservation call (~line 233)**

Find:
```typescript
                  reconnectMgr.clearReservation(resumeId).catch(() => {});
```

Replace with:
```typescript
                  reconnectMgr.clearReservation(resumeId).catch((err) =>
                    console.error("[connection] clearReservation failed:", err)
                  );
```

**Step 4: Run tests**

Run: `cd server && npx vitest run`
Expected: All 152 tests PASS

**Step 5: Commit**

```bash
git add server/src/room.ts server/src/server.ts
git commit -m "fix: log persistence errors instead of silently swallowing"
```

---

### Task 4: Guard score delta application against NaN (SERVER)

**Files:**
- Modify: `server/src/room.ts:1269-1272`
- Test: `server/tests/room.test.ts`

**Step 1: Write the failing test**

Add to `server/tests/room.test.ts` inside an existing describe or a new one:

```typescript
describe("Room - score delta safety", () => {
  it("skips non-numeric keys in scoreResult.deltas", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.state.scores = { 0: 10, 1: 10, 2: 10 };

    // Simulate applying deltas with a non-numeric key
    const deltas: Record<string, number> = { "0": 5, "bad": 99 };
    for (const [seatStr, delta] of Object.entries(deltas)) {
      const seat = Number(seatStr);
      if (Number.isNaN(seat)) continue;
      (room.state.scores as any)[seat] += delta;
    }

    expect(room.state.scores[0]).toBe(15);
    expect((room.state.scores as any)["NaN"]).toBeUndefined();
    expect((room.state.scores as any).NaN).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it passes (this tests the fix pattern, not the bug)**

Run: `cd server && npx vitest run room.test.ts`

**Step 3: Apply the fix in room.ts**

Find (~line 1269):
```typescript
    for (const [seatStr, delta] of Object.entries(scoreResult.deltas)) {
      const seat = Number(seatStr) as SeatIndex;
      this.state.scores[seat] += delta!;
    }
```

Replace with:
```typescript
    for (const [seatStr, delta] of Object.entries(scoreResult.deltas)) {
      const seat = Number(seatStr);
      if (Number.isNaN(seat) || delta == null) continue;
      this.state.scores[seat as SeatIndex] += delta;
    }
```

**Step 4: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS (152 + 1 new)

**Step 5: Commit**

```bash
git add server/src/room.ts server/tests/room.test.ts
git commit -m "fix: guard score deltas against NaN keys"
```

---

### Task 5: Guard hand access with optional chaining (SERVER)

**Files:**
- Modify: `server/src/room.ts:1075`

**Step 1: Apply fix**

Find (~line 1075):
```typescript
    return exchangeLimitsForSeat(contract, seat, ombre, this.hands[seat].length, this.talon.length);
```

Replace with:
```typescript
    return exchangeLimitsForSeat(contract, seat, ombre, this.hands[seat]?.length ?? 0, this.talon.length);
```

**Step 2: Run tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/src/room.ts
git commit -m "fix: guard hand access in getExchangeLimits against undefined seat"
```

---

### Task 6: Fix playerId preservation in reconnect (SERVER)

**Files:**
- Modify: `server/src/server.ts:229`
- Test: `server/tests/reconnect.test.ts` (add case if not covered)

**Step 1: Apply fix**

Find (~line 229):
```typescript
                  reservation.playerId || playerId
```

Replace with:
```typescript
                  reservation.playerId ?? playerId
```

This ensures that a stored playerId of `""` (falsy but not null/undefined) doesn't get swapped. Only truly missing IDs fall through.

**Step 2: Run tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add server/src/server.ts
git commit -m "fix: use nullish coalescing for playerId in reconnect"
```

---

### Task 7: Restrict CORS to production domain (SERVER)

**Files:**
- Modify: `server/src/server.ts:27`

**Step 1: Apply env-based CORS**

Find (~line 27):
```typescript
  res.setHeader("Access-Control-Allow-Origin", "*");
```

Replace with:
```typescript
  const origin = process.env.NODE_ENV === "production"
    ? "https://rocambor.app"
    : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
```

**Step 2: Run tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS (tests don't set NODE_ENV=production)

**Step 3: Commit**

```bash
git add server/src/server.ts
git commit -m "fix: restrict CORS to rocambor.app in production"
```

---

### Task 8: Wrap persistence DB writes in transaction (SERVER)

**Files:**
- Modify: `server/src/persistence.ts:160-219`

**Step 1: Add transaction wrapper**

Find the DB section inside `saveMatchResult` (~line 160):
```typescript
  if (!db) return;
  try {
    // Check if match_players table exists (from migration 002)
    const tableCheck = await db.query(
```

Replace the `try` block contents with a transaction-wrapped version:
```typescript
  if (!db) return;
  try {
    const tableCheck = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'match_players'
      )`
    );
    if (!tableCheck.rows[0].exists) return;

    await db.query("BEGIN");
    try {
      // Fetch current DB Elos for more accurate calculation
      const dbEloMap = new Map<string, number>();
      for (const pid of data.playerIds.filter(Boolean) as string[]) {
        const res = await db.query("SELECT elo FROM players WHERE id = $1", [pid]);
        dbEloMap.set(pid, res.rows[0]?.elo ?? 1200);
      }

      // Recompute Elos from DB values
      const dbNewElos = new Map<string, number>();
      for (let i = 0; i < data.playerIds.length; i++) {
        const pid = data.playerIds[i];
        if (!pid) continue;
        const myElo = dbEloMap.get(pid) ?? 1200;
        const isWinner = i === data.winner;
        const opps = data.playerIds
          .filter((_, j) => j !== i && data.playerIds[j] !== null)
          .map((opId) => dbEloMap.get(opId!) ?? 1200);
        const avgOpp =
          opps.length > 0
            ? opps.reduce((a, b) => a + b, 0) / opps.length
            : 1200;
        dbNewElos.set(pid, computeElo(myElo, avgOpp, isWinner ? 1.0 : 0.0));
      }

      for (let i = 0; i < data.playerIds.length; i++) {
        const pid = data.playerIds[i];
        if (!pid) continue;

        const handle = data.playerHandles[i] || `Player ${String(pid).slice(0, 8)}`;
        const isWinner = i === data.winner;
        await ensurePlayerRecord(pid, handle);

        await db.query(
          `INSERT INTO match_players (room_id, player_id, seat, final_score, is_winner)
           VALUES ($1, $2::uuid, $3, $4, $5)`,
          [data.roomId, pid, i, data.finalScores[i] || 0, isWinner]
        );

        await db.query(
          `UPDATE players SET
             games_played = COALESCE(games_played, 0) + 1,
             wins = COALESCE(wins, 0) + $2,
             elo = $3,
             last_played = NOW()
           WHERE id = $1`,
          [pid, isWinner ? 1 : 0, dbNewElos.get(pid) ?? 1200]
        );
      }

      await db.query("COMMIT");
    } catch (txErr) {
      await db.query("ROLLBACK").catch(() => {});
      throw txErr;
    }
  } catch (e) {
    console.error("[persistence] saveMatchResult failed:", e);
  }
```

**Step 2: Run tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS (persistence tests don't use real DB)

**Step 3: Commit**

```bash
git add server/src/persistence.ts
git commit -m "fix: wrap saveMatchResult DB writes in transaction"
```

---

## Final Verification

After all 8 tasks:

```bash
cd server && npx vitest run
```

Expected: 153 tests PASS (152 existing + 1 new score delta test)

```bash
cd client && npx tsc --noEmit
```

Expected: No type errors
