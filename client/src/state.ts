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
    this.game = gameState;
    if (hand) this.hand = hand;
    this.roomCode = gameState.roomCode;

    // Detect my seat from players info
    if (this.mySeat === null && hand && hand.length > 0) {
      // Seat is assigned via ROOM_JOINED message, not here
    }
    this.notify();
  }

  setSeat(seat: SeatIndex | null): void {
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

  getExchangeMax(): number {
    const g = this.game;
    if (!g || g.phase !== "exchange" || this.mySeat === null) return 0;
    const isOmbre = this.mySeat === g.ombre;
    const contract = g.contract;
    const isSolo = contract === "solo" || contract === "solo_oros";
    const isOros = contract === "oros" || contract === "solo_oros";
    if (contract === "bola") return 0;
    if (contract === "contrabola") return isOmbre ? 1 : 0;
    if (isOmbre) return isSolo ? 0 : isOros ? 6 : 8;
    return Math.min(5, g.exchange.talonSize);
  }

  clearSelection(): void {
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
    if (
      this.game.turn === this.mySeat ||
      this.game.exchange.current === this.mySeat
    ) {
      return this.game.exchange.order.includes(this.mySeat);
    }

    const contract = this.game.contract;
    if (contract === "solo" || contract === "solo_oros" || contract === "contrabola") {
      return false;
    }

    const ombre = this.game.ombre;
    if (ombre === null) return false;

    const completed = this.game.exchange.completed;
    if (completed.length !== 1 || !completed.includes(ombre)) return false;

    return (
      this.game.exchange.order.includes(this.mySeat) &&
      !completed.includes(this.mySeat) &&
      this.mySeat !== ombre
    );
  }

  get canCloseHandNow(): boolean {
    if (!this.game || this.mySeat === null) return false;
    if (this.game.phase !== "play") return false;
    if (this.game.turn !== this.mySeat) return false;
    if (this.game.ombre !== this.mySeat) return false;
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
