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
    if (this.selectedCards.has(cardId)) this.selectedCards.delete(cardId);
    else this.selectedCards.add(cardId);
    this.notify();
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
