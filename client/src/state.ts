import type { GameState, Card, SeatIndex } from "./protocol";

export type StateListener = (state: ClientState) => void;

export class ClientState {
  game: GameState | null = null;
  hand: Card[] = [];
  mySeat: SeatIndex | null = null;
  selectedCards = new Set<string>();
  roomCode: string | null = null;
  private listeners = new Set<StateListener>();

  update(gameState: GameState, hand: Card[] | null): void {
    const turnPlayer =
      gameState.turn !== null ? gameState.players[gameState.turn] : undefined;
    const shouldHideTurnDeadline =
      typeof gameState.turnDeadline === "number" &&
      turnPlayer !== undefined &&
      !turnPlayer.isBot &&
      turnPlayer.connected;

    this.game = shouldHideTurnDeadline
      ? { ...gameState, turnDeadline: undefined }
      : gameState;
    this.hand = hand ?? [];
    if (this.selectedCards.size > 0) {
      const validIds = new Set(this.hand.map((card) => card.id));
      this.selectedCards.forEach((cardId) => {
        if (!validIds.has(cardId)) this.selectedCards.delete(cardId);
      });
    }
    this.roomCode = this.game.roomCode;

    // Detect my seat from players info
    if (this.mySeat === null && hand && hand.length > 0) {
      // Seat is assigned via ROOM_JOINED message, not here
    }
    this.notify();
  }

  setRoomJoin(code: string, seat: SeatIndex | null): void {
    const normalizedCode = code.trim().toUpperCase();
    const roomChanged = this.roomCode !== normalizedCode;
    const seatChanged = this.mySeat !== seat;
    if (!roomChanged && !seatChanged) return;
    this.roomCode = normalizedCode;
    this.mySeat = seat;
    this.notify();
  }

  setSeat(seat: SeatIndex | null): void {
    if (this.mySeat === seat) return;
    this.mySeat = seat;
    this.notify();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this);
      } catch (e) {
        console.error("[state] Listener error:", e);
      }
    }
  }

  // Map absolute seat index to relative screen position
  relativePosition(
    seat: SeatIndex
  ): "self" | "left" | "across" | "right" {
    if (this.mySeat === null) return "across";
    const diff = ((seat - this.mySeat + 4) % 4) as 0 | 1 | 2 | 3;
    return (["self", "left", "across", "right"] as const)[diff];
  }

  // Get which absolute seat is at a given relative position
  seatAtPosition(pos: "self" | "left" | "across" | "right"): SeatIndex | null {
    if (this.mySeat === null) return null;
    const offsets: Record<string, number> = {
      self: 0,
      left: 1,
      across: 2,
      right: 3,
    };
    return ((this.mySeat + offsets[pos]) % 4) as SeatIndex;
  }

  toggleCardSelection(cardId: string): void {
    if (this.selectedCards.has(cardId)) {
      this.selectedCards.delete(cardId);
    } else {
      // Enforce exchange max during exchange phase
      if (this.game?.phase === "exchange") {
        const max = this.getExchangeMax();
        if (max > 0 && this.selectedCards.size >= max) return;
      }
      this.selectedCards.add(cardId);
    }
    this.notify();
  }

  getExchangeLimits(): { min: number; max: number } {
    const g = this.game;
    if (!g || g.phase !== "exchange" || this.mySeat === null) return { min: 0, max: 0 };
    const isOmbre = this.mySeat === g.ombre;
    const contract = g.contract;
    const isSolo = contract === "solo" || contract === "solo_oros";
    const isOros = contract === "oros" || contract === "solo_oros";
    if (contract === "bola") return { min: 0, max: 0 };
    if (contract === "contrabola") return isOmbre ? { min: 1, max: 1 } : { min: 0, max: 0 };
    if (isOmbre) {
      if (isSolo) return { min: 0, max: 0 };
      if (contract === "volteo") return { min: g.exchange.talonSize > 0 ? 1 : 0, max: Math.min(8, g.exchange.talonSize) };
      return { min: 0, max: Math.min(isOros ? 6 : 8, g.exchange.talonSize) };
    }
    return { min: 0, max: Math.min(this.hand.length, g.exchange.talonSize) };
  }

  getExchangeMax(): number {
    return this.getExchangeLimits().max;
  }

  clearSelection(): void {
    if (this.selectedCards.size === 0) return;
    this.selectedCards.clear();
    this.notify();
  }

  get isMyTurn(): boolean {
    return (
      this.game !== null &&
      this.mySeat !== null &&
      this.game.turn === this.mySeat
    );
  }

  get canExchangeNow(): boolean {
    if (!this.game || this.mySeat === null) return false;
    if (this.game.phase !== "exchange") return false;
    if (this.game.exchange.completed.includes(this.mySeat)) return false;
    return (
      this.game.turn === this.mySeat &&
      this.game.exchange.order.includes(this.mySeat)
    );
  }

  get canDeferExchangeOrder(): boolean {
    if (!this.game || this.mySeat === null) return false;
    if (this.game.phase !== "exchange" || this.game.turn !== this.mySeat) return false;
    const contract = this.game.contract;
    if (
      !contract ||
      contract === "solo" ||
      contract === "solo_oros" ||
      contract === "contrabola" ||
      contract === "bola"
    ) {
      return false;
    }
    const ombre = this.game.ombre;
    if (ombre === null) return false;
    const completed = this.game.exchange.completed;
    if (completed.length !== 1 || !completed.includes(ombre)) return false;
    const pendingDefenders = this.game.exchange.order.filter(
      (s) => s !== ombre && !completed.includes(s)
    );
    return pendingDefenders.length === 2 && pendingDefenders[0] === this.mySeat;
  }

  get canCloseHandNow(): boolean {
    if (!this.game || this.mySeat === null) return false;
    if (this.game.phase !== "play") return false;
    if (this.game.turn !== this.mySeat) return false;
    if (this.game.table.length !== 0) return false;

    const contract = this.game.contract;
    if (!contract) return false;
    if (contract === "bola" || contract === "contrabola" || contract === "penetro") {
      return false;
    }

    const myTricks = this.game.tricks[this.mySeat] || 0;
    if (myTricks !== 5) return false;

    const otherTricks = [0, 1, 2, 3]
      .filter((s) => s !== this.mySeat)
      .reduce((sum, s) => sum + (this.game!.tricks[s] || 0), 0);

    return otherTricks === 0;
  }

  get phase(): string {
    return this.game?.phase || "lobby";
  }

  reset(): void {
    this.game = null;
    this.hand = [];
    this.mySeat = null;
    this.selectedCards.clear();
    this.roomCode = null;
    this.notify();
  }
}
