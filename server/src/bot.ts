import { Card, Suit, Bid, SeatIndex, AUCTION_RANKED_BIDS } from "../../shared/types";
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

const BID_RANK: Record<string, number> = AUCTION_RANKED_BIDS.reduce(
  (acc, bid, idx) => {
    acc[bid] = idx;
    return acc;
  },
  {} as Record<string, number>
);

interface SuitStrengthProfile {
  points: number;
  trumps: number;
  matadors: number;
  strength: number;
}

const BID_THRESHOLDS: Array<{
  bid: Bid;
  minStrength: number;
  openingAllowed: boolean;
  requires?: (bestSuit: Suit, profile: SuitStrengthProfile) => boolean;
}> = [
  { bid: "entrada", minStrength: 26, openingAllowed: true },
  {
    bid: "oros",
    minStrength: 34,
    openingAllowed: false,
    requires: (bestSuit) => bestSuit === "oros",
  },
  { bid: "volteo", minStrength: 36, openingAllowed: true },
  { bid: "solo", minStrength: 44, openingAllowed: true },
  {
    bid: "solo_oros",
    minStrength: 56,
    openingAllowed: false,
    requires: (bestSuit, profile) =>
      bestSuit === "oros" &&
      profile.points >= 48 &&
      profile.trumps >= 6 &&
      profile.matadors >= 2,
  },
];

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

function evaluateSuitStrength(hand: Card[], suit: Suit): SuitStrengthProfile {
  const points = evalTrumpPointsExact(hand, suit);
  const trumps = hand.filter((c) => isTrump(suit, c)).length;
  const matadors = hand.filter((c) => isMatador(suit, c)).length;
  return {
    points,
    trumps,
    matadors,
    strength: points + matadors * 4 + Math.max(0, trumps - 3) * 1.5,
  };
}

function countMatadors(cards: Card[], trump: Suit): number {
  return cards.filter((c) => isMatador(trump, c)).length;
}

export function decideBid(ctx: BotContext): Bid {
  const hand0 = ctx.originalHand.length > 0 ? ctx.originalHand : ctx.hand;
  let bestSuit: Suit = "oros";
  let bestProfile: SuitStrengthProfile = {
    points: -Infinity,
    trumps: 0,
    matadors: 0,
    strength: -Infinity,
  };
  for (const s of SUITS) {
    const profile = evaluateSuitStrength(hand0, s);
    if (profile.strength > bestProfile.strength) {
      bestProfile = profile;
      bestSuit = s;
    }
  }

  const a = ctx.auction;
  const openingStage = a.currentBid === "pass";
  const qualifiedBids = BID_THRESHOLDS.filter((candidate) => {
    if (bestProfile.strength < candidate.minStrength) return false;
    if (openingStage && !candidate.openingAllowed) return false;
    return candidate.requires ? candidate.requires(bestSuit, bestProfile) : true;
  }).map((candidate) => candidate.bid);

  let bid: Bid;
  if (openingStage) {
    bid = qualifiedBids.length ? qualifiedBids[qualifiedBids.length - 1] : "pass";
  } else {
    const currentRank = BID_RANK[a.currentBid];
    bid =
      qualifiedBids.find((candidate) => {
        const rank = BID_RANK[candidate];
        return currentRank !== undefined && rank !== undefined && rank > currentRank;
      }) ?? "pass";
  }

  // Contrabola edge case
  const allPass =
    a.currentBid === "pass" && a.passed.length === a.order.length - 1;
  const isLast =
    a.order.indexOf(ctx.seat) === a.order.length - 1;

  if (allPass && isLast && bid === "pass") {
    if (bestProfile.strength >= 24) {
      bid = "entrada";
    } else if (Math.random() < 0.04) {
      bid = "contrabola";
    }
  }

  // Weak hands should still pass when table is already competitive
  const currentRank = BID_RANK[a.currentBid];
  if (
    bid !== "pass" &&
    bid !== "contrabola" &&
    bestProfile.strength < 28 &&
    currentRank !== undefined &&
    currentRank >= BID_RANK["entrada"]
  ) {
    bid = "pass";
  }

  return bid;
}

export function decidePenetroDecision(): boolean {
  // Conservative policy for resting bot: decline explicit penetro.
  return false;
}

export function decideTrump(ctx: BotContext): Suit {
  const needOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";
  if (needOros) return "oros";
  let bestSuit: Suit = "oros";
  let bestStrength = -Infinity;
  for (const s of SUITS) {
    const profile = evaluateSuitStrength(ctx.hand, s);
    if (profile.strength > bestStrength) {
      bestStrength = profile.strength;
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
    return [pickHighest(ctx.hand, null).id];
  }

  const max = isOmbre
    ? isSolo
      ? 0
      : isOros
        ? 6
        : 8
    : Math.min(ctx.hand.length, ctx.talonLength);

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
    if (trumpPoints < 12) desired = max;
    else if (trumpPoints < 16) desired = Math.min(max, 6);
    else if (trumpPoints < 20) desired = Math.min(max, 4);
    else desired = Math.min(max, 2);
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

  if (trump && isOmbre && trumpCards.length >= 4 && countMatadors(trumpCards, trump) >= 2) {
    const strongestTrump = pickHighest(trumpCards, trump);
    if (trumpOrderValue(strongestTrump, trump) >= 98) return strongestTrump;
  }

  if (trump && !isOmbre && trumpCards.length >= 5 && countMatadors(trumpCards, trump) >= 2) {
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
  if (nonTrump.length) {
    const suitCounts = new Map<Suit, number>();
    for (const card of nonTrump) {
      suitCounts.set(card.s, (suitCounts.get(card.s) ?? 0) + 1);
    }

    const sorted = nonTrump.slice().sort((a, b) => {
      const keepA = trump ? keepValue(a, trump) : cardPower(a, trump);
      const keepB = trump ? keepValue(b, trump) : cardPower(b, trump);
      if (keepA !== keepB) return keepA - keepB;

      const lenA = suitCounts.get(a.s) ?? 0;
      const lenB = suitCounts.get(b.s) ?? 0;
      if (lenA !== lenB) return lenA - lenB;

      return cardPower(a, trump) - cardPower(b, trump);
    });
    return sorted[0];
  }
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
  type: "BID" | "PENETRO_DECISION" | "CHOOSE_TRUMP" | "EXCHANGE" | "PLAY" | "UPGRADE_CONTRACT";
  payload: unknown;
} | null {
  switch (ctx.phase) {
    case "auction":
      return { type: "BID", payload: decideBid(ctx) };
    case "contract_upgrade":
      return { type: "UPGRADE_CONTRACT", payload: "keep" };
    case "penetro_choice":
      return { type: "PENETRO_DECISION", payload: decidePenetroDecision() };
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
