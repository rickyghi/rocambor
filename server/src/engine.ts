import { Card, Suit, Rank } from "../../shared/types";

export const SUITS: Suit[] = ["oros", "copas", "espadas", "bastos"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

// ---- Seeded PRNG (mulberry32) ----
function seedHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDeck(seed?: string): Card[] {
  const d: Card[] = [];
  for (const s of SUITS)
    for (const r of RANKS)
      d.push({ s, r, id: `${s[0]}${r}` }); // deterministic IDs: o1, c12, e7, b3...

  const rng = seed ? mulberry32(seedHash(seed)) : Math.random;
  // Fisher-Yates shuffle
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function generateSeed(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Card classification ----
export function isBlack(s: Suit): boolean {
  return s === "espadas" || s === "bastos";
}

export function isManille(tr: Suit, c: Card): boolean {
  return isBlack(tr) ? c.s === tr && c.r === 2 : c.s === tr && c.r === 7;
}

export function isMatador(tr: Suit, c: Card): boolean {
  return (
    (c.s === "espadas" && c.r === 1) ||
    isManille(tr, c) ||
    (c.s === "bastos" && c.r === 1)
  );
}

export function isTrump(tr: Suit | null, c: Card): boolean {
  return !!tr && (c.s === tr || isMatador(tr, c));
}

export function plainSuitValue(s: Suit, r: Rank): number {
  // Red suits (oros, copas): K > C > S > A > 2 > 3 > 4 > 5 > 6 > 7
  // Black suits (espadas, bastos): K > C > S > 7 > 6 > 5 > 4 > 3 > 2 > A
  const map: Record<number, number> = isBlack(s)
    ? { 12: 10, 11: 9, 10: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2, 1: 1 }
    : { 12: 10, 11: 9, 10: 8, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1 };
  return map[r] || 0;
}

// ---- Legal plays ----
export function legalPlays(
  tr: Suit | null,
  hand: Card[],
  led: Card | null
): Card[] {
  if (!led) return hand.slice();
  // No trump (bola/contrabola): simple follow-suit
  if (!tr) {
    const follow = hand.filter((c) => c.s === led.s);
    return follow.length ? follow : hand.slice();
  }
  const ledIsTrump = isTrump(tr, led);
  if (ledIsTrump) {
    const trumps = hand.filter((c) => isTrump(tr, c));
    const nonMatadorTrumps = trumps.filter(c => !isMatador(tr, c));
    if (nonMatadorTrumps.length > 0) {
      return trumps; // Has non-matador trumps: must play a trump (any trump including matadors)
    }
    return hand.slice(); // Only matadors or no trumps: can play anything (matador privilege)
  }
  // Matadors always behave as trump, not as plain suit followers.
  const must = hand.filter((c) => c.s === led.s && !isMatador(tr, c));
  if (must.length) return must;
  // Void in led suit: must play trump if holding any
  const trumps = hand.filter((c) => isTrump(tr, c));
  return trumps.length ? trumps : hand.slice();
}

// ---- Trick winner ----
export function trickWinner(
  tr: Suit | null,
  ledSuit: Suit,
  cards: Card[]
): number {
  function trumpVal(c: Card): number {
    if (!tr) return 0;
    if (c.s === "espadas" && c.r === 1) return 100; // spadille
    if (isManille(tr, c)) return 99;
    if (c.s === "bastos" && c.r === 1) return 98; // basto ace
    if (c.s !== tr) return 0;
    // Remaining trumps follow the suit's native plain order under matadors.
    return 80 + plainSuitValue(tr, c.r);
  }

  let best = -1,
    idx = 0;
  cards.forEach((c, i) => {
    const tv = trumpVal(c);
    const v =
      tv > 0
        ? 1000 + tv
        : c.s === ledSuit
          ? 100 + plainSuitValue(c.s, c.r)
          : 0;
    if (v > best) {
      best = v;
      idx = i;
    }
  });
  return idx;
}

// ---- Bot auction evaluation ----
export function trumpCardPoints(card: Card, trump: Suit): number {
  // Spadille (espadas ace) is always the #1 trump
  if (card.s === "espadas" && card.r === 1) return 10;
  // Manille (#2 trump) — rank depends on suit color
  if (isManille(trump, card)) return 9;
  // Basto (bastos ace) is always #3 trump (unless bastos is trump, then it's already manille)
  if (card.s === "bastos" && card.r === 1 && trump !== "bastos") return 8;
  // In-suit trump cards (remaining non-matador trumps)
  if (card.s === trump) {
    if (card.r === 12) return 6; // King
    if (card.r === 11) return 5; // Queen
    if (card.r === 10) return 4; // Jack
    // Remaining trumps by plain suit value: ace is strong in red, 7 is strong in black
    return 1 + plainSuitValue(trump, card.r); // range ~2-8 depending on suit color
  }
  // Off-suit kings
  if (card.r === 12) return 2;
  return 0;
}

export function evalTrumpPointsExact(hand: Card[], trump: Suit): number {
  return hand.reduce((s, c) => s + trumpCardPoints(c, trump), 0);
}
