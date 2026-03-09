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
  private soloSuitPickerOpen = false;

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

    if (phase !== "auction" || !myTurn) {
      this.soloSuitPickerOpen = false;
    }

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
    const rankedBids: Array<{ value: Bid; label: string; icon: string; desc: string }> = [
      { value: "entrada", label: "Entrada", icon: "\u2660", desc: "Standard opening" },
      { value: "oros", label: "Entrada Oros", icon: "\u2600\uFE0F", desc: "Entrada with Oros" },
      { value: "volteo", label: "Volteo", icon: "\u26A1", desc: "Trump from talon" },
      { value: "solo", label: "Solo", icon: "\uD83D\uDC51", desc: "Choose trump now" },
      { value: "solo_oros", label: "Solo Oros", icon: "\uD83D\uDC51", desc: "Solo with Oros" },
    ];

    const legal = opening
      ? rankedBids.filter((b) => b.value === "entrada" || b.value === "volteo" || b.value === "solo")
      : rankedBids.filter((b) => bidRank(b.value) > bidRank(currentBid));

    const btns = legal
      .map((b) => {
        const activeClass = b.value === "solo" && this.soloSuitPickerOpen ? " solo-active" : "";
        return `<button class="auction-bid bid-btn${activeClass}" data-bid="${b.value}">
          <span class="auction-bid-icon">${b.icon}</span>
          <span class="auction-bid-name">${b.label}</span>
          <span class="auction-bid-desc">${b.desc}</span>
        </button>`;
      })
      .join("");

    const showSoloPicker =
      this.soloSuitPickerOpen && legal.some((b) => b.value === "solo");
    const soloPicker = showSoloPicker
      ? `
        <div class="auction-suit-picker">
          <button class="auction-suit-btn solo-suit-btn" data-solo-suit="espadas" style="--suit-color: #0D0D0D">\u2660 Espadas</button>
          <button class="auction-suit-btn solo-suit-btn" data-solo-suit="copas" style="--suit-color: #B02E2E">\u2665 Copas</button>
          <button class="auction-suit-btn solo-suit-btn" data-solo-suit="bastos" style="--suit-color: #2A4D41">\u2663 Bastos</button>
        </div>
      `
      : "";

    // Contrabola: only when all others passed and you're last in order
    const a = this.state.game!.auction;
    const mySeatIdx = a.order.indexOf(this.state.mySeat!);
    const isLast = mySeatIdx === a.order.length - 1;
    const allOthersPassed = a.currentBid === "pass" && a.passed.length === a.order.length - 1;
    const showContrabola = isLast && allOthersPassed;

    const statusText = currentBid !== "pass"
      ? `Leading bid: ${this.bidLabel(currentBid)}`
      : "No leading bid";

    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">\u2696\uFE0F</span>
          <span class="auction-header-title">The Auction</span>
        </div>
        <div class="auction-panel-status">${statusText}</div>
        <div class="auction-bid-grid">
          ${btns}
          ${showContrabola ? `<button class="auction-bid bid-btn contrabola-btn" data-bid="contrabola">
            <span class="auction-bid-icon">\uD83C\uDFB2</span>
            <span class="auction-bid-name">Contrabola</span>
            <span class="auction-bid-desc">Last all-pass special</span>
          </button>` : ""}
          <button class="auction-bid bid-btn pass-btn" data-bid="pass">
            <span class="auction-bid-icon">\u2717</span>
            <span class="auction-bid-name">Pass</span>
            <span class="auction-bid-desc">Skip this round</span>
          </button>
        </div>
        ${soloPicker}
        <div class="auction-panel-divider"></div>
        <div class="auction-panel-quote">\u201CFortune favors the bold\u201D</div>
      </div>
    `;
  }

  private renderPenetroChoice(): string {
    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">\u2696\uFE0F</span>
          <span class="auction-header-title">Penetro Decision</span>
        </div>
        <div class="auction-panel-status">No active bidder. As resting player, choose whether to play Penetro.</div>
        <div class="auction-bid-grid">
          <button class="auction-bid bid-btn penetro-btn" data-accept="false">
            <span class="auction-bid-icon">\u2717</span>
            <span class="auction-bid-name">Decline</span>
            <span class="auction-bid-desc">Redeal hand</span>
          </button>
          <button class="auction-bid bid-btn penetro-btn" data-accept="true">
            <span class="auction-bid-icon">\u2694\uFE0F</span>
            <span class="auction-bid-name">Play Penetro</span>
            <span class="auction-bid-desc">Resting player enters</span>
          </button>
        </div>
        <div class="auction-panel-divider"></div>
        <div class="auction-panel-quote">\u201CFortune favors the bold\u201D</div>
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
          `<button class="auction-trump-btn trump-btn" data-suit="${s.value}" style="--suit-color: ${s.color}" ${orosOnly && s.value !== "oros" ? "disabled" : ""}>${s.symbol} ${s.label}</button>`
      )
      .join("");

    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">\u2694\uFE0F</span>
          <span class="auction-header-title">Choose Trump</span>
        </div>
        <div class="auction-trump-grid">
          ${btns}
        </div>
        <div class="auction-panel-divider"></div>
        <div class="auction-panel-quote">\u201CFortune favors the bold\u201D</div>
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
    const canDefer = this.state.canDeferExchangeOrder;

    const hintText = requireExactOne ? "Select exactly 1 card" : `Choose up to ${maxExchange} cards`;

    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">\uD83C\uDCCF</span>
          <span class="auction-header-title">Exchange Cards</span>
        </div>
        <div class="auction-panel-status">${hintText} \u2014 ${selected} / ${maxExchange} selected</div>
        <div class="auction-bid-grid">
          <button class="auction-bid exchange-btn" data-action="confirm" ${canConfirm ? "" : "disabled"}>
            <span class="auction-bid-icon">\u2194\uFE0F</span>
            <span class="auction-bid-name">Exchange Selected</span>
            <span class="auction-bid-desc">${selected} card${selected !== 1 ? "s" : ""} chosen</span>
          </button>
          ${min > 0 ? "" : `<button class="auction-bid exchange-btn pass-btn" data-action="skip">
            <span class="auction-bid-icon">\u2717</span>
            <span class="auction-bid-name">Keep All</span>
            <span class="auction-bid-desc">No exchange</span>
          </button>`}
          ${canDefer ? `<button class="auction-bid exchange-btn" data-action="defer">
            <span class="auction-bid-icon">\u23F3</span>
            <span class="auction-bid-name">Exchange Second</span>
            <span class="auction-bid-desc">Defer your turn</span>
          </button>` : ""}
        </div>
        ${needsSelectionHint ? `<div class="auction-panel-status">${requireExactOne ? "Select exactly 1 card" : `Select 1\u2013${maxExchange} cards`}</div>` : ""}
        <div class="auction-panel-divider"></div>
        <div class="auction-panel-quote">\u201CFortune favors the bold\u201D</div>
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
        if (bid === "solo") {
          this.soloSuitPickerOpen = !this.soloSuitPickerOpen;
          this.render();
          return;
        }
        this.soloSuitPickerOpen = false;
        this.conn.send({ type: "BID", value: bid });
        this.setActionLock(true);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>(".solo-suit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.actionLocked) return;
        const suit = btn.dataset.soloSuit as Suit | undefined;
        if (!suit) return;
        this.soloSuitPickerOpen = false;
        this.conn.send({ type: "BID", value: "solo", suit });
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
        } else if (btn.dataset.action === "skip") {
          if (min > 0) return;
          this.conn.send({ type: "EXCHANGE", discardIds: [] });
          this.state.clearSelection();
          this.setActionLock(true);
        } else if (btn.dataset.action === "defer") {
          this.conn.send({ type: "EXCHANGE_DEFER" });
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
