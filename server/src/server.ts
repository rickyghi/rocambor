import http from "http";
import { WebSocketServer } from "ws";
import { Room } from "./room";
import { initDB, closeDB } from "./db";
import { initRedis, closeRedis } from "./redis";
import { z } from "zod";

const port = Number(process.env.PORT || 8080);
let wss: WebSocketServer | null = null;

// Message validation schema
const Message = z.discriminatedUnion('type', [
  z.object({ type: z.literal('JOIN'), mode: z.enum(['tresillo','quadrille']) }),
  z.object({ type: z.literal('BID'), value: z.string().min(1) }),
  z.object({ type: z.literal('CHOOSE_TRUMP'), suit: z.enum(['oros','copas','espadas','bastos']) }),
  z.object({ type: z.literal('EXCHANGE'), discardIds: z.array(z.string()).optional() }),
  z.object({ type: z.literal('PLAY'), cardId: z.string().min(1) }),
  z.object({ type: z.literal('PING') })
]);

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/healthz') { 
    res.writeHead(200, { 'Content-Type': 'application/json' }); 
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() })); 
    return; 
  }
  
  res.writeHead(404, { 'Content-Type': 'text/plain' }); 
  res.end('Not Found');
});

async function startServer() {
  try {
    // Initialize database and Redis connections
    await initDB();
    await initRedis();

    const room = new Room("default");
    
    // Create WebSocket server
    wss = new WebSocketServer({ 
      server,
      perMessageDeflate: false,
      maxPayload: 64 * 1024, // 64KB max message size
      clientTracking: true
    });

    console.log(`[tresillo] Starting server on port ${port}`);
    console.log(`[tresillo] Environment: ${process.env.NODE_ENV || 'development'}`);

    // WebSocket connection handling
    wss.on("connection", (ws, req) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      console.log(`[connection] New client connected from ${clientIp}`);

      // Basic rate limiting (100 connections per IP)
      const connections = Array.from(wss!.clients).filter((client: any) => {
        return client.upgradeReq?.socket?.remoteAddress === clientIp;
      }).length;
      
      if (connections > 100) {
        ws.close(1008, "Too many connections");
        return;
      }

      const url = new URL(req.url || "/", `http://${req.headers.host || 'localhost'}`);
      const resumeId = url.searchParams.get("resume") || undefined;

      let conn: any;
      try {
        conn = room.attach(ws);
        
        // Send welcome with resumeId if provided
        if (resumeId) {
          room.send(conn, { 
            type: "WELCOME", 
            clientId: resumeId,
            roomId: room.id,
            resumed: true 
          });
        }
      } catch (error) {
        console.error("[connection] Failed to attach:", error);
        ws.close(1011, "Internal error");
        return;
      }

      // Message handling
      ws.on("message", (raw) => {
        try {
          const data = String(raw);
          const parsed = Message.safeParse(JSON.parse(data));
          
          if (!parsed.success) {
            ws.send(JSON.stringify({ 
              type: 'ERROR', 
              code: 'INVALID_MESSAGE',
              message: 'Invalid message format' 
            }));
            return;
          }
          
          room.handle(conn, parsed.data);
        } catch (error) {
          console.error("[message] Parse error:", error);
          try { 
            ws.send(JSON.stringify({ 
              type: "ERROR", 
              code: "INVALID_JSON",
              message: "Failed to parse message" 
            })); 
          } catch (sendError) {
            console.error("[message] Failed to send error response:", sendError);
          }
        }
      });

      const connectionCleanup = () => {
        try { 
          room.detach(conn); 
          console.log(`[connection] Client disconnected: ${conn.id}`);
        } 
        catch (err) { 
          console.error("[close] Detach error:", err); 
        }
      };

      ws.on("close", (code, reason) => {
        console.log(`[connection] WebSocket closed: ${code} ${reason}`);
        connectionCleanup();
      });

      ws.on("error", (error) => { 
        console.error("[ws] Connection error:", error); 
        connectionCleanup(); 
      });

      // Keep-alive ping
      const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

      ws.on("close", () => clearInterval(pingInterval));
      ws.on("error", () => clearInterval(pingInterval));
    });

    // WebSocket server error handling
    wss.on("error", (error) => {
      console.error("[wss] Server error:", error);
    });

    // Start HTTP server
    server.listen(port, () => {
      console.log(`[tresillo] HTTP server listening on port ${port}`);
    });

    // Health check logging
    setInterval(() => {
      const clientCount = wss ? wss.clients.size : 0;
      console.log(`[health] Server alive. Active connections: ${clientCount}`);
    }, 60000);

  } catch (error) {
    console.error("[startup] Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received, closing server gracefully...`);
  
  if (wss) {
    // Close all WebSocket connections
    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
    
    wss.close(() => {
      console.log("[shutdown] WebSocket server closed");
    });
  }
  
  if (server) {
    server.close(async () => {
      console.log("[shutdown] HTTP server closed");
      
      try {
        await closeDB();
        await closeRedis();
        console.log("[shutdown] Cleanup completed");
        process.exit(0);
      } catch (error) {
        console.error("[shutdown] Cleanup error:", error);
        process.exit(1);
      }
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error("[shutdown] Force exit after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Error handlers
process.on("uncaughtException", (error) => {
  console.error("[fatal] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[fatal] Unhandled rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});

// Start the server
startServer().catch((error) => {
  console.error("[startup] Server startup failed:", error);
  process.exit(1);
});