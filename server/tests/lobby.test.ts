import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { Lobby } from "../src/lobby";
import { RoomRouter } from "../src/room-router";

function makeFakeWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    ping: () => {},
  } as any;
}

describe("Lobby", () => {
  it("keeps a client in only one quick-play queue", () => {
    const router = {
      createRoom: () => {
        throw new Error("createRoom should not be called in this test");
      },
    } as unknown as RoomRouter;

    const lobby = new Lobby(null, router);
    const ws = makeFakeWs();

    const q1 = lobby.joinQueue("c1", "00000000-0000-4000-8000-000000000001", ws, "tresillo");
    expect(q1.status).toBe("queued");
    expect(lobby.getQueueSize("tresillo")).toBe(1);

    const q2 = lobby.joinQueue("c1", "00000000-0000-4000-8000-000000000001", ws, "quadrille");
    expect(q2.status).toBe("queued");
    expect(lobby.getQueueSize("tresillo")).toBe(0);
    expect(lobby.getQueueSize("quadrille")).toBe(1);
  });

  it("quick play always creates rooms with espada obligatoria enabled", () => {
    const calls: Array<{ rules?: { espadaObligatoria?: boolean } }> = [];
    const fakeRoom = {
      conns: [] as any[],
      allSeats: () => [0, 1, 2],
      attach: (ws: WebSocket, clientId: string, playerId: string) => {
        const conn = { ws, id: clientId, playerId, seat: null };
        fakeRoom.conns.push(conn);
        return conn;
      },
      startGame: () => {},
    };
    const router = {
      createRoom: (
        _mode: "tresillo" | "quadrille",
        _creatorId: string,
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

    lobby.joinQueue("c1", "00000000-0000-4000-8000-000000000001", ws1, "tresillo");
    lobby.joinQueue("c2", "00000000-0000-4000-8000-000000000002", ws2, "tresillo");
    lobby.joinQueue("c3", "00000000-0000-4000-8000-000000000003", ws3, "tresillo");

    expect(calls).toHaveLength(1);
    expect(calls[0].rules).toEqual({ espadaObligatoria: true });
  });
});
