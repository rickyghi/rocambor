import { Card, Suit, Bid, SeatIndex, BID_VAL } from "../../shared/types";
import {
  evalTrumpPointsExact,
  legalPlays,
  SUITS,
  isTrump,
  isMatador,
  plainSuitValue,
  trickWinner,
  isManille,
} from "./engine";

export interface BotContext {
  phase: string;
  seat: SeatIndex;
  hand: Card[];
  originalHand: Card[];
  trump: Suit | null;
  contract: string | null;
  auction: {
    currentBid: Bid;
    currentBidder: SeatIndex | null;
    passed: SeatIndex[];
    order: SeatIndex[];
  };
  ombre: SeatIndex | null;
  playOrder: SeatIndex[];
  handsCount: Record<number, number>;
  tricks: Record<number, number>;
  table: Card[];
  talonLength: number;
}

export function evaluateHand(hand: Card[]): { bestSuit: Suit; points: number } {
  let bestSuit: Suit = "oros";
  let bestPts = -1;
  for (const s of SUITS) {
    const p = evalTrumpPointsExact(hand, s);
    if (p > bestPts) {
      bestPts = p;
      bestSuit = s;
    }
  }
  return { bestSuit, points: bestPts };
}

function trumpOrderValue(card: Card, trump: Suit): number {
  if (card.s === "espadas" && card.r === 1) return 100;
  if (isManille(trump, card)) return 99;
  if (card.s === "bastos" && card.r === 1) return 98;
  if (card.s !== trump) return 0;
  return 80 + plainSuitValue(trump, card.r);
}

function plainOrderValue(card: Card): number {
  return plainSuitValue(card.s, card.r);
}

function cardPower(card: Card, trump: Suit | null): number {
  if (trump) {
    const tv = trumpOrderValue(card, trump);
    if (tv > 0) return 1000 + tv;
  }
  return plainOrderValue(card);
}

function sortWeakToStrong(cards: Card[], trump: Suit | null): Card[] {
  return cards.slice().sort((a, b) => cardPower(a, trump) - cardPower(b, trump));
}

function pickLowest(cards: Card[], trump: Suit | null): Card {
  return sortWeakToStrong(cards, trump)[0];
}

function pickHighest(cards: Card[], trump: Suit | null): Card {
  const sorted = sortWeakToStrong(cards, trump);
  return sorted[sorted.length - 1];
}

function wouldBeatCurrent(
  table: Card[],
  trump: Suit | null,
  candidate: Card
): boolean {
  if (!table.length) return true;
  const ledSuit = table[0].s;
  const cards = [...table, candidate];
  return trickWinner(trump, ledSuit, cards) === cards.length - 1;
}

function sameTeam(ctx: BotContext, a: SeatIndex, b: SeatIndex): boolean {
  if (ctx.contract === "penetro") return a === b;
  if (ctx.ombre === null) return a === b;
  return (a === ctx.ombre) === (b === ctx.ombre);
}

function evaluateSuitStrength(hand: Card[], suit: Suit): number {
  const points = evalTrumpPointsExact(hand, suit);
  const trumps = hand.filter((c) => isTrump(suit, c)).length;
  const matadors = hand.filter((c) => isMatador(suit, c)).length;
  return points + matadors * 4 + Math.max(0, trumps - 3) * 1.5;
}

export function decideBid(ctx: BotContext): Bid {
  const hand0 = ctx.originalHand.length > 0 ? ctx.originalHand : ctx.hand;
  let bestSuit: Suit = "oros";
  let bestStrength = -Infinity;
  for (const s of SUITS) {
    const strength = evaluateSuitStrength(hand0, s);
    if (strength > bestStrength) {
      bestStrength = strength;
      bestSuit = s;
    }
  }

  const ladder: Array<{ bid: Bid; minStrength: number }> =
    bestSuit === "oros"
      ? [
          { bid: "solo_oros", minStrength: 35 },
          { bid: "oros", minStrength: 30 },
          { bid: "entrada", minStrength: 25 },
        ]
      : [
          { bid: "solo", minStrength: 35 },
          { bid: "volteo", minStrength: 30 },
          { bid: "entrada", minStrength: 25 },
        ];

  let bid: Bid = "pass";
  for (const c of ladder) {
    if (bestStrength >= c.minStrength) {
      bid = c.bid;
      break;
    }
  }

  // Contrabola edge case
  const a = ctx.auction;
  const allPass =
    a.currentBid === "pass" && a.passed.length === a.order.length - 1;
  const isLast =
    a.order.indexOf(ctx.seat) === a.order.length - 1;

  if (allPass && isLast && bid === "pass") {
    if (bestStrength >= 21) {
      bid = "entrada";
    } else if (Math.random() < 0.04) {
      bid = "contrabola";
    }
  }

  // Ensure bid beats current
  if (bid !== "pass" && BID_VAL[bid] <= BID_VAL[a.currentBid]) {
    const candidates = ladder
      .map((x) => x.bid)
      .filter((b) => BID_VAL[b] > BID_VAL[a.currentBid]);
    // Prefer the cheapest legal overcall, not an unnecessarily high jump.
    bid = candidates.length ? candidates[candidates.length - 1] : "pass";
  }

  // Weak hands should still pass when table is already competitive
  if (bid !== "pass" && bestStrength < 25 && BID_VAL[a.currentBid] >= BID_VAL["entrada"]) {
    bid = "pass";
  }

  return bid;
}

export function decideTrump(ctx: BotContext): Suit {
  const needOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";
  if (needOros) return "oros";
  let bestSuit: Suit = "oros";
  let bestStrength = -Infinity;
  for (const s of SUITS) {
    const st = evaluateSuitStrength(ctx.hand, s);
    if (st > bestStrength) {
      bestStrength = st;
      bestSuit = s;
    }
  }
  return bestSuit;
}

function keepValue(card: Card, trump: Suit): number {
  let score = 0;
  if (isMatador(trump, card)) score += 100;
  if (isTrump(trump, card)) score += 40 + trumpOrderValue(card, trump);
  if (card.r === 12) score += 8;
  if (card.r === 11 || card.r === 10) score += 4;
  if (!isTrump(trump, card) && card.r <= 4) score -= 4;
  return score;
}

export function decideExchange(ctx: BotContext): string[] {
  const isOmbre = ctx.seat === ctx.ombre;
  const isSolo =
    ctx.contract === "solo" || ctx.contract === "solo_oros";
  const isContrabola = ctx.contract === "contrabola";
  const isOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";

  if (isContrabola) {
    if (!isOmbre || ctx.talonLength === 0 || ctx.hand.length === 0) return [];
    return [pickLowest(ctx.hand, null).id];
  }

  const max = isOmbre
    ? isSolo
      ? 0
      : isOros
        ? 6
        : 8
    : 5;

  if (max === 0 || ctx.talonLength === 0 || ctx.hand.length === 0) return [];

  const trump = ctx.trump;
  if (!trump) return [];

  const trumpPoints = evalTrumpPointsExact(ctx.hand, trump);
  let desired = 0;

  if (isOmbre) {
    if (trumpPoints < 20) desired = max;
    else if (trumpPoints < 24) desired = Math.min(max, 6);
    else if (trumpPoints < 28) desired = Math.min(max, 4);
    else desired = Math.min(max, 2);
  } else {
    desired = trumpPoints < 16 ? Math.min(max, 4) : Math.min(max, 2);
  }

  desired = Math.min(desired, ctx.talonLength);
  if (desired <= 0) return [];

  const ranked = ctx.hand
    .slice()
    .sort((a, b) => keepValue(a, trump) - keepValue(b, trump));
  return ranked.slice(0, desired).map((c) => c.id);
}

function chooseLeadCard(ctx: BotContext, legal: Card[]): Card {
  const trumpCards = legal.filter((c) => isTrump(ctx.trump, c));
  const plainCards = legal.filter((c) => !isTrump(ctx.trump, c));
  const isOmbre = ctx.ombre !== null && ctx.seat === ctx.ombre;
  const trump = ctx.trump;

  if (trump && isOmbre && trumpCards.length >= 4) {
    const strongestTrump = pickHighest(trumpCards, trump);
    if (trumpOrderValue(strongestTrump, trump) >= 98) return strongestTrump;
  }

  if (trump && !isOmbre && trumpCards.length >= 5) {
    const strongestTrump = pickHighest(trumpCards, trump);
    if (trumpOrderValue(strongestTrump, trump) >= 99) return strongestTrump;
  }

  const pool = plainCards.length ? plainCards : legal;
  const bySuit = SUITS.map((s) => ({
    suit: s,
    cards: pool.filter((c) => c.s === s),
  }))
    .filter((x) => x.cards.length > 0)
    .sort((a, b) => b.cards.length - a.cards.length);

  if (bySuit.length) {
    const options = sortWeakToStrong(bySuit[0].cards, ctx.trump);
    return isOmbre ? options[options.length - 1] : options[0];
  }

  return pickLowest(legal, ctx.trump);
}

function chooseDiscard(legal: Card[], trump: Suit | null): Card {
  const nonTrump = legal.filter((c) => !isTrump(trump, c));
  if (nonTrump.length) return pickLowest(nonTrump, trump);
  return pickLowest(legal, trump);
}

export function decidePlay(ctx: BotContext): string | null {
  const led = ctx.table.length ? ctx.table[0] : null;
  const legal = legalPlays(ctx.trump, ctx.hand, led);
  if (!legal.length) return null;

  if (!led) {
    return chooseLeadCard(ctx, legal).id;
  }

  const winnerIdx = trickWinner(ctx.trump, ctx.table[0].s, ctx.table);
  const winningSeat = ctx.playOrder[winnerIdx] ?? null;
  const winningCards = legal.filter((c) => wouldBeatCurrent(ctx.table, ctx.trump, c));

  if (
    winningSeat !== null &&
    winningSeat !== ctx.seat &&
    sameTeam(ctx, winningSeat, ctx.seat)
  ) {
    const nonWinning = legal.filter((c) => !wouldBeatCurrent(ctx.table, ctx.trump, c));
    return chooseDiscard(nonWinning.length ? nonWinning : legal, ctx.trump).id;
  }

  if (winningCards.length) {
    return pickLowest(winningCards, ctx.trump).id;
  }

  return chooseDiscard(legal, ctx.trump).id;
}

export function botAct(ctx: BotContext): {
  type: "BID" | "CHOOSE_TRUMP" | "EXCHANGE" | "PLAY";
  payload: unknown;
} | null {
  switch (ctx.phase) {
    case "auction":
      return { type: "BID", payload: decideBid(ctx) };
    case "trump_choice":
      return { type: "CHOOSE_TRUMP", payload: decideTrump(ctx) };
    case "exchange":
      return { type: "EXCHANGE", payload: decideExchange(ctx) };
    case "play": {
      const cardId = decidePlay(ctx);
      return cardId ? { type: "PLAY", payload: cardId } : null;
    }
    default:
      return null;
  }
}
