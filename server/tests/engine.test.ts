import { describe, it, expect } from "vitest";
import {
  makeDeck,
  SUITS,
  RANKS,
  legalPlays,
  trickWinner,
  isTrump,
  isMatador,
  isManille,
  isBlack,
  evalTrumpPointsExact,
} from "../src/engine";
import { Card, Suit } from "../../shared/types";

function card(s: Suit, r: number): Card {
  return { s, r: r as any, id: `${s[0]}${r}` };
}

describe("makeDeck", () => {
  it("produces 40 unique cards", () => {
    const deck = makeDeck();
    expect(deck.length).toBe(40);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(40);
  });

  it("covers all 4 suits x 10 ranks", () => {
    const deck = makeDeck();
    for (const s of SUITS) {
      for (const r of RANKS) {
        expect(deck.find((c) => c.s === s && c.r === r)).toBeTruthy();
      }
    }
  });

  it("is deterministic with a seed", () => {
    const a = makeDeck("test-seed-123");
    const b = makeDeck("test-seed-123");
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("produces different orders with different seeds", () => {
    const a = makeDeck("seed-A");
    const b = makeDeck("seed-B");
    const aIds = a.map((c) => c.id).join(",");
    const bIds = b.map((c) => c.id).join(",");
    expect(aIds).not.toBe(bIds);
  });

  it("uses deterministic card IDs (suit initial + rank)", () => {
    const deck = makeDeck("any-seed");
    expect(deck.find((c) => c.id === "o1")).toBeTruthy(); // oros 1
    expect(deck.find((c) => c.id === "e12")).toBeTruthy(); // espadas 12
    expect(deck.find((c) => c.id === "b7")).toBeTruthy(); // bastos 7
    expect(deck.find((c) => c.id === "c10")).toBeTruthy(); // copas 10
  });
});

describe("card classification", () => {
  it("isBlack for espadas and bastos", () => {
    expect(isBlack("espadas")).toBe(true);
    expect(isBlack("bastos")).toBe(true);
    expect(isBlack("oros")).toBe(false);
    expect(isBlack("copas")).toBe(false);
  });

  it("isManille depends on trump color", () => {
    // Black trump (espadas): manille is 2 of trump
    expect(isManille("espadas", card("espadas", 2))).toBe(true);
    expect(isManille("espadas", card("espadas", 7))).toBe(false);
    // Red trump (oros): manille is 7 of trump
    expect(isManille("oros", card("oros", 7))).toBe(true);
    expect(isManille("oros", card("oros", 2))).toBe(false);
    // Copas (red): manille is 7
    expect(isManille("copas", card("copas", 7))).toBe(true);
    // Bastos (black): manille is 2
    expect(isManille("bastos", card("bastos", 2))).toBe(true);
  });

  it("isMatador identifies the three matadors", () => {
    // Spadille (espadas-1) is always a matador regardless of trump
    expect(isMatador("oros", card("espadas", 1))).toBe(true);
    expect(isMatador("copas", card("espadas", 1))).toBe(true);
    // Basto ace (bastos-1) is always a matador
    expect(isMatador("oros", card("bastos", 1))).toBe(true);
    // Manille is a matador
    expect(isMatador("oros", card("oros", 7))).toBe(true);
    expect(isMatador("espadas", card("espadas", 2))).toBe(true);
    // Regular cards are not matadors
    expect(isMatador("oros", card("oros", 12))).toBe(false);
    expect(isMatador("copas", card("copas", 3))).toBe(false);
  });

  it("isTrump includes trump suit cards and matadors", () => {
    // Regular trump card
    expect(isTrump("oros", card("oros", 5))).toBe(true);
    // Matadors are trump regardless of suit
    expect(isTrump("oros", card("espadas", 1))).toBe(true); // spadille
    expect(isTrump("oros", card("bastos", 1))).toBe(true); // basto
    // Non-trump plain card
    expect(isTrump("oros", card("copas", 5))).toBe(false);
    // Null trump means nothing is trump
    expect(isTrump(null, card("oros", 1))).toBe(false);
  });
});

describe("legalPlays", () => {
  const trump: Suit = "oros";

  it("all cards legal when leading", () => {
    const hand = [card("oros", 5), card("copas", 3), card("espadas", 12)];
    const legal = legalPlays(trump, hand, null);
    expect(legal.length).toBe(3);
  });

  it("must follow suit when non-trump led", () => {
    const hand = [card("copas", 3), card("copas", 12), card("espadas", 5)];
    const legal = legalPlays(trump, hand, card("copas", 7));
    // Should only allow copas cards
    expect(legal.every((c) => c.s === "copas")).toBe(true);
    expect(legal.length).toBe(2);
  });

  it("any card legal when void in led suit", () => {
    const hand = [card("oros", 5), card("espadas", 3)];
    const legal = legalPlays(trump, hand, card("copas", 7));
    expect(legal.length).toBe(2);
  });

  it("must follow with trump when trump led", () => {
    const hand = [
      card("oros", 5), // trump
      card("copas", 3), // not trump
      card("espadas", 1), // spadille = trump!
    ];
    const legal = legalPlays(trump, hand, card("oros", 12));
    // Should require trump cards (oros + spadille)
    expect(legal.length).toBe(2);
    expect(legal.some((c) => c.id === "o5")).toBe(true);
    expect(legal.some((c) => c.id === "e1")).toBe(true);
  });
});

describe("trickWinner", () => {
  const trump: Suit = "oros";

  it("spadille beats everything", () => {
    const cards = [card("oros", 12), card("espadas", 1), card("copas", 12)];
    expect(trickWinner(trump, "oros", cards)).toBe(1); // spadille wins
  });

  it("manille beats basto ace", () => {
    // Oros trump: manille is oros-7
    const cards = [card("bastos", 1), card("oros", 7), card("copas", 12)];
    expect(trickWinner(trump, "bastos", cards)).toBe(1); // oros-7 (manille) wins
  });

  it("basto ace beats regular trump", () => {
    const cards = [card("oros", 12), card("bastos", 1), card("oros", 5)];
    expect(trickWinner(trump, "oros", cards)).toBe(1); // basto ace wins
  });

  it("trump beats plain", () => {
    const cards = [card("copas", 12), card("copas", 11), card("oros", 3)];
    expect(trickWinner(trump, "copas", cards)).toBe(2); // oros (trump) wins
  });

  it("highest led suit wins when no trump played", () => {
    const cards = [card("copas", 3), card("copas", 12), card("espadas", 12)];
    expect(trickWinner(trump, "copas", cards)).toBe(1); // copas-12 (king) wins
  });

  it("off-suit card loses to led suit", () => {
    const cards = [card("copas", 3), card("espadas", 12), card("copas", 5)];
    expect(trickWinner(trump, "copas", cards)).toBe(0); // copas-3 > copas-5 in red suit ranking, espadas ignored
  });
});

describe("evalTrumpPointsExact", () => {
  it("evaluates a strong hand correctly", () => {
    const hand = [
      card("oros", 1), // ace = 9 pts
      card("oros", 12), // king = 6 pts
      card("oros", 11), // queen = 5 pts
    ];
    expect(evalTrumpPointsExact(hand, "oros")).toBe(20);
  });

  it("evaluates off-suit kings", () => {
    const hand = [card("copas", 12), card("espadas", 12)];
    expect(evalTrumpPointsExact(hand, "oros")).toBe(4); // 2 pts each king
  });

  it("evaluates empty hand as 0", () => {
    expect(evalTrumpPointsExact([], "oros")).toBe(0);
  });
});
