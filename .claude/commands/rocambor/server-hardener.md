---
name: rocambor:server-hardener
description: Add rate limiting, input validation, and connection guards to the WebSocket server
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Bash
---

# Server Hardener

You are hardening a live production WebSocket game server against abuse. The server runs at https://rocambor.app. All protections must be **dependency-free** (no new npm packages).

## Step 1: Read Context

Read these files:

1. `CLAUDE.md` — Note: `broadcastState()` must remain public. Start script must point to `dist/server/src/server.js`.
2. `server/src/server.ts` — HTTP/WebSocket entry point. Find the `connection` event, `onMessage` handler, and `setupWsHandlers()`.
3. `server/src/protocol.ts` — Zod schemas for C2S messages. Note existing validation.
4. `server/src/room.ts` — The `handle()` method and `attach()` method.
5. `server/src/room-router.ts` — Room creation and cleanup.

## Step 2: Create Rate Limiter Module

Create `server/src/rate-limit.ts`:

```typescript
export class RateLimiter {
  // Sliding window rate limiter
  // check(key: string): boolean — returns true if request is allowed
  // Uses a Map<string, { count: number, windowStart: number }>
  // Configurable: windowMs, maxRequests
}

export class ConnectionTracker {
  // Per-IP connection counting
  // connect(ip: string): boolean — returns true if under limit
  // disconnect(ip: string): void
  // Configurable: maxPerIp (default 10)
}
```

Requirements:
- No external dependencies
- Automatic cleanup of stale entries (entries older than 2x window)
- Thread-safe for Node.js single-thread model (no mutex needed)

## Step 3: Per-IP Connection Limiting

In `server.ts`, at the WebSocket `connection` event:

1. Extract IP from `req.socket.remoteAddress` or `x-forwarded-for` header
2. Call `connectionTracker.connect(ip)` — if false, send close frame with code 1008 (Policy Violation) and return
3. On WebSocket `close`, call `connectionTracker.disconnect(ip)`
4. Default limit: 10 connections per IP

## Step 4: Per-Connection Message Throttle

In `setupWsHandlers()` or the `onMessage` handler:

1. Create a per-connection rate limiter (30 messages/second window)
2. On each message, call `limiter.check(connectionId)`
3. If over limit: send `{ type: "ERROR", code: "RATE_LIMITED", message: "Too many messages" }` and ignore the message
4. After 3 consecutive rate-limit violations, close the connection

## Step 5: Room Creation Rate Limiting

In the pre-room message handler where `CREATE_ROOM` is processed:

1. Rate limit room creation to 3 per IP per 60 seconds
2. On violation, send `{ type: "ERROR", code: "RATE_LIMITED", message: "Too many room creations" }`

## Step 6: Handle Sanitization

In `room.ts` where player handles are set (the `Conn` object):

1. Strip any HTML tags from the handle: `handle.replace(/<[^>]*>/g, "")`
2. Trim whitespace and limit to 20 characters
3. If empty after sanitization, default to `"Player"`
4. Apply this in `attach()` and `tryReconnect()`

## Step 7: Spectator Capacity Cap

In `room.ts` `attach()` method:

1. Count current spectators: `this.conns.filter(c => c.isSpectator).length`
2. If >= 20, reject with `{ type: "ERROR", code: "ROOM_FULL", message: "Spectator limit reached" }`

## Step 8: Write Tests

Create `server/tests/rate-limit.test.ts`:

- Test `RateLimiter`: allows requests under limit, blocks over limit, resets after window
- Test `ConnectionTracker`: allows under limit, blocks over limit, decrements on disconnect
- Test handle sanitization: strips HTML, trims, limits length, handles empty

## Step 9: Verify

1. `cd server && npx tsc --noEmit` — type check
2. `cd server && npx vitest run` — all existing + new tests pass
3. Verify no changes to the public API (broadcastState stays public, message types unchanged)

## Implementation Notes

- Use `req.headers["x-forwarded-for"]?.split(",")[0].trim()` for proxied environments (Railway uses a reverse proxy)
- The rate limiter cleanup can run lazily (check on each call) rather than on a timer
- Keep the rate limiter generic — it should work for any string key, not just IPs
- Log rate-limit violations at `console.warn` level for monitoring
