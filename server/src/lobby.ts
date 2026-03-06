import { Mode, SeatIndex } from "../../shared/types";
import { MaybeRedis } from "./redis";
import { RoomRouter } from "./room-router";
import { Room, Conn } from "./room";
import { WebSocket } from "ws";

interface QueueEntry {
  clientId: string;
  playerId: string;
  ws: WebSocket;
  joinedAt: number;
}

interface MatchParticipant {
  ws: WebSocket;
  clientId: string;
  seat: SeatIndex | null;
}

export class Lobby {
  private queues: Record<Mode, QueueEntry[]> = {
    tresillo: [],
    quadrille: [],
  };

  constructor(
    private redis: MaybeRedis,
    private router: RoomRouter
  ) {}

  joinQueue(
    clientId: string,
    playerId: string,
    ws: WebSocket,
    mode: Mode
  ): { status: "queued"; position: number } | { status: "matched"; roomId: string; code: string; room: Room; participants: MatchParticipant[] } {
    // Remove if already in any queue (prevents cross-mode duplicate entries)
    this.leaveQueue(clientId);

    const queue = this.queues[mode];
    queue.push({ clientId, playerId, ws, joinedAt: Date.now() });

    // Clean stale entries (disconnected WebSockets)
    this.cleanQueue(mode);

    const need = mode === "tresillo" ? 3 : 4;

    if (queue.length >= need) {
      const matched = queue.splice(0, need);
      const { roomId, code, room } = this.router.createRoom(
        mode,
        matched[0].clientId,
        undefined,
        { espadaObligatoria: true }
      );

      // Seat all matched players
      const seats = room.allSeats();
      const participants: MatchParticipant[] = [];
      for (let i = 0; i < matched.length; i++) {
        const entry = matched[i];
        const conn = room.attach(entry.ws, entry.clientId, entry.playerId);
        const seat = seats[i];
        room.handle(conn, { type: "TAKE_SEAT", seat });
        participants.push({
          ws: entry.ws,
          clientId: entry.clientId,
          seat: conn.seat,
        });
      }

      // Auto-start with bots for remaining seats
      room.startGame();

      return { status: "matched", roomId, code, room, participants };
    }

    return { status: "queued", position: queue.length };
  }

  leaveQueue(clientId: string, mode?: Mode): void {
    const modes: Mode[] = mode ? [mode] : ["tresillo", "quadrille"];
    for (const m of modes) {
      this.queues[m] = this.queues[m].filter((e) => e.clientId !== clientId);
    }
  }

  getQueueSize(mode: Mode): number {
    this.cleanQueue(mode);
    return this.queues[mode].length;
  }

  private cleanQueue(mode: Mode): void {
    const now = Date.now();
    this.queues[mode] = this.queues[mode].filter((e) => {
      // Remove entries older than 5 minutes
      if (now - e.joinedAt > 300_000) return false;
      // Remove disconnected WebSockets
      if (e.ws.readyState !== WebSocket.OPEN) return false;
      return true;
    });
  }
}
