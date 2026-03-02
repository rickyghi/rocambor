import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReconnectManager } from "../src/reconnect";
import { SeatIndex } from "../../shared/types";

describe("ReconnectManager (in-memory fallback)", () => {
  let mgr: ReconnectManager;

  beforeEach(() => {
    mgr = new ReconnectManager(null); // No Redis
  });

  it("reserves and resumes a seat", async () => {
    await mgr.reserveSeat("client-1", "room-A", 2 as SeatIndex, null);
    const res = await mgr.tryResume("client-1");
    expect(res).not.toBeNull();
    expect(res!.roomId).toBe("room-A");
    expect(res!.seat).toBe(2);
    expect(res!.clientId).toBe("client-1");
  });

  it("resume consumes the reservation (single use)", async () => {
    await mgr.reserveSeat("client-1", "room-A", 0 as SeatIndex, null);
    const first = await mgr.tryResume("client-1");
    expect(first).not.toBeNull();
    const second = await mgr.tryResume("client-1");
    expect(second).toBeNull();
  });

  it("returns null for unknown clientId", async () => {
    const res = await mgr.tryResume("nonexistent");
    expect(res).toBeNull();
  });

  it("expired reservation returns null", async () => {
    // Manually create an expired reservation by setting expiresAt in the past
    await mgr.reserveSeat("client-1", "room-A", 1 as SeatIndex, "player-uuid");

    // Access internal fallback map to expire it
    const fallbackMap = (mgr as any).fallback as Map<string, any>;
    const res = fallbackMap.get("client-1");
    if (res) {
      res.expiresAt = Date.now() - 1000; // Already expired
    }

    const result = await mgr.tryResume("client-1");
    expect(result).toBeNull();
  });

  it("clearReservation removes the entry", async () => {
    await mgr.reserveSeat("client-1", "room-A", 0 as SeatIndex, null);
    await mgr.clearReservation("client-1");
    const res = await mgr.tryResume("client-1");
    expect(res).toBeNull();
  });

  it("preserves playerId in reservation", async () => {
    await mgr.reserveSeat("c1", "r1", 3 as SeatIndex, "uuid-abc");
    const res = await mgr.tryResume("c1");
    expect(res!.playerId).toBe("uuid-abc");
  });

  it("destroy clears all state", async () => {
    await mgr.reserveSeat("c1", "r1", 0 as SeatIndex, null);
    await mgr.reserveSeat("c2", "r2", 1 as SeatIndex, null);
    mgr.destroy();
    const r1 = await mgr.tryResume("c1");
    const r2 = await mgr.tryResume("c2");
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });
});
