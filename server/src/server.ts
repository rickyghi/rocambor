import "dotenv/config";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { initDB, closeDB } from "./db";
import { initRedis, closeRedis, getRedis } from "./redis";
import { RoomRouter } from "./room-router";
import { ReconnectManager } from "./reconnect";
import { Lobby } from "./lobby";
import { C2SMessageSchema } from "./protocol";
import { Conn } from "./room";
import { Mode, SeatIndex, S2CMessage } from "../../shared/types";

const port = Number(process.env.PORT || 8080);
let wss: WebSocketServer | null = null;
let router: RoomRouter;
let reconnectMgr: ReconnectManager;
let lobby: Lobby;

// Track which room each connection belongs to
const connToRoom = new WeakMap<WebSocket, { conn: Conn; roomId: string }>();

// ---- HTTP Server ----
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
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

      // Try reconnection first
      if (resumeId) {
        reconnectMgr
          .tryResume(resumeId)
          .then((reservation) => {
            if (reservation) {
              const room = router.getById(reservation.roomId);
              if (room) {
                const conn = room.tryReconnect(
                  resumeId,
                  ws,
                  reservation.seat
                );
                if (conn) {
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
            handleNewConnection(ws, resumeId);
          })
          .catch(() => {
            handleNewConnection(ws, resumeId);
          });
      } else {
        handleNewConnection(ws);
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

function handleNewConnection(ws: WebSocket, clientId?: string): void {
  const id = clientId || Math.random().toString(36).slice(2);

  // Send welcome (not attached to any room yet)
  wsSend(ws, { type: "WELCOME", clientId: id, playerId: null });

  // Set up message handling for pre-room commands
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
          const result = lobby.joinQueue(id, ws, msg.mode);
          if (result.status === "matched") {
            // Player is now in a room
            const room = result.room;
            const conn = room.conns.find((c) => c.id === id);
            if (conn) {
              ws.removeListener("message", onMessage);
              connToRoom.set(ws, { conn, roomId: room.id });
              setupWsHandlers(ws, conn, room.id);
              wsSend(ws, {
                type: "ROOM_JOINED",
                roomId: room.id,
                code: result.code,
                seat: conn.seat,
              });
            }
          } else {
            wsSend(ws, {
              type: "QUEUE_UPDATE",
              position: result.position,
              mode: msg.mode,
            });
          }
          return;
        }

        case "CREATE_ROOM": {
          const { roomId, code, room } = router.createRoom(
            msg.mode,
            id,
            msg.target
          );
          const conn = room.attach(ws, id);

          // Auto-seat creator at seat 0
          conn.seat = room.allSeats()[0];

          ws.removeListener("message", onMessage);
          connToRoom.set(ws, { conn, roomId });
          setupWsHandlers(ws, conn, roomId);

          wsSend(ws, {
            type: "ROOM_JOINED",
            roomId,
            code,
            seat: conn.seat,
          });
          room.broadcastState();
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

          const conn = room.attach(ws, id);

          // Find first available seat (replace bot or empty)
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
            conn.seat = seat;
          } else {
            const free = seats.find((s) => !occupied.has(s));
            if (free !== undefined) {
              conn.seat = free;
            }
          }

          ws.removeListener("message", onMessage);
          connToRoom.set(ws, { conn, roomId: room.id });
          setupWsHandlers(ws, conn, room.id);

          wsSend(ws, {
            type: "ROOM_JOINED",
            roomId: room.id,
            code: room.code,
            seat: conn.seat,
          });
          room.broadcastState();
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
          connToRoom.set(ws, { conn, roomId: room.id });
          setupWsHandlers(ws, conn, room.id);
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

  ws.on("message", onMessage);

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30_000);

  ws.on("close", () => {
    clearInterval(pingInterval);
    lobby.leaveQueue(id);
  });
  ws.on("error", () => clearInterval(pingInterval));
}

function setupWsHandlers(
  ws: WebSocket,
  conn: Conn,
  roomId: string
): void {
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

  const cleanup = () => {
    const room = router.getById(roomId);
    if (room && conn.seat !== null) {
      // Reserve seat for reconnection
      reconnectMgr
        .reserveSeat(conn.id, roomId, conn.seat, conn.playerId)
        .catch(() => {});
      // Mark as disconnected but don't remove
      conn.connected = false;
      room.broadcastState();
      console.log(
        `[connection] Client ${conn.id} disconnected from room ${roomId} seat ${conn.seat}`
      );
    } else if (room) {
      room.detach(conn);
    }
  };

  ws.on("close", (code, reason) => {
    console.log(`[connection] WebSocket closed: ${code} ${reason}`);
    cleanup();
  });

  ws.on("error", (error) => {
    console.error("[ws] Connection error:", error);
    cleanup();
  });
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
