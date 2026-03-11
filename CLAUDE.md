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

# Run client dev server (port 3000, proxies /ws to localhost:8080)
cd client && npm run dev

# Run game server (port 8080)
cd server && npm start
```

## Running Tests
```bash
cd server && npx vitest run
```
All 152 tests should pass. Simulation tests use `vi.useFakeTimers()` from Vitest to control the Room's internal timer-driven bot flow.

## Key Architecture Decisions

### Seating: `allSeats()` vs `seatsActive()`
- **`allSeats()`** — All seats that need a player for lobby/seating. Quadrille: 4 seats, Tresillo: 3 seats. Use for JOIN_ROOM, TAKE_SEAT, fillWithBots, canStart.
- **`seatsActive()`** — Seats actively playing the current hand (excludes resting seat). Use for dealing, auction order, trick logic.
- **Do not** use `seatsActive()` for lobby operations — it excludes the resting seat, which needs to be filled.

### `broadcastState()` must remain public
It is called from `server.ts` (not just internally in `room.ts`). Do not make it private.

### Null trump handling (bola/contrabola)
In bola and contrabola contracts, `state.trump` is `null`. The `legalPlays()` function has an early guard: if `tr` is null, use simple follow-suit logic without trump checks. Never use `tr!` assertions without checking for null first.

### Matador renounce rule
When trump is led, players with non-matador trumps must play a trump. But players holding **only** matadors (no regular trumps) may play **any** card — this is the matador privilege. Implemented in `legalPlays()` in engine.ts. The three matadors are: espadilla (espadas-1), manilla (trump-suit rank 7 for red, rank 2 for black), basto (bastos-1).

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
When evaluating hands for bot bidding (uses `isManille()` for suit-color-aware ranking):
- Spadille (espadas-1, always #1 trump) = 10 pts
- Manille (#2 trump: rank 7 for red suits, rank 2 for black) = 9 pts
- Basto (bastos-1, always #3 trump) = 8 pts
- In-suit King(12) = 6, Queen(11) = 5, Jack(10) = 4, Rank 7 = 3, other = 2
- Off-suit Kings = 2 pts each

**Important**: The manille rank depends on suit color. For red trump (oros/copas), rank 7 is the manille. For black trump (espadas/bastos), rank 2 is the manille. When constructing test hands, be aware of this asymmetry.

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
- **Lora** — Serif headings for home/lobby screens (loaded via Google Fonts)
- **Playfair Display** — Serif headings (loaded via Google Fonts, legacy)
- **NoeDisplay Bold** — Display/logo text (local @font-face)

### Design Token System
CSS variables in `theme.css` `:root` — semantic surfaces, motion timing, focus rings, shadows.
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

### Asset Paths
- **Logo**: `/assets/rocambor/logo-light.png` — Light version for dark backgrounds (home panel)
- **Favicon**: `/assets/rocambor/coin.png` — Gold coin (favicon in index.html, nav icon in home/lobby)
- **Source assets**: `/Users/rickyghi/Desktop/Rocambor/Assets/Finales/` — Original high-res PNGs

### Figma Design References
Use these file keys with the Figma MCP `get_screenshot` tool to compare against current implementation:
- **Desktop Auction**: `ea2vMte70fT6zMCsvAba0p` node `3:208`
- **Mobile Auction**: `NnRJzIEqu2mAMRDHnBw2rc` node `10:223`
- **Desktop Play**: `IMIN8TTFJvZ7pbFougOJSl` node `3:481`
- **Mobile Play**: `q4yNDyVjQNEREPorA9Dh3g` node `10:2`

### Canvas Rendering
- Desktop: 1320×760 logical resolution; Mobile: 760×1020 logical resolution; CSS-scaled to fill viewport
- `renderer.ts` — Main render loop. In sprite mode (`domPlatesEnabled`): canvas is `clearRect` only (transparent), animations still render. `drawPlayers()` is skipped entirely when `domPlatesEnabled` is true (prevents redundant canvas-drawn opponent card backs). In fallback mode: draws full table background.
- Card skins: procedural (`drawCard()`) + image-based (`CardImageAtlas`)
- Animations: `CardPlayAnimation`, `TrickWinAnimation` (with sparkle dots), `CardDealAnimation`, `ScoreChangeAnimation`

### Sprite-Mode DOM Card Rendering
- In production, cards render as DOM elements using CSS spritesheet (`.roc-card` at 96×138 base), not canvas
- Spritesheet cards scaled via `transform: scale()` inside `.hand-card-wrap` containers that define layout box
- Cards overlap via negative `margin-left` (`:first-child { margin-left: 0 }`) — NOT spread with gaps
- Desktop hand cards: 140×201 (auction, scale 1.458), 128×184 (play, scale 1.333); trick cards: 96×144
- Desktop card overlap: -28px (auction), -22px (play)
- Mobile 920px: 110×158 (auction), 96×138 (play); overlap -20px / -16px
- Mobile 430px: 100×144 (auction), 86×124 (play); overlap -20px / -16px
- Mobile 360px: 92×132 (auction), 80×115 (play); overlap -18px / -14px
- Phase-specific CSS classes (`.phase-auction`, `.phase-play`, `.phase-exchange`, `.phase-trump`) toggle card sizes
- `renderDomCardLayers()` in `game.ts` rebuilds both trick and hand card DOM on every state change
- Spritesheet CSS classes from `card-sprites.ts`: `spriteClassForCard(card)`, `spriteBackClass()`

### Game Table Architecture
- **Full-viewport layout**: `.game-stage` fills entire viewport (`position: absolute; inset: 0`). No bounded box — the viewport IS the table.
- Hybrid Canvas + DOM: in sprite mode, canvas is transparent (animations only); `FeltBackground.ts` provides CSS felt + `.felt-ellipse` decorative outline
- `GameScreen.spriteMode` flag controls which layer is active
- `game.css` is ~2560 lines with responsive breakpoints at 1060px, 920px (portrait), 430px (portrait), 360px (portrait)
- Mobile uses `isMobilePortrait` flag set by `handleResize()` (width ≤ 900px + portrait orientation)
- Controls rendered by `GameControls` class (`controls.ts`) into `#game-controls` slot inside `.game-controls-shell`
- `.game-controls-shell` is a **direct child of `.game-stage`** (not inside `.game-stage-bottom`)
- Desktop controls: `position: absolute; top: calc(50% - 30px); left: 50%; transform: translate(-50%, -50%)` — centered in viewport
- Mobile controls: `position: relative; margin-top: auto` inside flex column `.game-stage`
- `GameControls.attachHandlers()` relies on CSS class names (`.bid-btn`, `.trump-btn`, `.exchange-btn`, `.penetro-btn`) — preserve these

### Game Table UI Components
- **HUD Bar**: Floating pill strip (`game-hud-bar`) — desktop: transparent header (pills float on felt with own glass backgrounds); mobile: dark glass header bar
- **Hero Plates**: Two styles — **opponents** float on felt (no panel bg, transparent container) with avatar, name, position pill, role badge (OMBRE/CONTRA/TURN), trick dots. **Self plate** is a compact dark glass strip (`min(500px, 90vw)`) with avatar, name, YOU pill, role badge, YOUR TURN flash, trick dots. Diamond dots now track **tricks won** (not cards remaining). Positioned: left 16px, right 16px, across top 50px, self bottom. Active turn: opponents get avatar gold glow, self gets panel border glow + pulsing YOUR TURN pill.
- **Parchment Auction Panel**: Ivory gradient panel (desktop) or dark glass panel (mobile). Desktop: 2×2 bid grid with icons/descriptions. Mobile: **horizontal 4-across row** (icons/descriptions hidden, compact pill buttons)
- **Auction Bid Colors**: `[data-bid="entrada|volteo|solo"]` selectors on `.auction-bid` set distinct colors (ivory/gold/crimson). These have higher specificity than generic `.auction-bid` overrides. Mobile pass button: crimson.
- **Trick Area**: DOM-rendered trick cards with player name labels and winner badge overlay
- **Trick Result Banner**: Auto-dismissing green glass pill showing trick winner name + card
- **Turn-to-Lead Prompt**: Floating glass pill when player leads a new trick
- **Mobile Hand Dock**: Overlapping cards (negative margin-left) with "Your Hand" header, "SLIDE TO SELECT" hint, scroll dot indicators, full-width action button (play/exchange)
- **Arena Phase Banner**: Centered glass panel showing current phase + contextual guidance text
- **Arena Toast Feed**: Stack of auto-dismissing chip notifications for game events

### Card Skin System
- `card-skin-registry.ts` — Built-in skins (rocambor, classic, minimal, parchment, clasica) + custom import/export via localStorage
- Each skin has metadata: `author`, `theme` (classic/modern/ornate/custom), `rarity` (common/rare/legendary)
- Settings modal uses visual tile grid with mini canvas previews and rarity stars
- Image-mode skins load sprite atlases from `/cards/{skinId}/` via `card-image-loader.ts`

### Screen Architecture
- Hybrid DOM + Canvas: screens implement `Screen` interface (`mount`/`unmount`)
- 6 screens: `home`, `lobby`, `game`, `post-hand`, `match-summary`, `leaderboard`
- Each screen injects `<style>` via `addStyles()` with ID-gated dedup
- Home: dark panel with logo, mode toggle, action rows (Create/Quick Play/Join), secondary links, quote
- Lobby: dark felt theme, glass navbar, room code header, player seat cards with gold accents, match config, gold Start Game button. Mobile: vertical card list + sticky bottom bar.
- Game: canvas + dark felt-themed DOM controls (`.game-screen` scoped overrides in `game.css`)
- Leaderboard: skeleton loading, gradient rank badges, self-row highlight, empty state

### Game Screen Dark Theme
- Game screen uses dark semi-transparent panels instead of ivory (scoped via `.game-screen .rc-panel` etc.)
- Dark panel CSS vars in `theme.css`: `--panel-dark`, `--panel-dark-alt`, `--panel-dark-border`, `--text-on-panel`, `--text-on-panel-muted`
- Desktop header is **transparent** — HUD pills float on felt with individual `rgba(0,0,0,0.4)` + `backdrop-filter: blur(8px)` backgrounds
- Settings/sound buttons have subtle circular glass backgrounds (`rgba(0,0,0,0.2)` + blur) for felt visibility
- Profile avatar uses gold border + shadow; profile name uses ivory color + text-shadow for felt legibility
- Mobile header (920px) restores dark glass bar (`var(--panel-dark)` + border + blur)
- Trick dot indicators (`.hero-trick-dot`) are CSS-only diamonds (filled = gold for tricks won, empty = transparent with border). Replaced old card-remaining dots.
- Auction panel switches from parchment (desktop) to dark glass (mobile) via 920px media query

## Deployment

### Live URLs
- **Client**: https://rocambor.app (Netlify, custom domain)
- **Server**: https://rocambor-server-production.up.railway.app (Railway)
- **GitHub**: https://github.com/rickyghi/rocambor

### Railway (Server)
- Config: `railway.toml` — NIXPACKS builder, start: `cd server && npm start`
- Healthcheck: `/healthz` (120s timeout)
- CLI: `railway up -d --service rocambor-server` to deploy, `railway logs` to view logs
- The NIXPACKS build phase runs `npm run build` (root script builds both server + client). The start command only runs the server.

### Netlify (Client)
- Config: `netlify.toml` — builds from `client/`, publishes `dist/`, SPA fallback, security headers (CSP allows Google Fonts)
- Deploy pre-built dist (use absolute path for `--dir` to work around monorepo bug):
  ```bash
  cd client && npx netlify-cli deploy --prod --dir /Users/rickyghi/Desktop/Rocambor/RocamborMP/client/dist --no-build
  ```
- Site ID: `af83d768-1128-471d-bf0b-75c5b9d3c46c` (stored in `client/.netlify/state.json`)
- The Netlify CLI has a monorepo detection bug — relative `--dir dist` resolves to project root instead of `client/`. Always use absolute path.
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

### Quick Ship to Production
```bash
# 1. Test & type-check
cd server && npx vitest run && cd ../client && npx tsc --noEmit && cd ..

# 2. Build client with prod WS URLs
cd client && VITE_WS_URL=wss://rocambor-server-production.up.railway.app VITE_API_URL=https://rocambor-server-production.up.railway.app npm run build && cd ..

# 3. Build server
cd server && npm run build && cd ..

# 4. Deploy client to Netlify
cd client && npx netlify-cli deploy --prod --dir /Users/rickyghi/Desktop/Rocambor/RocamborMP/client/dist --no-build && cd ..

# 5. Deploy server to Railway
railway up -d --service rocambor-server
```

### CI/CD
GitHub Actions (`.github/workflows/ci.yml`) runs on push to `main`:
- Server job: install → type-check → test (152 tests) → build
- Client job: install → type-check → build

## File Structure
```
server/src/
  room.ts      — Core game state machine (~1400 lines), handles all game phases
  server.ts    — HTTP/WebSocket entry point, room creation/joining
  engine.ts    — Card logic: legal plays, trick winner, deck generation
  bot.ts       — Bot AI: bidding, trump choice, exchange, play decisions
  scoring.ts   — Pure scoring calculations (sacada/codille/puesta/bola/contrabola/penetro)
  auction-utils.ts — Bid ranking, validation, mapBidToContract (pure functions)
  exchange-utils.ts — Exchange limits and order calculation (pure functions)
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
    game.ts       — Game screen (~1770 lines): hero plates, hand dock, trick overlay, HUD, phase logic
    game.css      — Game screen styles (~2560 lines): responsive breakpoints, animations, all game UI
  canvas/       — HTML5 Canvas rendering (cards, players, table, animations)
    renderer.ts   — Main render loop + unified HUD strip
    cards.ts      — Procedural card drawing
    card-skin-registry.ts — Skin definitions + custom import/export
    card-image-loader.ts  — Image atlas loading for image-mode skins
    animations.ts — Card play, trick win (sparkle dots), deal, score animations
    table.ts      — Table background rendering
    players.ts    — Player names, scores, opponent cards
    layout.ts     — Canvas layout calculations (desktop 1320×760, mobile 760×1020)
  components/
    layout/
      FeltBackground.ts — Full-viewport felt background with `.felt-ellipse` decorative gold outline
  ui/           — Controls, settings, modals, toasts
    controls.ts   — GameControls: auction panel, trump choice, exchange, penetro render methods + event wiring
  audio/        — Sound effects
  lib/
    card-sprites.ts — Spritesheet CSS class generation (spriteClassForCard, spriteBackClass)
    avatars.ts    — Avatar URL builders (bot, DiceBear, fallback)
  styles/
    theme.css       — CSS custom properties (:root), body/html base styles
    global.css      — Utility resets, keyframe animations, responsive helpers
    components.css  — Shared component classes (.rc-panel, .btn-*, .ornament-divider)
    design-tokens.ts — TypeScript constants for canvas (COLORS, FONT, SPACING, RADIUS, MOTION, SURFACES)

shared/
  types.ts      — Shared TypeScript types (Card, Suit, GameState, etc.)
```
