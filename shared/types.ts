// ---- Card primitives ----
export type Suit = "oros" | "copas" | "espadas" | "bastos";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export interface Card { s: Suit; r: Rank; id: string; }

// ---- Seat model (perspective-neutral numeric indices) ----
export type SeatIndex = 0 | 1 | 2 | 3;
export const ALL_SEATS: readonly SeatIndex[] = [0, 1, 2, 3] as const;

// ---- Game mode ----
export type Mode = "tresillo" | "quadrille";

// ---- Contracts and Bids ----
export type Contract =
  | "entrada" | "volteo" | "solo"
  | "oros" | "solo_oros" | "bola" | "contrabola" | "penetro";

export type Bid =
  | "pass" | "entrada" | "oros" | "volteo"
  | "solo" | "solo_oros" | "bola" | "contrabola";

export const BID_ORDER: Bid[] = ["pass", "entrada", "oros", "volteo", "solo", "solo_oros", "bola"];
export const BID_VAL: Record<Bid, number> = {
  pass: 0, entrada: 1, oros: 2, volteo: 3, solo: 4, solo_oros: 5, bola: 6, contrabola: 99
};

// ---- Game phases ----
export type Phase =
  | "lobby" | "dealing" | "auction" | "trump_choice"
  | "exchange" | "play" | "scoring" | "post_hand" | "match_end";

// ---- Player info in state ----
export interface PlayerInfo {
  handle: string;
  isBot: boolean;
  connected: boolean;
  playerId: string | null;
}

// ---- Game state (sent to clients) ----
export interface GameState {
  roomId: string;
  roomCode: string;
  mode: Mode;
  phase: Phase;
  turn: SeatIndex | null;
  ombre: SeatIndex | null;
  trump: Suit | null;
  contract: Contract | null;
  resting: SeatIndex | null;
  handNo: number;
  table: Card[];
  playOrder: SeatIndex[];
  handsCount: Record<number, number>;
  scores: Record<number, number>;
  tricks: Record<number, number>;
  auction: {
    currentBid: Bid;
    currentBidder: SeatIndex | null;
    passed: SeatIndex[];
    order: SeatIndex[];
  };
  exchange: {
    current: SeatIndex | null;
    order: SeatIndex[];
    talonSize: number;
    completed: SeatIndex[];
  };
  players: Partial<Record<number, PlayerInfo>>;
  gameTarget: number;
  seq: number;
  rules: {
    espadaObligatoria: boolean;
    penetroEnabled: boolean;
  };
}

// ---- Client-to-Server messages ----
export type C2SMessage =
  | { type: "QUICK_PLAY"; mode: Mode }
  | { type: "CREATE_ROOM"; mode: Mode; target?: number }
  | { type: "JOIN_ROOM"; code: string }
  | { type: "SPECTATE"; roomId: string }
  | { type: "TAKE_SEAT"; seat: SeatIndex }
  | { type: "LEAVE_ROOM" }
  | { type: "START_GAME" }
  | { type: "BID"; value: Bid }
  | { type: "CHOOSE_TRUMP"; suit: Suit }
  | { type: "EXCHANGE"; discardIds: string[] }
  | { type: "PLAY"; cardId: string }
  | { type: "REMATCH" }
  | { type: "PING" };

// ---- Server-to-Client messages ----
export type S2CMessage =
  | { type: "WELCOME"; clientId: string; playerId: string | null }
  | { type: "ROOM_JOINED"; roomId: string; code: string; seat: SeatIndex | null }
  | { type: "ROOM_LEFT" }
  | { type: "STATE"; state: GameState; hand: Card[] | null }
  | { type: "EVENT"; name: string; payload: Record<string, unknown> }
  | { type: "ERROR"; code: string; message?: string }
  | { type: "PONG" }
  | { type: "QUEUE_UPDATE"; position: number; mode: Mode };
