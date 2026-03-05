import type { ConnectionManager } from "../connection";
import type { ClientState } from "../state";
import type { Bid, Suit } from "../protocol";
import { escapeHtml } from "../utils/escape";

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
    const canExchange = this.state.canExchangeNow;
    const phase = game.phase;

    let html = "";

    if (phase === "auction" && myTurn) {
      html = this.renderAuction();
    } else if (phase === "penetro_choice" && myTurn) {
      html = this.renderPenetroChoice();
    } else if (phase === "trump_choice" && myTurn) {
      html = this.renderTrumpChoice();
    } else if (phase === "exchange" && canExchange) {
      html = this.renderExchange();
    } else if (phase === "play" && myTurn) {
      html = this.renderPlay();
    } else if (phase === "auction" && !myTurn) {
      html = `<div class="controls-hint">Waiting for ${this.seatLabel(game.turn)}...</div>`;
    } else if (phase === "penetro_choice" && !myTurn) {
      html = `<div class="controls-hint">Waiting for the resting player to decide Penetro...</div>`;
    } else if (phase === "exchange" && !canExchange) {
      html = `<div class="controls-hint">Waiting for exchange...</div>`;
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
    const bidRank = (bid: Bid): number =>
      ({ entrada: 0, oros: 1, volteo: 2, solo: 3, solo_oros: 4 } as Partial<Record<Bid, number>>)[bid] ?? -1;
    const opening = currentBid === "pass";
    const rankedBids: Array<{ value: Bid; label: string }> = [
      { value: "entrada", label: "Entrada" },
      { value: "oros", label: "Entrada Oros" },
      { value: "volteo", label: "Volteo" },
      { value: "solo", label: "Solo" },
      { value: "solo_oros", label: "Solo Oros" },
    ];

    const legal = opening
      ? rankedBids.filter((b) => b.value === "entrada" || b.value === "volteo" || b.value === "solo")
      : rankedBids.filter((b) => bidRank(b.value) > bidRank(currentBid));

    const btns = legal
      .map((b) => `<button class="bid-btn" data-bid="${b.value}">${b.label}</button>`)
      .join("");

    // Contrabola: only when all others passed and you're last in order
    const a = this.state.game!.auction;
    const mySeatIdx = a.order.indexOf(this.state.mySeat!);
    const isLast = mySeatIdx === a.order.length - 1;
    const allOthersPassed = a.currentBid === "pass" && a.passed.length === a.order.length - 1;
    const showContrabola = isLast && allOthersPassed;

    return `
      <div class="control-group">
        <span class="control-label">Auction</span>
        ${btns}
        ${showContrabola ? `<button class="bid-btn contrabola-btn" data-bid="contrabola">Contrabola</button>` : ""}
        <button class="bid-btn pass-btn" data-bid="pass">Pass</button>
      </div>
    `;
  }

  private renderPenetroChoice(): string {
    return `
      <div class="control-group">
        <span class="control-label">Penetro</span>
        <span class="controls-hint">No active bidder. As resting player, choose whether to play Penetro.</span>
        <div class="control-row">
          <button class="bid-btn penetro-btn" data-accept="false">Decline</button>
          <button class="bid-btn penetro-btn" data-accept="true">Play Penetro</button>
        </div>
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
    const { min, max } = this.exchangeLimits();
    const maxExchange = Math.min(max, this.state.hand.length);
    const canConfirm = selected >= min && selected <= maxExchange;
    const requireExactOne = min === 1 && maxExchange === 1;

    return `
      <div class="control-group">
        <span class="control-label">Exchange</span>
        ${requireExactOne ? `<span class="controls-hint">Select exactly 1 card</span>` : ""}
        <span class="exchange-count">${selected} / ${maxExchange}</span>
        <button class="exchange-btn primary" data-action="confirm" ${canConfirm ? "" : "disabled"}>
          ${requireExactOne ? "Exchange 1 card" : `Exchange ${selected} card${selected !== 1 ? "s" : ""}`}
        </button>
        ${min > 0 ? "" : `<button class="exchange-btn secondary" data-action="skip">Keep All</button>`}
      </div>
    `;
  }

  private exchangeLimits(): { min: number; max: number } {
    const game = this.state.game;
    if (!game || this.state.mySeat === null) return { min: 0, max: 0 };

    const isOmbre = game.ombre === this.state.mySeat;
    const contract = game.contract;
    const isSolo = contract === "solo" || contract === "solo_oros";
    const isOros = contract === "oros" || contract === "solo_oros";

    if (contract === "bola") return { min: 0, max: 0 };
    if (contract === "contrabola") {
      return isOmbre ? { min: 1, max: 1 } : { min: 0, max: 0 };
    }
    if (isOmbre) {
      if (isSolo) return { min: 0, max: 0 };
      return { min: 0, max: isOros ? 6 : 8 };
    }
    return { min: 0, max: 5 };
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

  private renderPlay(): string {
    if (!this.state.canCloseHandNow) {
      return `<div class="controls-hint">Click a card to play</div>`;
    }

    return `
      <div class="control-group">
        <span class="control-label">Five Consecutive Tricks</span>
        <span class="controls-hint">Close hand now, or continue playing to imply Bola.</span>
        <button class="exchange-btn secondary" data-action="close-hand">Close Hand</button>
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
        const { min, max } = this.exchangeLimits();

        if (btn.dataset.action === "confirm") {
          let ids = Array.from(this.state.selectedCards);
          if (ids.length < min) return;
          if (ids.length > max) ids = ids.slice(0, max);
          this.conn.send({ type: "EXCHANGE", discardIds: ids });
          this.state.clearSelection();
        } else {
          if (min > 0) return;
          this.conn.send({ type: "EXCHANGE", discardIds: [] });
          this.state.clearSelection();
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>(".penetro-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.conn.send({
          type: "PENETRO_DECISION",
          accept: btn.dataset.accept === "true",
        });
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

    this.container.querySelector<HTMLButtonElement>('[data-action="close-hand"]')?.addEventListener("click", () => {
      this.conn.send({ type: "CLOSE_HAND" });
    });
  }

  private seatLabel(seat: number | null): string {
    if (seat === null) return "...";
    const rel = this.state.relativePosition(seat as any);
    if (rel === "self") return "you";
    const player = this.state.game?.players[seat];
    return escapeHtml(player?.handle || rel);
  }

  update(): void {
    this.render();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container.innerHTML = "";
  }
}
