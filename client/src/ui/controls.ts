import type { ConnectionManager } from "../connection";
import type { ClientState } from "../state";
import type { Bid, Suit } from "../protocol";
import { escapeHtml } from "../utils/escape";

export class GameControls {
  private container: HTMLElement;
  private conn: ConnectionManager;
  private state: ClientState;
  private unsubscribe: (() => void) | null = null;
  private actionLocked = false;
  private unlockTimer: number | null = null;
  private lastSeq = -1;

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
      this.setActionLock(false);
      this.container.innerHTML = "";
      return;
    }

    if (game.seq !== this.lastSeq) {
      this.lastSeq = game.seq;
      this.setActionLock(false);
    }

    const myTurn = this.state.isMyTurn;
    const canExchange = this.state.canExchangeNow;
    const phase = game.phase;

    let html = "";
    let actionable = false;

    if (phase === "auction" && myTurn) {
      html = this.renderAuction();
      actionable = true;
    } else if (phase === "penetro_choice" && myTurn) {
      html = this.renderPenetroChoice();
      actionable = true;
    } else if (phase === "trump_choice" && myTurn) {
      html = this.renderTrumpChoice();
      actionable = true;
    } else if (phase === "exchange" && canExchange) {
      html = this.renderExchange();
      actionable = true;
    } else if (phase === "play" && myTurn) {
      html = this.renderPlay();
      actionable = this.state.canCloseHandNow;
    } else if (phase === "post_hand") {
      html = "";
    } else if (phase === "match_end") {
      html = this.renderMatchEnd();
      actionable = true;
    } else if (phase === "lobby") {
      html = this.renderLobby();
      actionable = true;
    }

    this.container.innerHTML = html;
    this.container.dataset.actionable = actionable ? "true" : "false";
    this.container.setAttribute("aria-hidden", actionable ? "false" : "true");
    const shell = this.container.closest(".game-controls-shell") as HTMLElement | null;
    if (shell) {
      shell.dataset.actionable = actionable ? "true" : "false";
      shell.hidden = !actionable;
    }
    this.attachHandlers();

    if (this.actionLocked) {
      this.container.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
        btn.disabled = true;
      });
    }
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
      .map((b) => {
        const helper =
          b.value === "entrada"
            ? "Open standard game"
            : b.value === "volteo"
              ? "Trump from talon"
              : b.value === "solo"
                ? "No exchange for ombre"
                : b.value === "oros"
                  ? "Entrada with Oros trump"
                  : "Solo with Oros trump";
        return `<button class="bid-btn" data-bid="${b.value}"><span>${b.label}</span><small>${helper}</small></button>`;
      })
      .join("");

    // Contrabola: only when all others passed and you're last in order
    const a = this.state.game!.auction;
    const mySeatIdx = a.order.indexOf(this.state.mySeat!);
    const isLast = mySeatIdx === a.order.length - 1;
    const allOthersPassed = a.currentBid === "pass" && a.passed.length === a.order.length - 1;
    const showContrabola = isLast && allOthersPassed;

    return `
      <div class="control-group">
        <span class="control-label">🛡️ Your turn: choose a bid</span>
        ${currentBid !== "pass" ? `<span class="controls-hint">Leading bid: ${this.bidLabel(currentBid)}</span>` : ""}
        <div class="control-row compact control-row-bids">
          ${btns}
          ${showContrabola ? `<button class="bid-btn contrabola-btn" data-bid="contrabola"><span>Contrabola</span><small>Last all-pass special</small></button>` : ""}
          <button class="bid-btn pass-btn" data-bid="pass">Pass</button>
        </div>
      </div>
    `;
  }

  private renderPenetroChoice(): string {
    return `
      <div class="control-group">
        <span class="control-label">🛡️ Penetro</span>
        <span class="controls-hint">No active bidder. As resting player, choose whether to play Penetro.</span>
        <div class="control-row">
          <button class="bid-btn penetro-btn" data-accept="false"><span>Decline</span><small>Redeal hand</small></button>
          <button class="bid-btn penetro-btn" data-accept="true"><span>Play Penetro</span><small>Resting player enters</small></button>
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
          `<button class="trump-btn" data-suit="${s.value}" style="--suit-color: ${s.color}" ${orosOnly && s.value !== "oros" ? "disabled" : ""}><span>${s.symbol} ${s.label}</span></button>`
      )
      .join("");

    return `
      <div class="control-group">
        <span class="control-label">⚔️ Your turn: choose trump</span>
        <div class="control-row compact control-row-trumps">
          ${btns}
        </div>
      </div>
    `;
  }

  private renderExchange(): string {
    const selected = this.state.selectedCards.size;
    const { min, max } = this.exchangeLimits();
    const maxExchange = Math.min(max, this.state.hand.length);
    const requireExactOne = min === 1 && maxExchange === 1;
    const canConfirm = requireExactOne
      ? selected === 1
      : selected > 0 && selected <= maxExchange;
    const needsSelectionHint = selected === 0 || (selected > maxExchange || selected < min);

    return `
      <div class="control-group">
        <span class="control-label">🃏 Select cards to exchange</span>
        ${requireExactOne ? `<span class="controls-hint">Select exactly 1 card</span>` : `<span class="controls-hint">Choose up to ${maxExchange} cards</span>`}
        <div class="control-row compact">
          <span class="exchange-count">${selected} / ${maxExchange}</span>
          <button class="exchange-btn primary" data-action="confirm" ${canConfirm ? "" : "disabled"}>
            Exchange Selected
          </button>
          ${min > 0 ? "" : `<button class="exchange-btn secondary" data-action="skip">Keep All</button>`}
        </div>
        ${needsSelectionHint ? `<span class="controls-hint">Select ${requireExactOne ? "exactly 1 card" : `1-${maxExchange} cards`}</span>` : ""}
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
    return { min: 0, max: Math.min(this.state.hand.length, game.exchange.talonSize) };
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
      return "";
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
        if (this.actionLocked) return;
        const bid = btn.dataset.bid as Bid;
        this.conn.send({ type: "BID", value: bid });
        this.setActionLock(true);
      });
    });

    // Trump buttons
    this.container.querySelectorAll<HTMLButtonElement>(".trump-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.actionLocked) return;
        const suit = btn.dataset.suit as Suit;
        this.conn.send({ type: "CHOOSE_TRUMP", suit });
        this.setActionLock(true);
      });
    });

    // Exchange buttons
    this.container.querySelectorAll<HTMLButtonElement>(".exchange-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.actionLocked) return;
        const { min, max } = this.exchangeLimits();

        if (btn.dataset.action === "confirm") {
          let ids = Array.from(this.state.selectedCards);
          if (ids.length < min) return;
          if (ids.length > max) ids = ids.slice(0, max);
          this.conn.send({ type: "EXCHANGE", discardIds: ids });
          this.state.clearSelection();
          this.setActionLock(true);
        } else {
          if (min > 0) return;
          this.conn.send({ type: "EXCHANGE", discardIds: [] });
          this.state.clearSelection();
          this.setActionLock(true);
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>(".penetro-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.actionLocked) return;
        this.conn.send({
          type: "PENETRO_DECISION",
          accept: btn.dataset.accept === "true",
        });
        this.setActionLock(true);
      });
    });

    // Rematch button
    this.container.querySelector<HTMLButtonElement>(".rematch-btn")?.addEventListener("click", () => {
      if (this.actionLocked) return;
      this.conn.send({ type: "REMATCH" });
      this.setActionLock(true);
    });

    // Start button
    this.container.querySelector<HTMLButtonElement>(".start-btn")?.addEventListener("click", () => {
      if (this.actionLocked) return;
      this.conn.send({ type: "START_GAME" });
      this.setActionLock(true);
    });

    this.container.querySelector<HTMLButtonElement>('[data-action="close-hand"]')?.addEventListener("click", () => {
      if (this.actionLocked) return;
      this.conn.send({ type: "CLOSE_HAND" });
      this.setActionLock(true);
    });
  }

  private setActionLock(value: boolean): void {
    this.actionLocked = value;
    if (this.unlockTimer !== null) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
    if (value) {
      this.unlockTimer = window.setTimeout(() => {
        this.actionLocked = false;
        this.render();
      }, 1800);
    }
  }

  private seatLabel(seat: number | null): string {
    if (seat === null) return "...";
    const rel = this.state.relativePosition(seat as any);
    if (rel === "self") return "you";
    const player = this.state.game?.players[seat];
    return escapeHtml(player?.handle || rel);
  }

  private bidLabel(value: string): string {
    const labels: Record<string, string> = {
      entrada: "Entrada",
      oros: "Entrada Oros",
      volteo: "Volteo",
      solo: "Solo",
      solo_oros: "Solo Oros",
      contrabola: "Contrabola",
      pass: "Pass",
    };
    return labels[value] || value;
  }

  update(): void {
    this.render();
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.unlockTimer !== null) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
    this.container.innerHTML = "";
  }
}
