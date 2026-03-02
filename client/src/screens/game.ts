import type { Screen, AppContext } from "../router";
import { GameRenderer } from "../canvas/renderer";
import { GameControls } from "../ui/controls";
import { showToast } from "../ui/toast";
import type { S2CMessage } from "../protocol";

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

    // Canvas interaction: click handler
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("mousemove", this.handleCanvasMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleCanvasMouseLeave);

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
      case "TRICK_WON":
        this.ctx.sounds.trickWin();
        const winner = payload.winner as number;
        const rel = this.ctx.state.relativePosition(winner as any);
        const label =
          rel === "self"
            ? "You"
            : this.ctx.state.game?.players[winner]?.handle || rel;
        showToast(`${label} won the trick!`, "info", 1500);
        break;

      case "CARD_PLAYED":
        this.ctx.sounds.cardPlay();
        break;

      case "DEAL":
        this.ctx.sounds.cardDeal();
        break;
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
        background: var(--bg-secondary);
        border-top: 1px solid var(--border);
      }
      .control-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .control-label {
        font-size: 13px;
        color: var(--text-secondary);
        font-weight: 600;
        margin-right: 4px;
      }
      .controls-hint {
        font-size: 14px;
        color: var(--text-secondary);
        font-style: italic;
      }
      .bid-btn, .trump-btn, .exchange-btn, .rematch-btn, .start-btn {
        font-size: 13px;
        padding: 8px 14px;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s;
      }
      .bid-btn {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border);
      }
      .bid-btn:hover:not(:disabled) {
        background: var(--bg-card);
        color: var(--text-dark);
      }
      .bid-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .trump-btn {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border);
        font-size: 14px;
      }
      .trump-btn:hover:not(:disabled) {
        background: var(--bg-card);
        color: var(--text-dark);
        transform: scale(1.05);
      }
      .trump-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      @media (max-width: 640px) {
        .game-controls-bar {
          padding: 6px 8px;
        }
        .bid-btn, .trump-btn, .exchange-btn {
          font-size: 12px;
          padding: 6px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
