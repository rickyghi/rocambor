# Harden Batch 2 — Design

**Date:** 2026-03-12
**Scope:** 5 defensive fixes (3 server, 2 client)
**Goal:** Eliminate remaining unsafe assertions and minor client issues

---

## Fix 1 — Guard `this.state.ombre!` assertions (SERVER)

**File:** `server/src/room.ts` lines 1117, 1255
**Problem:** Non-null assertions crash with TypeError if state machine has a bug.
**Fix:** Replace with explicit null check + early return with console.error.

## Fix 2 — Guard `this.state.contract!` assertions (SERVER)

**File:** `server/src/room.ts` lines 971, 1268
**Problem:** Same pattern as Fix 1.
**Fix:** Replace with explicit null check + early return with console.error.

## Fix 3 — Add seat range validation to score delta loop (SERVER)

**File:** `server/src/room.ts` lines 1283-1286
**Problem:** NaN guard exists but doesn't check seat is in valid range (0-3).
**Fix:** Add `seat < 0 || seat > 3` to the existing guard condition.

## Fix 4 — Toast timer cleanup (CLIENT)

**File:** `client/src/ui/toast.ts`
**Problem:** setTimeout callbacks accumulate and reference detached DOM nodes on navigation.
**Fix:** Track timeout IDs, export `clearToasts()` for cleanup, call on navigation.

## Fix 5 — Remove leaderboard error rethrow (CLIENT)

**File:** `client/src/app/screens/LeaderboardScreen.tsx` line 382
**Problem:** Error already captured in state; rethrow creates console spam.
**Fix:** Delete the throw line.
