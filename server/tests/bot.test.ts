import { describe, it, expect } from "vitest";
import { evaluateHand, decideBid, decideTrump, decidePlay, decideExchange, botAct, BotContext } from "../src/bot";
import { Card, Suit, SeatIndex, Bid } from "../../shared/types";

function card(s: Suit, r: number): Card {
  return { s, r: r as any, id: `${s[0]}${r}` };
}

function makeCtx(overrides: Partial<BotContext> = {}): BotContext {
  return {
    phase: "auction",
    seat: 0 as SeatIndex,
    hand: [],
    originalHand: [],
    trump: null,
    contract: null,
    auction: {
      currentBid: "pass" as Bid,
      currentBidder: null,
      passed: [],
      order: [0, 1, 2] as SeatIndex[],
    },
    ombre: null,
    playOrder: [],
    handsCount: { 0: 9, 1: 9, 2: 9, 3: 0 },
    tricks: { 0: 0, 1: 0, 2: 0, 3: 0 },
    table: [],
    talonLength: 13,
    ...overrides,
  };
}

describe("evaluateHand", () => {
  it("strong oros hand evaluates high", () => {
    const hand = [
      card("oros", 1),  // 9 pts
      card("oros", 12), // 6 pts
      card("oros", 11), // 5 pts
      card("oros", 10), // 4 pts
      card("oros", 7),  // 3 pts (red manille)
      card("oros", 5),  // 2 pts
      card("copas", 12), // 2 pts
      card("espadas", 12), // 2 pts
      card("bastos", 5), // 0 pts
    ];
    const { bestSuit, points } = evaluateHand(hand);
    expect(bestSuit).toBe("oros");
    expect(points).toBeGreaterThan(20);
  });

  it("weak hand evaluates low", () => {
    const hand = [
      card("copas", 6),
      card("espadas", 4),
      card("bastos", 5),
      card("oros", 6),
      card("copas", 4),
      card("espadas", 5),
      card("bastos", 6),
      card("oros", 4),
      card("copas", 5),
    ];
    const { points } = evaluateHand(hand);
    expect(points).toBeLessThan(15);
  });

  it("identifies best suit", () => {
    const hand = [
      card("copas", 1),  // 9 if copas trump
      card("copas", 12), // 6
      card("copas", 11), // 5
      card("copas", 10), // 4
      card("oros", 3),
      card("oros", 4),
      card("espadas", 5),
      card("bastos", 6),
      card("bastos", 3),
    ];
    const { bestSuit } = evaluateHand(hand);
    expect(bestSuit).toBe("copas");
  });
});

describe("decideBid", () => {
  it("strong hand bids high", () => {
    const hand = [
      card("oros", 1), card("oros", 12), card("oros", 11),
      card("oros", 10), card("oros", 7), card("oros", 5),
      card("copas", 12), card("espadas", 12), card("bastos", 12),
    ];
    const ctx = makeCtx({ hand, originalHand: hand });
    const bid = decideBid(ctx);
    expect(["entrada", "oros", "volteo", "solo", "solo_oros"]).toContain(bid);
    expect(bid).not.toBe("pass");
  });

  it("weak hand passes", () => {
    const hand = [
      card("copas", 3), card("espadas", 4), card("bastos", 5),
      card("oros", 6), card("copas", 4), card("espadas", 5),
      card("bastos", 6), card("oros", 3), card("copas", 2),
    ];
    const ctx = makeCtx({ hand, originalHand: hand });
    const bid = decideBid(ctx);
    expect(bid).toBe("pass");
  });

  it("does not bid below current bid", () => {
    const hand = [
      card("oros", 1), card("oros", 12), card("oros", 11),
      card("oros", 10), card("oros", 7), card("copas", 12),
      card("espadas", 12), card("bastos", 12), card("copas", 5),
    ];
    const ctx = makeCtx({
      hand,
      originalHand: hand,
      auction: {
        currentBid: "solo" as Bid,
        currentBidder: 1 as SeatIndex,
        passed: [],
        order: [0, 1, 2] as SeatIndex[],
      },
    });
    const bid = decideBid(ctx);
    // Should either pass or bid higher than solo
    if (bid !== "pass") {
      expect(["solo_oros"].includes(bid)).toBe(true);
    }
  });

  it("uses the smallest legal overcall instead of jumping to top bid", () => {
    const hand = [
      card("oros", 1), card("oros", 12), card("oros", 11),
      card("oros", 5), card("oros", 4), card("copas", 12),
      card("espadas", 12), card("bastos", 6), card("copas", 5),
    ];
    const ctx = makeCtx({
      hand,
      originalHand: hand,
      auction: {
        currentBid: "solo" as Bid,
        currentBidder: 1 as SeatIndex,
        passed: [],
        order: [0, 1, 2] as SeatIndex[],
      },
    });
    const bid = decideBid(ctx);
    expect(bid).toBe("solo_oros");
  });

  it("declines penetro choice", () => {
    const action = botAct(makeCtx({ phase: "penetro_choice" }));
    expect(action).toEqual({ type: "PENETRO_DECISION", payload: false });
  });
});

describe("decideTrump", () => {
  it("returns oros when contract requires it", () => {
    const ctx = makeCtx({ phase: "trump_choice", contract: "oros", hand: [] });
    expect(decideTrump(ctx)).toBe("oros");
  });

  it("returns best suit for standard contracts", () => {
    const hand = [
      card("copas", 1), card("copas", 12), card("copas", 11),
      card("copas", 10), card("copas", 7), card("oros", 3),
      card("espadas", 4), card("bastos", 5), card("bastos", 6),
    ];
    const ctx = makeCtx({ phase: "trump_choice", contract: "entrada", hand });
    const suit = decideTrump(ctx);
    expect(suit).toBe("copas");
  });
});

describe("decidePlay", () => {
  it("picks a legal card", () => {
    const hand = [card("copas", 3), card("espadas", 12)];
    const ctx = makeCtx({
      phase: "play",
      trump: "oros",
      hand,
      table: [],
    });
    const id = decidePlay(ctx);
    expect(id).toBeTruthy();
    expect(hand.find((c) => c.id === id)).toBeTruthy();
  });

  it("returns null for empty hand", () => {
    const ctx = makeCtx({
      phase: "play",
      trump: "oros",
      hand: [],
      table: [],
    });
    const id = decidePlay(ctx);
    expect(id).toBeNull();
  });

  it("defender avoids overtaking a teammate already winning", () => {
    const ctx = makeCtx({
      phase: "play",
      seat: 2 as SeatIndex,
      ombre: 0 as SeatIndex,
      trump: "oros",
      table: [card("oros", 10), card("oros", 11)],
      playOrder: [0 as SeatIndex, 1 as SeatIndex],
      hand: [card("oros", 12), card("oros", 3)],
    });
    const id = decidePlay(ctx);
    expect(id).toBe("o3");
  });

  it("defender uses the weakest winning trump when ombre is winning", () => {
    const ctx = makeCtx({
      phase: "play",
      seat: 2 as SeatIndex,
      ombre: 0 as SeatIndex,
      trump: "oros",
      table: [card("copas", 10), card("bastos", 4)],
      playOrder: [0 as SeatIndex, 1 as SeatIndex],
      hand: [card("oros", 12), card("oros", 3), card("bastos", 5)],
    });
    const id = decidePlay(ctx);
    expect(id).toBe("o3");
  });

  it("ombre can lead a top matador to pull trumps with a strong trump holding", () => {
    const ctx = makeCtx({
      phase: "play",
      seat: 0 as SeatIndex,
      ombre: 0 as SeatIndex,
      trump: "oros",
      table: [],
      hand: [
        card("espadas", 1),
        card("oros", 7),
        card("oros", 12),
        card("oros", 3),
        card("copas", 12),
      ],
    });
    const id = decidePlay(ctx);
    expect(id).toBe("e1");
  });
});

describe("decideExchange", () => {
  it("defender exchange is not capped at five when talon allows", () => {
    const weakHand = [
      card("copas", 2),
      card("copas", 3),
      card("copas", 4),
      card("bastos", 2),
      card("bastos", 3),
      card("bastos", 4),
      card("espadas", 2),
      card("espadas", 3),
      card("espadas", 4),
    ];
    const ctx = makeCtx({
      phase: "exchange",
      seat: 1 as SeatIndex,
      ombre: 0 as SeatIndex,
      contract: "entrada",
      trump: "oros",
      hand: weakHand,
      originalHand: weakHand,
      talonLength: 8,
    });
    const ids = decideExchange(ctx);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.length).toBeLessThanOrEqual(8);
  });
});
