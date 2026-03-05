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

export class GameScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private renderer!: GameRenderer;
  private controls!: GameControls;
  private unsubscribes: Array<() => void> = [];

  private headerMeta!: HTMLElement;
  private headerAvatar!: HTMLImageElement;
  private headerName!: HTMLElement;
  private soundToggleBtn!: HTMLButtonElement;

  private domLayers!: HTMLElement;
  private trickLayer!: HTMLElement;
  private handLayer!: HTMLElement;
  private spriteMode = false;

  private prevPhase: string | null = null;
  private prevTurn: number | null = null;

  private lastTouchTs = 0;
  private pendingPlayCard: string | null = null;
  private headerTicker: number | null = null;
  private lastInvalidToastTs = 0;

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

          <div class="game-canvas-wrap">
            <canvas id="game-canvas"></canvas>

            <div id="game-dom-layers" class="game-dom-layers" hidden>
              <div class="trick-overlay" aria-hidden="true">
                <div class="trick-overlay-inner" id="trick-layer"></div>
              </div>

              <div class="hand-overlay">
                <div class="hand-row rc-panel rc-panel-noise" id="hand-layer" role="listbox" aria-label="Your hand"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="game-controls-bar rc-panel rc-panel-noise" id="game-controls"></div>
      </div>
    `;

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

    this.domLayers = container.querySelector("#game-dom-layers") as HTMLElement;
    this.trickLayer = container.querySelector("#trick-layer") as HTMLElement;
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
    this.configureSpritesheetMode();
    this.headerTicker = window.setInterval(() => this.updateHeader(), 1000);
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
        },
      });
    });

    this.soundToggleBtn?.addEventListener("click", () => {
      const next = !this.ctx.settings.get("soundEnabled");
      this.ctx.settings.set("soundEnabled", next);
      this.updateHeader();
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
        this.renderDomCardLayers();
      }),

      this.ctx.profile.subscribe(() => {
        this.renderer.requestRender();
        this.updateHeader();
      }),

      this.ctx.settings.subscribe(() => {
        this.renderer.requestRender();
        this.updateHeader();
      }),

      this.ctx.connection.on("EVENT", (msg: S2CMessage) => {
        if (msg.type !== "EVENT") return;
        this.handleEvent(msg.name, msg.payload);
      }),
      this.ctx.connection.on("_latency", () => {
        this.updateHeader();
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

    if (supported) {
      ensureSpritesheetCss();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const renderable = verifySpritesheetClasses(this.ctx.state.hand);
      if (!renderable) {
        this.spriteMode = false;
        this.domLayers.hidden = true;
        this.renderer.setCanvasCardLayers({ hand: true, table: true });
        return;
      }
      this.renderer.setCanvasCardLayers({ hand: false, table: false });
      this.renderDomCardLayers();
      return;
    }

    this.renderer.setCanvasCardLayers({ hand: true, table: true });
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
        break;
      case "auction":
        if (this.ctx.state.isMyTurn) showToast("Your turn to bid", "info", 1800);
        break;
      case "trump_choice":
        if (this.ctx.state.isMyTurn) showToast("Choose trump suit", "info", 1800);
        break;
      case "exchange":
        if (this.ctx.state.canExchangeNow) showToast("Select cards to exchange", "info", 1800);
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
        const rel = this.ctx.state.relativePosition(winner as any);
        const label = rel === "self" ? "You" : this.ctx.state.game?.players[winner]?.handle || rel;
        showToast(`${label} won the trick`, "info", 1300);
        this.renderer.addAnimation(new TrickWinAnimation(512, 340, 600));
        break;
      }

      case "CARD_PLAYED": {
        this.ctx.sounds.cardPlay();
        const seat = payload.seat as number | undefined;
        if (seat !== undefined) {
          const relPos = this.ctx.state.relativePosition(seat as any);
          const positions: Record<string, { x: number; y: number }> = {
            self: { x: 512, y: 570 },
            left: { x: 120, y: 280 },
            across: { x: 512, y: 100 },
            right: { x: 904, y: 280 },
          };
          const from = positions[relPos] || positions.across;
          this.renderer.addAnimation(new CardPlayAnimation(from.x, from.y, 512, 340, 76, 108, 250));
        }
        break;
      }

      case "DEAL": {
        this.ctx.sounds.cardDeal();
        const dealTargets = [
          { x: 512, y: 570 },
          { x: 120, y: 280 },
          { x: 512, y: 100 },
          { x: 904, y: 280 },
        ];
        for (let i = 0; i < dealTargets.length; i++) {
          const target = dealTargets[i];
          this.renderer.addAnimation(
            new CardDealAnimation(512, 340, target.x, target.y, 76, 108, i * 80, 300)
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

    const metaParts: string[] = [];
    if (game) {
      metaParts.push(`Round ${game.handNo}`);
      if (game.contract) metaParts.push(`Contract: ${String(game.contract).replace("_", " ")}`);
      if (game.trump) metaParts.push(`Trump: ${game.trump}`);
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

    if (this.ctx.connection.latencyMs !== null) {
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

  private handleResize = (): void => {
    const wrap = this.container.querySelector(".game-canvas-wrap") as HTMLElement | null;
    if (!wrap || !this.canvas) return;

    const wrapRect = wrap.getBoundingClientRect();
    const targetRatio = 1024 / 720;
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
  };
}
