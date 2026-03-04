# Rocambor / Tresillo Online

Real-time multiplayer Spanish trick-taking card game supporting Tresillo (3 players) and Quadrille (4 players).

## Tech Stack

- **Server**: TypeScript, Node.js, WebSocket (`ws`), PostgreSQL, Redis
- **Client**: Vanilla TypeScript, Vite, HTML5 Canvas
- **Deploy**: Railway (server), Netlify (client)

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 15+ (optional - runs without DB)
- Redis 7+ (optional - runs without Redis)

### Local Development

```bash
# From the project root
npm install

# Start server (port 8080)
cd server && npm run dev

# In another terminal, start client (port 5173)
cd client && npm run dev
```

Open `http://localhost:5173` in your browser. The Vite dev server proxies WebSocket connections to the server on port 8080.

### Running Tests

```bash
cd server && npm test
```

### Type Checking

```bash
# Server
cd server && npx tsc --noEmit

# Client
cd client && npm run type-check
```

### Production Build

```bash
# Server
cd server && npm run build

# Client
cd client && npm run build
```

## Project Structure

```
RocamborMP/
  shared/types.ts          # Shared types (Card, GameState, messages)
  server/
    src/
      server.ts            # HTTP + WS entry point
      engine.ts            # Card logic, deck, legal plays, trick winner
      room.ts              # Game state machine (auction, play, scoring)
      room-router.ts       # Multi-room manager
      bot.ts               # Bot AI
      reconnect.ts         # Seat reservation for reconnection
      lobby.ts             # Matchmaking queue
      persistence.ts       # DB writes (game results, stats)
      protocol.ts          # Zod message validation
      db.ts, redis.ts      # Database connections
    tests/                 # Vitest test suites
    migrations/            # SQL migration files
  client/
    src/
      main.ts              # App bootstrap
      connection.ts        # WebSocket manager
      state.ts             # Client state store
      router.ts            # Hash-based screen router
      screens/             # Home, Lobby, Game, Post-hand, Match Summary
      canvas/              # Canvas rendering (cards, table, players)
      ui/                  # Controls, toast, modal, settings
      audio/               # Web Audio sound effects
      styles/              # Design tokens, global CSS
```

## Environment Variables

### Server

| Variable       | Default             | Description                          |
|----------------|---------------------|--------------------------------------|
| `PORT`         | `8080`              | HTTP/WS server port                  |
| `DATABASE_URL` | _(none)_            | PostgreSQL connection string         |
| `REDIS_URL`    | _(none)_            | Redis connection string              |
| `NODE_ENV`     | `development`       | Environment mode                     |

### Graceful Degradation

The server runs fine without PostgreSQL or Redis:
- **No Postgres**: Game results and stats are not persisted. Everything else works.
- **No Redis**: Reconnection seat reservations use an in-memory Map (lost on restart). Lobby uses in-memory arrays.

## Database Setup (Optional)

```bash
# Create database
createdb rocambor

# Set connection string
export DATABASE_URL="postgresql://localhost:5432/rocambor"

# Run migrations
cd server && npm run migrate
```

## Deployment

### Railway (Server)

1. Connect your GitHub repo to Railway
2. Set the root directory to the project root
3. Set environment variables: `DATABASE_URL`, `REDIS_URL` (from Railway add-ons)
4. Railway will auto-detect the `railway.toml` config

### Netlify (Client)

1. Connect your GitHub repo to Netlify
2. Set base directory to `client`
3. Build command: `npm run build`
4. Publish directory: `client/dist`
5. The `netlify.toml` handles SPA redirects and security headers

## WebSocket Troubleshooting

- **Connection refused**: Ensure the server is running on port 8080
- **Proxy errors in dev**: Check that `vite.config.ts` has the WS proxy configured
- **Reconnection failing**: The client stores a `clientId` in localStorage. Clear it to start fresh: `localStorage.removeItem("rocambor_clientId")`
- **CORS issues in production**: Ensure Netlify CSP headers allow `wss://your-railway-domain`

## Game Features

- **Multi-room support**: Create private rooms with shareable 6-character codes
- **Quick Play**: Automatic matchmaking for Tresillo or Quadrille
- **Bot players**: AI bots fill empty seats when the game starts
- **Reconnection**: Disconnected players can rejoin within 120 seconds
- **Spectator mode**: Watch games without taking a seat
- **Colorblind mode**: Alternative suit color palette
- **Table themes**: Classic Green, Royal Blue, Rustic Brown
- **Sound effects**: Synthesized audio (Web Audio API, no external files)

## Classic Luxury UI Assets

Canonical UI assets now live in:

- `client/public/assets/rocambor/felt-texture.jpg`
- `client/public/assets/rocambor/noise-texture.png`
- `client/public/assets/rocambor/app-icon.png`
- `client/public/assets/rocambor/favicon.png`
- `client/public/assets/rocambor/divider-1.png`
- `client/public/assets/rocambor/divider-2.png`
- `client/public/assets/rocambor/coin-crown.png`
- `client/public/assets/rocambor/coin-heart.png`
- `client/public/assets/rocambor/coin-club.png`
- `client/public/assets/rocambor/coin-gold.png`

Legacy folders (`/textures`, `/brand`, `/logo`) are still kept for compatibility fallback.

## Avatar System

- Player profile data is stored locally through `ProfileManager`.
- Name and avatar persist in local storage.
- Avatar choices use deterministic DiceBear URLs and local SVG fallbacks.
- If remote avatar loading fails, the UI falls back to bundled local avatars and then initials-based SVG.

## Modals and Toasts

- Modals are implemented via `client/src/ui/modal.ts`.
- `showModal(...)` supports:
  - `size: "sm" | "md" | "lg"`
  - `scroll: boolean`
  - `dismissible: boolean` (Escape/backdrop/close button)
- Toasts are implemented via `client/src/ui/toast.ts` and styled for:
  - Desktop: top-center stack
  - Mobile: bottom-center stack

## Spritesheet Card Mapping

The UI can render DOM cards from a spritesheet when all files exist:

- `/cards/rocambor_cards_spritesheet.webp`
- `/cards/rocambor_cards_spritesheet.css`
- `/cards/rocambor_cards_spritesheet.json`

Class convention:

- `roc-card roc-card--{suit}-{rank}` (example: `roc-card roc-card--oros-1`)
- Back face: `roc-card roc-card--back`

Fallback behavior:

- If spritesheet assets are missing, the game automatically falls back to existing canvas card rendering (no gameplay regression).

## License

Private project.
