import type { ConnectionManager } from "../connection";
import type { ClientState } from "../state";
import type { Bid, Suit } from "../protocol";

export class GameControls {
  private container: HTMLElement;
  private conn: ConnectionManager;
  private state: ClientState;
  private unsubscribe: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    conn: ConnectionManager,
    state: ClientState
  ) {
    this.container = container;
    this.conn = conn;
    this.state = state;
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const game = this.state.game;
    if (!game) {
      this.container.innerHTML = "";
      return;
    }

    const myTurn = this.state.isMyTurn;
    const phase = game.phase;

    let html = "";

    if (phase === "auction" && myTurn) {
      html = this.renderAuction();
    } else if (phase === "trump_choice" && myTurn) {
      html = this.renderTrumpChoice();
    } else if (phase === "exchange" && myTurn) {
      html = this.renderExchange();
    } else if (phase === "play" && myTurn) {
      html = `<div class="controls-hint">Click a card to play</div>`;
    } else if (phase === "auction" && !myTurn) {
      html = `<div class="controls-hint">Waiting for ${this.seatLabel(game.turn)}...</div>`;
    } else if (phase === "play" && !myTurn) {
      html = `<div class="controls-hint">Waiting for ${this.seatLabel(game.turn)}...</div>`;
    } else if (phase === "post_hand") {
      html = `<div class="controls-hint">Hand complete - next hand starting...</div>`;
    } else if (phase === "match_end") {
      html = this.renderMatchEnd();
    } else if (phase === "lobby") {
      html = this.renderLobby();
    }

    this.container.innerHTML = html;
    this.attachHandlers();
  }

  private renderAuction(): string {
    const currentBid = this.state.game!.auction.currentBid;
    const bids: Array<{ value: Bid; label: string; minVal: number }> = [
      { value: "entrada", label: "Entrada", minVal: 1 },
      { value: "oros", label: "Oros", minVal: 2 },
      { value: "volteo", label: "Volteo", minVal: 3 },
      { value: "solo", label: "Solo", minVal: 4 },
      { value: "solo_oros", label: "Solo Oros", minVal: 5 },
      { value: "bola", label: "Bola", minVal: 6 },
    ];

    const currentVal =
      ({ pass: 0, entrada: 1, oros: 2, volteo: 3, solo: 4, solo_oros: 5, bola: 6, contrabola: 99 } as Record<string, number>)[currentBid] || 0;

    const btns = bids
      .map(
        (b) =>
          `<button class="bid-btn" data-bid="${b.value}" ${b.minVal <= currentVal ? "disabled" : ""}>${b.label}</button>`
      )
      .join("");

    return `
      <div class="control-group">
        <span class="control-label">Auction</span>
        ${btns}
        <button class="bid-btn pass-btn" data-bid="pass">Pass</button>
      </div>
    `;
  }

  private renderTrumpChoice(): string {
    const contract = this.state.game!.contract;
    const orosOnly = contract === "oros" || contract === "solo_oros";

    const suits: Array<{ value: Suit; label: string; symbol: string; color: string }> = [
      { value: "oros", label: "Oros", symbol: "\u2666", color: "#C8A651" },
      { value: "copas", label: "Copas", symbol: "\u2665", color: "#B02E2E" },
      { value: "espadas", label: "Espadas", symbol: "\u2660", color: "#0D0D0D" },
      { value: "bastos", label: "Bastos", symbol: "\u2663", color: "#2A4D41" },
    ];

    const btns = suits
      .map(
        (s) =>
          `<button class="trump-btn" data-suit="${s.value}" style="--suit-color: ${s.color}" ${orosOnly && s.value !== "oros" ? "disabled" : ""}>${s.symbol} ${s.label}</button>`
      )
      .join("");

    return `
      <div class="control-group">
        <span class="control-label">Choose Trump</span>
        ${btns}
      </div>
    `;
  }

  private renderExchange(): string {
    const selected = this.state.selectedCards.size;
    const maxExchange = this.state.hand.length;
    return `
      <div class="control-group">
        <span class="control-label">Exchange</span>
        <span class="exchange-count">${selected} / ${maxExchange}</span>
        <button class="exchange-btn primary" data-action="confirm">Exchange ${selected} card${selected !== 1 ? "s" : ""}</button>
        <button class="exchange-btn secondary" data-action="skip">Keep All</button>
      </div>
    `;
  }

  private renderMatchEnd(): string {
    return `
      <div class="control-group">
        <span class="control-label">Match Complete!</span>
        <button class="rematch-btn primary" data-action="rematch">Play Again</button>
      </div>
    `;
  }

  private renderLobby(): string {
    return `
      <div class="control-group">
        <button class="start-btn primary" data-action="start">Start Game</button>
      </div>
    `;
  }

  private attachHandlers(): void {
    // Bid buttons
    this.container.querySelectorAll<HTMLButtonElement>(".bid-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.dataset.bid as Bid;
        this.conn.send({ type: "BID", value: bid });
      });
    });

    // Trump buttons
    this.container.querySelectorAll<HTMLButtonElement>(".trump-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const suit = btn.dataset.suit as Suit;
        this.conn.send({ type: "CHOOSE_TRUMP", suit });
      });
    });

    // Exchange buttons
    this.container.querySelectorAll<HTMLButtonElement>(".exchange-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.action === "confirm") {
          const ids = Array.from(this.state.selectedCards);
          this.conn.send({ type: "EXCHANGE", discardIds: ids });
          this.state.clearSelection();
        } else {
          this.conn.send({ type: "EXCHANGE", discardIds: [] });
          this.state.clearSelection();
        }
      });
    });

    // Rematch button
    this.container.querySelector<HTMLButtonElement>(".rematch-btn")?.addEventListener("click", () => {
      this.conn.send({ type: "REMATCH" });
    });

    // Start button
    this.container.querySelector<HTMLButtonElement>(".start-btn")?.addEventListener("click", () => {
      this.conn.send({ type: "START_GAME" });
    });
  }

  private seatLabel(seat: number | null): string {
    if (seat === null) return "...";
    const rel = this.state.relativePosition(seat as any);
    if (rel === "self") return "you";
    const player = this.state.game?.players[seat];
    return player?.handle || rel;
  }

  update(): void {
    this.render();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container.innerHTML = "";
  }
}
