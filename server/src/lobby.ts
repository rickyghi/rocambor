import { Mode, SeatIndex, StakeMode } from "../../shared/types";
import { MaybeRedis } from "./redis";
import { RoomRouter } from "./room-router";
import { Room, Conn } from "./room";
import { WebSocket } from "ws";

interface QueueEntry {
  clientId: string;
  playerId: string;
  authUserId: string | null;
  ws: WebSocket;
  joinedAt: number;
}

interface MatchParticipant {
  ws: WebSocket;
  clientId: string;
  seat: SeatIndex | null;
}

export class Lobby {
  private queues: Record<Mode, Record<StakeMode, QueueEntry[]>> = {
    tresillo: { free: [], tokens: [] },
    quadrille: { free: [], tokens: [] },
  };

  constructor(
    private redis: MaybeRedis,
    private router: RoomRouter
  ) {}

  async joinQueue(
    clientId: string,
    playerId: string,
    authUserId: string | null,
    ws: WebSocket,
    mode: Mode,
    stakeMode: StakeMode
  ): Promise<
    | { status: "queued"; position: number }
    | { status: "matched"; roomId: string; code: string; room: Room; participants: MatchParticipant[] }
    | { status: "error"; code: string; message: string }
  > {
    // Remove if already in any queue (prevents cross-mode duplicate entries)
    this.leaveQueue(clientId);

    const queue = this.queues[mode][stakeMode];
    queue.push({ clientId, playerId, authUserId, ws, joinedAt: Date.now() });

    // Clean stale entries (disconnected WebSockets)
    this.cleanQueue(mode, stakeMode);

    const need = mode === "tresillo" ? 3 : 4;

    if (queue.length >= need) {
      const matched = queue.splice(0, need);
      const { roomId, code, room } = this.router.createRoom(
        mode,
        matched[0].clientId,
        stakeMode,
        undefined,
        { espadaObligatoria: true }
      );

      // Seat all matched players
      const seats = room.allSeats();
      const participants: MatchParticipant[] = [];
      for (let i = 0; i < matched.length; i++) {
        const entry = matched[i];
        const conn = room.attach(
          entry.ws,
          entry.clientId,
          entry.playerId,
          entry.authUserId
        );
        const seat = seats[i];
        room.handle(conn, { type: "TAKE_SEAT", seat });
        participants.push({
          ws: entry.ws,
          clientId: entry.clientId,
          seat: conn.seat,
        });
      }

      // Auto-start with bots for remaining seats
      const started = await room.startGame();
      if (!started) {
        for (const participant of matched) {
          if (participant.ws.readyState === WebSocket.OPEN) {
            participant.ws.send(
              JSON.stringify({
                type: "ERROR",
                code: "STAKE_START_FAILED",
                message:
                  stakeMode === "tokens"
                    ? "Unable to fund this staked quick-play table right now."
                    : "Unable to start quick play right now.",
              })
            );
          }
        }
        this.router.removeRoom(roomId);
        return {
          status: "error",
          code: "STAKE_START_FAILED",
          message:
            stakeMode === "tokens"
              ? "Unable to fund this staked quick-play table right now."
              : "Unable to start quick play right now.",
        };
      }

      return { status: "matched", roomId, code, room, participants };
    }

    return { status: "queued", position: queue.length };
  }

  leaveQueue(clientId: string, mode?: Mode): void {
    const modes: Mode[] = mode ? [mode] : ["tresillo", "quadrille"];
    for (const m of modes) {
      this.queues[m].free = this.queues[m].free.filter(
        (e) => e.clientId !== clientId
      );
      this.queues[m].tokens = this.queues[m].tokens.filter(
        (e) => e.clientId !== clientId
      );
    }
  }

  getQueueSize(mode: Mode): number {
    this.cleanQueue(mode, "free");
    this.cleanQueue(mode, "tokens");
    return this.queues[mode].free.length + this.queues[mode].tokens.length;
  }

  private cleanQueue(mode: Mode, stakeMode: StakeMode): void {
    const now = Date.now();
    this.queues[mode][stakeMode] = this.queues[mode][stakeMode].filter((e) => {
      // Remove entries older than 5 minutes
      if (now - e.joinedAt > 300_000) return false;
      // Remove disconnected WebSockets
      if (e.ws.readyState !== WebSocket.OPEN) return false;
      return true;
    });
  }
}
