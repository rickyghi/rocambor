import type { Screen, AppContext } from "../router";
import { GameRenderer } from "../canvas/renderer";
import { GameControls } from "../ui/controls";
import { showToast } from "../ui/toast";
import type { S2CMessage } from "../protocol";
import {
  CardPlayAnimation,
  TrickWinAnimation,
  CardDealAnimation,
} from "../canvas/animations";

export class GameScreen implements Screen {
  private ctx!: AppContext;
  private container!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private renderer!: GameRenderer;
  private controls!: GameControls;
  private unsubscribes: Array<() => void> = [];
  private prevPhase: string | null = null;
  private prevTurn: number | null = null;

  mount(container: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    this.container = container;

    container.innerHTML = `
      <div class="screen game-screen">
        <div class="game-canvas-wrap">
          <canvas id="game-canvas"></canvas>
        </div>
        <div class="game-controls-bar" id="game-controls"></div>
      </div>
    `;

    this.addStyles();

    // Setup canvas
    this.canvas = container.querySelector("#game-canvas") as HTMLCanvasElement;
    const canvasCtx = this.canvas.getContext("2d")!;

    // Create renderer
    this.renderer = new GameRenderer(
      this.canvas,
      canvasCtx,
      ctx.state,
      ctx.settings
    );

    // Create controls
    const controlsEl = container.querySelector("#game-controls") as HTMLElement;
    this.controls = new GameControls(controlsEl, ctx.connection, ctx.state);

    // Canvas interaction: mouse + touch handlers
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleCanvasMouseLeave);
    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);

    // Subscribe to state changes
    this.unsubscribes.push(
      ctx.state.subscribe(() => {
        this.renderer.requestRender();
        this.handlePhaseTransitions();
      })
    );

    // Listen for server events
    this.unsubscribes.push(
      ctx.connection.on("EVENT", (msg: S2CMessage) => {
        if (msg.type !== "EVENT") return;
        this.handleEvent(msg.name, msg.payload);
      })
    );

    // Listen for errors
    this.unsubscribes.push(
      ctx.connection.on("ERROR", (msg: S2CMessage) => {
        if (msg.type !== "ERROR") return;
        showToast(msg.message || msg.code, "error");
        ctx.sounds.error();
      })
    );

    // Listen for room left
    this.unsubscribes.push(
      ctx.connection.on("ROOM_LEFT", () => {
        ctx.router.navigate("home");
      })
    );

    // Resize handler
    this.handleResize();
    window.addEventListener("resize", this.handleResize);

    // Initialize phase tracking
    if (ctx.state.game) {
      this.prevPhase = ctx.state.game.phase;
      this.prevTurn = ctx.state.game.turn;
    }
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
    window.removeEventListener("resize", this.handleResize);
  }

  // --- Canvas interaction ---

  private handleCanvasClick = (e: MouseEvent): void => {
    const { x, y } = this.renderer.canvasCoords(e.clientX, e.clientY);
    const hit = this.renderer.hitTestCard(x, y);

    if (!hit) return;

    const state = this.ctx.state;
    const phase = state.phase;

    if (phase === "exchange" && state.isMyTurn) {
      // Toggle card selection for exchange
      state.toggleCardSelection(hit.card.id);
      this.ctx.sounds.cardPlay();
    } else if (phase === "play" && state.isMyTurn) {
      // Play the card
      this.ctx.connection.send({ type: "PLAY", cardId: hit.card.id });
      this.ctx.sounds.cardPlay();
    }
  };

  private handleCanvasMouseMove = (e: MouseEvent): void => {
    const { x, y } = this.renderer.canvasCoords(e.clientX, e.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(hit ? hit.index : -1);

    // Change cursor
    const state = this.ctx.state;
    const isInteractive =
      hit &&
      ((state.phase === "exchange" && state.isMyTurn) ||
        (state.phase === "play" && state.isMyTurn));
    this.canvas.style.cursor = isInteractive ? "pointer" : "default";
  };

  private handleCanvasMouseLeave = (): void => {
    this.renderer.setHoveredCard(-1);
    this.canvas.style.cursor = "default";
  };

  // --- Touch interaction ---

  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault(); // Prevent scroll
    const touch = e.touches[0];
    const { x, y } = this.renderer.canvasCoords(touch.clientX, touch.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(hit ? hit.index : -1);
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    const touch = e.changedTouches[0];
    const { x, y } = this.renderer.canvasCoords(touch.clientX, touch.clientY);
    const hit = this.renderer.hitTestCard(x, y);
    this.renderer.setHoveredCard(-1);

    if (!hit) return;

    const state = this.ctx.state;
    const phase = state.phase;

    if (phase === "exchange" && state.isMyTurn) {
      state.toggleCardSelection(hit.card.id);
      this.ctx.sounds.cardPlay();
    } else if (phase === "play" && state.isMyTurn) {
      this.ctx.connection.send({ type: "PLAY", cardId: hit.card.id });
      this.ctx.sounds.cardPlay();
    }
  };

  // --- Phase transition effects ---

  private handlePhaseTransitions(): void {
    const game = this.ctx.state.game;
    if (!game) return;

    const newPhase = game.phase;
    const newTurn = game.turn;

    // Phase changed
    if (newPhase !== this.prevPhase) {
      this.onPhaseChange(this.prevPhase, newPhase);
      this.prevPhase = newPhase;
    }

    // Turn changed - play sound if it's now my turn
    if (newTurn !== this.prevTurn) {
      if (this.ctx.state.isMyTurn && this.prevTurn !== null) {
        this.ctx.sounds.yourTurn();
      }
      this.prevTurn = newTurn;
    }

    // Navigate to post-hand or match-summary screens
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
        if (this.ctx.state.isMyTurn) {
          showToast("Your turn to bid", "info", 2000);
        }
        break;
      case "trump_choice":
        if (this.ctx.state.isMyTurn) {
          showToast("Choose trump suit", "info", 2000);
        }
        break;
      case "exchange":
        if (this.ctx.state.isMyTurn) {
          showToast("Select cards to exchange", "info", 2000);
        }
        this.ctx.state.clearSelection();
        break;
      case "play":
        if (oldPhase === "exchange") {
          this.ctx.state.clearSelection();
        }
        break;
    }
  }

  // --- Server event handling ---

  private handleEvent(name: string, payload: Record<string, unknown>): void {
    switch (name) {
      case "TRICK_TAKEN":
      case "TRICK_WON": {
        this.ctx.sounds.trickWin();
        const winner = payload.winner as number;
        const rel = this.ctx.state.relativePosition(winner as any);
        const label =
          rel === "self"
            ? "You"
            : this.ctx.state.game?.players[winner]?.handle || rel;
        showToast(`${label} won the trick!`, "info", 1500);

        // Gold ring animation at table center
        this.renderer.addAnimation(
          new TrickWinAnimation(512, 340, 600)
        );
        break;
      }

      case "CARD_PLAYED": {
        this.ctx.sounds.cardPlay();

        // Card flight animation toward table center
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
          this.renderer.addAnimation(
            new CardPlayAnimation(from.x, from.y, 512, 340, 76, 108, 250)
          );
        }
        break;
      }

      case "DEAL": {
        this.ctx.sounds.cardDeal();

        // Staggered deal animation from center to all positions
        const dealTargets = [
          { x: 512, y: 570 },  // self
          { x: 120, y: 280 },  // left
          { x: 512, y: 100 },  // across
          { x: 904, y: 280 },  // right
        ];
        for (let i = 0; i < dealTargets.length; i++) {
          const target = dealTargets[i];
          this.renderer.addAnimation(
            new CardDealAnimation(
              512, 340,
              target.x, target.y,
              76, 108,
              i * 80,  // stagger delay
              300
            )
          );
        }
        break;
      }
    }
  }

  // --- Resize ---

  private handleResize = (): void => {
    const wrap = this.container.querySelector(".game-canvas-wrap") as HTMLElement;
    if (!wrap || !this.canvas) return;

    const wrapRect = wrap.getBoundingClientRect();
    const targetRatio = 1024 / 720;
    const wrapRatio = wrapRect.width / wrapRect.height;

    let displayW: number;
    let displayH: number;

    if (wrapRatio > targetRatio) {
      // Wider than needed
      displayH = wrapRect.height;
      displayW = displayH * targetRatio;
    } else {
      // Taller than needed
      displayW = wrapRect.width;
      displayH = displayW / targetRatio;
    }

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
  };

  // --- Styles ---

  private addStyles(): void {
    if (document.getElementById("game-styles")) return;
    const style = document.createElement("style");
    style.id = "game-styles";
    style.textContent = `
      .game-screen {
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        overflow: hidden;
      }
      .game-canvas-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        min-height: 0;
      }
      #game-canvas {
        image-rendering: auto;
      }
      .game-controls-bar {
        flex-shrink: 0;
        min-height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        background: var(--surface-parchment);
        border-top: 2px solid rgba(200,166,81,0.2);
        box-shadow: 0 -4px 16px rgba(0,0,0,0.06);
      }
      .control-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .control-label {
        font-size: 14px;
        font-family: var(--font-display);
        color: var(--text-on-parchment);
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-right: 8px;
      }
      .controls-hint {
        font-size: 14px;
        font-family: var(--font-sans);
        color: var(--text-secondary);
        font-style: italic;
      }
      .bid-btn, .trump-btn, .exchange-btn, .rematch-btn, .start-btn {
        font-size: 13px;
        font-family: var(--font-sans);
        font-weight: 600;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background var(--dur-fast) var(--ease-standard),
                    border-color var(--dur-fast) var(--ease-standard),
                    transform var(--dur-micro) var(--ease-standard),
                    box-shadow var(--dur-fast) var(--ease-standard);
        border: 1px solid var(--border);
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
      .bid-btn:focus-visible, .trump-btn:focus-visible, .exchange-btn:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring), var(--focus-ring-offset);
      }
      .bid-btn:hover:not(:disabled) {
        border-color: var(--color-gold);
        background: rgba(200, 166, 81, 0.08);
      }
      .bid-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .bid-btn.pass-btn {
        color: var(--text-secondary);
      }
      .bid-btn.pass-btn:hover:not(:disabled) {
        border-color: var(--text-secondary);
        background: rgba(90, 90, 90, 0.08);
      }
      .trump-btn {
        font-size: 14px;
        padding: 8px 18px;
      }
      .trump-btn:hover:not(:disabled) {
        border-color: var(--suit-color, var(--color-gold));
        background: rgba(200, 166, 81, 0.08);
        transform: scale(1.04);
      }
      .trump-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .exchange-btn.primary, .rematch-btn.primary, .start-btn.primary {
        background: var(--color-crimson);
        color: #fff;
        border-color: var(--color-crimson);
      }
      .exchange-btn.primary:hover, .rematch-btn.primary:hover, .start-btn.primary:hover {
        background: #9a2626;
        border-color: #9a2626;
      }
      .exchange-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
        font-family: var(--font-sans);
        padding: 4px 12px;
        border-radius: var(--radius-pill);
        background: rgba(200,166,81,0.15);
        color: var(--color-gold);
        letter-spacing: 0.5px;
        margin-right: 4px;
      }
      .exchange-btn.secondary {
        background: transparent;
        border-color: var(--color-gold);
        color: var(--color-gold);
      }
      .exchange-btn.secondary:hover {
        background: rgba(200, 166, 81, 0.08);
      }
      @media (max-width: 640px) {
        .game-controls-bar {
          padding: 6px 8px;
          min-height: 52px;
        }
        .bid-btn, .trump-btn, .exchange-btn, .rematch-btn, .start-btn {
          font-size: 12px;
          padding: 8px 14px;
          min-height: 44px;
          min-width: 44px;
        }
        .control-label {
          font-size: 12px;
          margin-right: 4px;
        }
        .exchange-count {
          font-size: 12px;
          padding: 3px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
