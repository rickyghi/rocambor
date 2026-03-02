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

### Live URLs
- **Client**: https://rocambor-game.netlify.app (Netlify)
- **Server**: https://rocambor-server-production.up.railway.app (Railway)
- **GitHub**: https://github.com/rickyghi/rocambor

### Railway (Server)
- Config: `railway.toml` — NIXPACKS builder, start: `cd server && npm start`
- Healthcheck: `/healthz` (120s timeout)
- CLI: `railway up -d` to deploy, `railway logs` to view logs
- The NIXPACKS build phase runs `npm run build` (root script builds both server + client). The start command only runs the server.

### Netlify (Client)
- Config: `netlify.toml` — builds from `client/`, publishes `dist/`, SPA fallback, security headers
- CLI: `netlify deploy --prod --dir=client/dist --site=b1b0f56c-fad3-401a-b2eb-ef23cd2ab33a --no-build --filter rocambor-client`
- Must use `--filter rocambor-client` due to monorepo workspace detection
- Client is built locally with `VITE_WS_URL=wss://rocambor-server-production.up.railway.app` baked in

### WebSocket URL (cross-domain)
`client/src/connection.ts` uses `VITE_WS_URL` env var for split deployments. Set this when building the client:
```bash
cd client && VITE_WS_URL=wss://rocambor-server-production.up.railway.app npm run build
```
If not set, falls back to `location.hostname` (works when server/client share domain).

### Build output paths
The server tsconfig uses `rootDir: ".."` so tsc outputs preserve the full directory structure:
- `server/src/server.ts` → `server/dist/server/src/server.js`
- `shared/types.ts` → `server/dist/shared/types.js`

**Important**: The `start` script in `server/package.json` must point to `dist/server/src/server.js`, NOT `dist/src/server.js`.

### Environment Variables
| Variable | Platform | Required | Description |
|----------|----------|----------|-------------|
| `PORT` | Railway | Auto-set | Server listen port (default 8080) |
| `NODE_ENV` | Railway | Optional | `production` for SSL on DB connections |
| `DATABASE_URL` | Railway | Optional | PostgreSQL connection — server runs fine without it |
| `REDIS_URL` | Railway | Optional | Redis connection — server runs fine without it |
| `VITE_WS_URL` | Build-time | Required for split deploy | WebSocket URL baked into client at build time |

### CI/CD
GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`:
- Server job: install → type-check → test (78 tests) → build
- Client job: install → type-check → build

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
