# CLAUDE.md — RocamborMP Project Guide

## Project Overview
Multiplayer Spanish trick-taking card game (Tresillo/Quadrille) with a Node.js WebSocket server and Vite-bundled browser client using HTML5 Canvas rendering.

## Dev Environment Setup
```bash
# Install Homebrew + Node.js (macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node

# Install dependencies (from project root)
npm install
```

## Running Tests
```bash
cd server && npx vitest run
```
All 78 tests should pass. Simulation tests use `vi.useFakeTimers()` from Vitest to control the Room's internal timer-driven bot flow.

## Key Architecture Decisions

### Seating: `allSeats()` vs `seatsActive()`
- **`allSeats()`** — All seats that need a player for lobby/seating. Quadrille: 4 seats, Tresillo: 3 seats. Use for JOIN_ROOM, TAKE_SEAT, fillWithBots, canStart.
- **`seatsActive()`** — Seats actively playing the current hand (excludes resting seat). Use for dealing, auction order, trick logic.
- **Do not** use `seatsActive()` for lobby operations — it excludes the resting seat, which needs to be filled.

### `broadcastState()` must remain public
It is called from `server.ts` (not just internally in `room.ts`). Do not make it private.

### Null trump handling (bola/contrabola)
In bola and contrabola contracts, `state.trump` is `null`. The `legalPlays()` function has an early guard: if `tr` is null, use simple follow-suit logic without trump checks. Never use `tr!` assertions without checking for null first.

## Spanish Card Ranking (Critical for Tests)

### Red suits (oros, copas) have REVERSED plain ranking
Lower numeric ranks are **stronger** in plain (non-trump) tricks:
```
King(12) > Queen(11) > Jack(10) > Ace(1) > 2 > 3 > 4 > 5 > 6 > 7
```
So copas-3 **beats** copas-5 in a copas-led trick. This is correct Tresillo behavior.

### Black suits (espadas, bastos) have standard ranking
```
King(12) > Queen(11) > Jack(10) > 7 > 6 > 5 > 4 > 3 > 2 > Ace(1)
```

### Trump card point values (`trumpCardPoints` in engine.ts)
When evaluating hands for bot bidding:
- Rank 1 (Ace) = 9 pts, Rank 2 = 8 pts, Rank 3 = 7 pts
- Rank 12 (King) = 6 pts, Rank 11 (Queen) = 5 pts, Rank 10 (Jack) = 4 pts
- Rank 7 = 3 pts, Other ranks = 2 pts
- Off-suit Kings = 2 pts each

**Important**: Rank 2 and Rank 3 score very high as trump cards. When constructing "weak" test hands, avoid putting rank-2 or rank-3 cards in any single suit, or they'll score 15+ as potential trump.

## Simulation Test Pattern
The simulation tests (`simulation.test.ts`) use Vitest fake timers to run full bot-vs-bot games:
1. Create room, add one "human" conn at seat 0 (keep `isBot = false`)
2. Call `startGame()` — this requires at least 1 human via `canStart()`
3. **After** startGame succeeds, set `conn.isBot = true` and call `botMaybeAct()`
4. Use `vi.advanceTimersByTime(1500)` in a loop to drive bot actions naturally
5. Clean up with `vi.clearAllTimers()`

## Deployment
- **Server**: Railway (`railway.toml`)
- **Client**: Netlify (`netlify.toml`)
- Server uses PostgreSQL (via `pg`) and Redis (via `ioredis`) with graceful degradation — runs fine without either

## File Structure
```
server/src/
  room.ts      — Core game state machine (~1100 lines), handles all game phases
  server.ts    — HTTP/WebSocket entry point, room creation/joining
  engine.ts    — Card logic: legal plays, trick winner, deck generation
  bot.ts       — Bot AI: bidding, trump choice, exchange, play decisions
  lobby.ts     — Matchmaking queue for quick play
  redis.ts     — Redis connection (optional)
  db.ts        — PostgreSQL connection (optional)
  persistence.ts — Save hand/match results
  reconnect.ts — WebSocket reconnection handling

client/src/
  main.ts       — App bootstrap
  connection.ts — WebSocket client
  state.ts      — Client-side state management
  router.ts     — Screen navigation
  screens/      — UI screens (home, lobby, game, post-hand, match-summary)
  canvas/       — HTML5 Canvas rendering (cards, players, table, animations)
  ui/           — Controls, settings, modals, toasts
  audio/        — Sound effects
  styles/       — CSS + design tokens

shared/
  types.ts      — Shared TypeScript types (Card, Suit, GameState, etc.)
```
