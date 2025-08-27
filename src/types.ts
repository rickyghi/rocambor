export type Suit = "oros" | "copas" | "espadas" | "bastos";
export type Rank = 1|2|3|4|5|6|7|10|11|12; // Spanish 40-card
export interface Card { s: Suit; r: Rank; id: string }

export type Seat = "you" | "left" | "across" | "right";
export const SEATS: Seat[] = ["you","left","across","right"];

export type Contract =
  | "entrada" | "volteo" | "solo"
  | "oros" | "solo_oros" | "bola" | "contrabola" | "penetro";

export type Bid =
  | "pass" | "entrada" | "oros" | "volteo" | "solo" | "solo_oros" | "bola" | "contrabola";

export const BID_ORDER: Bid[] = ["pass","entrada","oros","volteo","solo","solo_oros","bola"];
export const BID_VAL: Record<Bid, number> = {
  pass:0, entrada:1, oros:2, volteo:3, solo:4, solo_oros:5, bola:6, contrabola:99
};

export interface State {
  roomId: string;
  mode: "tresillo" | "quadrille";
  phase: "lobby" | "dealing" | "auction" | "trump_choice" | "exchange" | "play" | "scoring";
  turn: Seat | null;
  ombre: Seat | null;
  trump: Suit | null;
  contract: Contract | null;
  resting: Seat | null;
  handNo: number;
  table: Card[];
  playOrder: Seat[];
  handsCount: Record<Seat, number>;
  scores: Record<Seat, number>;
  tricks: Record<Seat, number>;
  auction: { currentBid: Bid; currentBidder: Seat | null; passed: Seat[]; order: Seat[]; };
  exchange: { current: Seat | null; order: Seat[]; talonSize: number; completed: Seat[]; };
  gameTarget: number;
  seq: number;
  rules: { espadaObligatoria: boolean; penetroEnabled: boolean };
}
