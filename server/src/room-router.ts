import { Room } from "./room";
import { Mode } from "../../shared/types";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class RoomRouter {
  private rooms = new Map<string, Room>();
  private codeToId = new Map<string, string>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up stale rooms every 60 seconds
    this.cleanupTimer = setInterval(() => this.cleanStaleRooms(), 60_000);
  }

  createRoom(
    mode: Mode,
    creatorClientId: string,
    gameTarget?: number
  ): { roomId: string; code: string; room: Room } {
    const roomId = generateId();
    let code = generateCode();
    // Ensure unique code
    while (this.codeToId.has(code)) {
      code = generateCode();
    }

    const room = new Room(roomId, {
      mode,
      code,
      gameTarget: gameTarget || 12,
      creatorId: creatorClientId,
    });

    this.rooms.set(roomId, room);
    this.codeToId.set(code, roomId);

    console.log(`[router] Room created: ${roomId} (code: ${code}, mode: ${mode})`);
    return { roomId, code, room };
  }

  getByCode(code: string): Room | undefined {
    const id = this.codeToId.get(code.toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  getById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  removeRoom(id: string): void {
    const room = this.rooms.get(id);
    if (!room) return;

    room.cleanup();
    this.codeToId.delete(room.code);
    this.rooms.delete(id);
    console.log(`[router] Room removed: ${id}`);
  }

  listActiveRooms(): Array<{
    id: string;
    code: string;
    mode: Mode;
    players: number;
    phase: string;
  }> {
    const result: Array<{
      id: string;
      code: string;
      mode: Mode;
      players: number;
      phase: string;
    }> = [];
    for (const [id, room] of this.rooms) {
      result.push({
        id,
        code: room.code,
        mode: room.state.mode,
        players: room.humanCount(),
        phase: room.state.phase,
      });
    }
    return result;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private cleanStaleRooms(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      // Purge disconnected players past their reconnect TTL
      room.cleanDisconnected();
      // Remove rooms that have been empty (no humans) for > 2 minutes
      if (room.humanCount() === 0 && now - room.lastActivity > 120_000) {
        this.removeRoom(id);
      }
      // Remove rooms that have been in match_end for > 5 minutes
      if (room.state.phase === "match_end" && now - room.lastActivity > 300_000) {
        this.removeRoom(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [id] of this.rooms) {
      this.removeRoom(id);
    }
  }
}
