/**
 * scoring.ts — Pure scoring calculations for hand results.
 *
 * Takes game state (contract, tricks, ombre, active seats) and returns
 * the result, points, award recipients, and score deltas.
 * No side effects — Room applies the deltas and broadcasts events.
 */

import type { SeatIndex, Contract } from "../../shared/types";

export interface HandScoreInput {
  contract: Contract;
  ombre: SeatIndex;
  activeSeats: SeatIndex[];
  tricks: Record<SeatIndex, number>;
  trickWinners: SeatIndex[];
}

export interface HandScoreResult {
  result: string;
  points: number;
  award: SeatIndex[];
  /** Per-seat score deltas to add */
  deltas: Partial<Record<SeatIndex, number>>;
}

/**
 * Calculate the hand score for a penetro round (all 4 seats compete).
 * Winner = most tricks; tie-break = latest trick winner among tied.
 */
export function scorePenetro(
  tricks: Record<SeatIndex, number>,
  allSeats: SeatIndex[],
  trickWinners: SeatIndex[]
): HandScoreResult {
  let maxTricks = -1;
  for (const s of allSeats) {
    if (tricks[s] > maxTricks) maxTricks = tricks[s];
  }

  const tied = allSeats.filter((s) => tricks[s] === maxTricks);
  let winner: SeatIndex = tied[0];

  if (tied.length > 1) {
    const tiedSet = new Set(tied);
    for (let i = trickWinners.length - 1; i >= 0; i--) {
      if (tiedSet.has(trickWinners[i])) {
        winner = trickWinners[i];
        break;
      }
    }
  }

  return {
    result: "penetro",
    points: 2,
    award: [winner],
    deltas: { [winner]: 2 },
  };
}

/**
 * Calculate the hand score for bola contract.
 * Ombre must win all 9 tricks; failure awards 2 pts to each defender.
 */
function scoreBola(
  ombre: SeatIndex,
  ombreTricks: number,
  defenders: SeatIndex[]
): HandScoreResult {
  const ok = ombreTricks === 9;
  if (ok) {
    return {
      result: "bola_made",
      points: 6,
      award: [ombre],
      deltas: { [ombre]: 6 },
    };
  }
  const deltas: Partial<Record<SeatIndex, number>> = {};
  for (const d of defenders) deltas[d] = 2;
  return {
    result: "bola_failed",
    points: 2,
    award: defenders,
    deltas,
  };
}

/**
 * Calculate the hand score for contrabola contract.
 * Ombre must win 0 tricks; failure awards 1 pt to each defender.
 */
function scoreContrabola(
  ombre: SeatIndex,
  ombreTricks: number,
  defenders: SeatIndex[]
): HandScoreResult {
  const ok = ombreTricks === 0;
  if (ok) {
    return {
      result: "contrabola_made",
      points: 4,
      award: [ombre],
      deltas: { [ombre]: 4 },
    };
  }
  const deltas: Partial<Record<SeatIndex, number>> = {};
  for (const d of defenders) deltas[d] = 1;
  return {
    result: "contrabola_failed",
    points: 1,
    award: defenders,
    deltas,
  };
}

/**
 * Calculate the hand score for standard contracts (entrada, oros, volteo, solo, solo_oros).
 * - Sacada: ombre ≥5 tricks → 1–4 pts (bonus for oros/solo_oros)
 * - Codille: a defender ≥5 tricks → 2 pts to that defender
 * - Puesta: nobody ≥5 → 1 pt to each defender
 */
function scoreStandard(
  contract: Contract,
  ombre: SeatIndex,
  ombreTricks: number,
  defenders: SeatIndex[],
  tricks: Record<SeatIndex, number>
): HandScoreResult {
  if (ombreTricks >= 5) {
    let points = ombreTricks === 9 ? 4 : ombreTricks >= 7 ? 2 : 1;
    if (contract === "oros") points += 1;
    if (contract === "solo_oros") points += 1;
    return {
      result: "sacada",
      points,
      award: [ombre],
      deltas: { [ombre]: points },
    };
  }

  const maxDef = Math.max(...defenders.map((s) => tricks[s]));
  if (maxDef >= 5) {
    const winner = defenders.find((s) => tricks[s] === maxDef)!;
    return {
      result: "codille",
      points: 2,
      award: [winner],
      deltas: { [winner]: 2 },
    };
  }

  const deltas: Partial<Record<SeatIndex, number>> = {};
  for (const d of defenders) deltas[d] = 1;
  return {
    result: "puesta",
    points: 1,
    award: defenders,
    deltas,
  };
}

/**
 * Main scoring dispatcher. Returns the hand result without side effects.
 */
export function calculateHandScore(input: HandScoreInput): HandScoreResult {
  const { contract, ombre, activeSeats, tricks } = input;
  const ombreTricks = tricks[ombre];
  const defenders = activeSeats.filter((s) => s !== ombre);

  switch (contract) {
    case "bola":
      return scoreBola(ombre, ombreTricks, defenders);
    case "contrabola":
      return scoreContrabola(ombre, ombreTricks, defenders);
    default:
      return scoreStandard(contract, ombre, ombreTricks, defenders, tricks);
  }
}
