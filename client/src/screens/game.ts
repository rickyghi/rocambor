import "./game.css";

import type { AppContext, Screen } from "../router";
import {
  CardDealAnimation,
  CardPlayAnimation,
  TrickWinAnimation,
} from "../canvas/animations";
import { GameRenderer } from "../canvas/renderer";
import { renderGameHeaderMarkup } from "../components/layout/AppHeader";
import { renderFeltBackgroundMarkup } from "../components/layout/FeltBackground";
import { openProfileModal } from "../components/profile/ProfileModal";
import { buildDiceBearUrl, fallbackAvatarAt } from "../lib/avatars";
import {
  detectSpritesheetSupport,
  ensureSpritesheetCss,
  spriteClassForCard,
  verifySpritesheetClasses,
} from "../lib/card-sprites";
import type { S2CMessage } from "../protocol";
import { GameControls } from "../ui/controls";
import { openSettingsModal } from "../ui/settings-modal";
import { showToast } from "../ui/toast";
import { escapeHtml } from "../utils/escape";

export class GameScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private rootEl!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private renderer!: GameRenderer;
  private controls!: GameControls;
  private unsubscribes: Array<() => void> = [];

  private headerMeta!: HTMLElement;
  private headerAvatar!: HTMLImageElement;
  private headerName!: HTMLElement;
  private soundToggleBtn!: HTMLButtonElement;
  private mobileSummary!: HTMLElement;
  private opponentsStrip!: HTMLElement;
  private phaseRail!: HTMLElement;
  private trickHistory!: HTMLElement;
  private auctionBanner!: HTMLElement;
  private auctionBannerMain!: HTMLElement;
  private auctionBannerLead!: HTMLElement;

  private domLayers!: HTMLElement;
  private trickLayer!: HTMLElement;
  private handDock!: HTMLElement;
  private handLayer!: HTMLElement;
  private spriteMode = false;

  private prevPhase: string | null = null;
  private prevTurn: number | null = null;

  private lastTouchTs = 0;
  private pendingPlayCard: string | null = null;
  private headerTicker: number | null = null;
  private auctionBannerTimer: number | null = null;
  private lastInvalidToastTs = 0;
  private recentTrickWinners: number[] = [];
  private isMobilePortrait = false;

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    if (!ctx.state.game) {
      ctx.router.navigate("home");
      return;
    }

    container.innerHTML = `
      <div class="screen game-screen felt-shell">
        ${renderFeltBackgroundMarkup()}
        <div class="game-shell">
          ${renderGameHeaderMarkup()}
          <div class="game-mobile-summary rc-panel rc-panel-noise" id="game-mobile-summary"></div>
          <div class="game-opponents-strip rc-panel rc-panel-noise" id="game-opponents-strip" role="list" aria-label="Opponents"></div>
          <div class="game-status-rail rc-panel rc-panel-noise">
            <div class="game-phase-rail" id="game-phase-rail"></div>
            <div class="game-trick-history" id="game-trick-history"></div>
          </div>

          <div class="game-table-stack">
            <div class="game-canvas-wrap">
              <div class="auction-announcement rc-panel rc-panel-noise" id="auction-announcement" hidden>
                <div class="auction-announcement-main" id="auction-announcement-main"></div>
                <div class="auction-announcement-lead" id="auction-announcement-lead"></div>
              </div>
              <canvas id="game-canvas"></canvas>

              <div id="game-dom-layers" class="game-dom-layers" hidden>
                <div class="trick-overlay" aria-hidden="true">
                  <div class="trick-overlay-inner" id="trick-layer"></div>
                </div>
              </div>
            </div>
            <div class="game-controls-bar rc-panel rc-panel-noise" id="game-controls"></div>
            <div class="game-hand-dock" id="game-hand-dock" aria-label="Your hand area">
              <div class="hand-row rc-panel rc-panel-noise" id="hand-layer" role="listbox" aria-label="Your hand"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.rootEl = container.querySelector(".game-screen") as HTMLElement;
    this.canvas = container.querySelector("#game-canvas") as HTMLCanvasElement;
    const canvasCtx = this.canvas.getContext("2d")!;

    this.renderer = new GameRenderer(
      this.canvas,
      canvasCtx,
      ctx.state,
      ctx.settings,
      ctx.profile
    );

    this.headerMeta = container.querySelector("#game-header-meta") as HTMLElement;
    this.headerAvatar = container.querySelector(".game-profile-avatar") as HTMLImageElement;
    this.headerName = container.querySelector(".game-profile-name") as HTMLElement;
    this.soundToggleBtn = container.querySelector(".game-sound-btn") as HTMLButtonElement;
    this.mobileSummary = container.querySelector("#game-mobile-summary") as HTMLElement;
    this.opponentsStrip = container.querySelector("#game-opponents-strip") as HTMLElement;
    this.phaseRail = container.querySelector("#game-phase-rail") as HTMLElement;
    this.trickHistory = container.querySelector("#game-trick-history") as HTMLElement;
    this.auctionBanner = container.querySelector("#auction-announcement") as HTMLElement;
    this.auctionBannerMain = container.querySelector("#auction-announcement-main") as HTMLElement;
    this.auctionBannerLead = container.querySelector("#auction-announcement-lead") as HTMLElement;

    this.domLayers = container.querySelector("#game-dom-layers") as HTMLElement;
    this.trickLayer = container.querySelector("#trick-layer") as HTMLElement;
    this.handDock = container.querySelector("#game-hand-dock") as HTMLElement;
    this.handLayer = container.querySelector("#hand-layer") as HTMLElement;

    this.controls = new GameControls(
      container.querySelector("#game-controls") as HTMLElement,
      ctx.connection,
      ctx.state
    );

    this.bindEvents();
    this.setupSubscriptions();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);

    if (ctx.state.game) {
      this.prevPhase = ctx.state.game.phase;
      this.prevTurn = ctx.state.game.turn;
    }

    this.updateHeader();
    this.updateMobileSummary();
    this.updateMobileOpponents();
    this.updatePhaseRail();
    this.updateTrickHistory();
    this.updateAuctionLead();
    this.configureSpritesheetMode();
    this.headerTicker = window.setInterval(() => {
      this.updateHeader();
      this.updateMobileSummary();
    }, 1000);
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];

    this.renderer?.destroy();
    this.controls?.destroy();

    this.canvas?.removeEventListener("click", this.handleCanvasClick);
    this.canvas?.removeEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas?.removeEventListener("mouseleave", this.handleCanvasMouseLeave);
    this.canvas?.removeEventListener("touchstart", this.handleTouchStart);
    this.canvas?.removeEventListener("touchend", this.handleTouchEnd);

    this.handLayer?.removeEventListener("click", this.handleDomHandClick);

    window.removeEventListener("resize", this.handleResize);
    if (this.headerTicker !== null) {
      clearInterval(this.headerTicker);
      this.headerTicker = null;
    }
    if (this.auctionBannerTimer !== null) {
      clearTimeout(this.auctionBannerTimer);
      this.auctionBannerTimer = null;
    }
  }

  private bindEvents(): void {
    this.container.querySelector(".game-leave-btn")?.addEventListener("click", () => {
      this.ctx.connection.send({ type: "LEAVE_ROOM" });
    });

    this.container.querySelector(".game-profile-btn")?.addEventListener("click", () => {
      openProfileModal(this.ctx.profile);
    });

    this.container.querySelector(".game-settings-btn")?.addEventListener("click", () => {
      openSettingsModal(this.ctx.settings, {
        onApplied: () => {
          this.renderer.requestRender();
          this.updateHeader();
          this.updateMobileSummary();
        },
      });
    });

    this.soundToggleBtn?.addEventListener("click", () => {
      const next = !this.ctx.settings.get("soundEnabled");
      this.ctx.settings.set("soundEnabled", next);
      this.updateHeader();
      this.updateMobileSummary();
    });

    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleCanvasMouseLeave);
    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);

    this.handLayer.addEventListener("click", this.handleDomHandClick);
  }

  private setupSubscriptions(): void {
    this.unsubscribes.push(
      this.ctx.state.subscribe(() => {
        this.renderer.requestRender();
        this.handlePhaseTransitions();
        this.updateHeader();
        this.updateMobileSummary();
        this.updateMobileOpponents();
        this.updatePhaseRail();
        this.updateTrickHistory();
        this.updateAuctionLead();
        this.renderDomCardLayers();
      }),

      this.ctx.profile.subscribe(() => {
        this.renderer.requestRender();
        this.updateHeader();
        this.updateMobileOpponents();
      }),

      this.ctx.settings.subscribe(() => {
        this.renderer.requestRender();
        this.updateHeader();
        this.updateMobileSummary();
      }),

      this.ctx.connection.on("EVENT", (msg: S2CMessage) => {
        if (msg.type !== "EVENT") return;
        this.handleEvent(msg.name, msg.payload);
      }),
      this.ctx.connection.on("_latency", () => {
        this.updateHeader();
        this.updateMobileSummary();
      }),

      this.ctx.connection.on("ERROR", (msg: S2CMessage) => {
        if (msg.type !== "ERROR") return;
        showToast(msg.message || msg.code, "error");
        this.ctx.sounds.error();
      }),

      this.ctx.connection.on("ROOM_LEFT", () => {
        this.ctx.router.navigate("home");
      })
    );
  }

  private async configureSpritesheetMode(): Promise<void> {
    const supported = await detectSpritesheetSupport();
    if (!this.container.isConnected) return;

    this.spriteMode = supported;
    this.domLayers.hidden = !supported;
    this.syncCardPresentationMode();

    if (supported) {
      ensureSpritesheetCss();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const renderable = verifySpritesheetClasses(this.ctx.state.hand);
      if (!renderable) {
        this.spriteMode = false;
        this.domLayers.hidden = true;
        this.renderer.setCanvasCardLayers({ hand: true, table: true });
        this.syncCardPresentationMode();
        return;
      }
      this.renderer.setCanvasCardLayers({ hand: false, table: false });
      this.renderDomCardLayers();
      return;
    }

    this.renderer.setCanvasCardLayers({ hand: true, table: true });
    this.syncCardPresentationMode();
  }

  private syncCardPresentationMode(): void {
    this.rootEl.classList.toggle("sprite-mode", this.spriteMode);
    this.handDock.hidden = !this.spriteMode;
    if (!this.spriteMode) {
      this.handLayer.innerHTML = "";
      this.trickLayer.innerHTML = "";
    }
  }

  private renderDomCardLayers(): void {
    if (!this.spriteMode) return;

    const state = this.ctx.state;
    const game = state.game;
    if (!game) return;

    const legalIds = game.legalIds || [];
    const touchConfirm = window.matchMedia("(hover: none)").matches;

    this.trickLayer.innerHTML = game.table
      .map((card, index) => {
        const angle = (index - 1) * 6;
        return `
          <div class="trick-card-wrap" style="transform: rotate(${angle}deg)">
            <div class="${spriteClassForCard(card)}"></div>
          </div>
        `;
      })
      .join("");

    this.handLayer.innerHTML = state.hand
      .map((card) => {
        const selected = state.selectedCards.has(card.id);
        const isPlay = state.phase === "play" && state.isMyTurn;
        const illegal = isPlay && legalIds.length > 0 && !legalIds.includes(card.id);
        const legal = isPlay && !illegal;
        const pending = touchConfirm && this.pendingPlayCard === card.id;

        return `
          <button
            class="hand-card-wrap${selected ? " selected" : ""}${illegal ? " illegal" : ""}${legal ? " legal" : ""}${pending ? " pending" : ""}"
            type="button"
            role="option"
            aria-selected="${selected ? "true" : "false"}"
            data-card-id="${card.id}"
            ${illegal ? "disabled" : ""}
          >
            <div class="${spriteClassForCard(card)}"></div>
          </button>
        `;
      })
      .join("");

    if (!this.validateDomSpriteRender()) {
      this.spriteMode = false;
      this.domLayers.hidden = true;
      this.renderer.setCanvasCardLayers({ hand: true, table: true });
      this.syncCardPresentationMode();
      showToast("Using fallback card renderer.", "info", 1200);
    }
  }

  private validateDomSpriteRender(): boolean {
    const hand = this.ctx.state.hand;
    if (!hand.length) return true;

    const nodes = this.handLayer.querySelectorAll<HTMLElement>(".roc-card");
    if (!nodes.length) return false;

    const sample = Array.from(nodes).slice(0, 3);
    return sample.every((node) => {
      const style = window.getComputedStyle(node);
      const bg = style.backgroundImage || "";
      const w = parseFloat(style.width || "0");
      const h = parseFloat(style.height || "0");
      return bg.includes("url(") && !bg.includes("none") && w > 0 && h > 0;
    });
  }

  private handleCanvasClick = (e: MouseEvent): void => {
    if (this.spriteMode) return;
    if (Date.now() - this.lastTouchTs < 700) return;

    const { x, y } = this.renderer.canvasCoords(e.clientX, e.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    if (!hit) return;

    this.handleCardInteraction(hit.card.id, false);
  };

  private handleCanvasMouseMove = (e: MouseEvent): void => {
    if (this.spriteMode) {
      this.canvas.style.cursor = "default";
      return;
    }

    const { x, y } = this.renderer.canvasCoords(e.clientX, e.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(hit ? hit.index : -1);

    const state = this.ctx.state;
    const isInteractive =
      hit &&
      ((state.phase === "exchange" && state.canExchangeNow) ||
        (state.phase === "play" && state.isMyTurn));

    this.canvas.style.cursor = isInteractive ? "pointer" : "default";
  };

  private handleCanvasMouseLeave = (): void => {
    if (this.spriteMode) return;
    this.renderer.setHoveredCard(-1);
    this.canvas.style.cursor = "default";
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (this.spriteMode) return;

    this.lastTouchTs = Date.now();
    e.preventDefault();

    const touch = e.touches[0];
    const { x, y } = this.renderer.canvasCoords(touch.clientX, touch.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(hit ? hit.index : -1);
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (this.spriteMode) return;

    this.lastTouchTs = Date.now();

    const touch = e.changedTouches[0];
    const { x, y } = this.renderer.canvasCoords(touch.clientX, touch.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(-1);

    if (!hit) return;

    this.handleCardInteraction(hit.card.id, true);
  };

  private handleDomHandClick = (e: Event): void => {
    if (!this.spriteMode) return;

    const target = e.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-card-id]");
    if (!button) return;

    const cardId = button.dataset.cardId;
    if (!cardId) return;

    const touchConfirm = window.matchMedia("(hover: none)").matches;
    this.handleCardInteraction(cardId, touchConfirm);
  };

  private handleCardInteraction(cardId: string, tapToConfirm: boolean): void {
    const state = this.ctx.state;
    const game = state.game;
    if (!game) return;

    if (state.phase === "exchange" && !state.canExchangeNow) {
      this.showInvalidAction("Wait for your exchange turn.");
      return;
    }

    if (state.phase === "exchange" && state.canExchangeNow) {
      const isContrabolaOmbre = game.contract === "contrabola" && game.ombre === state.mySeat;
      if (isContrabolaOmbre && !state.selectedCards.has(cardId)) {
        state.clearSelection();
      }
      state.toggleCardSelection(cardId);
      this.ctx.sounds.cardPlay();
      this.renderDomCardLayers();
      return;
    }

    if (state.phase !== "play") return;

    if (!state.isMyTurn) {
      this.showInvalidAction("Wait for your turn.");
      return;
    }

    const legalIds = game.legalIds;
    if (legalIds && !legalIds.includes(cardId)) {
      this.showInvalidAction("Illegal card: follow suit if possible.");
      return;
    }

    if (!tapToConfirm) {
      this.ctx.connection.send({ type: "PLAY", cardId });
      this.ctx.sounds.cardPlay();
      return;
    }

    if (this.pendingPlayCard === cardId) {
      this.ctx.connection.send({ type: "PLAY", cardId });
      this.ctx.sounds.cardPlay();
      this.pendingPlayCard = null;
      state.clearSelection();
      this.renderDomCardLayers();
      return;
    }

    this.pendingPlayCard = cardId;
    state.clearSelection();
    state.toggleCardSelection(cardId);
    this.renderDomCardLayers();
  }

  private showInvalidAction(message: string): void {
    const now = Date.now();
    if (now - this.lastInvalidToastTs > 900) {
      showToast(message, "warning", 1300);
      this.lastInvalidToastTs = now;
    }

    const row = this.container.querySelector(".hand-row");
    if (!row) return;
    row.classList.remove("invalid-shake");
    // Force reflow so repeated invalid actions retrigger animation.
    void (row as HTMLElement).offsetWidth;
    row.classList.add("invalid-shake");
  }

  private handlePhaseTransitions(): void {
    const game = this.ctx.state.game;
    if (!game) return;

    const newPhase = game.phase;
    const newTurn = game.turn;

    if (newPhase !== this.prevPhase) {
      this.onPhaseChange(this.prevPhase, newPhase);
      this.prevPhase = newPhase;
    }

    if (newTurn !== this.prevTurn) {
      this.pendingPlayCard = null;
      if (this.ctx.state.isMyTurn && this.prevTurn !== null) {
        this.ctx.sounds.yourTurn();
      }
      this.prevTurn = newTurn;
    }

    if (newPhase === "post_hand") {
      this.ctx.router.navigate("post-hand");
    } else if (newPhase === "match_end") {
      this.ctx.router.navigate("match-summary");
    }
  }

  private onPhaseChange(oldPhase: string | null, newPhase: string): void {
    switch (newPhase) {
      case "dealing":
        this.ctx.sounds.cardDeal();
        this.recentTrickWinners = [];
        this.updateTrickHistory();
        break;
      case "auction":
        if (this.ctx.state.isMyTurn) {
          this.showAuctionAnnouncement("Your turn to bid", 1500);
        }
        break;
      case "penetro_choice":
        if (this.ctx.state.isMyTurn) {
          showToast("Choose whether to play Penetro", "info", 1800);
        }
        break;
      case "trump_choice":
        if (this.ctx.state.isMyTurn) showToast("Choose trump suit", "info", 1800);
        break;
      case "exchange":
        this.ctx.state.clearSelection();
        this.renderDomCardLayers();
        break;
      case "play":
        if (oldPhase === "exchange") this.ctx.state.clearSelection();
        this.renderDomCardLayers();
        break;
      default:
        break;
    }
  }

  private handleEvent(name: string, payload: Record<string, unknown>): void {
    switch (name) {
      case "TRICK_TAKEN":
      case "TRICK_WON": {
        this.ctx.sounds.trickWin();
        const winner = payload.winner as number;
        this.recentTrickWinners.push(winner);
        if (this.recentTrickWinners.length > 3) this.recentTrickWinners.shift();
        this.updateTrickHistory();
        const rel = this.ctx.state.relativePosition(winner as any);
        const label = rel === "self" ? "You" : this.ctx.state.game?.players[winner]?.handle || rel;
        showToast(`${label} won the trick`, "info", 1300);
        const anchors = this.renderer.getAnimationAnchors();
        this.renderer.addAnimation(new TrickWinAnimation(anchors.trickCenter.x, anchors.trickCenter.y, 600));
        break;
      }

      case "AUCTION_ACTION": {
        const seat = Number(payload.seat);
        const value = String(payload.value || "pass");
        const actor = this.seatLabelForAnnouncements(seat);
        if (value === "pass") {
          this.showAuctionAnnouncement(`${actor} passes`, 1400);
        } else {
          this.showAuctionAnnouncement(`${actor} bids ${this.bidLabel(value)}`, 1700);
        }
        this.updateAuctionLead(
          String(payload.currentBid || "pass"),
          payload.currentBidder === null || payload.currentBidder === undefined
            ? null
            : Number(payload.currentBidder)
        );
        break;
      }

      case "AUCTION_WIN": {
        const seat = Number(payload.ombre);
        const bid = String(payload.bid || "");
        const actor = this.seatLabelForAnnouncements(seat);
        this.showAuctionAnnouncement(`${actor} wins auction with ${this.bidLabel(bid)}`, 2600);
        this.updateAuctionLead(bid, seat);
        break;
      }

      case "CARD_PLAYED": {
        this.ctx.sounds.cardPlay();
        const seat = payload.seat as number | undefined;
        if (seat !== undefined) {
          const relPos = this.ctx.state.relativePosition(seat as any);
          const anchors = this.renderer.getAnimationAnchors();
          const cardSize = this.renderer.getCardDimensions();
          const from = anchors.playFrom[relPos] || anchors.playFrom.across;
          this.renderer.addAnimation(
            new CardPlayAnimation(
              from.x,
              from.y,
              anchors.trickCenter.x,
              anchors.trickCenter.y,
              cardSize.w,
              cardSize.h,
              250
            )
          );
        }
        break;
      }

      case "DEAL": {
        this.ctx.sounds.cardDeal();
        const anchors = this.renderer.getAnimationAnchors();
        const cardSize = this.renderer.getCardDimensions();
        const dealTargets = [
          anchors.playFrom.self,
          anchors.playFrom.left,
          anchors.playFrom.across,
          anchors.playFrom.right,
        ];
        for (let i = 0; i < dealTargets.length; i++) {
          const target = dealTargets[i];
          this.renderer.addAnimation(
            new CardDealAnimation(
              anchors.dealSource.x,
              anchors.dealSource.y,
              target.x,
              target.y,
              cardSize.w,
              cardSize.h,
              i * 80,
              300
            )
          );
        }
        break;
      }

      default:
        break;
    }
  }

  private updateHeader(): void {
    const game = this.ctx.state.game;
    const profile = this.ctx.profile.get();
    const compact = this.isMobilePortrait;

    const metaParts: string[] = [];
    if (game) {
      metaParts.push(`Round ${game.handNo}`);
      if (!compact && game.contract) metaParts.push(`Contract: ${String(game.contract).replace("_", " ")}`);
      if (!compact && game.trump) metaParts.push(`Trump: ${game.trump}`);
      if (typeof game.turnDeadline === "number") {
        const secs = Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000));
        metaParts.push(`Turn: ${secs}s`);
        this.headerMeta.classList.toggle("urgent", secs <= 5);
      } else {
        this.headerMeta.classList.remove("urgent");
      }
    } else {
      metaParts.push("Waiting for game state");
      this.headerMeta.classList.remove("urgent");
    }

    if (!compact && this.ctx.connection.latencyMs !== null) {
      metaParts.push(`Ping: ${Math.round(this.ctx.connection.latencyMs)}ms`);
    }

    this.headerMeta.textContent = metaParts.join("  •  ");
    this.headerName.textContent = profile.name;
    this.headerAvatar.src = profile.avatar || this.ctx.profile.getFallbackAvatar();
    this.headerAvatar.onerror = () => {
      this.headerAvatar.src = this.ctx.profile.getFallbackAvatar();
    };

    const soundOn = this.ctx.settings.get("soundEnabled");
    this.soundToggleBtn.textContent = soundOn ? "Sound On" : "Sound Off";
    this.soundToggleBtn.setAttribute("aria-pressed", String(soundOn));
  }

  private updateMobileSummary(): void {
    if (!this.isMobilePortrait) {
      this.mobileSummary.innerHTML = "";
      return;
    }

    const game = this.ctx.state.game;
    if (!game) {
      this.mobileSummary.innerHTML = `<span class="mobile-summary-chip">Waiting for game state</span>`;
      return;
    }

    const chips: string[] = [`<span class="mobile-summary-chip">Round ${game.handNo}</span>`];
    if (game.contract) {
      chips.push(`<span class="mobile-summary-chip">Contract ${escapeHtml(this.bidLabel(game.contract))}</span>`);
    }
    if (game.trump) {
      chips.push(`<span class="mobile-summary-chip">Trump ${escapeHtml(game.trump)}</span>`);
    }

    if (game.turn !== null) {
      const actor = this.seatLabelForAnnouncements(game.turn);
      const secs = typeof game.turnDeadline === "number"
        ? ` · ${Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000))}s`
        : "";
      const mine = game.turn === this.ctx.state.mySeat ? " mine" : "";
      chips.push(`<span class="mobile-summary-chip turn${mine}">${escapeHtml(`${actor} turn${secs}`)}</span>`);
    }

    this.mobileSummary.innerHTML = chips.join("");
  }

  private updateMobileOpponents(): void {
    if (!this.isMobilePortrait) {
      this.opponentsStrip.innerHTML = "";
      return;
    }

    const game = this.ctx.state.game;
    if (!game || this.ctx.state.mySeat === null) {
      this.opponentsStrip.innerHTML = "";
      return;
    }

    const seats = ([
      { pos: "left", label: "Left" },
      { pos: "across", label: "Across" },
      { pos: "right", label: "Right" },
    ] as const)
      .map(({ pos, label }) => {
        const seat = this.ctx.state.seatAtPosition(pos);
        if (seat === null) return "";
        const player = game.players[seat];
        const name = player?.handle || `Seat ${seat}`;
        const score = game.scores[seat] || 0;
        const tricks = game.tricks[seat] || 0;
        const active = game.turn === seat ? " active-turn" : "";
        const disconnected = player && !player.connected ? " disconnected" : "";
        const avatarUrl = player?.isBot
          ? buildDiceBearUrl(name || `bot-${seat}`, "bottts-neutral")
          : buildDiceBearUrl(name || `seat-${seat}`, "identicon");
        const fallback = fallbackAvatarAt(seat);
        const aria = `${label} seat ${name}, score ${score}, tricks ${tricks}`;

        return `
          <div class="mobile-opponent${active}${disconnected}" role="listitem" aria-label="${escapeHtml(aria)}">
            <img class="mobile-opponent-avatar" src="${avatarUrl}" data-fallback="${fallback}" alt="" />
            <div class="mobile-opponent-meta">
              <span class="mobile-opponent-seat">${label}</span>
              <span class="mobile-opponent-name">${escapeHtml(name)}</span>
            </div>
            <div class="mobile-opponent-stats">
              <span>S ${score}</span>
              <span>T ${tricks}</span>
            </div>
          </div>
        `;
      })
      .join("");

    this.opponentsStrip.innerHTML = seats;

    this.opponentsStrip.querySelectorAll<HTMLImageElement>(".mobile-opponent-avatar").forEach((img) => {
      img.onerror = () => {
        const fallback = img.dataset.fallback;
        if (!fallback) return;
        img.onerror = null;
        img.src = fallback;
      };
    });
  }

  private updatePhaseRail(): void {
    const game = this.ctx.state.game;
    if (!game) {
      this.phaseRail.innerHTML = "";
      return;
    }

    const stage = game.phase === "penetro_choice"
      ? "auction"
      : game.phase === "trump_choice"
        ? "trump"
        : game.phase === "exchange"
          ? "exchange"
          : game.phase === "play" || game.phase === "post_hand" || game.phase === "match_end"
            ? "play"
            : "auction";

    const order = ["auction", "trump", "exchange", "play"] as const;
    const activeIdx = order.indexOf(stage);

    this.phaseRail.innerHTML = order
      .map((name, idx) => {
        const active = idx === activeIdx ? " active" : "";
        const done = idx < activeIdx ? " done" : "";
        const label = name === "trump" ? "Trump" : name[0].toUpperCase() + name.slice(1);
        return `<span class="phase-chip${active}${done}">${label}</span>`;
      })
      .join("");
  }

  private updateTrickHistory(): void {
    const winners = this.recentTrickWinners.slice(-3);
    if (!winners.length) {
      this.trickHistory.innerHTML = `<span class="trick-history-empty">No tricks yet</span>`;
      return;
    }

    this.trickHistory.innerHTML = winners
      .map((seat) => `<span class="trick-chip">${this.seatLabelForAnnouncements(seat)}</span>`)
      .join("");
  }

  private updateAuctionLead(currentBid?: string, currentBidder?: number | null): void {
    const game = this.ctx.state.game;
    if (!game) return;

    const bid = currentBid ?? game.auction.currentBid;
    const bidder = currentBidder === undefined ? game.auction.currentBidder : currentBidder;

    if (bid === "pass" || bidder === null) {
      this.auctionBannerLead.textContent = "No leading bid yet";
    } else {
      this.auctionBannerLead.textContent =
        `Leading bid: ${this.bidLabel(bid)} by ${this.seatLabelForAnnouncements(bidder)}`;
    }

    this.syncAuctionBannerVisibility();
  }

  private showAuctionAnnouncement(text: string, ttlMs: number): void {
    this.auctionBannerMain.textContent = text;
    this.syncAuctionBannerVisibility();

    if (this.auctionBannerTimer !== null) {
      clearTimeout(this.auctionBannerTimer);
      this.auctionBannerTimer = null;
    }

    this.auctionBannerTimer = window.setTimeout(() => {
      this.auctionBannerMain.textContent = "";
      this.syncAuctionBannerVisibility();
      this.auctionBannerTimer = null;
    }, ttlMs);
  }

  private syncAuctionBannerVisibility(): void {
    const phase = this.ctx.state.game?.phase;
    const hasMain = Boolean(this.auctionBannerMain.textContent?.trim());
    const visible = phase === "auction" || hasMain;
    this.auctionBannerLead.style.display = visible ? "block" : "none";
    this.auctionBanner.hidden = !visible;
  }

  private seatLabelForAnnouncements(seat: number): string {
    if (this.ctx.state.mySeat === seat) return "You";
    const handle = this.ctx.state.game?.players[seat]?.handle;
    return handle || `Seat ${seat}`;
  }

  private bidLabel(value: string): string {
    const labels: Record<string, string> = {
      pass: "Pass",
      entrada: "Entrada",
      oros: "Entrada Oros",
      volteo: "Volteo",
      solo: "Solo",
      solo_oros: "Solo Oros",
      contrabola: "Contrabola",
      bola: "Bola",
    };
    return labels[value] || value;
  }

  private handleResize = (): void => {
    const wrap = this.container.querySelector(".game-canvas-wrap") as HTMLElement | null;
    if (!wrap || !this.canvas) return;

    const narrow = window.matchMedia("(max-width: 900px)").matches;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const mobilePortrait = narrow && portrait;

    this.isMobilePortrait = mobilePortrait;
    this.rootEl.classList.toggle("mobile-portrait-mode", mobilePortrait);
    this.renderer.setViewportMode(mobilePortrait ? "mobile-portrait" : "desktop");

    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width <= 0 || wrapRect.height <= 0) return;
    const logical = this.renderer.getLogicalSize();
    const targetRatio = logical.width / logical.height;
    const wrapRatio = wrapRect.width / wrapRect.height;

    let displayW: number;
    let displayH: number;

    if (wrapRatio > targetRatio) {
      displayH = wrapRect.height;
      displayW = displayH * targetRatio;
    } else {
      displayW = wrapRect.width;
      displayH = displayW / targetRatio;
    }

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
    this.updateHeader();
    this.updateMobileSummary();
    this.updateMobileOpponents();
  };
}
