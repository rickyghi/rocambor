import { WebSocket } from "ws";
import {
  Card,
  Suit,
  SeatIndex,
  ALL_SEATS,
  GameState,
  Bid,
  Contract,
  Mode,
  PlayerInfo,
  S2CMessage,
} from "../../shared/types";
import { makeDeck, legalPlays, trickWinner, generateSeed } from "./engine";
import { botAct, BotContext } from "./bot";
import {
  saveHandResult,
  saveMatchResult,
  createRoomRecord,
} from "./persistence";
import { bidRank, isRankedBid, mapBidToContract } from "./auction-utils";
import { calculateHandScore, scorePenetro } from "./scoring";
import { exchangeLimitsForSeat, computeExchangeOrder } from "./exchange-utils";

const TURN_MS = 25_000;
const BOT_DELAY_MIN = 600;
const BOT_DELAY_MAX = 1200;
const POST_HAND_DELAY = 3000;
export interface Conn {
  id: string;
  ws: WebSocket;
  seat: SeatIndex | null;
  handle: string;
  isBot: boolean;
  playerId: string | null;
  isSpectator: boolean;
  connected: boolean;
  lastSeen: number;
}

export interface RoomConfig {
  mode: Mode;
  code: string;
  gameTarget?: number;
  creatorId: string;
  roomName?: string;
  rules?: {
    espadaObligatoria?: boolean;
  };
}

export class Room {
  id: string;
  code: string;
  conns: Conn[] = [];
  state: GameState;
  hands: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  original: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  talon: Card[] = [];
  table: Card[] = [];
  playOrder: SeatIndex[] = [];
  trickWinners: SeatIndex[] = [];
  timer: NodeJS.Timeout | null = null;
  private timerEpoch = 0;
  private botEpoch = 0;
  private postHandTimer: NodeJS.Timeout | null = null;
  restIndex = -1;
  lastActivity: number = Date.now();
  private seed: string = "";
  private hostSeat: SeatIndex | null = null;
  private rematchVotes = new Set<SeatIndex>();
  private soloTrumpBySeat: Partial<Record<SeatIndex, Suit>> = {};

  constructor(id: string, config: RoomConfig) {
    this.id = id;
    this.code = config.code;
    const roomName = config.roomName?.trim() || null;
    this.state = {
      roomId: id,
      roomCode: config.code,
      roomName,
      mode: config.mode,
      phase: "lobby",
      turn: null,
      ombre: null,
      trump: null,
      contract: null,
      resting: null,
      handNo: 1,
      table: [],
      playOrder: [],
      handsCount: { 0: 0, 1: 0, 2: 0, 3: 0 },
      scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      tricks: { 0: 0, 1: 0, 2: 0, 3: 0 },
      auction: { currentBid: "pass", currentBidder: null, passed: [], order: [] },
      exchange: { current: null, order: [], talonSize: 0, completed: [] },
      players: {},
      gameTarget: config.gameTarget || 12,
      seq: 0,
      rules: {
        espadaObligatoria: config.rules?.espadaObligatoria ?? true,
        penetroEnabled: true,
      },
    };

    createRoomRecord(id, config.mode).catch(() => {});
  }

  // ---- Helpers ----
  private send(conn: Conn, msg: S2CMessage): void {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(JSON.stringify(msg));
      } catch (error) {
        console.error(`[room] Failed to send to ${conn.id}:`, error);
      }
    }
  }

  private shouldUseTurnDeadline(seat: SeatIndex | null): boolean {
    const conn = this.seatConn(seat);
    return !!conn && (conn.isBot || !conn.connected);
  }

  broadcastState(): void {
    if (this.hostSeat === null) {
      const firstHuman = this.conns.find(
        (c) => !c.isBot && !c.isSpectator && c.seat !== null && c.connected
      );
      this.hostSeat = firstHuman?.seat ?? null;
    }
    this.updatePlayersInfo();
    this.state.hostSeat = this.hostSeat;
    for (const c of this.conns) {
      const hand = c.seat !== null && !c.isSpectator ? this.hands[c.seat] || null : null;
      const baseState = this.shouldUseTurnDeadline(this.state.turn)
        ? this.state
        : { ...this.state, turnDeadline: undefined };
      let stateToSend = baseState;

      // Send legal play hints to the player whose turn it is
      if (
        this.state.phase === "play" &&
        c.seat === this.state.turn &&
        hand
      ) {
        const ledCard = this.table.length > 0 ? this.table[0] : null;
        const legal = legalPlays(this.state.trump, hand, ledCard);
        stateToSend = { ...baseState, legalIds: legal.map((card) => card.id) };
      }

      this.send(c, { type: "STATE", state: stateToSend, hand });
    }
  }

  private patch(p: Partial<GameState>): void {
    Object.assign(this.state, p);
    const turnConn = this.seatConn(this.state.turn);
    if (turnConn && !turnConn.isBot && turnConn.connected) {
      delete this.state.turnDeadline;
    }
    this.state.seq++;
    this.lastActivity = Date.now();
    this.broadcastState();
  }

  private seatConn(seat: SeatIndex | null): Conn | undefined {
    if (seat === null) return undefined;
    return this.conns.find((c) => c.seat === seat && !c.isSpectator);
  }

  private event(name: string, payload: Record<string, unknown>): void {
    this.conns.forEach((c) => this.send(c, { type: "EVENT", name, payload }));
  }

  private updatePlayersInfo(): void {
    const players: Partial<Record<number, PlayerInfo>> = {};
    for (const c of this.conns) {
      if (c.seat !== null && !c.isSpectator) {
        players[c.seat] = {
          handle: c.handle,
          isBot: c.isBot,
          connected: c.connected,
          playerId: c.playerId,
        };
      }
    }
    this.state.players = players;
  }

  private errorSeat(seat: SeatIndex, code: string, message?: string): void {
    const c = this.conns.find((x) => x.seat === seat);
    if (c) this.send(c, { type: "ERROR", code, message });
  }

  humanCount(): number {
    return this.conns.filter((c) => !c.isBot && !c.isSpectator && c.seat !== null && c.connected).length;
  }

  /** Remove disconnected human players whose reconnect TTL has expired. */
  cleanDisconnected(): void {
    const now = Date.now();
    const TTL = 120_000;
    const before = this.conns.length;
    this.conns = this.conns.filter((c) => {
      if (!c.connected && !c.isBot && c.seat !== null && (now - c.lastSeen) > TTL) {
        console.log(`[room] Removing stale disconnected player ${c.handle} from seat ${c.seat}`);
        return false;
      }
      return true;
    });
    if (this.conns.length !== before) {
      this.updatePlayersInfo();
      this.broadcastState();
    }
  }

  // ---- Seat management ----
  restSeat(): SeatIndex {
    if (this.state.mode === "quadrille") {
      return (((this.restIndex % 4) + 4) % 4) as SeatIndex;
    }
    return 3 as SeatIndex; // In tresillo, seat 3 always rests
  }

  /** All seats that need a player (for lobby/seating). Quadrille: 4 seats, Tresillo: 3. */
  allSeats(): SeatIndex[] {
    if (this.state.mode === "quadrille") return ALL_SEATS.slice() as SeatIndex[];
    return [0, 1, 2] as SeatIndex[];
  }

  /** Seats actively playing the current hand (excludes resting seat). */
  seatsActive(): SeatIndex[] {
    if (this.state.contract === "penetro") return ALL_SEATS.slice() as SeatIndex[];
    const rest = this.restSeat();
    return (ALL_SEATS.filter((s) => s !== rest) as SeatIndex[]).slice(0, 3);
  }

  nextActive(seat: SeatIndex): SeatIndex {
    const active = this.seatsActive();
    for (let step = 1; step <= 4; step++) {
      const candidate = ((seat + step) % 4) as SeatIndex;
      if (active.includes(candidate)) return candidate;
    }
    return active[0];
  }

  // ---- Connection management ----
  attach(ws: WebSocket, clientId?: string, playerId?: string | null): Conn {
    const conn: Conn = {
      id: clientId || Math.random().toString(36).slice(2),
      ws,
      seat: null,
      handle: `Player ${Math.floor(Math.random() * 999)}`,
      isBot: false,
      playerId: playerId || null,
      isSpectator: false,
      connected: true,
      lastSeen: Date.now(),
    };

    this.conns.push(conn);
    this.send(conn, {
      type: "WELCOME",
      clientId: conn.id,
      playerId: conn.playerId,
    });

    console.log(`[room] Client ${conn.id} attached to room ${this.id}`);
    return conn;
  }

  detach(conn: Conn): void {
    const leavingSeat = conn.seat;
    const replaceWithBot =
      leavingSeat !== null &&
      !conn.isBot &&
      !conn.isSpectator &&
      this.state.phase !== "lobby";

    if (leavingSeat !== null) {
      console.log(`[room] Player ${conn.handle} (seat ${leavingSeat}) left room ${this.id}`);
      conn.connected = false;
      this.event("PLAYER_LEFT", { seat: leavingSeat, handle: conn.handle });
    }
    this.conns = this.conns.filter((c) => c !== conn);

    if (replaceWithBot) {
      const bot = this.makeBot();
      this.conns.push(bot);
      this.assignSeat(bot, leavingSeat);
    }

    // Transfer host if the leaving player was host
    if (leavingSeat !== null && leavingSeat === this.hostSeat) {
      const nextHuman = this.conns.find(
        (c) => !c.isBot && !c.isSpectator && c.seat !== null && c.connected
      );
      this.hostSeat = nextHuman?.seat ?? null;
    }
    this.lastActivity = Date.now();
  }

  markDisconnected(conn: Conn): void {
    if (!this.conns.includes(conn)) return;

    conn.connected = false;
    conn.lastSeen = Date.now();

    if (conn.seat !== null && conn.seat === this.hostSeat) {
      const nextHuman = this.conns.find(
        (c) =>
          c !== conn &&
          !c.isBot &&
          !c.isSpectator &&
          c.seat !== null &&
          c.connected
      );
      this.hostSeat = nextHuman?.seat ?? null;
      this.event("HOST_CHANGED", { hostSeat: this.hostSeat });
    }

    this.broadcastState();
  }

  tryReconnect(
    clientId: string,
    ws: WebSocket,
    seat: SeatIndex,
    playerId?: string | null
  ): Conn | null {
    // Check if seat is still occupied by a disconnected connection
    const existing = this.conns.find(
      (c) => c.seat === seat && !c.connected && !c.isBot
    );

    if (existing) {
      // Restore the old connection with new WebSocket
      existing.ws = ws;
      existing.connected = true;
      existing.lastSeen = Date.now();
      existing.id = clientId;

      this.send(existing, {
        type: "WELCOME",
        clientId: existing.id,
        playerId: existing.playerId,
      });
      this.send(existing, {
        type: "ROOM_JOINED",
        roomId: this.id,
        code: this.code,
        seat: existing.seat,
      });

      // Send full state
      const hand = existing.seat !== null ? this.hands[existing.seat] || null : null;
      this.send(existing, { type: "STATE", state: this.state, hand });

      this.event("PLAYER_RECONNECTED", { seat, handle: existing.handle });
      console.log(`[room] Client ${clientId} reconnected to seat ${seat}`);
      return existing;
    }

    // Check if seat has a bot we can replace
    const botConn = this.conns.find((c) => c.seat === seat && c.isBot);
    if (botConn) {
      this.conns = this.conns.filter((c) => c !== botConn);
      const conn = this.attach(ws, clientId, playerId || null);
      this.seatPlayer(conn, seat);
      return conn;
    }

    return null;
  }

  addSpectator(ws: WebSocket): Conn {
    const conn: Conn = {
      id: Math.random().toString(36).slice(2),
      ws,
      seat: null,
      handle: `Spectator`,
      isBot: false,
      playerId: null,
      isSpectator: true,
      connected: true,
      lastSeen: Date.now(),
    };
    this.conns.push(conn);
    this.send(conn, { type: "WELCOME", clientId: conn.id, playerId: null });
    this.send(conn, {
      type: "ROOM_JOINED",
      roomId: this.id,
      code: this.code,
      seat: null,
    });
    // Send state without hand
    this.send(conn, { type: "STATE", state: this.state, hand: null });
    return conn;
  }

  /** Assign a seat with bookkeeping (host tracking, event). Does NOT send ROOM_JOINED. */
  assignSeat(conn: Conn, seat: SeatIndex): void {
    conn.seat = seat;
    conn.isSpectator = false;
    // Track host: first seated human becomes host
    if (this.hostSeat === null && !conn.isBot) {
      this.hostSeat = seat;
    }
    this.event("SEATED", { seat, id: conn.id, handle: conn.handle, bot: conn.isBot });
    console.log(`[room] ${conn.handle} seated at ${seat} in room ${this.id}`);
  }

  private seatPlayer(conn: Conn, seat: SeatIndex): void {
    this.assignSeat(conn, seat);
    this.send(conn, {
      type: "ROOM_JOINED",
      roomId: this.id,
      code: this.code,
      seat,
    });
  }

  // ---- Bot management ----
  private makeBot(): Conn {
    const fake = {
      readyState: WebSocket.OPEN,
      send: () => {},
      close: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as WebSocket;

    return {
      id: "bot-" + Math.random().toString(36).slice(2),
      ws: fake,
      seat: null,
      handle: "Bot",
      isBot: true,
      playerId: null,
      isSpectator: false,
      connected: true,
      lastSeen: Date.now(),
    };
  }

  fillWithBots(): void {
    const seats = this.allSeats();
    const assigned = new Set(
      this.conns
        .filter((c) => c.seat !== null && !c.isSpectator)
        .map((c) => c.seat!)
    );

    for (const s of seats) {
      if (!assigned.has(s)) {
        const bot = this.makeBot();
        this.conns.push(bot);
        this.seatPlayer(bot, s);
      }
    }
  }

  canStart(): boolean {
    const seats = this.allSeats();
    const humans = this.conns.filter(
      (c) => !c.isBot && !c.isSpectator && c.seat !== null && seats.includes(c.seat!)
    );
    return humans.length >= 1; // At least 1 human, rest can be bots
  }

  // ---- Game lifecycle ----
  startGame(): void {
    if (this.state.phase !== "lobby") return;
    if (!this.canStart()) return;
    this.fillWithBots();
    this.newHand();
  }

  newHand(): void {
    this.rematchVotes.clear();
    this.clearTurnTimer();

    if (this.state.mode === "quadrille") {
      this.restIndex = (this.restIndex + 1) % 4;
    }

    // Clear contract before cleanBots so seatsActive() doesn't see stale "penetro"
    this.state.contract = null;

    // Remove bots from non-active seats, ensure active seats filled
    this.cleanBots();
    this.fillWithBots();

    // Reset hand data
    for (const s of ALL_SEATS) {
      this.hands[s] = [];
      this.original[s] = [];
    }
    this.talon = [];
    this.table = [];
    this.playOrder = [];
    this.trickWinners = [];

    // Reset state
    this.state.ombre = null;
    this.state.trump = null;
    this.soloTrumpBySeat = {};
    this.state.tricks = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.state.table = [];
    this.state.playOrder = [];
    this.state.phase = "dealing";
    this.state.resting = this.restSeat();

    // Deal cards with seed
    this.seed = generateSeed();
    const active = this.seatsActive();
    const deck = makeDeck(this.seed);

    // Deal in 3 rounds of 3
    for (let r = 0; r < 3; r++) {
      for (const p of active) {
        for (let i = 0; i < 3; i++) {
          this.hands[p].push(deck.pop()!);
        }
      }
    }

    for (const s of active) {
      this.original[s] = this.hands[s].slice();
    }

    this.talon = deck.splice(0, 40 - active.length * 9);

    this.state.handsCount = {
      0: this.hands[0].length,
      1: this.hands[1].length,
      2: this.hands[2].length,
      3: this.hands[3].length,
    };

    // Start auction with the first active seat after the resting/dealer seat.
    const firstBidder = this.nextActive(this.restSeat());
    const order: SeatIndex[] = [];
    let cur = firstBidder;
    for (let i = 0; i < active.length; i++) {
      order.push(cur);
      cur = this.nextActive(cur);
    }

    this.state.auction = {
      currentBid: "pass",
      currentBidder: null,
      passed: [],
      order,
    };

    this.state.phase = "auction";
    this.state.turn = order[0];
    this.event("DEAL", {
      activeSeats: active,
      cardsPerHand: 9,
      talonSize: this.talon.length,
    });
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  private cleanBots(): void {
    const activeSeats = this.seatsActive();
    this.conns = this.conns.filter(
      (c) => !c.isBot || (c.seat !== null && activeSeats.includes(c.seat))
    );
  }

  // ---- Timer ----
  private clearTurnTimer(): void {
    this.timerEpoch += 1;
    this.botEpoch += 1;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.postHandTimer) {
      clearTimeout(this.postHandTimer);
      this.postHandTimer = null;
    }
    delete this.state.turnDeadline;
  }

  private armTimer(): void {
    this.clearTurnTimer();
    if (!this.shouldUseTurnDeadline(this.state.turn)) {
      this.broadcastState();
      return;
    }
    const epoch = this.timerEpoch;
    this.state.turnDeadline = Date.now() + TURN_MS;
    this.timer = setTimeout(() => {
      if (epoch !== this.timerEpoch) return;
      this.timer = null;
      this.onTimeout();
    }, TURN_MS);
    this.broadcastState();
  }

  private onTimeout(): void {
    const seat = this.state.turn;
    if (seat === null) return;
    if (!this.shouldUseTurnDeadline(seat)) {
      this.clearTurnTimer();
      this.broadcastState();
      return;
    }
    console.log(`[room] Turn timeout for seat ${seat} in room ${this.id}`);
    this.doBotAction(seat);
  }

  private botMaybeAct(): void {
    const seat = this.state.turn;
    if (seat === null) return;
    const conn = this.seatConn(seat);
    if (conn?.isBot) {
      const delay = this.botDelayMs(seat);
      const epoch = ++this.botEpoch;
      setTimeout(() => {
        if (this.botEpoch !== epoch) return; // phase/turn changed, skip stale action
        this.doBotAction(seat);
      }, delay);
    }
  }

  private botDelayMs(seat: SeatIndex): number {
    const hand = this.hands[seat] || [];
    let min = BOT_DELAY_MIN;
    let max = BOT_DELAY_MAX;

    switch (this.state.phase) {
      case "auction":
        min = 500;
        max = 1400;
        break;
      case "trump_choice":
        min = 700;
        max = 1700;
        break;
      case "exchange":
        min = 900;
        max = 2100;
        break;
      case "play": {
        const led = this.table.length ? this.table[0] : null;
        const options = legalPlays(this.state.trump, hand, led).length;
        min = 600 + Math.min(800, options * 90);
        max = min + 700;
        break;
      }
    }

    return min + Math.random() * (max - min);
  }

  private doBotAction(seat: SeatIndex): void {
    if (this.state.turn !== seat) return;
    const conn = this.seatConn(seat);
    if (!conn || (!conn.isBot && conn.connected)) return;
    const ctx = this.buildBotContext(seat);

    const action = botAct(ctx);
    if (!action) return;

    switch (action.type) {
      case "BID":
        this.applyBid(seat, action.payload as Bid);
        break;
      case "PENETRO_DECISION":
        this.handlePenetroDecision(seat, Boolean(action.payload));
        break;
      case "CHOOSE_TRUMP":
        this.chooseTrump(seat, action.payload as Suit);
        break;
      case "EXCHANGE":
        this.finishExchange(seat, action.payload as string[]);
        break;
      case "PLAY":
        this.playCard(seat, action.payload as string);
        break;
    }
  }

  private buildBotContext(seat: SeatIndex): BotContext {
    return {
      phase: this.state.phase,
      seat,
      hand: this.hands[seat] || [],
      originalHand: this.original[seat] || [],
      trump: this.state.trump,
      contract: this.state.contract,
      auction: this.state.auction,
      ombre: this.state.ombre,
      playOrder: this.playOrder.slice(),
      handsCount: { ...this.state.handsCount },
      tricks: { ...this.state.tricks },
      table: this.table,
      talonLength: this.talon.length,
    };
  }

  // bidRank, isRankedBid → imported from auction-utils.ts

  // ---- Auction ----
  applyBid(seat: SeatIndex, value: Bid, suit?: Suit): void {
    if (this.state.phase !== "auction" || this.state.turn !== seat) return;
    if (value === "solo" && suit === "oros") {
      value = "solo_oros";
      suit = undefined;
    }
    if (value === "bola") {
      return this.errorSeat(
        seat,
        "BOLA_IMPLICIT_ONLY",
        "Bola cannot be declared in auction. It can only be implied after five consecutive trick wins."
      );
    }

    const a = this.state.auction;
    if (a.passed.includes(seat)) {
      return this.errorSeat(
        seat,
        "BIDDER_ALREADY_PASSED",
        "Passed players cannot re-enter the auction"
      );
    }
    const allPassSoFar =
      a.currentBid === "pass" && a.passed.length === a.order.length - 1;
    const isLast = a.order.indexOf(seat) === a.order.length - 1;
    const isContrabolaAllowed = value === "contrabola" && allPassSoFar && isLast;
    const openingStage = a.currentBid === "pass";

    if (value === "contrabola" && !isContrabolaAllowed) {
      return this.errorSeat(
        seat,
        "CONTRABOLA_ONLY_LAST_ALL_PASS",
        "Contrabola is only allowed for the last active player after all others pass."
      );
    }

    if (openingStage) {
      if (value !== "pass" && !isContrabolaAllowed) {
        if (value === "oros" || value === "solo_oros") {
          return this.errorSeat(
            seat,
            "OPENING_BID_RESTRICTED",
            "Opening bids may only be entrada, volteo, or solo."
          );
        }
        if (value !== "entrada" && value !== "volteo" && value !== "solo") {
          return this.errorSeat(seat, "BAD_BID", "Invalid opening bid");
        }
      }
    } else if (value !== "pass") {
      if (!isRankedBid(value)) {
        return this.errorSeat(seat, "BAD_BID", "Must beat previous bid");
      }
      const currentRank = bidRank(a.currentBid);
      const nextRank = bidRank(value);
      if (currentRank < 0 || nextRank <= currentRank) {
        return this.errorSeat(seat, "BAD_BID", "Must beat previous bid");
      }
    }

    if (value === "pass") {
      if (!a.passed.includes(seat)) a.passed.push(seat);
    } else {
      a.currentBid = value;
      a.currentBidder = seat;
      if (value === "solo" && suit && suit !== "oros") {
        this.soloTrumpBySeat[seat] = suit;
      } else if (value !== "solo") {
        delete this.soloTrumpBySeat[seat];
      }
    }

    this.event("AUCTION_ACTION", {
      seat,
      value,
      currentBid: a.currentBid,
      currentBidder: a.currentBidder,
    });

    const alive = a.order.filter((s) => !a.passed.includes(s));

    if (alive.length === 0) return this.onPassOut();

    if (alive.length === 1 && a.currentBidder !== null && alive[0] === a.currentBidder) {
      this.state.ombre = a.currentBidder;
      this.state.contract = mapBidToContract(a.currentBid);
      this.event("AUCTION_WIN", {
        ombre: a.currentBidder,
        bid: a.currentBid,
        contract: this.state.contract,
      });

      if (a.currentBid === "volteo") {
        const top = this.talon[0];
        this.state.trump = top.s;
        this.event("TRUMP_SET", { method: "volteo", suit: this.state.trump });
        this.startExchange();
      } else if (a.currentBid === "contrabola") {
        this.startExchange();
      } else if (a.currentBid === "solo") {
        const declared = this.soloTrumpBySeat[a.currentBidder];
        if (declared) {
          this.state.trump = declared;
          this.event("TRUMP_SET", { method: "solo_bid", suit: declared });
          this.startExchange();
        } else {
          this.state.phase = "trump_choice";
          this.state.turn = this.state.ombre;
          this.patch(this.state);
          this.armTimer();
          this.botMaybeAct();
        }
      } else {
        this.state.phase = "trump_choice";
        this.state.turn = this.state.ombre;
        this.patch(this.state);
        this.armTimer();
        this.botMaybeAct();
      }
      return;
    }

    const next = this.nextAuctionSeat(seat, a.order, a.passed);
    if (next === null) return this.onPassOut();
    this.state.turn = next;
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  // mapBidToContract → imported from auction-utils.ts

  private onPassOut(): void {
    const spadilleHolder = this.findSpadilleHolder();

    if (this.state.rules.espadaObligatoria && spadilleHolder !== null) {
      this.state.ombre = spadilleHolder;
      this.state.contract = "entrada";
      this.state.phase = "trump_choice";
      this.state.turn = spadilleHolder;
      this.event("ESPADA_OBLIGATORIA", { ombre: spadilleHolder });
      this.patch(this.state);
      this.armTimer();
      this.botMaybeAct();
      return;
    }

    if (this.state.mode === "quadrille" && this.state.rules.penetroEnabled) {
      this.startPenetroChoice();
      return;
    }

    this.event("AUCTION_PASS_OUT", {});
    this.newHand();
  }

  private nextAuctionSeat(
    from: SeatIndex,
    order: SeatIndex[],
    passed: SeatIndex[]
  ): SeatIndex | null {
    const idx = order.indexOf(from);
    if (idx < 0) return null;
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(idx + step) % order.length];
      if (!passed.includes(candidate)) return candidate;
    }
    return null;
  }

  private findSpadilleHolder(): SeatIndex | null {
    for (const s of this.seatsActive()) {
      if (this.hands[s].some((c) => c.s === "espadas" && c.r === 1)) return s;
    }
    return null;
  }

  private startPenetroChoice(): void {
    const resting = this.restSeat();
    this.state.phase = "penetro_choice";
    this.state.turn = resting;
    this.event("PENETRO_CHOICE", { restingPlayer: resting });
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  private handlePenetroDecision(seat: SeatIndex, accept: boolean): void {
    if (this.state.phase !== "penetro_choice") {
      return this.errorSeat(seat, "WRONG_PHASE");
    }

    const resting = this.restSeat();
    if (seat !== resting || this.state.turn !== seat) {
      return this.errorSeat(seat, "NOT_RESTING_PLAYER");
    }

    if (accept) {
      this.event("PENETRO_ACCEPTED", { seat });
      this.startPenetro();
      return;
    }

    this.event("PENETRO_DECLINED", { seat });
    this.event("AUCTION_PASS_OUT", {});
    this.newHand();
  }

  // ---- Trump choice ----
  chooseTrump(seat: SeatIndex, suit: Suit): void {
    if (this.state.phase !== "trump_choice") {
      return this.errorSeat(seat, "WRONG_PHASE");
    }
    if (this.state.ombre !== seat) {
      return this.errorSeat(seat, "NOT_OMBRE");
    }
    if (this.state.contract === "contrabola" || this.state.contract === "bola") {
      return this.errorSeat(seat, "NO_TRUMP_FOR_CONTRACT");
    }
    if (
      (this.state.contract === "oros" || this.state.contract === "solo_oros") &&
      suit !== "oros"
    ) {
      return this.errorSeat(seat, "TRUMP_MUST_BE_OROS");
    }

    this.state.trump = suit;
    this.event("TRUMP_SET", { method: "choice", suit });
    this.startExchange();
  }

  // ---- Exchange ----
  private startExchange(): void {
    const isSolo =
      this.state.contract === "solo" || this.state.contract === "solo_oros";
    const isBola = this.state.contract === "bola";
    const isContrabola = this.state.contract === "contrabola";
    const ombre = this.state.ombre;
    if (ombre === null) return;

    // Bola: no exchange by any player.
    if (isBola) {
      this.state.phase = "play";
      this.state.turn = this.nextActive(ombre);
      this.patch(this.state);
      this.armTimer();
      this.botMaybeAct();
      return;
    }

    this.state.phase = "exchange";
    const activeOrderFromOmbre: SeatIndex[] = [];
    let cursor = ombre;
    for (let i = 0; i < this.seatsActive().length; i++) {
      activeOrderFromOmbre.push(cursor);
      cursor = this.nextActive(cursor);
    }

    const ex = computeExchangeOrder(this.state.contract!, ombre, activeOrderFromOmbre);

    this.state.exchange = {
      current: ex[0] ?? null,
      order: ex,
      talonSize: this.talon.length,
      completed: [],
    };

    this.autoAdvanceExchangeTurn(this.state.exchange.current);
  }

  finishExchange(seat: SeatIndex, discardIds: string[]): void {
    if (this.state.phase !== "exchange") return;

    const ex = this.state.exchange;
    if (!ex.order.includes(seat) || ex.completed.includes(seat)) return;
    if (this.state.turn !== seat) return;

    const { min, max } = this.getExchangeLimits(seat);
    const hand = this.hands[seat];

    const ids = new Set(discardIds);
    const toDiscard: Card[] = [];

    for (let i = hand.length - 1; i >= 0; i--) {
      if (ids.has(hand[i].id)) {
        toDiscard.push(hand[i]);
      }
    }

    if (toDiscard.length < min || toDiscard.length > max) {
      if (min === 1 && max === 1) {
        return this.errorSeat(
          seat,
          "BAD_EXCHANGE",
          "Contrabola requires exchanging exactly one card"
        );
      }
      return this.errorSeat(
        seat,
        "BAD_EXCHANGE",
        `Exchange must be between ${min} and ${max} cards`
      );
    }
    const count = toDiscard.length;

    for (let i = 0; i < count; i++) {
      const k = hand.findIndex((c) => c.id === toDiscard[i].id);
      if (k >= 0) hand.splice(k, 1);
    }

    for (let i = 0; i < count; i++) {
      if (this.talon.length) hand.push(this.talon.shift()!);
    }

    this.state.handsCount[seat] = hand.length;
    this.state.exchange.completed.push(seat);
    this.state.exchange.talonSize = this.talon.length;

    const next = ex.order.find((s) => !ex.completed.includes(s)) ?? null;
    this.autoAdvanceExchangeTurn(next);
  }

  deferDefenderExchange(seat: SeatIndex): void {
    if (this.state.phase !== "exchange") {
      return this.errorSeat(seat, "WRONG_PHASE");
    }
    if (this.state.turn !== seat) {
      return this.errorSeat(seat, "NOT_YOUR_TURN");
    }

    const contract = this.state.contract;
    if (!contract) return this.errorSeat(seat, "BAD_EXCHANGE_ORDER");
    if (
      contract === "solo" ||
      contract === "solo_oros" ||
      contract === "contrabola" ||
      contract === "bola"
    ) {
      return this.errorSeat(seat, "BAD_EXCHANGE_ORDER");
    }

    const ombre = this.state.ombre;
    if (ombre === null) return this.errorSeat(seat, "BAD_EXCHANGE_ORDER");
    const completed = this.state.exchange.completed;
    if (completed.length !== 1 || !completed.includes(ombre)) {
      return this.errorSeat(seat, "BAD_EXCHANGE_ORDER");
    }

    const pendingDefenders = this.state.exchange.order.filter(
      (s) => s !== ombre && !completed.includes(s)
    );
    if (pendingDefenders.length !== 2 || pendingDefenders[0] !== seat) {
      return this.errorSeat(
        seat,
        "BAD_EXCHANGE_ORDER",
        "Only the first defender can choose to exchange second."
      );
    }

    const secondDefender = pendingDefenders[1];
    this.state.exchange.current = secondDefender;
    this.state.turn = secondDefender;
    this.event("EXCHANGE_ORDER_DEFER", {
      from: seat,
      to: secondDefender,
    });
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  // exchangeLimitsForSeat → imported from exchange-utils.ts
  private getExchangeLimits(seat: SeatIndex): { min: number; max: number } {
    const contract = this.state.contract;
    const ombre = this.state.ombre;
    if (!contract || ombre === null) return { min: 0, max: 0 };
    return exchangeLimitsForSeat(contract, seat, ombre, this.hands[seat]?.length ?? 0, this.talon.length);
  }

  private autoAdvanceExchangeTurn(startSeat: SeatIndex | null): void {
    if (this.state.phase !== "exchange") return;

    const ex = this.state.exchange;
    let next = startSeat;

    while (next !== null && ex.order.includes(next)) {
      if (ex.completed.includes(next)) {
        next = ex.order.find((s) => !ex.completed.includes(s)) ?? null;
        continue;
      }
      const { min, max } = this.getExchangeLimits(next);
      if (max > 0 || min > 0) break;

      ex.completed.push(next);
      this.state.handsCount[next] = this.hands[next].length;
      this.event("EXCHANGE_AUTO_SKIP", { seat: next });
      next = ex.order.find((s) => !ex.completed.includes(s)) ?? null;
    }

    ex.current = next;
    this.state.exchange.talonSize = this.talon.length;

    if (next === null) {
      this.state.phase = "play";
      if (this.state.ombre === null) {
        console.error("[room] ombre is null at exchange→play transition");
        return;
      }
      this.state.turn = this.nextActive(this.state.ombre);
      this.patch(this.state);
      this.armTimer();
      this.botMaybeAct();
      return;
    }

    this.state.turn = next;
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  private canCloseHandNow(seat: SeatIndex): boolean {
    if (this.state.phase !== "play" || this.state.turn !== seat) return false;
    if (this.table.length !== 0) return false;
    if (!this.state.contract) return false;
    if (
      this.state.contract === "bola" ||
      this.state.contract === "contrabola" ||
      this.state.contract === "penetro"
    ) {
      return false;
    }
    if (this.trickWinners.length !== 5) return false;
    return this.trickWinners.every((w) => w === seat);
  }

  private canImplyBolaByContinuation(seat: SeatIndex): boolean {
    if (this.state.phase !== "play" || this.state.turn !== seat) return false;
    if (this.table.length !== 0) return false;
    if (!this.state.contract) return false;
    if (
      this.state.contract === "bola" ||
      this.state.contract === "contrabola" ||
      this.state.contract === "penetro"
    ) {
      return false;
    }

    // Implicit bola only happens by continuing into trick 6:
    // the first five completed tricks must all be won by the same player.
    if (this.trickWinners.length !== 5) return false;
    const firstFiveWinners = this.trickWinners.slice(0, 5);
    return firstFiveWinners.every((w) => w === seat);
  }

  closeHand(seat: SeatIndex): void {
    if (!this.canCloseHandNow(seat)) {
      return this.errorSeat(
        seat,
        "BAD_CLOSE",
        "You can only close after taking five consecutive tricks"
      );
    }
    this.event("HAND_CLOSED", { seat });
    this.finishHand();
  }

  // ---- Card play ----
  playCard(seat: SeatIndex, cardId: string): void {
    if (this.state.phase !== "play" || this.state.turn !== seat) return;

    const hand = this.hands[seat];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return;

    const card = hand[idx];
    const led = this.table.length ? this.table[0] : null;
    const legal = legalPlays(this.state.trump, hand, led);

    if (!legal.find((c) => c.id === card.id)) {
      return this.errorSeat(seat, "ILLEGAL_PLAY", "Card is not a legal play");
    }

    // Continuing after the "first five won" close window implies bola.
    if (this.canImplyBolaByContinuation(seat)) {
      this.state.contract = "bola";
      this.state.ombre = seat;
      this.event("BOLA_IMPLIED", { ombre: seat });
      this.patch(this.state);
    }

    hand.splice(idx, 1);
    this.table.push(card);
    this.playOrder.push(seat);
    this.state.handsCount[seat] = hand.length;

    // Update visible state
    this.state.table = this.table.slice();
    this.state.playOrder = this.playOrder.slice();
    this.event("CARD_PLAYED", { seat, card });

    const needed = this.state.contract === "penetro" ? 4 : 3;

    if (this.table.length === needed) {
      const winIdx = trickWinner(this.state.trump, this.table[0].s, this.table);
      const winner = this.playOrder[winIdx];
      this.state.tricks[winner]++;
      this.trickWinners.push(winner);

      this.event("TRICK_TAKEN", {
        winner,
        cards: this.table,
        playOrder: this.playOrder.slice(),
      });

      this.table = [];
      this.playOrder = [];
      this.state.table = [];
      this.state.playOrder = [];
      this.state.turn = winner;
      this.patch(this.state);
      this.armTimer();

      const everyone =
        this.state.contract === "penetro"
          ? (ALL_SEATS.slice() as SeatIndex[])
          : this.seatsActive();
      const empty = everyone.every((p) => this.hands[p].length === 0);

      if (empty) {
        this.finishHand();
      } else {
        this.botMaybeAct();
      }
    } else {
      this.state.turn = this.nextActive(seat);
      this.patch(this.state);
      this.armTimer();
      this.botMaybeAct();
    }
  }

  // ---- Scoring (logic in scoring.ts) ----
  private finishHand(): void {
    this.clearTurnTimer();

    if (this.state.ombre === null) {
      console.error("[room] ombre is null at finishHand");
      return;
    }
    const om = this.state.ombre;
    const active =
      this.state.contract === "penetro"
        ? (ALL_SEATS.slice() as SeatIndex[])
        : this.seatsActive();

    // Delegate score calculation to pure functions
    let scoreResult;
    if (this.state.contract === "penetro") {
      scoreResult = scorePenetro(this.state.tricks, ALL_SEATS as SeatIndex[], this.trickWinners);
      this.event("PENETRO_RESULT", { winner: scoreResult.award[0], tricks: this.state.tricks });
    } else {
      scoreResult = calculateHandScore({
        contract: this.state.contract!,
        ombre: om,
        activeSeats: active,
        tricks: this.state.tricks,
        trickWinners: this.trickWinners,
      });
      this.event("HAND_RESULT", {
        result: scoreResult.result,
        points: scoreResult.points,
        award: scoreResult.award,
        tricks: this.state.tricks,
      });
    }

    // Apply score deltas
    for (const [seatStr, delta] of Object.entries(scoreResult.deltas)) {
      const seat = Number(seatStr);
      if (Number.isNaN(seat) || delta == null) continue;
      this.state.scores[seat as SeatIndex] += delta;
    }

    saveHandResult({
      roomId: this.id,
      handNo: this.state.handNo,
      trump: this.state.trump,
      ombre: om,
      resting: this.state.resting,
      result: scoreResult.result,
      points: scoreResult.points,
      award: scoreResult.award,
      tricks: this.state.tricks,
      scores: this.state.scores,
    }).catch((err) => console.error("[room] saveHandResult failed:", err));

    this.nextHand();
  }

  private nextHand(): void {
    const target = this.state.gameTarget;
    let winner: SeatIndex | null = null;

    for (const s of ALL_SEATS) {
      if (this.state.scores[s] >= target) {
        winner = s as SeatIndex;
        break;
      }
    }

    if (winner !== null) {
      this.state.phase = "match_end";
      this.patch(this.state);

      this.event("GAME_END", {
        winner,
        finalScores: this.state.scores,
      });

      // Save match result
      const playerIds = ALL_SEATS.map((s) => {
        const c = this.conns.find((conn) => conn.seat === s);
        return c?.playerId || null;
      });
      const playerHandles = ALL_SEATS.map((s) => {
        const c = this.conns.find((conn) => conn.seat === s);
        return c?.handle || null;
      });

      saveMatchResult({
        roomId: this.id,
        mode: this.state.mode,
        winner,
        finalScores: this.state.scores,
        totalHands: this.state.handNo,
        playerIds,
        playerHandles,
      }).catch((err) => console.error("[room] saveMatchResult failed:", err));
    } else {
      // Show post-hand briefly then deal next
      this.state.phase = "post_hand";
      this.patch(this.state);

      this.postHandTimer = setTimeout(() => {
        this.postHandTimer = null;
        this.state.handNo += 1;
        this.newHand();
      }, POST_HAND_DELAY);
    }
  }

  // ---- Penetro ----
  private startPenetro(): void {
    const rest = this.restSeat();
    // Capture first-dealt seat before setting contract="penetro" (which changes seatsActive())
    const firstTurn = this.seatsActive()[0];
    const can = Math.min(9, this.talon.length);

    for (let i = 0; i < can; i++) {
      this.hands[rest].push(this.talon.shift()!);
    }

    this.state.handsCount[rest] = this.hands[rest].length;
    this.state.contract = "penetro";
    this.state.ombre = rest; // Set ombre to resting player for scoring reference
    this.state.phase = "play";
    this.state.turn = firstTurn;

    this.event("PENETRO_START", { restingPlayer: rest });
    this.patch(this.state);
    this.armTimer();
    this.botMaybeAct();
  }

  // ---- Rematch ----
  handleRematch(seat: SeatIndex): void {
    if (this.state.phase !== "match_end") return;
    this.rematchVotes.add(seat);

    // Require majority of connected humans
    const humanSeats = this.conns
      .filter((c) => !c.isBot && !c.isSpectator && c.seat !== null && c.connected)
      .map((c) => c.seat!);
    const required = Math.max(1, Math.floor(humanSeats.length / 2) + 1);

    this.event("REMATCH_VOTE", {
      voter: seat,
      count: this.rematchVotes.size,
      required,
    });

    if (this.rematchVotes.size >= required) {
      this.rematchVotes.clear();
      this.state.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      this.state.handNo = 1;
      this.newHand();
    }
  }

  // ---- Message handler ----
  handle(conn: Conn, msg: { type: string; [key: string]: unknown }): void {
    try {
      this.lastActivity = Date.now();

      switch (msg.type) {
        case "TAKE_SEAT": {
          if (this.state.phase !== "lobby") {
            return this.send(conn, {
              type: "ERROR",
              code: "GAME_IN_PROGRESS",
              message: "Cannot change seats during a game",
            });
          }
          const seat = msg.seat as SeatIndex;
          const validSeats = this.allSeats();
          if (!validSeats.includes(seat)) {
            return this.send(conn, {
              type: "ERROR",
              code: "INVALID_SEAT",
              message: "Seat is not active",
            });
          }
          // Check if seat is taken by a human
          const occupant = this.conns.find(
            (c) => c.seat === seat && !c.isBot && !c.isSpectator
          );
          if (occupant && occupant !== conn) {
            return this.send(conn, {
              type: "ERROR",
              code: "SEAT_TAKEN",
              message: "Seat is occupied",
            });
          }
          // Remove bot from seat if present
          const bot = this.conns.find((c) => c.seat === seat && c.isBot);
          if (bot) {
            this.conns = this.conns.filter((c) => c !== bot);
          }
          this.seatPlayer(conn, seat);
          this.broadcastState();
          return;
        }

        case "START_GAME": {
          if (this.hostSeat !== null && conn.seat !== this.hostSeat) {
            return this.send(conn, {
              type: "ERROR",
              code: "NOT_HOST",
              message: "Only the room host can start the game",
            });
          }
          this.startGame();
          return;
        }

        case "REMATCH": {
          if (conn.seat !== null) this.handleRematch(conn.seat);
          return;
        }

        case "PING": {
          this.send(conn, { type: "PONG" });
          return;
        }

        case "LEAVE_ROOM": {
          this.detach(conn);
          this.send(conn, { type: "ROOM_LEFT" });
          this.broadcastState();
          if (this.state.phase !== "lobby") {
            this.botMaybeAct();
          }
          return;
        }
      }

      // Game actions require an active seated connection
      if (conn.seat === null || !this.conns.includes(conn)) {
        return this.send(conn, { type: "ERROR", code: "NO_SEAT" });
      }

      switch (msg.type) {
        case "BID":
          return this.applyBid(conn.seat, msg.value as Bid, msg.suit as Suit | undefined);
        case "CHOOSE_TRUMP":
          return this.chooseTrump(conn.seat, msg.suit as Suit);
        case "EXCHANGE":
          return this.finishExchange(conn.seat, (msg.discardIds as string[]) || []);
        case "EXCHANGE_DEFER":
          return this.deferDefenderExchange(conn.seat);
        case "PENETRO_DECISION":
          return this.handlePenetroDecision(conn.seat, Boolean(msg.accept));
        case "CLOSE_HAND":
          return this.closeHand(conn.seat);
        case "PLAY":
          return this.playCard(conn.seat, msg.cardId as string);
        default:
          console.warn(`[room] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error(`[room] Error handling message from ${conn.id}:`, error);
      this.send(conn, {
        type: "ERROR",
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
      });
    }
  }

  // ---- Cleanup ----
  cleanup(): void {
    this.clearTurnTimer();

    this.event("ROOM_CLOSING", {});

    for (const conn of this.conns) {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.close(1000, "Room closing");
        } catch (error) {
          console.error(`Failed to close connection ${conn.id}:`, error);
        }
      }
    }

    this.conns = [];
    console.log(`[room] Room ${this.id} cleaned up`);
  }
}
