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

export type BotPersonaId = "ilse" | "juan" | "guido" | "jorge" | "rafael";

export interface HumanLearningSignals {
  bidAggression: number;
  preferredTrump: Suit | null;
  exchangePressure: number;
}

interface BotPersona {
  id: BotPersonaId;
  name: string;
  bidNerve: number;
  overcallNerve: number;
  exchangeDepth: number;
  leadAggression: number;
  winRisk: number;
  learningSensitivity: number;
  suitBias: Partial<Record<Suit, number>>;
}

export const BOT_PERSONA_IDS: readonly BotPersonaId[] = [
  "ilse",
  "juan",
  "guido",
  "jorge",
  "rafael",
] as const;

const DEFAULT_HUMAN_SIGNALS: HumanLearningSignals = {
  bidAggression: 0.4,
  preferredTrump: null,
  exchangePressure: 0.4,
};

const BOT_PERSONAS: Record<BotPersonaId, BotPersona> = {
  ilse: {
    id: "ilse",
    name: "Ilse",
    bidNerve: 0.6,
    overcallNerve: 0.35,
    exchangeDepth: -1,
    leadAggression: 0.2,
    winRisk: 0.15,
    learningSensitivity: 0.85,
    suitBias: { espadas: 1.2, copas: 0.4 },
  },
  juan: {
    id: "juan",
    name: "Juan",
    bidNerve: -0.8,
    overcallNerve: 0.1,
    exchangeDepth: 1,
    leadAggression: 0.05,
    winRisk: 0,
    learningSensitivity: 1,
    suitBias: { oros: 0.6, bastos: -0.4 },
  },
  guido: {
    id: "guido",
    name: "Guido",
    bidNerve: 0,
    overcallNerve: 0,
    exchangeDepth: 0,
    leadAggression: 0,
    winRisk: 0,
    learningSensitivity: 0.55,
    suitBias: {},
  },
  jorge: {
    id: "jorge",
    name: "Jorge",
    bidNerve: 0.35,
    overcallNerve: 0.5,
    exchangeDepth: -1,
    leadAggression: 0.8,
    winRisk: 0.75,
    learningSensitivity: 0.6,
    suitBias: { espadas: 0.7, bastos: 0.5 },
  },
  rafael: {
    id: "rafael",
    name: "Rafael",
    bidNerve: 0.15,
    overcallNerve: 0.25,
    exchangeDepth: 0,
    leadAggression: 0.45,
    winRisk: 0.3,
    learningSensitivity: 1.15,
    suitBias: { oros: 0.5, copas: 0.3 },
  },
};

export function getBotPersona(id: BotPersonaId | null | undefined): BotPersona {
  return BOT_PERSONAS[id ?? "guido"] ?? BOT_PERSONAS.guido;
}

export function chooseBotPersona(existing: BotPersonaId[] = []): BotPersona {
  const available = BOT_PERSONA_IDS.filter((id) => !existing.includes(id));
  const pool = available.length ? available : BOT_PERSONA_IDS;
  const id = pool[Math.floor(Math.random() * pool.length)] ?? "guido";
  return getBotPersona(id);
}

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
  personaId: BotPersonaId | null;
  humanSignals: HumanLearningSignals;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getHumanSignals(ctx: BotContext): HumanLearningSignals {
  return {
    bidAggression: ctx.humanSignals?.bidAggression ?? DEFAULT_HUMAN_SIGNALS.bidAggression,
    preferredTrump: ctx.humanSignals?.preferredTrump ?? DEFAULT_HUMAN_SIGNALS.preferredTrump,
    exchangePressure: ctx.humanSignals?.exchangePressure ?? DEFAULT_HUMAN_SIGNALS.exchangePressure,
  };
}

export function decideBid(ctx: BotContext): Bid {
  const persona = getBotPersona(ctx.personaId);
  const humanSignals = getHumanSignals(ctx);
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
    const tablePressure = (humanSignals.bidAggression - 0.45) * 8 * persona.learningSensitivity;
    const effectiveMinStrength =
      candidate.minStrength - persona.bidNerve * 3 + tablePressure;
    if (bestProfile.strength < effectiveMinStrength) return false;
    if (openingStage && !candidate.openingAllowed) return false;
    return candidate.requires ? candidate.requires(bestSuit, bestProfile) : true;
  }).map((candidate) => candidate.bid);

  let bid: Bid;
  if (openingStage) {
    bid = qualifiedBids.length ? qualifiedBids[qualifiedBids.length - 1] : "pass";
  } else {
    const currentRank = BID_RANK[a.currentBid];
    const overcalls = qualifiedBids.filter((candidate) => {
        const rank = BID_RANK[candidate];
        return currentRank !== undefined && rank !== undefined && rank > currentRank;
      });
    if (!overcalls.length) {
      bid = "pass";
    } else {
      const scaledNerve = clamp(
        persona.overcallNerve - humanSignals.bidAggression * 0.2 * persona.learningSensitivity,
        0,
        1
      );
      const pickIndex = Math.round((overcalls.length - 1) * scaledNerve);
      bid = overcalls[pickIndex] ?? overcalls[0];
    }
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
  const persona = getBotPersona(ctx.personaId);
  const humanSignals = getHumanSignals(ctx);
  const needOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";
  if (needOros) return "oros";
  let bestSuit: Suit = "oros";
  let bestStrength = -Infinity;
  for (const s of SUITS) {
    const profile = evaluateSuitStrength(ctx.hand, s);
    const learnedSuitPressure =
      humanSignals.preferredTrump === s
        ? persona.learningSensitivity * (persona.id === "juan" ? 0.6 : persona.id === "rafael" ? 0.25 : -0.2)
        : 0;
    const weightedStrength =
      profile.strength + (persona.suitBias[s] ?? 0) + learnedSuitPressure;
    if (weightedStrength > bestStrength) {
      bestStrength = weightedStrength;
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
  const persona = getBotPersona(ctx.personaId);
  const humanSignals = getHumanSignals(ctx);
  const isOmbre = ctx.seat === ctx.ombre;
  const isSolo =
    ctx.contract === "solo" || ctx.contract === "solo_oros";
  const isContrabola = ctx.contract === "contrabola";
  const isVolteo = ctx.contract === "volteo";
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

  const exchangeAdjustment = Math.round(
    persona.exchangeDepth +
      (humanSignals.exchangePressure - 0.4) * 4 * persona.learningSensitivity
  );
  desired = clamp(desired + exchangeAdjustment, 0, max);
  desired = Math.min(desired, ctx.talonLength);
  if (isOmbre && isVolteo && desired <= 0 && ctx.talonLength > 0) {
    desired = 1;
  }
  if (desired <= 0) return [];

  const ranked = ctx.hand
    .slice()
    .sort((a, b) => keepValue(a, trump) - keepValue(b, trump));
  return ranked.slice(0, desired).map((c) => c.id);
}

function chooseLeadCard(ctx: BotContext, legal: Card[]): Card {
  const persona = getBotPersona(ctx.personaId);
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
    if (isOmbre) {
      return options[options.length - 1];
    }
    const defenderIndex = Math.min(
      options.length - 1,
      Math.floor((options.length - 1) * persona.leadAggression * 0.55)
    );
    return options[defenderIndex];
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
  const persona = getBotPersona(ctx.personaId);
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
    return (persona.winRisk > 0.6
      ? pickHighest(winningCards, ctx.trump)
      : pickLowest(winningCards, ctx.trump)).id;
  }

  return chooseDiscard(legal, ctx.trump).id;
}

function decideContractUpgrade(ctx: BotContext): Bid | "keep" {
  const choice = decideBid(ctx);
  if ((BID_RANK[choice] ?? -1) < 0) return "keep";
  return BID_RANK[choice] > BID_RANK[ctx.auction.currentBid] ? choice : "keep";
}

export function botAct(ctx: BotContext): {
  type: "BID" | "PENETRO_DECISION" | "CHOOSE_TRUMP" | "EXCHANGE" | "PLAY" | "UPGRADE_CONTRACT";
  payload: unknown;
} | null {
  switch (ctx.phase) {
    case "auction":
      return { type: "BID", payload: decideBid(ctx) };
    case "contract_upgrade":
      return { type: "UPGRADE_CONTRACT", payload: decideContractUpgrade(ctx) };
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
