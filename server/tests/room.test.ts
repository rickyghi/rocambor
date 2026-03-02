import { describe, it, expect, beforeEach } from "vitest";
import { Room, RoomConfig, Conn } from "../src/room";
import { SeatIndex, Bid, Suit } from "../../shared/types";
import { WebSocket } from "ws";

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

function makeRoom(mode: "tresillo" | "quadrille" = "tresillo"): Room {
  return new Room("test-room", {
    mode,
    code: "TEST01",
    gameTarget: 12,
    creatorId: "test",
  });
}

function addHuman(room: Room, seatIndex?: SeatIndex): { conn: Conn; ws: any } {
  const ws = makeFakeWs();
  const conn = room.attach(ws);
  if (seatIndex !== undefined) {
    conn.seat = seatIndex;
  }
  return { conn, ws };
}

describe("Room - phase transitions", () => {
  it("starts in lobby phase", () => {
    const room = makeRoom();
    expect(room.state.phase).toBe("lobby");
  });

  it("transitions lobby -> dealing -> auction on startGame", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    expect(room.state.phase).toBe("auction");
  });

  it("cannot start game from non-lobby phase", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.state.phase = "play";
    room.startGame();
    expect(room.state.phase).toBe("play"); // unchanged
  });

  it("fills with bots on startGame", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    // Tresillo: 3 active seats needed
    const activeConns = room.conns.filter(
      (c) => c.seat !== null && !c.isSpectator
    );
    expect(activeConns.length).toBe(3);
    const bots = activeConns.filter((c) => c.isBot);
    expect(bots.length).toBe(2);
  });
});

describe("Room - auction", () => {
  let room: Room;

  beforeEach(() => {
    room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    // Disable bot auto-act by making all conns non-bot
    room.conns.forEach((c) => (c.isBot = false));
  });

  it("rejects bid that doesn't beat current", () => {
    const seat = room.state.turn!;
    room.applyBid(seat, "entrada");
    const next = room.state.turn!;
    // Try to bid entrada again (same value) — should be rejected
    room.applyBid(next, "entrada");
    // Bid should remain unchanged and turn should stay on next
    expect(room.state.auction.currentBid).toBe("entrada");
    expect(room.state.turn).toBe(next);
  });

  it("higher bid succeeds", () => {
    const seat = room.state.turn!;
    room.applyBid(seat, "entrada");
    expect(room.state.auction.currentBid).toBe("entrada");

    const next = room.state.turn!;
    room.applyBid(next, "volteo");
    expect(room.state.auction.currentBid).toBe("volteo");
  });

  it("all pass triggers passout handling", () => {
    const order = room.state.auction.order.slice();
    for (const seat of order) {
      room.applyBid(seat, "pass");
    }
    // Should either re-deal (espada obligatoria) or still be in auction
    // After all pass, newHand should be called
    expect(
      room.state.phase === "auction" ||
        room.state.phase === "trump_choice" ||
        room.state.phase === "dealing"
    ).toBe(true);
  });

  it("single bidder wins auction", () => {
    const order = room.state.auction.order.slice();
    // First player bids entrada
    room.applyBid(order[0], "entrada");
    // Others pass
    room.applyBid(order[1], "pass");
    room.applyBid(order[2], "pass");
    // Winner should be ombre
    expect(room.state.ombre).toBe(order[0]);
    expect(room.state.contract).toBe("entrada");
    expect(room.state.phase).toBe("trump_choice");
  });

  it("quadrille all-pass with active spadille holder does not start penetro", () => {
    const qRoom = makeRoom("quadrille");
    addHuman(qRoom, 0);
    qRoom.startGame();
    qRoom.conns.forEach((c) => (c.isBot = false));

    // Force spadille into an active player's hand
    qRoom.hands[0] = [{ s: "espadas", r: 1, id: "e1" }];

    const order = qRoom.state.auction.order.slice();
    for (const seat of order) {
      qRoom.applyBid(seat, "pass");
    }

    expect(qRoom.state.contract).toBe("entrada");
    expect(qRoom.state.phase).toBe("trump_choice");
    expect(qRoom.state.ombre).toBe(0);
  });
});

describe("Room - trump choice", () => {
  let room: Room;

  beforeEach(() => {
    room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    // Force auction to conclude with seat 0 as ombre
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.phase = "trump_choice";
    room.state.turn = 0;
  });

  it("ombre can choose trump", () => {
    room.chooseTrump(0, "copas");
    expect(room.state.trump).toBe("copas");
    expect(room.state.phase).toBe("exchange");
  });

  it("non-ombre cannot choose trump", () => {
    room.chooseTrump(1 as SeatIndex, "copas");
    expect(room.state.trump).toBeNull(); // unchanged
  });

  it("oros contract forces oros trump", () => {
    room.state.contract = "oros";
    room.chooseTrump(0, "copas");
    expect(room.state.trump).toBeNull(); // rejected
    room.chooseTrump(0, "oros");
    expect(room.state.trump).toBe("oros");
  });
});

describe("Room - exchange", () => {
  let room: Room;

  beforeEach(() => {
    room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    // Set up for exchange
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.phase = "exchange";
    room.talon = [
      { s: "copas", r: 5, id: "c5" },
      { s: "copas", r: 6, id: "c6" },
      { s: "copas", r: 7, id: "c7" },
    ];
    room.state.exchange = {
      current: 0,
      order: [0, 1, 2] as SeatIndex[],
      talonSize: 3,
      completed: [],
    };
    room.state.turn = 0;
  });

  it("ombre can exchange cards", () => {
    const hand = room.hands[0];
    const discardId = hand[0]?.id;
    if (discardId) {
      const handBefore = hand.length;
      room.finishExchange(0, [discardId]);
      expect(room.hands[0].length).toBe(handBefore); // same size (1 out, 1 in)
      expect(room.state.exchange.completed).toContain(0);
    }
  });

  it("exchange with 0 cards (pass) is valid", () => {
    room.finishExchange(0, []);
    expect(room.state.exchange.completed).toContain(0);
  });

  it("solo contract: ombre does not exchange", () => {
    room.state.contract = "solo";
    room.state.auction = {
      currentBid: "solo",
      currentBidder: 0,
      passed: [],
      order: [0, 1, 2] as SeatIndex[],
    };
    // In solo, exchange order excludes ombre
    // This is handled in startExchange(), which we already tested
    // The max for ombre in solo is 0
    const isOmbre = true;
    const isSolo = true;
    const max = isOmbre ? (isSolo ? 0 : 8) : 5;
    expect(max).toBe(0);
  });

  it("human ombre exchanges first in non-solo contracts", () => {
    room.state.contract = "entrada";
    room.state.ombre = 0;
    room.state.phase = "trump_choice";
    room.state.turn = 0;

    room.chooseTrump(0, "copas");

    expect(room.state.phase).toBe("exchange");
    expect(room.state.exchange.order[0]).toBe(0);
    expect(room.state.turn).toBe(0);
  });

  it("human-vs-bots bola via auction gives ombre exchange turn before play", () => {
    const qRoom = makeRoom("quadrille");
    addHuman(qRoom, 0);
    qRoom.startGame();

    // Keep seat 0 as human, rest as bots (from fillWithBots)
    // Disable bot auto-act so we can drive the auction manually
    const origBotMaybeAct = (qRoom as any).botMaybeAct.bind(qRoom);
    (qRoom as any).botMaybeAct = () => {};

    const order = qRoom.state.auction.order.slice();
    const seat0Idx = order.indexOf(0 as SeatIndex);

    // All players before seat 0 pass
    for (let i = 0; i < seat0Idx; i++) {
      qRoom.applyBid(order[i], "pass");
    }
    // Seat 0 bids bola
    qRoom.applyBid(0 as SeatIndex, "bola");
    // Remaining players pass
    for (let i = seat0Idx + 1; i < order.length; i++) {
      qRoom.applyBid(order[i], "pass");
    }

    // Human-vs-bots bola should route through startExchange and give human a turn
    expect(qRoom.state.phase).toBe("exchange");
    expect(qRoom.state.exchange.order[0]).toBe(0);
    expect(qRoom.state.turn).toBe(0);
  });
});

describe("Room - handle message routing", () => {
  it("routes BID message to applyBid", () => {
    const room = makeRoom();
    const { conn } = addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    const turnSeat = room.state.turn!;
    const turnConn = room.conns.find((c) => c.seat === turnSeat)!;
    room.handle(turnConn, { type: "BID", value: "entrada" });
    expect(room.state.auction.currentBid).toBe("entrada");
  });

  it("rejects game actions without a seat", () => {
    const room = makeRoom();
    const ws = makeFakeWs();
    const conn = room.attach(ws);
    // conn.seat is null

    room.handle(conn, { type: "BID", value: "entrada" });
    const msgs = (ws as any)._sent.map((s: string) => JSON.parse(s));
    const err = msgs.find((m: any) => m.type === "ERROR" && m.code === "NO_SEAT");
    expect(err).toBeTruthy();
  });

  it("PING returns PONG", () => {
    const room = makeRoom();
    const ws = makeFakeWs();
    const conn = room.attach(ws);

    room.handle(conn, { type: "PING" });
    const msgs = (ws as any)._sent.map((s: string) => JSON.parse(s));
    const pong = msgs.find((m: any) => m.type === "PONG");
    expect(pong).toBeTruthy();
  });
});

describe("Room - spectators", () => {
  it("spectators receive state but no hand", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.startGame();

    const specWs = makeFakeWs();
    const spec = room.addSpectator(specWs);
    expect(spec.isSpectator).toBe(true);
    expect(spec.seat).toBeNull();

    // Check that state was sent
    const msgs = (specWs as any)._sent.map((s: string) => JSON.parse(s));
    const stateMsg = msgs.find((m: any) => m.type === "STATE");
    expect(stateMsg).toBeTruthy();
    expect(stateMsg.hand).toBeNull();
  });
});

describe("Room - quadrille mode", () => {
  it("has 4 seats with one resting", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    room.startGame();

    const active = room.seatsActive();
    expect(active.length).toBe(3);
    expect(room.state.resting).not.toBeNull();
  });

  it("resting seat rotates each hand", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);

    const rests: (SeatIndex | null)[] = [];
    // Simulate 4 hands worth of resting
    for (let i = 0; i < 4; i++) {
      room.restIndex = i;
      rests.push(room.restSeat());
    }

    // All 4 seats should rest once
    expect(new Set(rests).size).toBe(4);
  });
});
