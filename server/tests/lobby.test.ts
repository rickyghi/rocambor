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
});
