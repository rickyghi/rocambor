import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { Lobby } from "../src/lobby";
import { RoomRouter } from "../src/room-router";

function makeFakeWs(): WebSocket {
  const sent: string[] = [];
  return {
    readyState: WebSocket.OPEN,
    send: (data: string) => sent.push(data),
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    ping: () => {},
    _sent: sent,
  } as any;
}

describe("Lobby", () => {
  it("keeps a client in only one quick-play queue", async () => {
    const router = {
      createRoom: () => {
        throw new Error("createRoom should not be called in this test");
      },
    } as unknown as RoomRouter;

    const lobby = new Lobby(null, router);
    const ws = makeFakeWs();

    const q1 = await lobby.joinQueue(
      "c1",
      "00000000-0000-4000-8000-000000000001",
      null,
      ws,
      "tresillo",
      "free"
    );
    expect(q1.status).toBe("queued");
    expect(lobby.getQueueSize("tresillo")).toBe(1);

    const q2 = await lobby.joinQueue(
      "c1",
      "00000000-0000-4000-8000-000000000001",
      null,
      ws,
      "quadrille",
      "free"
    );
    expect(q2.status).toBe("queued");
    expect(lobby.getQueueSize("tresillo")).toBe(0);
    expect(lobby.getQueueSize("quadrille")).toBe(1);
  });

  it("quick play always creates rooms with espada obligatoria enabled", async () => {
    const calls: Array<{ rules?: { espadaObligatoria?: boolean } }> = [];
    const fakeRoom = {
      conns: [] as any[],
      allSeats: () => [0, 1, 2],
      attach: (
        ws: WebSocket,
        clientId: string,
        playerId: string,
        authUserId: string | null
      ) => {
        const conn = { ws, id: clientId, playerId, authUserId, seat: null };
        fakeRoom.conns.push(conn);
        return conn;
      },
      handle: (conn: any, msg: any) => {
        if (msg?.type === "TAKE_SEAT") {
          conn.seat = msg.seat;
        }
      },
      startGame: async () => true,
    };
    const router = {
      createRoom: (
        _mode: "tresillo" | "quadrille",
        _creatorId: string,
        _stakeMode?: "free" | "tokens",
        _target?: number,
        rules?: { espadaObligatoria?: boolean }
      ) => {
        calls.push({ rules });
        return {
          roomId: "r1",
          code: "ABC123",
          room: fakeRoom as any,
        };
      },
    } as unknown as RoomRouter;

    const lobby = new Lobby(null, router);
    const ws1 = makeFakeWs();
    const ws2 = makeFakeWs();
    const ws3 = makeFakeWs();

    await lobby.joinQueue(
      "c1",
      "00000000-0000-4000-8000-000000000001",
      null,
      ws1,
      "tresillo",
      "free"
    );
    await lobby.joinQueue(
      "c2",
      "00000000-0000-4000-8000-000000000002",
      null,
      ws2,
      "tresillo",
      "free"
    );
    await lobby.joinQueue(
      "c3",
      "00000000-0000-4000-8000-000000000003",
      null,
      ws3,
      "tresillo",
      "free"
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].rules).toEqual({ espadaObligatoria: true });
  });

  it("quick play seats and notifies every matched player", async () => {
    const router = new RoomRouter();
    const lobby = new Lobby(null, router);
    const ws1 = makeFakeWs() as any;
    const ws2 = makeFakeWs() as any;
    const ws3 = makeFakeWs() as any;

    await lobby.joinQueue(
      "c1",
      "00000000-0000-4000-8000-000000000001",
      null,
      ws1,
      "tresillo",
      "free"
    );
    await lobby.joinQueue(
      "c2",
      "00000000-0000-4000-8000-000000000002",
      null,
      ws2,
      "tresillo",
      "free"
    );
    const match = await lobby.joinQueue(
      "c3",
      "00000000-0000-4000-8000-000000000003",
      null,
      ws3,
      "tresillo",
      "free"
    );

    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.participants).toHaveLength(3);

    for (const ws of [ws1, ws2, ws3]) {
      const msgs = ws._sent.map((raw: string) => JSON.parse(raw));
      expect(msgs.some((m: any) => m.type === "ROOM_JOINED" && m.seat !== null)).toBe(true);
    }

    router.destroy();
  });
});
