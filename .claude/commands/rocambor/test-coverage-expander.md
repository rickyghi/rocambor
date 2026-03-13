---
name: rocambor:test-coverage-expander
description: Identify and fill test coverage gaps in server game logic
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# Test Coverage Expander

You are expanding the test suite for a multiplayer Tresillo/Rocambor card game server. Your goal is to identify untested game logic paths and write focused tests that catch regressions.

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Pay special attention to:
   - "Spanish Card Ranking" — red suits reversed, rank-2/3 score high as trump
   - "Null Trump Handling" — bola/contrabola have `state.trump === null`
   - Seating model: `allSeats()` for lobby, `seatsActive()` for game
   - "Simulation Test Pattern" — the fake-timer bot flow
2. `shared/types.ts` — Card, GameState, Bid, SeatIndex types
3. `server/src/engine.ts` — `legalPlays()`, `trickWinner()`, `plainSuitValue()`, `isMatador()`
4. `server/src/room.ts` — The full state machine: auction, exchange, play, scoring
5. `server/src/bot.ts` — `BotContext` interface, `evaluateHand()`

## Step 2: Read Existing Tests

Read all test files to understand current coverage:

1. `server/tests/scoring.test.ts` — What scoring scenarios are covered?
2. `server/tests/reconnect.test.ts` — Reconnection tests
3. Any other `server/tests/*.test.ts` files

Note the conventions:
- `card(suit, rank)` helper: `function card(s: Suit, r: number): Card { return { s, r: r as any, id: \`\${s[0]}\${r}\` }; }`
- `makeRoom(mode)` helper for creating test rooms
- `vi.useFakeTimers()` / `vi.advanceTimersByTime(1500)` for bot simulation
- `vi.clearAllTimers()` in cleanup

## Step 3: Gap Inventory

Systematically check for missing test coverage in these areas:

### Engine Tests (`engine.test.ts` — may need to create)
- [ ] `legalPlays()` with null trump (bola/contrabola) — follow-suit-only logic
- [ ] `legalPlays()` matador exemption — matadors cannot be forced by trump lead
- [ ] `legalPlays()` void-suit trump obligation — must trump when void in led suit
- [ ] `trickWinner()` with red-suit reversed ranking (copas-3 beats copas-5)
- [ ] `trickWinner()` matador hierarchy (Espadilla > Manille > Basto)
- [ ] `trickWinner()` trump beats non-trump regardless of rank
- [ ] `plainSuitValue()` returns correct order for red vs black suits

### Room Tests — Auction
- [ ] Bid ladder enforcement: entrada < oros < volteo < solo < solo_oros
- [ ] Opening bid restrictions (only entrada, volteo, solo allowed first)
- [ ] Contrabola: only valid when declared by last remaining bidder
- [ ] Espada obligatoria: spadille holder forced to play entrada when all pass

### Room Tests — Exchange
- [ ] Ombre exchanges first, then defenders in order
- [ ] Entrada/Volteo limit: ombre up to 8 cards
- [ ] Oros limit: ombre up to 6 cards
- [ ] Solo: ombre exchanges 0
- [ ] Contrabola: ombre exchanges exactly 1
- [ ] Defer exchange (empty discard)

### Room Tests — Scoring
- [ ] Sacada: 1 point for 5 tricks, 2 for 7+, 4 for 9
- [ ] Codille: defender takes 5+ tricks, ombre loses
- [ ] Puesta: no one reaches 5, ombre loses 1
- [ ] Oros bonus: double the base points
- [ ] Bola: 6 points if all 9 tricks, else defenders get 2 each
- [ ] Contrabola: 4 points if 0 tricks, else defenders get 1 each
- [ ] Penetro: player with most tricks gets 2 points
- [ ] Implicit bola: winning all first 5 tricks implies bola

### Room Tests — Full Flow
- [ ] Penetro full flow with bot simulation
- [ ] Close hand (vote to end match)
- [ ] Reconnection during active hand

## Step 4: Write Tests in Batches

Create test files one at a time. After each file, run `cd server && npx vitest run` to confirm all tests pass before proceeding.

### Batch 1: Engine Tests
Create `server/tests/engine.test.ts`:
- Test `legalPlays()` for each of the three rules
- Test `trickWinner()` for red/black ranking, matador hierarchy, trump precedence
- Test `plainSuitValue()` for both suit colors

### Batch 2: Auction & Exchange Tests
Create or extend `server/tests/auction.test.ts`:
- Test bid ladder enforcement
- Test espada obligatoria
- Test exchange limits per contract

### Batch 3: Scoring Deep Tests
Extend `server/tests/scoring.test.ts`:
- Add missing scoring scenarios (oros bonus, bola fail, contrabola fail, penetro)
- Test implicit bola continuation

### Batch 4: Simulation Tests
Create or extend `server/tests/simulation.test.ts`:
- Full bot game flow for penetro
- Reconnection during play

## Step 5: Verify After Each Batch

After writing each batch of tests:

```bash
cd server && npx vitest run
```

All existing tests must continue to pass. New tests should pass immediately (they test existing correct behavior).

## Test Writing Rules

1. **Avoid rank-2/3 in "weak" hands** — They score 8/7 points as trump, making hands evaluate as strong
2. **Use `seatsActive()` for in-game seating** — Never use `allSeats()` for dealing/auction/play tests
3. **Use `allSeats()` for lobby tests** — JOIN_ROOM, TAKE_SEAT, canStart
4. **Each test must be independent** — Set up its own room and state
5. **Use descriptive test names** — `"legalPlays: matador is exempt from trump obligation"` not `"test matador"`
6. **Test both positive and negative cases** — "allows X" and "rejects X"
