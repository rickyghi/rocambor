# Rocambor - Design Document

## Architecture Overview

```
                     +-----------+
                     |  Netlify  |
                     |  (Static) |
                     +-----+-----+
                           |
                      HTTPS / WSS
                           |
                     +-----+-----+
                     |  Railway  |
                     |  (Server) |
                     +-----+-----+
                           |
              +------------+------------+
              |            |            |
         +----+----+ +----+----+ +-----+-----+
         | Postgres| |  Redis  | |  In-Memory|
         | (stats) | | (seats) | | (fallback)|
         +---------+ +---------+ +-----------+
```

### Monorepo Structure

- **`shared/`**: Types shared between server and client (Card, GameState, messages)
- **`server/`**: Node.js WebSocket server with game logic
- **`client/`**: Vite-bundled browser client with Canvas rendering

### Key Design Decisions

1. **Numeric SeatIndex** (0-3) instead of perspective-relative strings. Server sends neutral state; client rotates the view.
2. **Full state broadcast** on every change (~2KB/msg). Simple and correct for a turn-based card game.
3. **Procedural rendering**: All cards drawn with Canvas API, no image assets needed.
4. **Graceful degradation**: Server runs without Postgres/Redis, using in-memory fallbacks.

## Data Flow

```
User clicks card
    |
    v
Canvas hit test -> cardId
    |
    v
ConnectionManager.send({ type: "PLAY", cardId })
    |
    v (WebSocket)
Server room.handle(msg, conn)
    |
    v
Engine validates legal play
    |
    v
Room updates state, broadcasts
    |
    v (WebSocket to all)
ConnectionManager receives STATE message
    |
    v
ClientState.update(gameState, hand)
    |
    v
State subscribers notified
    |
    v
GameRenderer.requestRender() -> dirty flag
    |
    v
Next rAF: render all layers
```

## Server Architecture

### Room State Machine

```
lobby -> dealing -> auction -> trump_choice -> exchange -> play
                                                            |
                                                       (9 tricks)
                                                            |
                                                        post_hand
                                                            |
                                              (target reached?)
                                              /              \
                                         match_end        dealing
                                             |                |
                                          rematch          (loop)
                                             |
                                           lobby
```

### Module Responsibilities

| Module          | Purpose                                         |
|-----------------|------------------------------------------------|
| `server.ts`     | HTTP/WS entry, routes connections to rooms     |
| `room.ts`       | Game state machine, phase transitions, scoring |
| `engine.ts`     | Deck creation, legal plays, trick winner       |
| `bot.ts`        | AI decision making for bot players             |
| `room-router.ts`| Multi-room lifecycle management                |
| `lobby.ts`      | Matchmaking queue                              |
| `reconnect.ts`  | Seat reservation with TTL                      |
| `persistence.ts`| Database writes for game history               |
| `protocol.ts`   | Zod validation for incoming messages           |

### Message Protocol

**Client to Server (C2S)**: 13 message types

- Room management: `QUICK_PLAY`, `CREATE_ROOM`, `JOIN_ROOM`, `SPECTATE`, `TAKE_SEAT`, `LEAVE_ROOM`
- Game actions: `START_GAME`, `BID`, `CHOOSE_TRUMP`, `EXCHANGE`, `PLAY`, `REMATCH`
- Heartbeat: `PING`

**Server to Client (S2C)**: 8 message types

- Connection: `WELCOME`, `PONG`
- Room: `ROOM_JOINED`, `ROOM_LEFT`
- Game: `STATE`, `EVENT`, `ERROR`
- Queue: `QUEUE_UPDATE`

## Client Architecture

### Screen Lifecycle

The client now mounts a single React app at `#app`. Hash routing still drives the high-level screen name, but route composition is React-owned and `router.navigate(name)` just updates the active hash-backed screen:

- `home`
- `lobby`
- `game`
- `post-hand`
- `match-summary`
- `leaderboard`

The game route keeps the current canvas renderer and controller, but that controller now attaches into a React-rendered shell instead of creating screen markup imperatively.

### Canvas Rendering Pipeline

Render order (back to front):

1. **Table background** - Radial gradient felt with theme
2. **Players** - Name badges, scores, opponent card backs
3. **Table cards** - Currently played trick cards
4. **Player hand** - Bottom of screen, with hover/selection states
5. **Animations** - Overlay effects
6. **HUD** - Phase indicator, trump, contract, turn indicator

### Rendering Optimization

- **Dirty flag**: Only re-render when state changes
- **requestAnimationFrame**: Synced to display refresh
- **Logical coordinates**: Canvas is always 1024x720; CSS scales to fit viewport

## Design System

### Color Palette

| Token            | Value      | Usage                    |
|------------------|------------|--------------------------|
| `--bg-primary`   | `#0c1912`  | Main background          |
| `--bg-secondary` | `#13251b`  | Cards, panels            |
| `--bg-tertiary`  | `#1c2f24`  | Elevated surfaces        |
| `--text-primary` | `#e8f0ff`  | Body text                |
| `--text-secondary`| `#a0b0c0` | Muted text               |
| `--text-accent`  | `#fbbf24`  | Gold highlights          |
| `--success`      | `#4ade80`  | Positive feedback        |
| `--error`        | `#ff6b6b`  | Error states             |
| `--info`         | `#74c0fc`  | Informational            |

### Table Themes

| Theme   | Felt      | Dark      | Light     |
|---------|-----------|-----------|-----------|
| Classic | `#1a3b2e` | `#0c1912` | `#245a43` |
| Royal   | `#1a1a3b` | `#0c0c19` | `#24245a` |
| Rustic  | `#3b2a1a` | `#19120c` | `#5a4324` |

### Suit Colors

| Suit    | Standard | Colorblind |
|---------|----------|------------|
| Oros    | `#FFD700`| `#FFD700`  |
| Copas   | `#FF4444`| `#0072B2`  |
| Espadas | `#C0C0C0`| `#E0E0E0`  |
| Bastos  | `#228B22`| `#D55E00`  |

### Typography

System font stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

### Components

- **Buttons**: `.primary` (gold accent), `.accent` (green), `.danger` (red)
- **Toast**: Auto-dismiss notifications (success, error, info, warning)
- **Modal**: Overlay dialog with title, content, action buttons
- **Controls**: Phase-sensitive game action buttons

## Reconnection Flow

1. Client disconnects (network drop, tab close)
2. Server reserves seat via `ReconnectManager` (120s TTL)
3. Room marks player as `connected: false`
4. Client reconnects with stored `clientId` from localStorage
5. Server checks `ReconnectManager.tryResume(clientId)`
6. If valid: restore player to seat, send full game state
7. If expired: fresh connection, bot may occupy old seat

## Bot AI Strategy

The bot evaluates hands using a point system:

- **Matadores**: High value (Spadille = 15, Manille = 12, Basto = 10)
- **Trump cards**: Moderate value based on rank
- **Non-trump honors**: Small value

Bid thresholds:
- Entrada: 20+ points with good trump suit
- Solo: 35+ points
- Bola: 50+ points (extremely rare)

Play strategy:
- Lead with winning matadores to pull trump
- Follow suit with lowest card when not winning
- Trump when void in led suit
