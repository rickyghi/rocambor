import { Card, Suit, Bid, SeatIndex, BID_VAL } from "../../shared/types";
import {
  evalTrumpPointsExact,
  legalPlays,
  SUITS,
} from "./engine";

function rand<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
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

export function decideBid(ctx: BotContext): Bid {
  const hand0 = ctx.originalHand.length > 0 ? ctx.originalHand : ctx.hand;
  const { bestSuit, points: bestPts } = evaluateHand(hand0);

  const threshold = bestSuit === "oros" || bestSuit === "copas" ? 23 : 22;
  let bid: Bid = "pass";

  if (bestPts >= threshold + 12) bid = "bola";
  else if (bestPts >= threshold + 6)
    bid = bestSuit === "oros" ? "solo_oros" : "solo";
  else if (bestPts >= threshold + 3)
    bid = bestSuit === "oros" ? "oros" : "volteo";
  else if (bestPts >= threshold)
    bid = bestSuit === "oros" ? "oros" : "entrada";

  // Ensure bid beats current
  const a = ctx.auction;
  if (bid !== "pass" && BID_VAL[bid] <= BID_VAL[a.currentBid]) {
    bid = "pass";
  }

  // Contrabola edge case
  const allPass =
    a.currentBid === "pass" && a.passed.length === a.order.length - 1;
  const isLast =
    a.order.indexOf(ctx.seat) === a.order.length - 1;

  if (allPass && isLast && bid === "pass" && Math.random() < 0.1) {
    bid = "contrabola";
  }

  return bid;
}

export function decideTrump(ctx: BotContext): Suit {
  const needOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";
  if (needOros) return "oros";
  const { bestSuit } = evaluateHand(ctx.hand);
  return bestSuit;
}

export function decideExchange(ctx: BotContext): string[] {
  const isOmbre = ctx.seat === ctx.ombre;
  const isSolo =
    ctx.contract === "solo" || ctx.contract === "solo_oros";
  const isOros =
    ctx.contract === "oros" || ctx.contract === "solo_oros";

  const max = isOmbre
    ? isSolo
      ? 0
      : isOros
        ? 6
        : 8
    : 5;

  const n = Math.min(max, ctx.talonLength, Math.floor(Math.random() * 3));
  // Discard weakest cards (first N in hand, simplistic)
  return ctx.hand.slice(0, n).map((c) => c.id);
}

export function decidePlay(ctx: BotContext): string | null {
  const led = ctx.table.length ? ctx.table[0] : null;
  const legal = legalPlays(ctx.trump, ctx.hand, led);
  const card = legal[0];
  return card ? card.id : null;
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
