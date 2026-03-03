# CLAUDE.md — RocamborMP Project Guide

## Project Overview
Multiplayer Spanish trick-taking card game (Tresillo/Quadrille) with a Node.js WebSocket server and Vite-bundled browser client using HTML5 Canvas rendering. Premium tabletop UI theme with ivory/gold/green brand palette.

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
All 87 tests should pass. Simulation tests use `vi.useFakeTimers()` from Vitest to control the Room's internal timer-driven bot flow.

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

## UI/UX Design System

### Brand Palette
- **Ivory** `#F8F6F0` — Primary background, parchment surfaces
- **Gold** `#C8A651` — Accent, borders, CTAs (use as accent, not fill)
- **Black** `#0D0D0D` — Text, contrast
- **Crimson** `#B02E2E` — Danger/error only (not primary CTAs)
- **Forest Green** `#2A4D41` — Felt/table surfaces

### Typography
- **Inter** — Body/UI text (variable weight sans-serif)
- **Playfair Display** — Serif headings (loaded via Google Fonts)
- **NoeDisplay Bold** — Display/logo text (local @font-face)

### Design Token System
CSS variables in `global.css` `:root` — semantic surfaces, motion timing, focus rings, shadows.
TypeScript constants in `design-tokens.ts` — `COLORS`, `FONT`, `SPACING`, `RADIUS`, `MOTION`, `SURFACES` for canvas rendering.

### Branded Component Classes
- **`.btn-gold-plaque`** — Premium gold gradient CTA (gradient bg, plaque shadow, shimmer hover)
- **`.btn-ivory-engraved`** — Secondary parchment button (carved inset shadow, gold border hover)
- **`.btn-ghost-felt`** — Tertiary transparent button for dark backgrounds
- **`.panel-parchment`** — Ivory surface panel with gold border
- **`.panel-felt`** — Dark semi-transparent panel with backdrop blur
- **`.ornament-divider`** — Gold gradient lines with center dot
- **`.skel-block`** / **`.skel-text`** / **`.skel-circle`** — Skeleton loading primitives

### Motion Tokens
```css
--dur-micro: 120ms;   /* Micro interactions (press feedback) */
--dur-fast: 150ms;    /* Standard hover/focus transitions */
--dur-base: 240ms;    /* Modal entrances, screen transitions */
--dur-slow: 400ms;    /* Entrance animations (fadeInUp) */
```

### Canvas Rendering
- Fixed 1024×720 logical resolution, CSS-scaled to container
- `renderer.ts` — Main render loop (table bg, players, cards, animations, HUD)
- Unified top HUD strip: phase | contract · trump | target
- Card skins: procedural (`drawCard()`) + image-based (`CardImageAtlas`)
- Animations: `CardPlayAnimation`, `TrickWinAnimation` (with sparkle dots), `CardDealAnimation`, `ScoreChangeAnimation`

### Card Skin System
- `card-skin-registry.ts` — Built-in skins (rocambor, classic, minimal, parchment, clasica) + custom import/export via localStorage
- Each skin has metadata: `author`, `theme` (classic/modern/ornate/custom), `rarity` (common/rare/legendary)
- Settings modal uses visual tile grid with mini canvas previews and rarity stars
- Image-mode skins load sprite atlases from `/cards/{skinId}/` via `card-image-loader.ts`

### Screen Architecture
- Hybrid DOM + Canvas: screens implement `Screen` interface (`mount`/`unmount`)
- 6 screens: `home`, `lobby`, `game`, `post-hand`, `match-summary`, `leaderboard`
- Each screen injects `<style>` via `addStyles()` with ID-gated dedup
- Home: single Play CTA + mode toggle, ornament dividers, skin gallery in settings
- Lobby: seat plaques with text badges, compact room header
- Game: canvas + parchment controls bar
- Leaderboard: skeleton loading, gradient rank badges, self-row highlight, empty state

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
- Config: `netlify.toml` — builds from `client/`, publishes `dist/`, SPA fallback, security headers (CSP allows Google Fonts)
- Deploy pre-built dist: `cd client && npx netlify-cli deploy --prod --dir dist --no-build`
- Site ID: `b1b0f56c-fad3-401a-b2eb-ef23cd2ab33a` (stored in `client/.netlify/state.json`)
- The Netlify CLI has a monorepo detection bug — use `--no-build` with pre-built dist to avoid interactive prompts
- Build command in `netlify.toml` includes `VITE_WS_URL` and `VITE_API_URL` env vars

### WebSocket URL (cross-domain)
`client/src/connection.ts` uses `VITE_WS_URL` env var for split deployments. Set this when building the client:
```bash
cd client && VITE_WS_URL=wss://rocambor-server-production.up.railway.app VITE_API_URL=https://rocambor-server-production.up.railway.app npm run build
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
| `VITE_API_URL` | Build-time | Required for split deploy | REST API URL baked into client at build time |

### CI/CD
GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`:
- Server job: install → type-check → test (87 tests) → build
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
  screens/      — UI screens (home, lobby, game, post-hand, match-summary, leaderboard)
  canvas/       — HTML5 Canvas rendering (cards, players, table, animations)
    renderer.ts   — Main render loop + unified HUD strip
    cards.ts      — Procedural card drawing
    card-skin-registry.ts — Skin definitions + custom import/export
    card-image-loader.ts  — Image atlas loading for image-mode skins
    animations.ts — Card play, trick win (sparkle dots), deal, score animations
    table.ts      — Table background rendering
    players.ts    — Player names, scores, opponent cards
    layout.ts     — Canvas layout calculations
  ui/           — Controls, settings, modals, toasts
  audio/        — Sound effects
  styles/
    global.css      — CSS variables, branded components, keyframes, responsive
    design-tokens.ts — TypeScript constants for canvas (COLORS, FONT, SPACING, RADIUS, MOTION, SURFACES)

shared/
  types.ts      — Shared TypeScript types (Card, Suit, GameState, etc.)
```
