// ---- Card primitives ----
export type Suit = "oros" | "copas" | "espadas" | "bastos";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export interface Card { s: Suit; r: Rank; id: string; }

// ---- Seat model (perspective-neutral numeric indices) ----
export type SeatIndex = 0 | 1 | 2 | 3;
export const ALL_SEATS: readonly SeatIndex[] = [0, 1, 2, 3] as const;

// ---- Game mode ----
export type Mode = "tresillo" | "quadrille";
export type StakeMode = "free" | "tokens";

// ---- Contracts and Bids ----
export type Contract =
  | "entrada" | "volteo" | "solo"
  | "oros" | "solo_oros" | "bola" | "contrabola" | "penetro";

export type Bid =
  | "pass" | "entrada" | "oros" | "volteo"
  | "solo" | "solo_oros" | "bola" | "contrabola";

export const BID_ORDER: Bid[] = ["pass", "entrada", "oros", "volteo", "solo", "solo_oros", "contrabola"];
export const AUCTION_RANKED_BIDS: Bid[] = ["entrada", "oros", "volteo", "solo", "solo_oros"];
export const BID_VAL: Record<Bid, number> = {
  pass: 0, entrada: 1, oros: 2, volteo: 3, solo: 4, solo_oros: 5, bola: -1, contrabola: 99
};

// ---- Game phases ----
export type Phase =
  | "lobby" | "dealing" | "auction" | "contract_upgrade" | "trump_choice"
  | "exchange" | "penetro_choice" | "play" | "scoring" | "post_hand" | "match_end";

// ---- Player info in state ----
export interface PlayerInfo {
  handle: string;
  isBot: boolean;
  connected: boolean;
  playerId: string | null;
}

export interface AuthUserSummary {
  id: string;
  email: string | null;
}

export interface WsTicketResponse {
  ticket: string;
  expiresAt: string;
  user: AuthUserSummary;
}

export type AnimationSpeed = "slow" | "normal" | "fast";
export type TableThemeKey = "classic" | "royal" | "rustic";

export interface PersistedPlayerSettings {
  locale: "en" | "es";
  soundEnabled: boolean;
  espadaObligatoria: boolean;
  soundVolume: number;
  colorblindMode: boolean;
  tableTheme: TableThemeKey;
  cardSkin: string;
  animationSpeed: AnimationSpeed;
  reduceMotion: boolean;
}

export interface MeResponse {
  playerId: string;
  email: string | null;
  name: string;
  avatar: string;
  createdAt: string;
  gamesPlayed: number;
  wins: number;
  elo: number;
  lastPlayed: string | null;
  settings: PersistedPlayerSettings;
  bootstrapSuggested: boolean;
}

export interface UpdateMeProfileRequest {
  name?: string;
  avatar?: string;
  settings?: Partial<PersistedPlayerSettings>;
}

export interface WalletResponse {
  playerId: string;
  balance: number;
  currency: "friendly_tokens";
  rescueThreshold: number;
  rescueTarget: number;
  rescueCooldownHours: number;
  canClaimRescue: boolean;
  rescueAvailableAt: string | null;
  lastRescueAt: string | null;
}

export interface ProfileMatchHistoryEntry {
  id: string;
  mode: Mode;
  outcome: "win" | "loss";
  role: "ombre" | "contra" | "resting";
  score: number;
  recordedAt: string;
  placement: number | null;
  stakeMode: StakeMode;
  ante: number;
  pot: number;
}

export interface MatchHistoryResponse {
  matches: ProfileMatchHistoryEntry[];
  count: number;
  generatedAt: string;
}

// ---- Game state (sent to clients) ----
export interface GameState {
  roomId: string;
  roomCode: string;
  roomName?: string | null;
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
    revealedCard: Card | null;
  };
  players: Partial<Record<number, PlayerInfo>>;
  gameTarget: number;
  seq: number;
  rules: {
    espadaObligatoria: boolean;
    penetroEnabled: boolean;
  };
  stakes: {
    stakeMode: StakeMode;
    currency: "friendly_tokens" | null;
    ante: number;
    pot: number;
    settlement: "winner_takes_pot" | null;
  };
  hostSeat?: SeatIndex | null;
  turnDeadline?: number;
  legalIds?: string[];
}

// ---- Client-to-Server messages ----
export type C2SMessage =
  | { type: "QUICK_PLAY"; mode: Mode; stakeMode?: StakeMode }
  | {
      type: "CREATE_ROOM";
      mode: Mode;
      stakeMode?: StakeMode;
      target?: number;
      roomName?: string;
      rules?: {
        espadaObligatoria?: boolean;
      };
    }
  | { type: "JOIN_ROOM"; code: string }
  | { type: "SPECTATE"; roomId: string }
  | { type: "TAKE_SEAT"; seat: SeatIndex }
  | { type: "LEAVE_ROOM" }
  | { type: "START_GAME" }
  | { type: "BID"; value: Bid; suit?: Suit }
  | { type: "CHOOSE_TRUMP"; suit: Suit }
  | { type: "EXCHANGE"; discardIds: string[] }
  | { type: "EXCHANGE_DEFER" }
  | { type: "PENETRO_DECISION"; accept: boolean }
  | { type: "CLOSE_HAND" }
  | { type: "UPGRADE_CONTRACT"; value: Bid | "keep" }
  | { type: "PLAY"; cardId: string }
  | { type: "REMATCH" }
  | { type: "LEAVE_QUEUE" }
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
