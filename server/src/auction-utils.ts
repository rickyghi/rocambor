/**
 * auction-utils.ts — Pure auction helper functions.
 *
 * Bid ranking, validation, and contract mapping.
 * No side effects — used by Room and bot.ts.
 */

import type { Bid, Contract } from "../../shared/types";
import { AUCTION_RANKED_BIDS } from "../../shared/types";

/** Return the rank index of a ranked bid, or -1 if not ranked. */
export function bidRank(value: Bid): number {
  return AUCTION_RANKED_BIDS.indexOf(value);
}

/** Check whether a bid participates in the ranked bid ladder. */
export function isRankedBid(value: Bid): boolean {
  return bidRank(value) >= 0;
}

/** Map a winning auction bid to its contract type. */
export function mapBidToContract(b: Bid): Contract {
  switch (b) {
    case "entrada":
      return "entrada";
    case "oros":
      return "oros";
    case "volteo":
      return "volteo";
    case "solo":
      return "solo";
    case "solo_oros":
      return "solo_oros";
    case "bola":
      return "bola";
    case "contrabola":
      return "contrabola";
    default:
      return "entrada";
  }
}
