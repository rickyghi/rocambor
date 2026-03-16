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
  plainSuitValue,
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

  it("can discard freely when void in led suit even if holding trump", () => {
    // Void in copas, but holding oros-5 which is trump.
    // Rocambor does not force a trump when the led suit is absent.
    const hand = [card("oros", 5), card("espadas", 3)];
    const legal = legalPlays(trump, hand, card("copas", 7));
    expect(legal.length).toBe(2);
  });

  it("any card legal when void in both led suit and trump", () => {
    // Void in copas AND void in trump (oros) — free to play anything
    const hand = [card("espadas", 3), card("bastos", 5)];
    const legal = legalPlays(trump, hand, card("copas", 7));
    expect(legal.length).toBe(2);
  });

  it("can discard freely when void in led suit and holding only matador trumps", () => {
    // Void in copas, but holding spadille (espadas-1 = matador = trump).
    // A matador is not forced here because no suit-follow is possible.
    const hand = [card("espadas", 1), card("bastos", 5)];
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

  it("uses black suit plain ranking when no trump is played", () => {
    const cards = [card("espadas", 2), card("espadas", 7), card("copas", 12)];
    expect(trickWinner(trump, "espadas", cards)).toBe(1); // espadas-7 > espadas-2 in black ranking
  });

  it("treats red-suit ace as a valid trump card", () => {
    const cards = [card("copas", 12), card("oros", 1), card("copas", 11)];
    expect(trickWinner(trump, "copas", cards)).toBe(1); // trump ace beats led plain cards
  });

  it("orders red-suit trump ace above trump two", () => {
    const cards = [card("oros", 2), card("oros", 1), card("copas", 12)];
    expect(trickWinner(trump, "oros", cards)).toBe(1); // oros-1 > oros-2 (non-matador trumps)
  });
});

describe("evalTrumpPointsExact", () => {
  it("evaluates a strong hand correctly", () => {
    const hand = [
      card("espadas", 1), // spadille = 10 pts (always #1 trump)
      card("oros", 12), // in-suit king = 6 pts
      card("oros", 11), // in-suit queen = 5 pts
    ];
    expect(evalTrumpPointsExact(hand, "oros")).toBe(21);
  });

  it("evaluates off-suit kings", () => {
    const hand = [card("copas", 12), card("espadas", 12)];
    expect(evalTrumpPointsExact(hand, "oros")).toBe(4); // 2 pts each king
  });

  it("evaluates empty hand as 0", () => {
    expect(evalTrumpPointsExact([], "oros")).toBe(0);
  });

  it("scores off-suit matadors (spadille and basto)", () => {
    const hand = [card("espadas", 1), card("bastos", 1)];
    // spadille=10, basto=8
    expect(evalTrumpPointsExact(hand, "oros")).toBe(18);
  });

  it("scores red-suit manille correctly", () => {
    const hand = [card("oros", 7)]; // manille when trump is oros (red suit)
    expect(evalTrumpPointsExact(hand, "oros")).toBe(9);
  });
});

// ---- New focused tests (gap coverage) ----

describe("legalPlays - null trump guard (bola/contrabola)", () => {
  // When trump is null, only follow-suit logic applies — no trumping allowed.
  it("null trump: must follow suit with same-suit cards", () => {
    const hand = [card("copas", 5), card("copas", 12), card("espadas", 3)];
    const legal = legalPlays(null, hand, card("copas", 7));
    expect(legal.length).toBe(2);
    expect(legal.every((c) => c.s === "copas")).toBe(true);
  });

  it("null trump: can play any card when void in led suit (no trump obligation)", () => {
    // Void in copas. In null trump, espadas cards are NOT treated as trump.
    const hand = [card("espadas", 3), card("bastos", 6)];
    const legal = legalPlays(null, hand, card("copas", 7));
    // All cards legal — no trump obligation in null trump games
    expect(legal.length).toBe(2);
  });

  it("null trump: matadors are NOT treated as trump — they follow suit normally", () => {
    // Espadas-1 (spadille) is a matador but in null trump it's just an espadas card.
    const hand = [card("espadas", 1), card("bastos", 5)];
    // Lead is copas; hand has no copas, so any card is legal
    const legal = legalPlays(null, hand, card("copas", 7));
    expect(legal.length).toBe(2); // both cards are legal (void in led suit)
  });

  it("null trump: spadille in led suit must follow copas lead if only copas cards available", () => {
    // Spadille is espadas-1 (not copas), so when copas is led and hand has copas, must follow
    const hand = [card("copas", 4), card("espadas", 1)];
    const legal = legalPlays(null, hand, card("copas", 7));
    // Must play the copas-4 (follow suit), can't play espadas-1
    expect(legal.length).toBe(1);
    expect(legal[0].id).toBe("c4");
  });
});

describe("legalPlays - matador exemption", () => {
  // A matador in the player's hand cannot be forced out by a trump lead
  // in its own suit. Matadors are exempted from plain-suit following.
  it("matador (spadille) is exempt from being forced out by plain copas lead", () => {
    // Trump is oros. Lead is copas (plain suit).
    // Hand has copas-5 (must follow) AND espadas-1 (spadille = matador).
    // Matador should NOT be in the forced-follow list (it's trump, not plain).
    const hand = [card("copas", 5), card("espadas", 1), card("bastos", 6)];
    const legal = legalPlays("oros", hand, card("copas", 3));
    // Only copas-5 should be required (follow suit). Matadors exempt from plain follow.
    expect(legal.length).toBe(1);
    expect(legal[0].id).toBe("c5");
  });

  it("matador (basto ace) is exempt from plain espadas lead", () => {
    // Trump is copas. Lead is espadas (plain suit).
    // Hand has espadas-5 and bastos-1 (basto matador = trump, not espadas plain).
    const hand = [card("espadas", 5), card("bastos", 1)];
    const legal = legalPlays("copas", hand, card("espadas", 3));
    // Must follow espadas with espadas-5; bastos-1 is a matador (trump), exempt from plain follow
    expect(legal.length).toBe(1);
    expect(legal[0].id).toBe("e5");
  });

  it("when hand has ONLY a matador vs a plain suit lead, can play anything (matador exempt)", () => {
    // Trump is oros. Lead is copas (plain). Hand has only espadas-1 (matador = trump, not copas).
    // No copas to follow, matador is exempt from plain-suit obligation.
    const hand = [card("espadas", 1), card("bastos", 6)];
    const legal = legalPlays("oros", hand, card("copas", 3));
    expect(legal.length).toBe(2);
  });
});

describe("legalPlays - void-suit freedom", () => {
  it("void in led suit and holding a regular trump: any card is legal", () => {
    const hand = [card("oros", 6), card("bastos", 4)]; // oros = trump
    const legal = legalPlays("oros", hand, card("copas", 7)); // copas led, void
    expect(legal.length).toBe(2);
  });

  it("void in led suit and holding only matadors as trump: any card is legal", () => {
    const hand = [card("espadas", 1), card("bastos", 4)]; // spadille is trump (matador)
    const legal = legalPlays("oros", hand, card("copas", 7));
    expect(legal.length).toBe(2);
  });

  it("void in led suit and void in trump: any card is legal", () => {
    const hand = [card("bastos", 4), card("espadas", 5)]; // no oros trump, no copas
    const legal = legalPlays("oros", hand, card("copas", 7));
    expect(legal.length).toBe(2);
  });
});

describe("legalPlays - matador leads", () => {
  it("spadille lead forces any lower trump, including lower matadors", () => {
    const hand = [card("oros", 5), card("bastos", 1), card("copas", 12)];
    const legal = legalPlays("oros", hand, card("espadas", 1));
    expect(legal.map((c) => c.id).sort()).toEqual(["b1", "o5"]);
  });

  it("manille lead forces lower trumps but spadille/basto always playable", () => {
    const hand = [card("espadas", 1), card("bastos", 1), card("oros", 5), card("copas", 12)];
    const legal = legalPlays("oros", hand, card("oros", 7));
    expect(legal.map((c) => c.id).sort()).toEqual(["b1", "e1", "o5"]);
  });

  it("basto lead: lower trumps required, spadille always playable", () => {
    const hand = [card("espadas", 1), card("oros", 7), card("oros", 5), card("copas", 12)];
    const legal = legalPlays("oros", hand, card("bastos", 1));
    expect(legal.map((c) => c.id).sort()).toEqual(["e1", "o5"]);
  });

  it("a player with only higher matadors against a matador lead may discard freely", () => {
    const hand = [card("espadas", 1), card("oros", 7), card("copas", 12)];
    const legal = legalPlays("oros", hand, card("bastos", 1));
    expect(legal.length).toBe(3);
  });
});

describe("trickWinner - red-suit reversed ranking", () => {
  // Copas is a red suit: lower numeric rank = stronger in plain tricks.
  // King(12) > Queen(11) > Jack(10) > Ace(1) > 2 > 3 > 4 > 5 > 6 > 7
  it("copas-3 beats copas-5 in a copas-led trick (red suit reversed)", () => {
    const cards = [card("copas", 5), card("copas", 3)];
    const winner = trickWinner("bastos", "copas", cards); // bastos trump, not played
    // copas-3 has plainSuitValue=5 > copas-5 has plainSuitValue=3
    expect(winner).toBe(1); // index 1 = copas-3
  });

  it("copas-ace beats copas-2 in a copas-led trick (red suit: ace rank 1 beats rank 2)", () => {
    const cards = [card("copas", 2), card("copas", 1)];
    const winner = trickWinner("bastos", "copas", cards);
    // Red suit: ace(1) = value 7, rank 2 = value 6
    expect(winner).toBe(1); // copas-1 (ace) wins
  });

  it("copas-king(12) beats copas-ace in plain trick (king is highest)", () => {
    const cards = [card("copas", 1), card("copas", 12)];
    const winner = trickWinner("bastos", "copas", cards);
    expect(winner).toBe(1); // copas-12 (king) wins
  });
});

describe("trickWinner - matador hierarchy", () => {
  // Spadille(e1) > Manille > Basto(b1) > regular trumps
  it("spadille beats manille when both in same trick", () => {
    // Trump = oros, so manille = oros-7
    const cards = [card("oros", 7), card("espadas", 1)]; // manille then spadille
    const winner = trickWinner("oros", "oros", cards);
    expect(winner).toBe(1); // espadas-1 (spadille) wins
  });

  it("manille beats basto ace when both in same trick", () => {
    // Trump = oros, manille = oros-7
    const cards = [card("bastos", 1), card("oros", 7)]; // basto-ace then manille
    const winner = trickWinner("oros", "oros", cards);
    expect(winner).toBe(1); // oros-7 (manille) wins
  });

  it("basto ace beats regular trump cards", () => {
    // Trump = copas, basto-1 is matador (rank 98 > 80+anything)
    const cards = [card("copas", 12), card("bastos", 1), card("copas", 5)];
    const winner = trickWinner("copas", "copas", cards);
    expect(winner).toBe(1); // bastos-1 (basto ace) wins
  });

  it("spadille beats basto ace directly", () => {
    const cards = [card("bastos", 1), card("espadas", 1)];
    const winner = trickWinner("oros", "oros", cards);
    expect(winner).toBe(1); // spadille wins (rank 100 > 98)
  });
});

describe("trickWinner - trump beats non-trump", () => {
  it("any trump card beats the highest plain-suit card", () => {
    // Led suit copas-king (12), highest plain card. But oros-7 is a regular trump.
    const cards = [card("copas", 12), card("oros", 7)];
    const winner = trickWinner("oros", "copas", cards);
    // oros-7 IS manille (red trump), so it has trump value 1099 vs plain 110
    expect(winner).toBe(1);
  });

  it("lowest regular trump beats plain-suit king", () => {
    // Trump = espadas. espadas-4 is a low trump. copas-12 is the king (highest plain).
    const cards = [card("copas", 12), card("espadas", 4)];
    const winner = trickWinner("espadas", "copas", cards);
    expect(winner).toBe(1); // espadas-4 (trump) wins
  });

  it("off-suit card loses to led suit even if higher-ranked in its own suit", () => {
    // Led suit copas. Off-suit bastos-12 is not relevant.
    const cards = [card("copas", 5), card("bastos", 12)];
    const winner = trickWinner("oros", "copas", cards);
    expect(winner).toBe(0); // copas-5 wins (led suit), bastos ignored
  });
});

describe("plainSuitValue - direct unit tests", () => {
  it("red suit (oros): lower rank = higher value (ace=1 beats 7)", () => {
    // Red suit: ace(1) value=7, rank 7 value=1
    expect(plainSuitValue("oros", 1)).toBeGreaterThan(plainSuitValue("oros", 7));
  });

  it("red suit (oros): king(12) has highest plain value", () => {
    expect(plainSuitValue("oros", 12)).toBe(10);
  });

  it("red suit (copas): rank 3 has higher value than rank 5", () => {
    // copas-3 value=5, copas-5 value=3 — lower rank wins in red suit
    expect(plainSuitValue("copas", 3)).toBeGreaterThan(plainSuitValue("copas", 5));
  });

  it("black suit (espadas): higher rank = higher value (7 beats ace=1)", () => {
    // Black suit: rank 7 value=7, ace(1) value=1
    expect(plainSuitValue("espadas", 7)).toBeGreaterThan(plainSuitValue("espadas", 1));
  });

  it("black suit (bastos): rank 7 has value 7, ace has value 1", () => {
    expect(plainSuitValue("bastos", 7)).toBe(7);
    expect(plainSuitValue("bastos", 1)).toBe(1);
  });

  it("black suit (espadas): king(12) has highest plain value", () => {
    expect(plainSuitValue("espadas", 12)).toBe(10);
  });

  it("red suit (copas): ace(1) value=7, rank 2 value=6 (ace beats 2 in red)", () => {
    expect(plainSuitValue("copas", 1)).toBe(7);
    expect(plainSuitValue("copas", 2)).toBe(6);
    expect(plainSuitValue("copas", 1)).toBeGreaterThan(plainSuitValue("copas", 2));
  });
});

describe("legalPlays - matador privilege (spadille/basto always playable)", () => {
  it("spadille is legal when manille leads and hand has spadille + regular trump", () => {
    const hand = [card("espadas", 1), card("oros", 5)];
    const led = card("oros", 7); // manille for red trump
    const legal = legalPlays("oros", hand, led);
    expect(legal.some((c) => c.s === "espadas" && c.r === 1)).toBe(true);
  });

  it("spadille is legal when basto leads and hand has spadille + regular trump", () => {
    const hand = [card("espadas", 1), card("oros", 5)];
    const led = card("bastos", 1); // basto
    const legal = legalPlays("oros", hand, led);
    expect(legal.some((c) => c.s === "espadas" && c.r === 1)).toBe(true);
  });

  it("basto is legal when manille leads and hand has basto + regular trump", () => {
    const hand = [card("bastos", 1), card("oros", 5)];
    const led = card("oros", 7); // manille for red trump
    const legal = legalPlays("oros", hand, led);
    expect(legal.some((c) => c.s === "bastos" && c.r === 1)).toBe(true);
  });
});
