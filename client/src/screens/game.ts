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
import { buildBotAvatarUrl, buildDiceBearUrl, fallbackAvatarAt } from "../lib/avatars";
import {
  detectSpritesheetSupport,
  ensureSpritesheetCss,
  spriteClassForCard,
  verifySpritesheetClasses,
} from "../lib/card-sprites";
import type { Card, S2CMessage, SeatIndex } from "../protocol";
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

  private headerMain!: HTMLElement;
  private headerSub!: HTMLElement;
  private hudTurn!: HTMLElement;
  private hudTrump!: HTMLElement;
  private hudOmbre!: HTMLElement;
  private hudTarget!: HTMLElement;
  private headerPing!: HTMLElement;
  private headerAvatar!: HTMLImageElement;
  private headerName!: HTMLElement;
  private soundToggleBtn!: HTMLButtonElement;
  private mobileSummary!: HTMLElement;
  private opponentsStrip!: HTMLElement;
  private heroPlates!: HTMLElement;
  private selfHeroPlate!: HTMLElement;
  private phaseBanner!: HTMLElement;
  private phaseBannerMain!: HTMLElement;
  private phaseBannerSub!: HTMLElement;
  private arenaToastFeed!: HTMLElement;

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
  private lastLiveTableIds: string[] = [];
  private trickFeedPrimed = false;
  private trickDisplayOverlay: {
    cards: Card[];
    playOrder: SeatIndex[];
    winner: SeatIndex;
  } | null = null;
  private trickOverlayTimer: number | null = null;
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
          <div class="game-stage rc-table-stage">
            <div class="game-stage-top">
              <div class="arena-phase-banner rc-panel rc-panel-noise" id="arena-phase-banner">
                <div class="arena-phase-main" id="arena-phase-main"></div>
                <div class="arena-phase-sub" id="arena-phase-sub"></div>
              </div>
              <div class="arena-toast-feed" id="arena-toast-feed" aria-live="polite"></div>
            </div>
            <div class="game-stage-mid">
              <div class="game-canvas-wrap">
                <div class="hero-plates-layer" id="hero-plates-layer" aria-hidden="true"></div>
                <canvas id="game-canvas"></canvas>
                <div id="game-dom-layers" class="game-dom-layers" hidden>
                  <div class="trick-overlay" aria-hidden="true">
                    <div class="trick-overlay-inner" id="trick-layer"></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="game-stage-bottom">
              <div class="hero-self-slot" id="hero-self-slot" aria-hidden="true"></div>
              <div class="game-hand-dock" id="game-hand-dock" aria-label="Your hand area">
                <div class="hand-row rc-panel rc-panel-noise" id="hand-layer" role="listbox" aria-label="Your hand"></div>
              </div>
              <div class="game-controls-shell" data-actionable="false">
                <div class="game-controls-bar rc-panel rc-panel-noise" id="game-controls"></div>
              </div>
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

    this.headerMain = container.querySelector("#game-header-main") as HTMLElement;
    this.headerSub = container.querySelector("#game-header-sub") as HTMLElement;
    this.hudTurn = container.querySelector("#game-state-turn") as HTMLElement;
    this.hudTrump = container.querySelector("#game-state-trump") as HTMLElement;
    this.hudOmbre = container.querySelector("#game-state-ombre") as HTMLElement;
    this.hudTarget = container.querySelector("#game-state-target") as HTMLElement;
    this.headerPing = container.querySelector("#game-header-ping") as HTMLElement;
    this.headerAvatar = container.querySelector(".game-profile-avatar") as HTMLImageElement;
    this.headerName = container.querySelector(".game-profile-name") as HTMLElement;
    this.soundToggleBtn = container.querySelector(".game-sound-btn") as HTMLButtonElement;
    this.mobileSummary = container.querySelector("#game-mobile-summary") as HTMLElement;
    this.opponentsStrip = container.querySelector("#game-opponents-strip") as HTMLElement;
    this.heroPlates = container.querySelector("#hero-plates-layer") as HTMLElement;
    this.selfHeroPlate = container.querySelector("#hero-self-slot") as HTMLElement;
    this.phaseBanner = container.querySelector("#arena-phase-banner") as HTMLElement;
    this.phaseBannerMain = container.querySelector("#arena-phase-main") as HTMLElement;
    this.phaseBannerSub = container.querySelector("#arena-phase-sub") as HTMLElement;
    this.arenaToastFeed = container.querySelector("#arena-toast-feed") as HTMLElement;

    this.domLayers = container.querySelector("#game-dom-layers") as HTMLElement;
    this.trickLayer = container.querySelector("#trick-layer") as HTMLElement;
    this.handDock = container.querySelector("#game-hand-dock") as HTMLElement;
    this.handLayer = container.querySelector("#hand-layer") as HTMLElement;

    this.controls = new GameControls(
      container.querySelector("#game-controls") as HTMLElement,
      ctx.connection,
      ctx.state
    );
    this.renderer.setDomPlatesEnabled(true);

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
    this.renderHeroPlates();
    this.updatePhaseBanner();
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
    if (this.trickOverlayTimer !== null) {
      clearTimeout(this.trickOverlayTimer);
      this.trickOverlayTimer = null;
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
        this.trackTrickFeedFromState();
        this.updateHeader();
        this.updateMobileSummary();
        this.updateMobileOpponents();
        this.renderHeroPlates();
        this.updatePhaseBanner();
        this.renderDomCardLayers();
      }),

      this.ctx.profile.subscribe(() => {
        this.renderer.requestRender();
        this.updateHeader();
        this.updateMobileOpponents();
        this.renderHeroPlates();
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
    this.updateHandDockVisibility();
    if (!this.spriteMode) {
      this.handLayer.innerHTML = "";
      this.trickLayer.innerHTML = "";
    }
  }

  private updateHandDockVisibility(): void {
    this.handDock.hidden = !(this.spriteMode && this.ctx.state.hand.length > 0);
  }

  private renderDomCardLayers(): void {
    this.updateHandDockVisibility();
    if (!this.spriteMode) return;

    const state = this.ctx.state;
    const game = state.game;
    if (!game) return;

    const legalIds = game.legalIds || [];
    const touchConfirm = window.matchMedia("(hover: none)").matches;

    const trickCards = game.table.length ? game.table : this.trickDisplayOverlay?.cards ?? [];
    const trickOrder = game.table.length ? game.playOrder : this.trickDisplayOverlay?.playOrder ?? [];
    const trickWinner = game.table.length ? null : this.trickDisplayOverlay?.winner ?? null;

    this.trickLayer.innerHTML = trickCards
      .map((card, index) => {
        const seat = trickOrder[index];
        const rel = seat === undefined ? null : state.relativePosition(seat);
        const slot = this.trickSlotForPosition(rel ?? "across");
        const winnerClass = trickWinner !== null && seat === trickWinner ? " winner" : "";
        const actorLabel = this.trickActorLabel(seat);
        return `
          <div class="trick-card-wrap${winnerClass}" style="${slot}">
            <div class="${spriteClassForCard(card)}"></div>
            ${actorLabel ? `<div class="trick-card-label">${escapeHtml(actorLabel)}</div>` : ""}
          </div>
        `;
      })
      .join("");

    this.handLayer.innerHTML = state.hand
      .map((card, index) => {
        const selected = state.selectedCards.has(card.id);
        const isPlay = state.phase === "play" && state.isMyTurn;
        const illegal = isPlay && legalIds.length > 0 && !legalIds.includes(card.id);
        const legal = isPlay && !illegal;
        const pending = touchConfirm && this.pendingPlayCard === card.id;
        const fan = this.handFanStyle(index, state.hand.length);

        return `
          <button
            class="hand-card-wrap${selected ? " selected" : ""}${illegal ? " illegal" : ""}${legal ? " legal" : ""}${pending ? " pending" : ""}"
            type="button"
            role="option"
            aria-selected="${selected ? "true" : "false"}"
            data-card-id="${card.id}"
            style="${fan}"
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

  private trickSlotForPosition(
    position: "self" | "left" | "across" | "right"
  ): string {
    const mobile = this.isMobilePortrait;
    const map = mobile
      ? {
          left: { x: "-98px", y: "12px", r: "-5deg" },
          across: { x: "0px", y: "-76px", r: "0deg" },
          right: { x: "98px", y: "12px", r: "5deg" },
          self: { x: "0px", y: "98px", r: "0deg" },
        }
      : {
          left: { x: "-148px", y: "14px", r: "-6deg" },
          across: { x: "0px", y: "-114px", r: "0deg" },
          right: { x: "148px", y: "14px", r: "6deg" },
          self: { x: "0px", y: "132px", r: "0deg" },
        };
    const slot = map[position];
    return `--slot-x:${slot.x};--slot-y:${slot.y};--slot-rot:${slot.r}`;
  }

  private handFanStyle(index: number, count: number): string {
    if (this.isMobilePortrait) return "";
    const mid = (count - 1) / 2;
    const delta = index - mid;
    const spread = Math.min(22, 120 / Math.max(4, count));
    const rotate = delta * spread * 0.45;
    const x = delta * 2.1;
    const y = Math.abs(delta) * 0.95;
    return `--fan-rot:${rotate.toFixed(2)}deg;--fan-x:${x.toFixed(2)}px;--fan-y:${y.toFixed(2)}px`;
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
        this.trickDisplayOverlay = null;
        this.renderer.setResolvedTrickOverlay(null);
        this.updatePhaseBanner();
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
        this.updatePhaseBanner();
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
        const rel = this.ctx.state.relativePosition(winner as any);
        const label = rel === "self" ? "You" : this.ctx.state.game?.players[winner]?.handle || rel;
        const reason = this.trickWinReason(payload);
        this.pushArenaToast(`${label} wins trick${reason ? ` (${reason})` : ""}`, 1900);
        this.applyTrickOverlayFromEvent(payload);
        this.renderHeroPlates();
        const anchors = this.renderer.getAnimationAnchors();
        this.renderer.addAnimation(new TrickWinAnimation(anchors.trickCenter.x, anchors.trickCenter.y, 600));
        this.lastLiveTableIds = [];
        break;
      }

      case "AUCTION_ACTION": {
        const seat = Number(payload.seat);
        const value = String(payload.value || "pass");
        const actor = this.seatLabelForAnnouncements(seat);
        if (value === "pass") {
          this.showAuctionAnnouncement(`${actor} passes`, 1400);
          this.pushArenaToast(`${actor} passes`);
        } else {
          this.showAuctionAnnouncement(`${actor} bids ${this.bidLabel(value)}`, 1700);
          this.pushArenaToast(`${actor} bids ${this.bidLabel(value)}`);
        }
        this.updatePhaseBanner(
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
        this.pushArenaToast(`${actor} wins with ${this.bidLabel(bid)}`);
        this.updatePhaseBanner(bid, seat);
        break;
      }

      case "CARD_PLAYED": {
        this.ctx.sounds.cardPlay();
        const seat = payload.seat as number | undefined;
        const card = payload.card as Card | undefined;
        if (seat !== undefined && card) {
          this.pushArenaToast(
            `${this.seatLabelForAnnouncements(seat)} played ${this.cardLabel(card)}`,
            1300
          );
        }
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

      case "HAND_RESULT": {
        const points = Number(payload.points || 0);
        const award = Array.isArray(payload.award) ? (payload.award as number[]) : [];
        const mySeat = this.ctx.state.mySeat;
        if (mySeat !== null && award.includes(mySeat) && points > 0) {
          this.pushArenaToast(`Round result: +${points} point${points === 1 ? "" : "s"}`, 2200);
        } else if (award.length && points > 0) {
          const names = award.map((seat) => this.seatLabelForAnnouncements(seat)).join(", ");
          this.pushArenaToast(`Round result: ${names} +${points}`, 2200);
        } else {
          this.pushArenaToast("Round complete", 1700);
        }
        break;
      }

      case "TRUMP_SET": {
        const suit = String(payload.suit || "");
        if (suit) {
          this.pushArenaToast(`Trump set to ${this.capSuit(suit)}`);
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

  private trackTrickFeedFromState(): void {
    const game = this.ctx.state.game;
    if (!game || game.phase !== "play") {
      this.lastLiveTableIds = [];
      this.trickFeedPrimed = false;
      return;
    }

    const cards = game.table || [];
    const playOrder = game.playOrder || [];
    if (!cards.length) {
      this.lastLiveTableIds = [];
      this.trickFeedPrimed = true;
      return;
    }

    if (!this.trickFeedPrimed) {
      this.lastLiveTableIds = cards.map((card) => card.id);
      this.trickFeedPrimed = true;
      return;
    }

    const prev = this.lastLiveTableIds;
    const prefixStable =
      prev.length <= cards.length &&
      prev.every((id, idx) => cards[idx] && cards[idx].id === id);

    if (prefixStable && cards.length > prev.length) {
      for (let i = prev.length; i < cards.length; i++) {
        const seat = playOrder[i];
        const card = cards[i];
        if (seat === undefined || !card) continue;
        this.pushArenaToast(
          `${this.seatLabelForAnnouncements(seat)} played ${this.cardLabel(card)}`,
          1300
        );
      }
    }

    this.lastLiveTableIds = cards.map((card) => card.id);
  }

  private updateHeader(): void {
    const game = this.ctx.state.game;
    const profile = this.ctx.profile.get();
    if (game) {
      const phase = this.phaseLabel(game.phase);
      this.headerMain.textContent = `Round ${game.handNo} · ${phase} · Target ${game.gameTarget}`;
      const turnName = this.turnActorLabelForHud(game.turn);
      const seconds =
        typeof game.turnDeadline === "number"
          ? Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000))
          : null;
      const prompt = this.phaseGuidance(game.phase, game.turn);
      this.headerSub.textContent =
        seconds !== null && game.turn !== null ? `${prompt} · ${seconds}s` : prompt;
      this.headerSub.classList.toggle("urgent", seconds !== null && seconds <= 5 && this.ctx.state.isMyTurn);

      this.hudTurn.textContent = `TURN: ${turnName}`;
      this.hudTrump.textContent = game.trump
        ? `TRUMP: ${this.suitIcon(game.trump)} ${this.capSuit(game.trump)}`
        : "TRUMP: Undeclared";
      this.hudOmbre.textContent =
        game.ombre === null ? "JUGADOR: --" : `JUGADOR: ${this.seatLabelForAnnouncements(game.ombre)}`;
      this.hudTarget.textContent = `TARGET: ${game.gameTarget}`;
    } else {
      this.headerMain.textContent = "Waiting for game state";
      this.headerSub.textContent = "";
      this.headerSub.classList.remove("urgent");
      this.hudTurn.textContent = "TURN: --";
      this.hudTrump.textContent = "TRUMP: --";
      this.hudOmbre.textContent = "JUGADOR: --";
      this.hudTarget.textContent = "TARGET: --";
    }

    const latency = this.ctx.connection.latencyMs;
    this.headerPing.textContent = latency === null ? "⏳ --" : `⏳ ${Math.round(latency)}ms`;

    this.headerName.textContent = profile.name;
    this.headerAvatar.src = profile.avatar || this.ctx.profile.getFallbackAvatar();
    this.headerAvatar.onerror = () => {
      this.headerAvatar.src = this.ctx.profile.getFallbackAvatar();
    };

    const soundOn = this.ctx.settings.get("soundEnabled");
    this.soundToggleBtn.textContent = soundOn ? "🔊 On" : "🔇 Off";
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

    const chips: string[] = [`<span class="mobile-summary-chip">🧾 Round ${game.handNo}</span>`];
    chips.push(`<span class="mobile-summary-chip">🎯 ${game.gameTarget}</span>`);
    if (game.turn !== null) {
      const secs = typeof game.turnDeadline === "number"
        ? ` · ${Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000))}s`
        : "";
      const mine = game.turn === this.ctx.state.mySeat ? " mine" : "";
      chips.push(`<span class="mobile-summary-chip turn${mine}">${escapeHtml(`⏳ ${this.turnActorLabelForHud(game.turn)}${secs}`)}</span>`);
    }

    this.mobileSummary.innerHTML = chips.join("");
  }

  private renderHeroPlates(): void {
    const game = this.ctx.state.game;
    if (!game || this.ctx.state.mySeat === null) {
      this.heroPlates.innerHTML = "";
      this.selfHeroPlate.innerHTML = "";
      return;
    }

    const sidePositions: Array<"left" | "across" | "right"> = ["left", "across", "right"];
    this.heroPlates.innerHTML = sidePositions
      .map((position) => this.renderHeroPlateMarkup(position))
      .join("");
    this.selfHeroPlate.innerHTML = this.renderHeroPlateMarkup("self");

    this.container.querySelectorAll<HTMLImageElement>(".hero-avatar").forEach((img) => {
      img.onerror = () => {
        const fallback = img.dataset.fallback;
        if (!fallback) return;
        img.onerror = null;
        img.src = fallback;
      };
    });
  }

  private renderHeroPlateMarkup(
    position: "self" | "left" | "across" | "right"
  ): string {
    const game = this.ctx.state.game;
    if (!game) return "";

    const seat = this.ctx.state.seatAtPosition(position);
    if (seat === null) return "";

    const player = game.players[seat];
    const isSelf = position === "self";
    const name = isSelf ? this.ctx.profile.get().name : player?.handle || `Seat ${seat}`;
    const avatar = isSelf
      ? this.ctx.profile.get().avatar || this.ctx.profile.getFallbackAvatar()
      : player?.isBot
        ? buildBotAvatarUrl(
            player.handle || `bot-${seat}`,
            seat,
            game.roomCode || this.ctx.state.roomCode
          )
        : buildDiceBearUrl(name || `seat-${seat}`, "identicon");
    const fallback = fallbackAvatarAt(seat);
    const active = game.turn === seat ? " active-turn" : "";
    const resting = game.resting === seat ? " resting" : "";
    const disconnected = player && !player.connected ? " disconnected" : "";
    const score = game.scores[seat] || 0;
    const cards = game.handsCount[seat] || 0;
    const tricks = game.tricks[seat] || 0;
    const roleLabel = this.roleLabelForSeat(seat);
    const ombreTag = game.ombre === seat ? `<span class="hero-ombre-tag">👑 JUGADOR</span>` : "";
    const turnTag = game.turn === seat ? `<span class="hero-turn-tag">TURN</span>` : "";
    const stateTag =
      game.resting === seat && roleLabel !== "RESTING"
        ? `<span class="hero-state-tag">Resting</span>`
        : "";
    const sideClass = isSelf ? "" : " hero-side";
    const roleText = roleLabel.toLowerCase();

    return `
      <section class="hero-plate hero-${position}${sideClass}${active}${resting}${disconnected}" aria-label="${escapeHtml(
        `${name}, ${roleText}, score ${score}, cards ${cards}, tricks ${tricks}`
      )}">
        <div class="hero-main-row">
          <span class="hero-avatar-medallion">
            <img class="hero-avatar" src="${avatar}" data-fallback="${fallback}" alt="" />
          </span>
          <div class="hero-id-col">
            <span class="hero-seat">${escapeHtml(roleLabel)}</span>
            <span class="hero-name">${escapeHtml(name)}</span>
          </div>
          <div class="hero-tags">
            ${ombreTag}
            ${turnTag}
            ${stateTag}
          </div>
        </div>
        <div class="hero-badges-row">
          <span class="hero-badge score"><span class="hero-badge-icon">🏆</span><span class="hero-badge-label">Score</span><span class="hero-badge-num">${score}</span></span>
          <span class="hero-badge cards"><span class="hero-badge-icon">🃏</span><span class="hero-badge-label">Cards</span><span class="hero-badge-num">${cards}</span></span>
          <span class="hero-badge tricks"><span class="hero-badge-icon">🎯</span><span class="hero-badge-label">Tricks</span><span class="hero-badge-num">${tricks}</span></span>
        </div>
        <div class="hero-trick-dots" aria-label="${escapeHtml(`Tricks won ${tricks}`)}">${this.renderTrickDots(tricks)}</div>
      </section>
    `;
  }

  private renderTrickDots(tricks: number): string {
    const maxDots = 6;
    const filled = Math.max(0, Math.min(maxDots, tricks));
    const dots = Array.from({ length: maxDots }, (_, idx) => {
      const active = idx < filled ? " filled" : "";
      return `<span class="hero-trick-dot${active}" aria-hidden="true">${idx < filled ? "◆" : "◌"}</span>`;
    });
    return dots.join("");
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
      { pos: "left" },
      { pos: "across" },
      { pos: "right" },
    ] as const)
      .map(({ pos }) => {
        const seat = this.ctx.state.seatAtPosition(pos);
        if (seat === null) return "";
        const player = game.players[seat];
        const name = player?.handle || `Seat ${seat}`;
        const tricks = game.tricks[seat] || 0;
        const active = game.turn === seat ? " active-turn" : "";
        const disconnected = player && !player.connected ? " disconnected" : "";
        const isOmbre = game.ombre === seat;
        const role = this.roleLabelForSeat(seat);
        const avatarUrl = player?.isBot
          ? buildBotAvatarUrl(
              player.handle || `bot-${seat}`,
              seat,
              game.roomCode || this.ctx.state.roomCode
            )
          : buildDiceBearUrl(name || `seat-${seat}`, "identicon");
        const fallback = fallbackAvatarAt(seat);
        const aria = `${role.toLowerCase()} ${name}, tricks ${tricks}`;

        return `
          <div class="mobile-opponent${active}${disconnected}" role="listitem" aria-label="${escapeHtml(aria)}">
            <img class="mobile-opponent-avatar" src="${avatarUrl}" data-fallback="${fallback}" alt="" />
            <div class="mobile-opponent-meta">
              <span class="mobile-opponent-seat">${escapeHtml(role)}</span>
              <span class="mobile-opponent-name">${escapeHtml(name)}</span>
            </div>
            ${isOmbre ? `<span class="mobile-opponent-ombre">👑 JUGADOR</span>` : ""}
            <div class="mobile-opponent-stats">
              <span>🎯 ${tricks}</span>
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

  private updatePhaseBanner(currentBid?: string, currentBidder?: number | null): void {
    const game = this.ctx.state.game;
    if (!game) {
      this.phaseBannerMain.textContent = "";
      this.phaseBannerSub.textContent = "";
      return;
    }

    this.phaseBannerMain.textContent = this.phaseLabel(game.phase).toUpperCase();
    this.phaseBanner.classList.toggle("your-turn", this.ctx.state.isMyTurn);

    const bid = currentBid ?? game.auction.currentBid;
    const bidder = currentBidder === undefined ? game.auction.currentBidder : currentBidder;

    let sub = "";
    if (game.phase === "auction") {
      if (bid === "pass" || bidder === null) {
        sub = game.turn === this.ctx.state.mySeat ? "Your turn: choose a bid" : "No leading bid yet";
      } else {
        const leader = `Leading bid: ${this.bidLabel(bid)} by ${this.seatLabelForAnnouncements(bidder)}`;
        sub = game.turn === this.ctx.state.mySeat ? `Your turn: choose a bid · ${leader}` : leader;
      }
    } else if (game.phase === "trump_choice") {
      sub = game.turn === this.ctx.state.mySeat
        ? "Your turn: choose trump"
        : game.turn !== null
          ? `Waiting for ${this.seatLabelForAnnouncements(game.turn)} to choose trump`
          : "Waiting for trump selection";
    } else if (game.phase === "exchange") {
      sub = this.ctx.state.canExchangeNow
        ? "Select cards to exchange"
        : game.exchange.current !== null
          ? `Waiting for ${this.seatLabelForAnnouncements(game.exchange.current)} to exchange`
          : "Preparing exchange";
    } else if (game.phase === "penetro_choice") {
      sub = "Resting player decides Penetro";
    } else if (game.phase === "play") {
      if (game.turn === null) {
        sub = "Waiting for lead";
      } else if (game.turn === this.ctx.state.mySeat) {
        sub = "Your turn: play a legal card";
      } else {
        sub = `Waiting for ${this.seatLabelForAnnouncements(game.turn)} to play`;
      }
    } else if (game.phase === "dealing") {
      sub = "Dealing cards";
    } else if (game.phase === "post_hand") {
      sub = "Hand complete";
    } else if (game.phase === "match_end") {
      sub = "Match complete";
    }
    this.phaseBannerSub.textContent = sub;
  }

  private showAuctionAnnouncement(text: string, ttlMs: number): void {
    this.phaseBannerSub.textContent = text;

    if (this.auctionBannerTimer !== null) {
      clearTimeout(this.auctionBannerTimer);
      this.auctionBannerTimer = null;
    }

    this.auctionBannerTimer = window.setTimeout(() => {
      this.updatePhaseBanner();
      this.auctionBannerTimer = null;
    }, ttlMs);
  }

  private pushArenaToast(text: string, ttlMs = 1400): void {
    while (this.arenaToastFeed.childElementCount >= 2) {
      this.arenaToastFeed.firstElementChild?.remove();
    }
    const chip = document.createElement("div");
    chip.className = "arena-toast-chip";
    chip.textContent = text;
    this.arenaToastFeed.appendChild(chip);
    window.setTimeout(() => {
      chip.classList.add("exit");
      window.setTimeout(() => chip.remove(), 260);
    }, ttlMs);
  }

  private seatLabelForAnnouncements(seat: number): string {
    if (this.ctx.state.mySeat === seat) return "You";
    const role = this.roleLabelForSeat(seat as SeatIndex);
    const handle = this.ctx.state.game?.players[seat]?.handle;
    if (handle) {
      if (role.startsWith("PRIMER")) return `Primer Contrincante (${handle})`;
      if (role.startsWith("SEGUNDO")) return `Segundo Contrincante (${handle})`;
      if (role === "JUGADOR") return `Jugador (${handle})`;
      return handle;
    }
    if (role === "JUGADOR") return "Jugador";
    if (role.startsWith("PRIMER")) return "Primer Contrincante";
    if (role.startsWith("SEGUNDO")) return "Segundo Contrincante";
    return `Seat ${seat}`;
  }

  private turnActorLabelForHud(turnSeat: number | null): string {
    if (turnSeat === null) return "Waiting";
    return this.seatLabelForAnnouncements(turnSeat);
  }

  private phaseGuidance(phase: string, turnSeat: number | null): string {
    const actor = turnSeat === null ? "table" : this.seatLabelForAnnouncements(turnSeat);
    if (phase === "auction") {
      return turnSeat === this.ctx.state.mySeat
        ? "Your turn: choose a bid"
        : `Waiting for ${actor} to bid`;
    }
    if (phase === "trump_choice") {
      return turnSeat === this.ctx.state.mySeat
        ? "Your turn: choose trump"
        : `Waiting for ${actor} to choose trump`;
    }
    if (phase === "exchange") {
      if (this.ctx.state.canExchangeNow) return "Your turn: select cards to exchange";
      const current = this.ctx.state.game?.exchange.current;
      return current !== null && current !== undefined
        ? `Waiting for ${this.seatLabelForAnnouncements(current)} to exchange`
        : "Preparing exchange";
    }
    if (phase === "play") {
      return turnSeat === this.ctx.state.mySeat
        ? "Your turn: play a legal card"
        : `Waiting for ${actor} to play`;
    }
    if (phase === "dealing") return "Dealing cards";
    if (phase === "penetro_choice") return "Resting player decides penetro";
    if (phase === "post_hand") return "Hand complete";
    if (phase === "match_end") return "Match complete";
    return "Waiting for next action";
  }

  private cardLabel(card: Card): string {
    const rankNames: Record<number, string> = {
      1: "As",
      10: "Sota",
      11: "Caballo",
      12: "Rey",
    };
    const rank = rankNames[card.r] || String(card.r);
    return `${rank} de ${this.capSuit(card.s)}`;
  }

  private trickWinReason(payload: Record<string, unknown>): string {
    const cards = Array.isArray(payload.cards) ? (payload.cards as Card[]) : [];
    const playOrder = Array.isArray(payload.playOrder) ? (payload.playOrder as number[]) : [];
    const winner = Number(payload.winner);
    const winIdx = playOrder.indexOf(winner);
    if (winIdx < 0 || !cards[winIdx] || !cards[0]) return "";

    const lead = cards[0];
    const winning = cards[winIdx];
    const trump = this.ctx.state.game?.trump;

    if (trump && winning.s === trump && lead.s !== trump) {
      return "trump advantage";
    }
    if (winning.s === lead.s) {
      return `highest ${this.capSuit(lead.s)}`;
    }
    if (trump && winning.s === trump) {
      return "trump advantage";
    }
    return "highest card";
  }

  private trickActorLabel(seat: number | undefined): string {
    if (seat === undefined) return "";
    const rel = this.ctx.state.relativePosition(seat as SeatIndex);
    if (rel === "self") return "YOU";
    const role = this.roleLabelForSeat(seat as SeatIndex);
    const relLabel = role === "JUGADOR"
      ? "JUGADOR"
      : role.startsWith("PRIMER")
        ? "PRIMER"
        : role.startsWith("SEGUNDO")
          ? "SEGUNDO"
          : rel.toUpperCase();
    const handle = this.ctx.state.game?.players[seat]?.handle;
    return handle ? `${relLabel} · ${handle}` : relLabel;
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

  private phaseLabel(phase: string): string {
    const labels: Record<string, string> = {
      dealing: "Dealing",
      auction: "Auction",
      penetro_choice: "Penetro Choice",
      trump_choice: "Choose Trump",
      exchange: "Exchange",
      play: "Play Trick",
      post_hand: "Hand Complete",
      match_end: "Match End",
    };
    return labels[phase] || phase;
  }

  private capSuit(suit: string): string {
    return suit.charAt(0).toUpperCase() + suit.slice(1);
  }

  private suitIcon(suit: string): string {
    const icons: Record<string, string> = {
      oros: "♦",
      copas: "♥",
      espadas: "♠",
      bastos: "♣",
    };
    return icons[suit] || "";
  }

  private capLabel(pos: "left" | "across" | "right" | "self"): string {
    const map: Record<typeof pos, string> = {
      self: "You",
      left: "Left",
      across: "Across",
      right: "Right",
    };
    return map[pos];
  }

  private activeSeatsForRole(): SeatIndex[] {
    const game = this.ctx.state.game;
    if (!game) return [0, 1, 2];
    if (game.contract === "penetro") return [0, 1, 2, 3];
    return ([0, 1, 2, 3] as SeatIndex[]).filter((s) => s !== game.resting).slice(0, 3);
  }

  private nextActiveSeat(seat: SeatIndex): SeatIndex {
    const active = this.activeSeatsForRole();
    const idx = active.indexOf(seat);
    if (idx < 0) return active[0];
    return active[(idx + 1) % active.length];
  }

  private roleLabelForSeat(seat: SeatIndex): string {
    const game = this.ctx.state.game;
    if (!game) return `Seat ${seat}`;
    if (game.resting === seat) return "RESTING";
    if (game.ombre === null) {
      return this.capLabel(this.ctx.state.relativePosition(seat)).toUpperCase();
    }
    if (seat === game.ombre) return "JUGADOR";
    const primer = this.nextActiveSeat(game.ombre);
    const segundo = this.nextActiveSeat(primer);
    if (seat === primer) return "PRIMER CONTR.";
    if (seat === segundo) return "SEGUNDO CONTR.";
    return this.capLabel(this.ctx.state.relativePosition(seat)).toUpperCase();
  }

  private applyTrickOverlayFromEvent(payload: Record<string, unknown>): void {
    const cards = Array.isArray(payload.cards) ? (payload.cards as Card[]).map((c) => ({ ...c })) : [];
    const playOrder = Array.isArray(payload.playOrder) ? (payload.playOrder as SeatIndex[]).slice() : [];
    const winner = Number(payload.winner) as SeatIndex;
    if (!cards.length) return;

    this.trickDisplayOverlay = { cards, playOrder, winner };
    this.renderer.setResolvedTrickOverlay({
      cards,
      playOrder,
      winner,
      expiresAt: Date.now() + 900,
    });
    this.renderDomCardLayers();

    if (this.trickOverlayTimer !== null) {
      clearTimeout(this.trickOverlayTimer);
      this.trickOverlayTimer = null;
    }
    this.trickOverlayTimer = window.setTimeout(() => {
      this.trickDisplayOverlay = null;
      this.renderer.setResolvedTrickOverlay(null);
      this.renderDomCardLayers();
      this.trickOverlayTimer = null;
    }, 900);
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
    this.renderHeroPlates();
    this.updatePhaseBanner();
    this.renderDomCardLayers();
  };
}
