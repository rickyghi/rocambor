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

## License

Private project.
