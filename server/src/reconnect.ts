import { SeatIndex } from "../../shared/types";
import { MaybeRedis } from "./redis";

export interface SeatReservation {
  roomId: string;
  seat: SeatIndex;
  clientId: string;
  playerId: string | null;
  expiresAt: number;
}

const RESERVATION_TTL_MS = 120_000; // 2 minutes

export class ReconnectManager {
  private fallback = new Map<string, SeatReservation>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private redis: MaybeRedis) {
    // Periodically clean expired in-memory reservations
    this.cleanupTimer = setInterval(() => this.cleanExpired(), 30_000);
  }

  async reserveSeat(
    clientId: string,
    roomId: string,
    seat: SeatIndex,
    playerId: string | null
  ): Promise<void> {
    const reservation: SeatReservation = {
      roomId,
      seat,
      clientId,
      playerId,
      expiresAt: Date.now() + RESERVATION_TTL_MS,
    };

    if (this.redis) {
      try {
        const key = `reconnect:${clientId}`;
        await this.redis.set(
          key,
          JSON.stringify(reservation),
          "PX",
          RESERVATION_TTL_MS
        );
        return;
      } catch (e) {
        console.error("[reconnect] Redis set failed, using fallback:", e);
      }
    }

    this.fallback.set(clientId, reservation);
  }

  async tryResume(clientId: string): Promise<SeatReservation | null> {
    if (this.redis) {
      try {
        const key = `reconnect:${clientId}`;
        const raw = await this.redis.get(key);
        if (!raw) return null;
        await this.redis.del(key);
        const reservation = JSON.parse(raw) as SeatReservation;
        if (reservation.expiresAt < Date.now()) return null;
        return reservation;
      } catch (e) {
        console.error("[reconnect] Redis get failed, trying fallback:", e);
      }
    }

    const reservation = this.fallback.get(clientId);
    if (!reservation) return null;
    this.fallback.delete(clientId);
    if (reservation.expiresAt < Date.now()) return null;
    return reservation;
  }

  async clearReservation(clientId: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(`reconnect:${clientId}`);
      } catch {
        // Ignore
      }
    }
    this.fallback.delete(clientId);
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, res] of this.fallback) {
      if (res.expiresAt < now) {
        this.fallback.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.fallback.clear();
  }
}
