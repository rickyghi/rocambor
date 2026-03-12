import "./game.css";

import type { AppContext } from "../router";
import {
  CardDealAnimation,
  CardPlayAnimation,
  TrickWinAnimation,
} from "../canvas/animations";
import { GameRenderer } from "../canvas/renderer";
import type {
  GameDomLayerBridge,
  TrickDisplayOverlaySnapshot,
} from "../app/screens/game-dom-layer-bridge";
import type { GameFeedbackBridge } from "../app/screens/game-feedback-bridge";
import {
  detectSpritesheetSupport,
  ensureSpritesheetCss,
} from "../lib/card-sprites";
import type { Card, S2CMessage, SeatIndex } from "../protocol";
import { showToast } from "../ui/toast";
import { detectGameMobilePortrait } from "../app/screens/game-viewport";
export class GameScreen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private rootEl!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private domLayerBridge!: GameDomLayerBridge;
  private feedbackBridge!: GameFeedbackBridge;
  private renderer!: GameRenderer;
  private unsubscribes: Array<() => void> = [];
  private spriteMode = false;

  private prevPhase: string | null = null;
  private prevTurn: number | null = null;
  private lastObservedSeq = -1;
  private lastObservedSeat: SeatIndex | null = null;
  private lastObservedHandKey = "";
  private lastObservedPhase = "";

  private lastTouchTs = 0;
  private pendingPlayCard: string | null = null;
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

  attach(
    container: HTMLElement,
    ctx: AppContext,
    domLayerBridge: GameDomLayerBridge,
    feedbackBridge: GameFeedbackBridge
  ): void {
    this.ctx = ctx;
    this.container = container;
    this.domLayerBridge = domLayerBridge;
    this.feedbackBridge = feedbackBridge;

    if (!ctx.state.game) {
      ctx.router.navigate("home");
      return;
    }

    this.rootEl = (
      container.matches(".game-screen")
        ? container
        : container.querySelector(".game-screen")
    ) as HTMLElement;
    if (!this.rootEl) {
      console.error("[game] Missing required DOM nodes for game screen");
      return;
    }
    this.canvas = this.rootEl.querySelector("#game-canvas") as HTMLCanvasElement;
    if (!this.canvas) {
      console.error("[game] Missing required DOM nodes for game screen");
      return;
    }
    const canvasCtx = this.canvas.getContext("2d")!;

    this.renderer = new GameRenderer(
      this.canvas,
      canvasCtx,
      ctx.state,
      ctx.settings,
      ctx.profile
    );
    this.renderer.setDomPlatesEnabled(true);
    this.domLayerBridge.setHandlers({
      onCardInteraction: (cardId, tapToConfirm) => {
        this.handleCardInteraction(cardId, tapToConfirm);
      },
      onMobileAction: () => {
        this.handleMobileActionClick();
      },
      onSpriteRenderFailure: () => {
        this.handleDomSpriteRenderFailure();
      },
    });

    this.bindEvents();
    this.setupSubscriptions();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);

    if (ctx.state.game) {
      this.prevPhase = ctx.state.game.phase;
      this.prevTurn = ctx.state.game.turn;
    }
    this.lastObservedSeq = ctx.state.game?.seq ?? -1;
    this.lastObservedSeat = ctx.state.mySeat;
    this.lastObservedHandKey = this.handSignature();
    this.lastObservedPhase = ctx.state.game?.phase ?? "";

    this.syncPhaseClass();
    this.domLayerBridge.setPendingPlayCard(this.pendingPlayCard);
    this.domLayerBridge.setTrickDisplayOverlay(this.trickDisplayOverlay);
    this.updatePhaseBanner();
    this.configureSpritesheetMode();
  }

  unmount(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.unsubscribes = [];

    this.renderer?.destroy();

    this.canvas?.removeEventListener("click", this.handleCanvasClick);
    this.canvas?.removeEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas?.removeEventListener("mouseleave", this.handleCanvasMouseLeave);
    this.canvas?.removeEventListener("touchstart", this.handleTouchStart);
    this.canvas?.removeEventListener("touchend", this.handleTouchEnd);

    window.removeEventListener("resize", this.handleResize);
    if (this.auctionBannerTimer !== null) {
      clearTimeout(this.auctionBannerTimer);
      this.auctionBannerTimer = null;
    }
    if (this.trickOverlayTimer !== null) {
      clearTimeout(this.trickOverlayTimer);
      this.trickOverlayTimer = null;
    }
    this.domLayerBridge.reset();
    this.feedbackBridge.reset();
  }

  private bindEvents(): void {
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleCanvasMouseLeave);
    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);
  }

  private setupSubscriptions(): void {
    this.unsubscribes.push(
      this.ctx.state.subscribe(() => {
        const nextSeq = this.ctx.state.game?.seq ?? -1;
        const nextSeat = this.ctx.state.mySeat;
        const nextHandKey = this.handSignature();
        const nextPhase = this.ctx.state.game?.phase ?? "";
        const stateChanged =
          nextSeq !== this.lastObservedSeq ||
          nextSeat !== this.lastObservedSeat ||
          nextHandKey !== this.lastObservedHandKey ||
          nextPhase !== this.lastObservedPhase;

        this.lastObservedSeq = nextSeq;
        this.lastObservedSeat = nextSeat;
        this.lastObservedHandKey = nextHandKey;
        this.lastObservedPhase = nextPhase;

        this.renderer.requestRender();
        if (stateChanged) {
          this.syncPhaseClass();
          this.handlePhaseTransitions();
          this.trackTrickFeedFromState();
          this.updatePhaseBanner();
        }
      }),

      this.ctx.profile.subscribe(() => {
        this.renderer.requestRender();
      }),

      this.ctx.settings.subscribe(() => {
        this.renderer.requestRender();
      }),

      this.ctx.connection.on("EVENT", (msg: S2CMessage) => {
        if (msg.type !== "EVENT") return;
        this.handleEvent(msg.name, msg.payload);
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
    this.syncCardPresentationMode();

    if (supported) {
      ensureSpritesheetCss();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      this.renderer.setCanvasCardLayers({ hand: false, table: false });
      return;
    }

    this.renderer.setCanvasCardLayers({ hand: true, table: true });
    this.syncCardPresentationMode();
  }

  private syncCardPresentationMode(): void {
    this.rootEl.classList.toggle("sprite-mode", this.spriteMode);
    this.domLayerBridge.setSpriteMode(this.spriteMode);
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

  private handleMobileActionClick = (): void => {
    const state = this.ctx.state;
    const game = state.game;
    if (!game) return;

    if (state.phase === "play" && this.pendingPlayCard) {
      this.ctx.connection.send({ type: "PLAY", cardId: this.pendingPlayCard });
      this.ctx.sounds.cardPlay();
      this.setPendingPlayCard(null);
      state.clearSelection();
      return;
    }

    if (state.phase === "exchange" && state.canExchangeNow) {
      const selected = Array.from(state.selectedCards);
      const { min, max } = state.getExchangeLimits();
      if (selected.length < min || selected.length > max) {
        this.showInvalidAction(
          min === 1 && max === 1 ? "Select exactly 1 card to exchange." : "Select a valid exchange."
        );
        return;
      }
      if (selected.length > 0) {
        this.ctx.connection.send({ type: "EXCHANGE", discardIds: selected });
        this.ctx.sounds.cardPlay();
        state.clearSelection();
      } else {
        this.ctx.connection.send({ type: "EXCHANGE", discardIds: [] });
        this.ctx.sounds.cardPlay();
      }
      return;
    }
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
      this.setPendingPlayCard(null);
      state.clearSelection();
      return;
    }

    this.setPendingPlayCard(cardId);
    state.clearSelection();
    state.toggleCardSelection(cardId);
  }

  private showInvalidAction(message: string): void {
    const now = Date.now();
    if (now - this.lastInvalidToastTs > 900) {
      showToast(message, "warning", 1300);
      this.lastInvalidToastTs = now;
    }
    this.domLayerBridge.pulseInvalidShake();
  }

  /** Toggle phase-specific CSS classes on root element for card sizing */
  private syncPhaseClass(): void {
    const game = this.ctx.state.game;
    const phase = game?.phase ?? "";
    const phaseClasses = ["phase-auction", "phase-play", "phase-exchange", "phase-trump"];
    phaseClasses.forEach((cls) => this.rootEl.classList.remove(cls));

    if (phase === "auction") this.rootEl.classList.add("phase-auction");
    else if (phase === "play") this.rootEl.classList.add("phase-play");
    else if (phase === "exchange") this.rootEl.classList.add("phase-exchange");
    else if (phase === "trump_choice") this.rootEl.classList.add("phase-trump");
  }

  private handlePhaseTransitions(): void {
    const game = this.ctx.state.game;
    if (!game) return;

    const newPhase = game.phase;
    const newTurn = game.turn;

    if (newPhase !== this.prevPhase) {
      const oldPhase = this.prevPhase;
      this.prevPhase = newPhase;
      this.onPhaseChange(oldPhase, newPhase);
    }

    if (newTurn !== this.prevTurn) {
      this.setPendingPlayCard(null);
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
        this.setTrickDisplayOverlay(null);
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
        break;
      case "play":
        if (oldPhase === "exchange") this.ctx.state.clearSelection();
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
        const trickCards = Array.isArray(payload.cards) ? (payload.cards as Card[]) : [];
        const trickPlayOrder = Array.isArray(payload.playOrder) ? (payload.playOrder as number[]) : [];
        const winIdx = trickPlayOrder.indexOf(winner);
        const winnerCard = winIdx >= 0 ? trickCards[winIdx] : null;
        const winnerLabel = rel === "self" ? "You win" : `${label} wins`;
        const cardDesc = winnerCard ? ` with ${this.cardLabel(winnerCard)}` : "";
        this.showTrickResultBanner(`${winnerLabel}${cardDesc}!`);
        this.applyTrickOverlayFromEvent(payload);
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
        const seat = payload.seat as number | undefined;
        const card = payload.card as Card | undefined;
        if (seat !== this.ctx.state.mySeat) {
          this.ctx.sounds.cardPlay();
        }
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

    this.lastLiveTableIds = cards.map((card) => card.id);
  }

  private updatePhaseBanner(currentBid?: string, currentBidder?: number | null): void {
    const game = this.ctx.state.game;
    if (!game) {
      this.feedbackBridge.setPhaseBanner({ main: "", sub: "", yourTurn: false });
      return;
    }

    const main = this.phaseLabel(game.phase).toUpperCase();
    const yourTurn = this.ctx.state.isMyTurn;

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

    this.feedbackBridge.setPhaseBanner({ main, sub, yourTurn });
  }

  private showAuctionAnnouncement(text: string, ttlMs: number): void {
    this.feedbackBridge.setPhaseBannerSub(text);

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
    this.feedbackBridge.pushToast(text, ttlMs);
  }

  private showTrickResultBanner(text: string): void {
    this.feedbackBridge.showTrickResult(text);
  }

  private handSignature(): string {
    return this.ctx.state.hand.map((card) => card.id).join("|");
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

    this.setTrickDisplayOverlay({ cards, playOrder, winner });
    this.renderer.setResolvedTrickOverlay({
      cards,
      playOrder,
      winner,
      expiresAt: Date.now() + 1500,
    });

    if (this.trickOverlayTimer !== null) {
      clearTimeout(this.trickOverlayTimer);
      this.trickOverlayTimer = null;
    }
    this.trickOverlayTimer = window.setTimeout(() => {
      this.setTrickDisplayOverlay(null);
      this.renderer.setResolvedTrickOverlay(null);
      this.trickOverlayTimer = null;
    }, 1500);
  }

  private handleResize = (): void => {
    const wrap = this.container.querySelector(".game-canvas-wrap") as HTMLElement | null;
    if (!wrap || !this.canvas) return;

    const mobilePortrait = detectGameMobilePortrait();

    this.domLayerBridge.setIsMobilePortrait(mobilePortrait);
    this.renderer.setViewportMode(mobilePortrait ? "mobile-portrait" : "desktop");

    // Fill viewport — no aspect-ratio letterboxing
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width <= 0 || wrapRect.height <= 0) return;

    this.canvas.style.width = `${wrapRect.width}px`;
    this.canvas.style.height = `${wrapRect.height}px`;

    this.updatePhaseBanner();
  };

  private setPendingPlayCard(cardId: string | null): void {
    this.pendingPlayCard = cardId;
    this.domLayerBridge.setPendingPlayCard(cardId);
  }

  private setTrickDisplayOverlay(overlay: TrickDisplayOverlaySnapshot | null): void {
    this.trickDisplayOverlay = overlay;
    this.domLayerBridge.setTrickDisplayOverlay(overlay);
  }

  private handleDomSpriteRenderFailure(): void {
    if (!this.spriteMode) return;
    this.spriteMode = false;
    this.renderer.setCanvasCardLayers({ hand: true, table: true });
    this.syncCardPresentationMode();
    showToast("Using fallback card renderer.", "info", 1200);
  }
}
