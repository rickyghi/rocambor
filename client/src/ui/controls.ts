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
    const rankedBids: Array<{ value: Bid; label: string; icon: string; desc: string }> = [
      { value: "entrada", label: "Entrada", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`, desc: "Challenge the table" },
      { value: "oros", label: "Entrada Oros", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>`, desc: "Entrada with Oros" },
      { value: "volteo", label: "Volteo", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`, desc: "Flip top card" },
      { value: "solo", label: "Solo", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/><circle cx="12" cy="12" r="3"/></svg>`, desc: "Play alone" },
      { value: "solo_oros", label: "Solo Oros", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/><circle cx="12" cy="12" r="3"/></svg>`, desc: "Solo with Oros" },
    ];

    const legal = opening
      ? rankedBids.filter((b) => b.value === "entrada" || b.value === "volteo" || b.value === "solo")
      : rankedBids.filter((b) => bidRank(b.value) > bidRank(currentBid));

    const btns = legal
      .map((b) => {
        return `<button class="auction-bid bid-btn" data-bid="${b.value}">
          <span class="auction-bid-icon">${b.icon}</span>
          <span class="auction-bid-name">${b.label}</span>
          <span class="auction-bid-desc">${b.desc}</span>
        </button>`;
      })
      .join("");

    // Contrabola: only when all others passed and you're last in order
    const a = this.state.game!.auction;
    const mySeatIdx = a.order.indexOf(this.state.mySeat!);
    const isLast = mySeatIdx === a.order.length - 1;
    const allOthersPassed = a.currentBid === "pass" && a.passed.length === a.order.length - 1;
    const showContrabola = isLast && allOthersPassed;

    const statusText = currentBid !== "pass"
      ? `Leading bid: ${this.bidLabel(currentBid)}`
      : "No leading bid";

    const gavelSvg = `<svg class="auction-header-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z"/><path d="M4 20l3.5-3.5"/><path d="M2 22l2-2"/></svg>`;
    const crossSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const diceSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`;

    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">${gavelSvg}</span>
          <span class="auction-header-title">The Auction</span>
        </div>
        <div class="auction-panel-status">${statusText}</div>
        <div class="auction-bid-grid">
          ${btns}
          ${showContrabola ? `<button class="auction-bid bid-btn contrabola-btn" data-bid="contrabola">
            <span class="auction-bid-icon">${diceSvg}</span>
            <span class="auction-bid-name">Contrabola</span>
            <span class="auction-bid-desc">Last all-pass special</span>
          </button>` : ""}
          <button class="auction-bid bid-btn pass-btn" data-bid="pass">
            <span class="auction-bid-icon">${crossSvg}</span>
            <span class="auction-bid-name">Pass</span>
            <span class="auction-bid-desc">Wait for turn</span>
          </button>
        </div>
        <div class="auction-panel-divider"></div>
        <div class="auction-panel-quote">\u201CFortune favors the bold\u201D</div>
      </div>
    `;
  }

  private renderPenetroChoice(): string {
    const crossSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const swordSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z"/><path d="M4 20l3.5-3.5"/><path d="M2 22l2-2"/></svg>`;
    const gavelSvg = `<svg class="auction-header-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z"/><path d="M4 20l3.5-3.5"/><path d="M2 22l2-2"/></svg>`;
    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">${gavelSvg}</span>
          <span class="auction-header-title">Penetro Decision</span>
        </div>
        <div class="auction-panel-status">No active bidder. As resting player, choose whether to play Penetro.</div>
        <div class="auction-bid-grid">
          <button class="auction-bid bid-btn penetro-btn" data-accept="false">
            <span class="auction-bid-icon">${crossSvg}</span>
            <span class="auction-bid-name">Decline</span>
            <span class="auction-bid-desc">Redeal hand</span>
          </button>
          <button class="auction-bid bid-btn penetro-btn" data-accept="true">
            <span class="auction-bid-icon">${swordSvg}</span>
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
          `<button class="auction-trump-btn trump-btn" data-suit="${s.value}" style="--suit-color: ${s.color}" ${orosOnly && s.value !== "oros" ? "disabled" : ""}>
            <span class="trump-suit-symbol" style="color: ${s.color}">${s.symbol}</span>
            <span class="trump-suit-name">${s.label}</span>
          </button>`
      )
      .join("");

    const swordSvg = `<svg class="auction-header-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5L18 6l-9 9-3.5-3.5 9-9z"/><path d="M4 20l3.5-3.5"/><path d="M2 22l2-2"/></svg>`;
    return `
      <div class="auction-panel">
        <div class="auction-panel-header">
          <span class="auction-header-icon">${swordSvg}</span>
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

    const swapSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    const crossSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const clockSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const cardsSvg = `<svg class="auction-header-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="18" rx="2"/><rect x="7" y="1" width="14" height="18" rx="2"/></svg>`;

    return `
      <div class="auction-panel exchange-panel-compact">
        <div class="auction-panel-header">
          <span class="auction-header-icon">${cardsSvg}</span>
          <span class="auction-header-title">Exchange</span>
        </div>
        <div class="auction-panel-status">${hintText} \u2014 ${selected} / ${maxExchange}</div>
        <div class="auction-bid-grid">
          <button class="auction-bid exchange-btn" data-action="confirm" ${canConfirm ? "" : "disabled"}>
            <span class="auction-bid-icon">${swapSvg}</span>
            <span class="auction-bid-name">Exchange</span>
          </button>
          ${min > 0 ? "" : `<button class="auction-bid exchange-btn pass-btn" data-action="skip">
            <span class="auction-bid-icon">${crossSvg}</span>
            <span class="auction-bid-name">Keep All</span>
          </button>`}
          ${canDefer ? `<button class="auction-bid exchange-btn" data-action="defer">
            <span class="auction-bid-icon">${clockSvg}</span>
            <span class="auction-bid-name">Defer</span>
          </button>` : ""}
        </div>
      </div>
    `;
  }

  private exchangeLimits(): { min: number; max: number } {
    return this.state.getExchangeLimits();
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
