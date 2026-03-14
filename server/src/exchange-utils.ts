/**
 * exchange-utils.ts — Pure exchange calculation functions.
 *
 * Computes exchange limits and exchange order without side effects.
 */

import type { SeatIndex, Contract } from "../../shared/types";

/**
 * Calculate the min/max cards a seat can exchange given the contract.
 *
 * Rules:
 * - Bola: nobody exchanges
 * - Contrabola: ombre exchanges exactly 1; others 0
 * - Solo/Solo_oros: ombre doesn't exchange; defenders exchange up to hand size or talon
 * - Volteo: ombre must discard at least 1 card after keeping the revealed talon card
 * - Normal (entrada/oros/volteo): ombre up to 8 (or 6 if oros); defenders up to hand/talon
 */
export function exchangeLimitsForSeat(
  contract: Contract,
  seat: SeatIndex,
  ombre: SeatIndex,
  handLength: number,
  talonLength: number
): { min: number; max: number } {
  const isOmbre = seat === ombre;
  const isSolo = contract === "solo" || contract === "solo_oros";
  const isOros = contract === "oros" || contract === "solo_oros";

  if (contract === "bola") return { min: 0, max: 0 };

  if (contract === "contrabola") {
    return isOmbre ? { min: 1, max: 1 } : { min: 0, max: 0 };
  }

  if (isOmbre) {
    if (isSolo) return { min: 0, max: 0 };
    if (contract === "volteo") {
      return { min: talonLength > 0 ? 1 : 0, max: Math.min(8, talonLength) };
    }
    return { min: 0, max: Math.min(isOros ? 6 : 8, talonLength) };
  }

  return {
    min: 0,
    max: Math.min(handLength, talonLength),
  };
}

/**
 * Compute the exchange order for a hand.
 *
 * - Bola: empty (no exchange)
 * - Contrabola: ombre only
 * - Solo/Solo_oros: defenders only (ombre skipped)
 * - Normal: ombre first, then defenders clockwise
 */
export function computeExchangeOrder(
  contract: Contract,
  ombre: SeatIndex,
  activeOrderFromOmbre: SeatIndex[]
): SeatIndex[] {
  if (contract === "bola") return [];

  if (contract === "contrabola") return [ombre];

  const isSolo = contract === "solo" || contract === "solo_oros";
  if (isSolo) return activeOrderFromOmbre.filter((s) => s !== ombre);

  return activeOrderFromOmbre;
}
