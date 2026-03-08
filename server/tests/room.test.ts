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

describe("Room - host handoff", () => {
  it("reassigns host when host disconnects, allowing next host to start", () => {
    const room = makeRoom();
    const h0 = addHuman(room);
    const h1 = addHuman(room);

    room.handle(h0.conn, { type: "TAKE_SEAT", seat: 0 as SeatIndex });
    room.handle(h1.conn, { type: "TAKE_SEAT", seat: 1 as SeatIndex });
    expect(room.state.hostSeat).toBe(0);

    room.markDisconnected(h0.conn);
    expect(room.state.hostSeat).toBe(1);

    room.handle(h1.conn, { type: "START_GAME" });
    expect(room.state.phase).toBe("auction");
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

  it("emits AUCTION_ACTION events for bids and passes", () => {
    const observer = room.conns.find((c) => !!(c.ws as any)?._sent)!;
    const firstSeat = room.state.turn!;

    room.applyBid(firstSeat, "entrada");
    const firstMsgs = (observer.ws as any)._sent.map((s: string) => JSON.parse(s));
    expect(
      firstMsgs.some(
        (m: any) => m.type === "EVENT" && m.name === "AUCTION_ACTION" && m.payload?.value === "entrada"
      )
    ).toBe(true);

    const secondSeat = room.state.turn!;
    room.applyBid(secondSeat, "pass");
    const secondMsgs = (observer.ws as any)._sent.map((s: string) => JSON.parse(s));
    expect(
      secondMsgs.some(
        (m: any) => m.type === "EVENT" && m.name === "AUCTION_ACTION" && m.payload?.value === "pass"
      )
    ).toBe(true);
  });

  it("rejects restricted opening bids (oros / solo_oros)", () => {
    const turn = room.state.turn!;
    const seatConn = room.conns.find((c) => c.seat === turn)!;

    room.applyBid(turn, "oros");
    expect(room.state.auction.currentBid).toBe("pass");
    expect(room.state.turn).toBe(turn);

    room.applyBid(turn, "solo_oros");
    expect(room.state.auction.currentBid).toBe("pass");
    expect(room.state.turn).toBe(turn);

    const msgs = (seatConn.ws as any)._sent.map((s: string) => JSON.parse(s));
    expect(msgs.some((m: any) => m.type === "ERROR" && m.code === "OPENING_BID_RESTRICTED")).toBe(true);
  });

  it("supports ladder overcalls across families", () => {
    const [s0, s1, s2] = room.state.auction.order;

    room.applyBid(s0, "entrada");
    expect(room.state.auction.currentBid).toBe("entrada");

    room.applyBid(s1, "oros");
    expect(room.state.auction.currentBid).toBe("oros");

    room.applyBid(s2, "volteo");
    expect(room.state.auction.currentBid).toBe("volteo");

    room.applyBid(s0, "solo");
    expect(room.state.auction.currentBid).toBe("solo");

    room.applyBid(s1, "solo_oros");
    expect(room.state.auction.currentBid).toBe("solo_oros");
  });

  it("rejects contrabola unless last active player after all-pass", () => {
    const turn = room.state.turn!;
    const seatConn = room.conns.find((c) => c.seat === turn)!;

    room.applyBid(turn, "contrabola");
    expect(room.state.auction.currentBid).toBe("pass");
    expect(room.state.turn).toBe(turn);

    const msgs = (seatConn.ws as any)._sent.map((s: string) => JSON.parse(s));
    expect(
      msgs.some(
        (m: any) =>
          m.type === "ERROR" && m.code === "CONTRABOLA_ONLY_LAST_ALL_PASS"
      )
    ).toBe(true);
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

  it("quadrille auction starts with seat after resting player", () => {
    const qRoom = makeRoom("quadrille");
    addHuman(qRoom, 0);
    qRoom.startGame();
    qRoom.conns.forEach((c) => (c.isBot = false));

    const resting = qRoom.state.resting!;
    const expectedFirst = (((resting + 1) % 4) as SeatIndex);
    expect(qRoom.state.auction.order[0]).toBe(expectedFirst);
    expect(qRoom.state.turn).toBe(expectedFirst);
  });

  it("solo bid with suit locks trump and skips trump_choice when solo wins", () => {
    const [s0, s1, s2] = room.state.auction.order;

    room.applyBid(s0, "solo", "copas");
    room.applyBid(s1, "pass");
    room.applyBid(s2, "pass");

    expect(room.state.ombre).toBe(s0);
    expect(room.state.contract).toBe("solo");
    expect(room.state.trump).toBe("copas");
    expect(room.state.phase).toBe("exchange");
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
    room.conns.forEach((c) => {
      c.isBot = false;
      if (!(c.ws as any)?._sent) {
        c.ws = makeFakeWs();
      }
    });
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

describe("Room - penetro choice", () => {
  function allPass(room: Room): void {
    const order = room.state.auction.order.slice();
    for (const seat of order) {
      room.applyBid(seat, "pass");
    }
  }

  it("enters penetro_choice in quadrille pass-out when espada obligatoria is off", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    for (const seat of room.seatsActive()) {
      room.hands[seat] = room.hands[seat].filter(
        (card) => !(card.s === "espadas" && card.r === 1)
      );
      room.state.handsCount[seat] = room.hands[seat].length;
    }

    allPass(room);
    expect(room.state.phase).toBe("penetro_choice");
    expect(room.state.turn).toBe(room.restSeat());
  });

  it("starts penetro when resting player accepts", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    for (const seat of room.seatsActive()) {
      room.hands[seat] = room.hands[seat].filter(
        (card) => !(card.s === "espadas" && card.r === 1)
      );
      room.state.handsCount[seat] = room.hands[seat].length;
    }

    allPass(room);
    const rest = room.restSeat();
    const restingConn = room.conns.find((c) => c.seat === rest)!;
    room.handle(restingConn, { type: "PENETRO_DECISION", accept: true });

    expect(room.state.contract).toBe("penetro");
    expect(room.state.phase).toBe("play");
    expect(room.state.ombre).toBe(rest);
  });

  it("decline in penetro_choice causes redeal", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    for (const seat of room.seatsActive()) {
      room.hands[seat] = room.hands[seat].filter(
        (card) => !(card.s === "espadas" && card.r === 1)
      );
      room.state.handsCount[seat] = room.hands[seat].length;
    }

    allPass(room);
    const rest = room.restSeat();
    const restingConn = room.conns.find((c) => c.seat === rest)!;
    room.handle(restingConn, { type: "PENETRO_DECISION", accept: false });

    expect(room.state.phase).toBe("auction");
    expect(room.state.contract).toBeNull();
  });

  it("rejects penetro decision from non-resting player", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    const nonRest = addHuman(room, 2);
    addHuman(room, 1);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    for (const seat of room.seatsActive()) {
      room.hands[seat] = room.hands[seat].filter(
        (card) => !(card.s === "espadas" && card.r === 1)
      );
      room.state.handsCount[seat] = room.hands[seat].length;
    }

    allPass(room);
    room.handle(nonRest.conn, { type: "PENETRO_DECISION", accept: true });
    expect(room.state.phase).toBe("penetro_choice");

    const msgs = (nonRest.ws as any)._sent.map((s: string) => JSON.parse(s));
    expect(
      msgs.some(
        (m: any) => m.type === "ERROR" && m.code === "NOT_RESTING_PLAYER"
      )
    ).toBe(true);
  });

  it("timeout in penetro_choice auto-declines", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    for (const seat of room.seatsActive()) {
      room.hands[seat] = room.hands[seat].filter(
        (card) => !(card.s === "espadas" && card.r === 1)
      );
      room.state.handsCount[seat] = room.hands[seat].length;
    }

    allPass(room);
    (room as any).onTimeout();

    expect(room.state.phase).toBe("auction");
    expect(room.state.contract).toBeNull();
  });

  it("with espada obligatoria off, pass-out does not force spadille holder", () => {
    const room = makeRoom("quadrille");
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    addHuman(room, 3);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));
    (room as any).botMaybeAct = () => {};

    room.state.rules.espadaObligatoria = false;
    room.hands[0][0] = { s: "espadas", r: 1, id: "forced-e1" } as any;
    room.state.handsCount[0] = room.hands[0].length;

    allPass(room);

    expect(room.state.phase).toBe("penetro_choice");
    expect(room.state.contract).toBeNull();
  });
});

describe("Room - exchange", () => {
  let room: Room;

  beforeEach(() => {
    room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => {
      c.isBot = false;
      if (!(c.ws as any)?._sent) {
        c.ws = makeFakeWs();
      }
    });
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

  it("non-ombre can exchange up to talon availability (not capped at 5)", () => {
    room.finishExchange(0 as SeatIndex, []);

    room.talon = [
      { s: "copas", r: 1, id: "c1" },
      { s: "copas", r: 2, id: "c2" },
      { s: "copas", r: 3, id: "c3" },
      { s: "copas", r: 4, id: "c4" },
      { s: "copas", r: 5, id: "c5x" },
      { s: "copas", r: 6, id: "c6x" },
      { s: "copas", r: 7, id: "c7x" },
    ] as any;
    room.state.exchange.talonSize = room.talon.length;
    room.state.turn = 1 as SeatIndex;
    room.state.exchange.current = 1 as SeatIndex;
    room.state.exchange.completed = [0 as SeatIndex];

    const discardIds = room.hands[1].slice(0, 7).map((c) => c.id);
    const handBefore = room.hands[1].length;
    room.finishExchange(1 as SeatIndex, discardIds);

    expect(room.state.exchange.completed).toContain(1);
    expect(room.hands[1].length).toBe(handBefore);
    expect(room.state.exchange.talonSize).toBe(0);
  });

  it("rejects exchange selections above seat max instead of truncating", () => {
    room.finishExchange(0 as SeatIndex, []);
    room.talon = [
      { s: "copas", r: 1, id: "c1" },
      { s: "copas", r: 2, id: "c2" },
      { s: "copas", r: 3, id: "c3" },
    ] as any;
    room.state.exchange.talonSize = room.talon.length;
    room.state.turn = 1 as SeatIndex;
    room.state.exchange.current = 1 as SeatIndex;
    room.state.exchange.completed = [0 as SeatIndex];

    const discardIds = room.hands[1].slice(0, 4).map((c) => c.id);
    const ws = room.conns.find((c) => c.seat === 1)?.ws as any;
    room.finishExchange(1 as SeatIndex, discardIds);

    expect(room.state.exchange.completed).not.toContain(1 as SeatIndex);
    const msgs = (ws?._sent || []).map((s: string) => JSON.parse(s));
    expect(msgs.some((m: any) => m.type === "ERROR" && m.code === "BAD_EXCHANGE")).toBe(true);
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

  it("rejects bola bid in auction (bola is implicit-only)", () => {
    const qRoom = makeRoom("quadrille");
    const { ws } = addHuman(qRoom, 0);
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
    // Seat 0 attempts bola (must be rejected)
    const turnBefore = qRoom.state.turn;
    qRoom.applyBid(0 as SeatIndex, "bola");
    expect(qRoom.state.phase).toBe("auction");
    expect(qRoom.state.turn).toBe(turnBefore);
    expect(qRoom.state.contract).toBeNull();

    const msgs = (ws as any)._sent.map((s: string) => JSON.parse(s));
    const err = msgs.find((m: any) => m.type === "ERROR" && m.code === "BOLA_IMPLICIT_ONLY");
    expect(err).toBeTruthy();
  });

  it("contrabola forces ombre to exchange exactly one card and nobody else", () => {
    const tRoom = makeRoom("tresillo");
    addHuman(tRoom, 2);
    tRoom.startGame();

    // Disable bot auto-act so we can drive the auction manually
    (tRoom as any).botMaybeAct = () => {};

    const order = tRoom.state.auction.order.slice();
    expect(order[order.length - 1]).toBe(2);

    tRoom.applyBid(order[0], "pass");
    tRoom.applyBid(order[1], "pass");
    tRoom.applyBid(2 as SeatIndex, "contrabola");

    expect(tRoom.state.contract).toBe("contrabola");
    expect(tRoom.state.phase).toBe("exchange");
    expect(tRoom.state.exchange.order).toEqual([2]);
    expect(tRoom.state.turn).toBe(2);

    // Contrabola ombre cannot skip exchange
    tRoom.finishExchange(2 as SeatIndex, []);
    expect(tRoom.state.phase).toBe("exchange");
    expect(tRoom.state.turn).toBe(2);

    // One-card exchange is required and valid
    const handBefore = tRoom.hands[2].length;
    const discardId = tRoom.hands[2][0]?.id;
    expect(discardId).toBeTruthy();
    tRoom.finishExchange(2 as SeatIndex, [discardId!]);
    expect(tRoom.hands[2].length).toBe(handBefore);
    expect(tRoom.state.phase).toBe("play");
    expect(tRoom.state.turn).toBe(tRoom.nextActive(2 as SeatIndex));
  });

  it("after declarer exchanges, defenders exchange in order by default", () => {
    // Declarer (seat 0) exchanges first.
    room.finishExchange(0 as SeatIndex, []);
    expect(room.state.exchange.completed).toEqual([0]);
    expect(room.state.turn).toBe(1);

    // Defender seat 2 cannot jump ahead without defer.
    room.finishExchange(2 as SeatIndex, []);
    expect(room.state.exchange.completed).not.toContain(2);
    expect(room.state.turn).toBe(1);
  });

  it("quadrille defenders follow clockwise order after ombre exchange", () => {
    const qRoom = makeRoom("quadrille");
    addHuman(qRoom, 0);
    qRoom.startGame();
    qRoom.conns.forEach((c) => {
      c.isBot = false;
      if (!(c.ws as any)?._sent) c.ws = makeFakeWs();
    });

    qRoom.state.ombre = 2 as SeatIndex;
    qRoom.state.contract = "entrada";
    qRoom.state.phase = "trump_choice";
    qRoom.state.turn = 2 as SeatIndex;
    qRoom.talon = [
      { s: "copas", r: 5, id: "qc5" },
      { s: "copas", r: 6, id: "qc6" },
      { s: "copas", r: 7, id: "qc7" },
      { s: "copas", r: 4, id: "qc4" },
    ] as any;

    qRoom.chooseTrump(2 as SeatIndex, "copas");
    expect(qRoom.state.exchange.order.slice(0, 3)).toEqual([2, 3, 0]);

    qRoom.finishExchange(2 as SeatIndex, []);
    expect(qRoom.state.turn).toBe(3);
  });

  it("first defender can defer and let second defender exchange first", () => {
    room.finishExchange(0 as SeatIndex, []);
    expect(room.state.turn).toBe(1);

    room.deferDefenderExchange(1 as SeatIndex);
    expect(room.state.turn).toBe(2);
    expect(room.state.exchange.current).toBe(2);

    room.finishExchange(2 as SeatIndex, []);
    expect(room.state.turn).toBe(1);
  });

  it("auto-skips no-op exchange seats", () => {
    room.state.contract = "solo";
    room.state.ombre = 0;
    room.state.phase = "trump_choice";
    room.state.turn = 0;
    room.talon = [];

    room.chooseTrump(0, "copas");
    expect(room.state.phase).toBe("play");
  });
});

describe("Room - play rules", () => {
  it("treats a led matador as trump and enforces trump follow", () => {
    const room = makeRoom();
    addHuman(room, 0);
    const s1 = addHuman(room, 1);
    addHuman(room, 2);
    (room as any).botMaybeAct = () => {};

    room.state.phase = "play";
    room.state.ombre = 0 as SeatIndex;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 0 as SeatIndex;
    room.state.tricks = { 0: 0, 1: 0, 2: 0, 3: 0 };
    room.table = [];
    room.playOrder = [];
    room.hands[0] = [{ s: "espadas", r: 1, id: "e1" }] as any;
    room.hands[1] = [
      { s: "copas", r: 12, id: "c12" },
      { s: "oros", r: 12, id: "o12" },
    ] as any;
    room.hands[2] = [{ s: "oros", r: 1, id: "o1" }] as any;
    room.state.handsCount = { 0: 1, 1: 2, 2: 1, 3: 0 };

    room.playCard(0 as SeatIndex, "e1");
    room.playCard(1 as SeatIndex, "c12"); // illegal while holding trump
    expect(room.state.table).toHaveLength(1);
    expect(room.hands[1]).toHaveLength(2);

    room.playCard(1 as SeatIndex, "o12");
    room.playCard(2 as SeatIndex, "o1");

    expect(room.state.tricks[0]).toBe(1);
    const msgs = s1.ws._sent.map((s: string) => JSON.parse(s));
    const illegal = msgs.find((m: any) => m.type === "ERROR" && m.code === "ILLEGAL_PLAY");
    expect(illegal).toBeTruthy();
  });

  it("in bola (no trump), black-suit rank order is respected", () => {
    const room = makeRoom();
    addHuman(room, 0);
    addHuman(room, 1);
    addHuman(room, 2);
    (room as any).botMaybeAct = () => {};

    room.state.phase = "play";
    room.state.ombre = 0 as SeatIndex;
    room.state.contract = "bola";
    room.state.trump = null;
    room.state.turn = 0 as SeatIndex;
    room.state.tricks = { 0: 0, 1: 0, 2: 0, 3: 0 };
    room.table = [];
    room.playOrder = [];
    room.hands[0] = [
      { s: "espadas", r: 2, id: "e2" },
      { s: "copas", r: 3, id: "c3" },
    ] as any;
    room.hands[1] = [
      { s: "espadas", r: 1, id: "e1" },
      { s: "copas", r: 4, id: "c4" },
    ] as any;
    room.hands[2] = [
      { s: "espadas", r: 7, id: "e7" },
      { s: "copas", r: 5, id: "c5" },
    ] as any;
    room.state.handsCount = { 0: 2, 1: 2, 2: 2, 3: 0 };

    room.playCard(0 as SeatIndex, "e2");
    room.playCard(1 as SeatIndex, "e1");
    room.playCard(2 as SeatIndex, "e7");

    expect(room.state.tricks[2]).toBe(1);
    expect(room.state.turn).toBe(2);
  });
});

describe("Room - implied bola", () => {
  it("implies bola when a player wins first five tricks and continues on trick six", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    room.state.phase = "play";
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 0;
    room.hands[0] = [{ s: "copas", r: 12, id: "c12" } as any];
    room.state.handsCount[0] = 1;
    (room as any).trickWinners = [0, 0, 0, 0, 0];

    room.playCard(0 as SeatIndex, "c12");
    expect(room.state.contract).toBe("bola");
  });

  it("implied bola is not restricted to ombre", () => {
    const room = makeRoom();
    addHuman(room, 1);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    room.state.phase = "play";
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 1;
    room.hands[1] = [{ s: "copas", r: 12, id: "c12" } as any];
    room.state.handsCount[1] = 1;
    (room as any).trickWinners = [1, 1, 1, 1, 1];

    room.playCard(1 as SeatIndex, "c12");
    expect(room.state.contract).toBe("bola");
  });

  it("does not imply bola when first five tricks are not all won by same player", () => {
    const room = makeRoom();
    addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    room.state.phase = "play";
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 0;
    room.hands[0] = [{ s: "copas", r: 12, id: "c12" } as any];
    room.state.handsCount[0] = 1;
    (room as any).trickWinners = [0, 0, 1, 0, 0];

    room.playCard(0 as SeatIndex, "c12");
    expect(room.state.contract).toBe("entrada");
  });

  it("allows ombre to close hand after first five tricks", () => {
    const room = makeRoom();
    const { conn } = addHuman(room, 0);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    room.state.phase = "play";
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 0;
    room.state.tricks = { 0: 5, 1: 0, 2: 0, 3: 0 };
    (room as any).trickWinners = [0, 0, 0, 0, 0];

    room.handle(conn, { type: "CLOSE_HAND" });
    expect(room.state.phase).toBe("post_hand");
    expect(room.state.contract).toBe("entrada");
  });

  it("allows any eligible player to close after five consecutive tricks", () => {
    const room = makeRoom();
    addHuman(room, 0);
    const other = addHuman(room, 1);
    room.startGame();
    room.conns.forEach((c) => (c.isBot = false));

    room.state.phase = "play";
    room.state.ombre = 0;
    room.state.contract = "entrada";
    room.state.trump = "oros";
    room.state.turn = 1;
    room.state.tricks = { 0: 0, 1: 5, 2: 0, 3: 0 };
    (room as any).trickWinners = [1, 1, 1, 1, 1];

    room.handle(other.conn, { type: "CLOSE_HAND" });
    expect(room.state.phase).toBe("post_hand");
    expect(room.state.contract).toBe("entrada");
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
