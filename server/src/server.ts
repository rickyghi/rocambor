import "dotenv/config";
import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { initDB, closeDB } from "./db";
import { initRedis, closeRedis, getRedis } from "./redis";
import { RoomRouter } from "./room-router";
import { ReconnectManager } from "./reconnect";
import { Lobby } from "./lobby";
import { C2SMessageSchema } from "./protocol";
import { Conn } from "./room";
import {
  FRIENDLY_TOKEN_ANTE,
  claimFriendlyRescue,
  getLeaderboard,
  getMatchHistoryForAuthUser,
  getOrCreateAuthenticatedProfile,
  getPlayerStats,
  getWalletForAuthUser,
  hasEnoughFriendlyTokens,
  updateAuthenticatedProfile,
} from "./persistence";
import { AuthUserSummary, Mode, S2CMessage, StakeMode } from "../../shared/types";
import {
  createWsTicket,
  isSupabaseAuthConfigured,
  verifySupabaseAccessToken,
  verifyWsTicket,
} from "./auth";
import { createRateLimiter, RateLimiter } from "./rate-limit";

// ---- Rate Limiters ----
const wsTicketLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });
const rescueLimiter = createRateLimiter({ windowMs: 3_600_000, maxRequests: 3 });
const defaultApiLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

const port = Number(process.env.PORT || 8080);
let wss: WebSocketServer | null = null;
let router: RoomRouter;
let reconnectMgr: ReconnectManager;
let lobby: Lobby;

// Track which room each connection belongs to
const connToRoom = new WeakMap<WebSocket, { conn: Conn; roomId: string }>();
const preRoomHandlers = new WeakMap<WebSocket, (raw: Buffer | string) => void>();

// ---- HTTP Server ----
const httpServer = http.createServer((req, res) => {
  const origin = process.env.NODE_ENV === "production"
    ? "https://rocambor.app"
    : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        rooms: router?.roomCount || 0,
      })
    );
    return;
  }

  // REST API for room management
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // ---- Rate limiting ----
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const limiter: RateLimiter =
    url.pathname === "/api/auth/ws-ticket"
      ? wsTicketLimiter
      : url.pathname === "/api/me/tokens/rescue"
        ? rescueLimiter
        : defaultApiLimiter;

  if (!limiter.check(clientIp)) {
    const retryAfter = limiter.retryAfterSecs(clientIp);
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    });
    res.end(JSON.stringify({ error: "Too many requests" }));
    return;
  }

  if (url.pathname === "/api/auth/ws-ticket" && req.method === "POST") {
    void handleWsTicketRequest(req, res);
    return;
  }

  if (url.pathname === "/api/me" && req.method === "GET") {
    void (async () => {
      const user = await authenticateApiRequest(req, res);
      if (!user) return;
      const me = await getOrCreateAuthenticatedProfile(user);
      if (!me) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Profile persistence is unavailable" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(me));
    })();
    return;
  }

  if (url.pathname === "/api/me/profile" && req.method === "PATCH") {
    void (async () => {
      const user = await authenticateApiRequest(req, res);
      if (!user) return;

      try {
        const rawBody = await readRequestBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const updated = await updateAuthenticatedProfile(user, body);
        if (!updated) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Profile persistence is unavailable" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(updated));
      } catch (error) {
        if (error instanceof SyntaxError) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
        const message = error instanceof Error ? error.message : "";
        if (message === "BODY_TOO_LARGE") {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request body too large" }));
          return;
        }
        console.error("[api] me/profile error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to update profile" }));
      }
    })();
    return;
  }

  if (url.pathname === "/api/me/wallet" && req.method === "GET") {
    void (async () => {
      const user = await authenticateApiRequest(req, res);
      if (!user) return;
      const wallet = await getWalletForAuthUser(user);
      if (!wallet) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Wallet persistence is unavailable" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(wallet));
    })();
    return;
  }

  if (url.pathname === "/api/me/matches" && req.method === "GET") {
    void (async () => {
      const user = await authenticateApiRequest(req, res);
      if (!user) return;
      const history = await getMatchHistoryForAuthUser(user);
      if (!history) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Match history persistence is unavailable" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(history));
    })();
    return;
  }

  if (url.pathname === "/api/me/tokens/rescue" && req.method === "POST") {
    void (async () => {
      const user = await authenticateApiRequest(req, res);
      if (!user) return;
      const result = await claimFriendlyRescue(user);
      if (!result.ok) {
        if (result.code === "NOT_ELIGIBLE") {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Rescue tokens are not available yet. Your balance must be below the threshold and the cooldown must be over.",
            })
          );
          return;
        }
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Wallet persistence is unavailable" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.wallet));
    })();
    return;
  }

  // GET /api/rooms - list active rooms
  if (url.pathname === "/api/rooms" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rooms: router.listActiveRooms() }));
    return;
  }

  // GET /api/rooms/:code - check if room exists
  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (roomMatch && req.method === "GET") {
    const room = router.getByCode(roomMatch[1]);
    if (room) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: room.id,
          code: room.code,
          mode: room.state.mode,
          players: room.humanCount(),
          phase: room.state.phase,
        })
      );
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Room not found" }));
    }
    return;
  }

  // GET /api/queue/:mode - queue status
  const queueMatch = url.pathname.match(/^\/api\/queue\/(tresillo|quadrille)$/);
  if (queueMatch && req.method === "GET") {
    const mode = queueMatch[1] as Mode;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ mode, size: lobby.getQueueSize(mode) }));
    return;
  }

  // GET /api/leaderboard?limit=25
  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    const limitRaw = Number(url.searchParams.get("limit") || "25");
    getLeaderboard(limitRaw)
      .then((leaderboard) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            leaderboard,
            count: leaderboard.length,
            generatedAt: new Date().toISOString(),
          })
        );
      })
      .catch((error) => {
        console.error("[api] leaderboard error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to load leaderboard" }));
      });
    return;
  }

  // GET /api/players/:playerId/stats
  const playerStatsMatch = url.pathname.match(
    /^\/api\/players\/([0-9a-fA-F-]{36})\/stats$/
  );
  if (playerStatsMatch && req.method === "GET") {
    getPlayerStats(playerStatsMatch[1])
      .then((stats) => {
        const safeStats = stats ?? {
          gamesPlayed: 0,
          wins: 0,
          elo: 1200,
          lastPlayed: null,
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            playerId: playerStatsMatch[1],
            gamesPlayed: safeStats.gamesPlayed,
            wins: safeStats.wins,
            winRate: safeStats.gamesPlayed > 0 ? safeStats.wins / safeStats.gamesPlayed : 0,
            elo: safeStats.elo,
            lastPlayed: safeStats.lastPlayed,
            generatedAt: new Date().toISOString(),
          })
        );
      })
      .catch((error) => {
        console.error("[api] player stats error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to load player stats" }));
      });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

async function handleWsTicketRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (!isSupabaseAuthConfigured()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Supabase auth is not configured" }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const body = rawBody
      ? (JSON.parse(rawBody) as { accessToken?: unknown })
      : {};
    if (typeof body.accessToken !== "string" || !body.accessToken.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "accessToken is required" }));
      return;
    }

    const user = await verifySupabaseAccessToken(body.accessToken);
    if (!user) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid access token" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(createWsTicket(user)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BODY_TOO_LARGE") {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request body too large" }));
      return;
    }
    if (error instanceof SyntaxError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    console.error("[api] ws-ticket error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to create WebSocket ticket" }));
  }
}

async function authenticateApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (!isSupabaseAuthConfigured()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Supabase auth is not configured" }));
    return null;
  }

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing bearer token" }));
    return null;
  }

  try {
    const user = await verifySupabaseAccessToken(match[1]);
    if (!user) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid access token" }));
      return null;
    }
    return user;
  } catch (error) {
    console.error("[api] auth verification error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Authentication failed" }));
    return null;
  }
}

async function ensureStakeEntryAllowed(
  ws: WebSocket,
  stakeMode: StakeMode,
  authUser: AuthUserSummary | null
): Promise<boolean> {
  if (stakeMode !== "tokens") return true;
  if (!authUser) {
    wsSend(ws, {
      type: "ERROR",
      code: "AUTH_REQUIRED",
      message: "Sign in to create or join friendly-stakes tables.",
    });
    return false;
  }
  const canAfford = await hasEnoughFriendlyTokens(
    authUser.id,
    FRIENDLY_TOKEN_ANTE
  );
  if (!canAfford) {
    wsSend(ws, {
      type: "ERROR",
      code: "INSUFFICIENT_TOKENS",
      message:
        "You do not have enough friendly tokens to enter a staked table right now.",
    });
    return false;
  }
  return true;
}

// ---- Helper to send raw message ----
function wsSend(ws: WebSocket, msg: S2CMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Ignore send errors
    }
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

// ---- WebSocket Server ----
async function startServer(): Promise<void> {
  try {
    await initDB();
    initRedis();

    router = new RoomRouter();
    reconnectMgr = new ReconnectManager(getRedis());
    lobby = new Lobby(getRedis(), router);

    wss = new WebSocketServer({
      server: httpServer,
      perMessageDeflate: false,
      maxPayload: 64 * 1024,
      clientTracking: true,
    });

    console.log(`[server] Starting on port ${port}`);
    console.log(`[server] Environment: ${process.env.NODE_ENV || "development"}`);

    wss.on("connection", (ws, req) => {
      const clientIp =
        req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      console.log(`[connection] New client from ${clientIp}`);

      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );
      const resumeId = url.searchParams.get("resume") || undefined;
      const ticket = url.searchParams.get("ticket") || undefined;
      const requestedPlayerId = url.searchParams.get("playerId") || undefined;
      const ticketIdentity = ticket ? verifyWsTicket(ticket) : null;
      if (ticket && !ticketIdentity) {
        ws.close(4401, "Invalid auth ticket");
        return;
      }
      const playerId =
        ticketIdentity?.user.id ||
        (requestedPlayerId && isUuid(requestedPlayerId)
          ? requestedPlayerId
          : randomUUID());

      // Try reconnection first
      if (resumeId) {
        reconnectMgr
          .tryResume(resumeId)
          .then((reservation) => {
            if (reservation) {
              if (
                ticketIdentity?.user.id &&
                reservation.playerId &&
                reservation.playerId !== ticketIdentity.user.id
              ) {
                handleNewConnection(
                  ws,
                  undefined,
                  ticketIdentity.user.id,
                  ticketIdentity.user
                );
                return;
              }
              const room = router.getById(reservation.roomId);
              if (room) {
                const conn = room.tryReconnect(
                  resumeId,
                  ws,
                  reservation.seat,
                  reservation.playerId ?? playerId,
                  ticketIdentity?.user.id ?? null
                );
                if (conn) {
                  // Consume the reservation only after a successful reconnect
                  reconnectMgr.clearReservation(resumeId).catch((err) => console.error("[connection] clearReservation failed:", err));
                  connToRoom.set(ws, { conn, roomId: reservation.roomId });
                  setupWsHandlers(ws, conn, room.id);
                  console.log(
                    `[connection] Resumed ${resumeId} -> room ${room.id} seat ${reservation.seat}`
                  );
                  return;
                }
              }
            }
            // Resume failed, treat as new connection
            handleNewConnection(
              ws,
              resumeId,
              playerId,
              ticketIdentity?.user ?? null
            );
          })
          .catch(() => {
            handleNewConnection(
              ws,
              resumeId,
              playerId,
              ticketIdentity?.user ?? null
            );
          });
      } else {
        handleNewConnection(
          ws,
          undefined,
          playerId,
          ticketIdentity?.user ?? null
        );
      }
    });

    wss.on("error", (error) => {
      console.error("[wss] Server error:", error);
    });

    httpServer.listen(port, () => {
      console.log(`[server] HTTP server listening on port ${port}`);
    });

    // Health check logging
    setInterval(() => {
      const clientCount = wss ? wss.clients.size : 0;
      console.log(
        `[health] Active connections: ${clientCount}, Rooms: ${router.roomCount}`
      );
    }, 60_000);
  } catch (error) {
    console.error("[startup] Failed to start server:", error);
    process.exit(1);
  }
}

function attachPreRoomMessageHandler(
  ws: WebSocket,
  id: string,
  playerId: string,
  authUser: AuthUserSummary | null
): (raw: Buffer | string) => void {
  const onMessage = (raw: Buffer | string) => {
    try {
      const data = JSON.parse(String(raw));
      const parsed = C2SMessageSchema.safeParse(data);

      if (!parsed.success) {
        wsSend(ws, {
          type: "ERROR",
          code: "INVALID_MESSAGE",
          message: "Invalid message format",
        });
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case "QUICK_PLAY": {
          void (async () => {
            const stakeMode = msg.stakeMode || "free";
            if (!(await ensureStakeEntryAllowed(ws, stakeMode, authUser))) {
              return;
            }

            const result = await lobby.joinQueue(
              id,
              playerId,
              authUser?.id ?? null,
              ws,
              msg.mode,
              stakeMode
            );
            if (result.status === "matched") {
              const room = result.room;
              for (const participant of result.participants) {
                const preHandler = preRoomHandlers.get(participant.ws);
                if (preHandler) {
                  participant.ws.removeListener("message", preHandler);
                  preRoomHandlers.delete(participant.ws);
                }
                const conn = room.conns.find((c) => c.id === participant.clientId);
                if (!conn) continue;
                connToRoom.set(participant.ws, { conn, roomId: room.id });
                setupWsHandlers(participant.ws, conn, room.id);
                wsSend(participant.ws, {
                  type: "ROOM_JOINED",
                  roomId: room.id,
                  code: room.code,
                  seat: conn.seat,
                });
              }
            } else if (result.status === "queued") {
              wsSend(ws, {
                type: "QUEUE_UPDATE",
                position: result.position,
                mode: msg.mode,
              });
            } else {
              wsSend(ws, {
                type: "ERROR",
                code: result.code,
                message: result.message,
              });
            }
          })().catch((error) => {
            console.error("[queue] quick play failed:", error);
            wsSend(ws, {
              type: "ERROR",
              code: "QUEUE_FAILED",
              message: "Unable to enter quick play right now.",
            });
          });
          return;
        }

        case "CREATE_ROOM": {
          const stakeMode = msg.stakeMode || "free";
          void (async () => {
            if (!(await ensureStakeEntryAllowed(ws, stakeMode, authUser))) {
              return;
            }
          const { roomId, code, room } = router.createRoom(
            msg.mode,
            id,
            stakeMode,
            msg.target,
            msg.rules,
            msg.roomName
          );
          const conn = room.attach(ws, id, playerId, authUser?.id ?? null);

          // Auto-seat creator at seat 0
          room.assignSeat(conn, room.allSeats()[0]);

          ws.removeListener("message", onMessage);
          preRoomHandlers.delete(ws);
          connToRoom.set(ws, { conn, roomId });
          setupWsHandlers(ws, conn, roomId);

          wsSend(ws, {
            type: "ROOM_JOINED",
            roomId,
            code,
            seat: conn.seat,
          });
          room.broadcastState();
          })().catch((error) => {
            console.error("[room] create room failed:", error);
            wsSend(ws, {
              type: "ERROR",
              code: "CREATE_ROOM_FAILED",
              message: "Unable to create room right now.",
            });
          });
          return;
        }

        case "JOIN_ROOM": {
          const room = router.getByCode(msg.code);
          if (!room) {
            wsSend(ws, {
              type: "ERROR",
              code: "ROOM_NOT_FOUND",
              message: "No room with that code",
            });
            return;
          }

          void (async () => {
            if (
              !(await ensureStakeEntryAllowed(
                ws,
                room.state.stakes.stakeMode,
                authUser
              ))
            ) {
              return;
            }

          const conn = room.attach(ws, id, playerId, authUser?.id ?? null);

          if (room.state.phase === "lobby") {
            const seats = room.allSeats();
            const occupied = new Set(
              room.conns
                .filter((c) => c !== conn && c.seat !== null && !c.isBot)
                .map((c) => c.seat!)
            );
            const botSeat = room.conns.find(
              (c) => c.isBot && c.seat !== null && seats.includes(c.seat)
            );

            if (botSeat) {
              const seat = botSeat.seat!;
              room.conns = room.conns.filter((c) => c !== botSeat);
              room.assignSeat(conn, seat);
            } else {
              const free = seats.find((s) => !occupied.has(s));
              if (free !== undefined) {
                room.assignSeat(conn, free);
              }
            }
          }

          ws.removeListener("message", onMessage);
          preRoomHandlers.delete(ws);
          connToRoom.set(ws, { conn, roomId: room.id });
          setupWsHandlers(ws, conn, room.id);

          wsSend(ws, {
            type: "ROOM_JOINED",
            roomId: room.id,
            code: room.code,
            seat: conn.seat,
          });
          room.broadcastState();
          })().catch((error) => {
            console.error("[room] join room failed:", error);
            wsSend(ws, {
              type: "ERROR",
              code: "JOIN_ROOM_FAILED",
              message: "Unable to join room right now.",
            });
          });
          return;
        }

        case "SPECTATE": {
          const room = router.getById(msg.roomId);
          if (!room) {
            wsSend(ws, {
              type: "ERROR",
              code: "ROOM_NOT_FOUND",
              message: "Room not found",
            });
            return;
          }
          const conn = room.addSpectator(ws);
          ws.removeListener("message", onMessage);
          preRoomHandlers.delete(ws);
          connToRoom.set(ws, { conn, roomId: room.id });
          setupWsHandlers(ws, conn, room.id);
          return;
        }

        case "LEAVE_QUEUE": {
          lobby.leaveQueue(id);
          return;
        }

        case "PING": {
          wsSend(ws, { type: "PONG" });
          return;
        }

        default: {
          wsSend(ws, {
            type: "ERROR",
            code: "NOT_IN_ROOM",
            message: "Join or create a room first",
          });
        }
      }
    } catch (error) {
      console.error("[message] Parse error:", error);
      wsSend(ws, {
        type: "ERROR",
        code: "INVALID_JSON",
        message: "Failed to parse message",
      });
    }
  };

  preRoomHandlers.set(ws, onMessage);
  ws.on("message", onMessage);
  return onMessage;
}

function handleNewConnection(
  ws: WebSocket,
  clientId?: string,
  playerId?: string,
  authUser?: AuthUserSummary | null
): void {
  const id = clientId || randomUUID();
  const resolvedPlayerId = playerId || randomUUID();

  // Send welcome (not attached to any room yet)
  wsSend(ws, { type: "WELCOME", clientId: id, playerId: resolvedPlayerId });

  attachPreRoomMessageHandler(ws, id, resolvedPlayerId, authUser || null);

  // Keep-alive ping with pong timeout to detect TCP half-open connections
  let pongTimeout: NodeJS.Timeout | null = null;
  const pingInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(pingInterval);
      return;
    }
    ws.ping();
    pongTimeout = setTimeout(() => {
      ws.terminate();
    }, 10_000);
  }, 30_000);
  ws.on("pong", () => {
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    if (pongTimeout) clearTimeout(pongTimeout);
    lobby.leaveQueue(id);
  });
  ws.on("error", () => {
    clearInterval(pingInterval);
    if (pongTimeout) clearTimeout(pongTimeout);
  });
}

function setupWsHandlers(
  ws: WebSocket,
  conn: Conn,
  roomId: string
): void {
  const cleanup = () => {
    const room = router.getById(roomId);
    if (room && conn.seat !== null) {
      // Reserve seat for reconnection
      reconnectMgr
        .reserveSeat(conn.id, roomId, conn.seat, conn.playerId)
        .catch(() => {});
      // Mark as disconnected but don't remove
      room.markDisconnected(conn);
      console.log(
        `[connection] Client ${conn.id} disconnected from room ${roomId} seat ${conn.seat}`
      );
    } else if (room) {
      room.detach(conn);
    }
  };

  const onClose = (code: number, reason: Buffer) => {
    console.log(`[connection] WebSocket closed: ${code} ${reason}`);
    cleanup();
  };

  const onError = (error: Error) => {
    console.error("[ws] Connection error:", error);
    cleanup();
  };

  const onMessage = (raw: Buffer | string) => {
    try {
      const data = JSON.parse(String(raw));
      const parsed = C2SMessageSchema.safeParse(data);

      if (!parsed.success) {
        wsSend(ws, {
          type: "ERROR",
          code: "INVALID_MESSAGE",
          message: "Invalid message format",
        });
        return;
      }

      const room = router.getById(roomId);
      if (!room) {
        wsSend(ws, {
          type: "ERROR",
          code: "ROOM_GONE",
          message: "Room no longer exists",
        });
        return;
      }

      room.handle(conn, parsed.data);

      // If the client left the room, detach the message handler
      if (parsed.data.type === "LEAVE_ROOM") {
        ws.removeListener("message", onMessage);
        ws.removeListener("close", onClose);
        ws.removeListener("error", onError);
        connToRoom.delete(ws);
        const resolvedPlayerId = conn.playerId && isUuid(conn.playerId)
          ? conn.playerId
          : randomUUID();
        attachPreRoomMessageHandler(
          ws,
          conn.id,
          resolvedPlayerId,
          conn.authUserId
            ? { id: conn.authUserId, email: null }
            : null
        );
      }
    } catch (error) {
      console.error("[message] Parse error:", error);
      wsSend(ws, {
        type: "ERROR",
        code: "INVALID_JSON",
        message: "Failed to parse message",
      });
    }
  };

  ws.on("message", onMessage);
  ws.on("close", onClose);
  ws.on("error", onError);
}

// ---- Graceful shutdown ----
async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] ${signal} received, closing server gracefully...`);

  if (wss) {
    wss.clients.forEach((ws) => {
      ws.close(1001, "Server shutting down");
    });
    wss.close(() => {
      console.log("[shutdown] WebSocket server closed");
    });
  }

  if (httpServer) {
    httpServer.close(async () => {
      console.log("[shutdown] HTTP server closed");
      try {
        router?.destroy();
        reconnectMgr?.destroy();
        wsTicketLimiter.destroy();
        rescueLimiter.destroy();
        defaultApiLimiter.destroy();
        await closeDB();
        await closeRedis();
        console.log("[shutdown] Cleanup completed");
        process.exit(0);
      } catch (error) {
        console.error("[shutdown] Cleanup error:", error);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error("[shutdown] Force exit after timeout");
      process.exit(1);
    }, 10_000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  console.error("[fatal] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[fatal] Unhandled rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});

startServer().catch((error) => {
  console.error("[startup] Server startup failed:", error);
  process.exit(1);
});
