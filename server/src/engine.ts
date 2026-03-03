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
    const must = hand.filter((c) => isTrump(tr, c));
    return must.length ? must : hand.slice();
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
    const nb = isBlack(tr);
    const map: Record<number, number> = nb
      ? { 12: 90, 11: 89, 10: 88, 7: 87, 6: 86, 5: 85, 4: 84, 3: 83 }
      : { 12: 90, 11: 89, 10: 88, 2: 87, 3: 86, 4: 85, 5: 84, 6: 83 };
    return map[c.r] || 0;
  }

  function plainVal(s: Suit, r: Rank): number {
    // Non-trump suit ranking is uniform across suits:
    // K > C > S > A > 2 > 3 > 4 > 5 > 6 > 7
    const map: Record<number, number> = {
      12: 10, 11: 9, 10: 8, 1: 7, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1,
    };
    return map[r] || 0;
  }

  let best = -1,
    idx = 0;
  cards.forEach((c, i) => {
    const tv = trumpVal(c);
    const v = tv > 0 ? 1000 + tv : c.s === ledSuit ? 100 + plainVal(c.s, c.r) : 0;
    if (v > best) {
      best = v;
      idx = i;
    }
  });
  return idx;
}

// ---- Bot auction evaluation ----
export function trumpCardPoints(card: Card, trump: Suit): number {
  if (card.s === trump) {
    if (card.r === 1) return 9;
    if (card.r === 2) return 8;
    if (card.r === 3) return 7;
    if (card.r === 12) return 6;
    if (card.r === 11) return 5;
    if (card.r === 10) return 4;
    if (card.r === 7) return 3;
    return 2;
  }
  if (card.r === 12) return 2; // off-suit kings
  return 0;
}

export function evalTrumpPointsExact(hand: Card[], trump: Suit): number {
  return hand.reduce((s, c) => s + trumpCardPoints(c, trump), 0);
}
