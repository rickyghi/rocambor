import type { ClientState } from "../state";
import type { SettingsManager } from "../ui/settings";
import type { Card } from "../protocol";
import { computeLayout, cardSpread, type Layout } from "./layout";
import { drawTableBackground } from "./table";
import { drawCard } from "./cards";
import { drawPlayers } from "./players";
import { AnimationManager } from "./animations";

export class GameRenderer {
  private animationId: number | null = null;
  private dirty = true;
  private layout: Layout;
  private animations = new AnimationManager();
  private hoveredCardIndex = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private state: ClientState,
    private settings: SettingsManager
  ) {
    this.layout = computeLayout(1024, 720);
    this.canvas.width = 1024;
    this.canvas.height = 720;
    this.startLoop();
  }

  requestRender(): void {
    this.dirty = true;
  }

  setHoveredCard(index: number): void {
    if (this.hoveredCardIndex !== index) {
      this.hoveredCardIndex = index;
      this.dirty = true;
    }
  }

  private startLoop(): void {
    const loop = () => {
      if (this.dirty || this.animations.hasActive()) {
        this.render();
        this.dirty = false;
      }
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private render(): void {
    const { width, height } = this.layout;
    this.ctx.clearRect(0, 0, width, height);

    // 1. Table background
    drawTableBackground(
      this.ctx,
      width,
      height,
      this.settings.get("tableTheme")
    );

    // 2. Players (names, scores, opponent cards)
    const colorblind = this.settings.get("colorblindMode");
    drawPlayers(this.ctx, this.state, this.layout, colorblind);

    // 3. Table cards (center)
    this.drawTableCards(colorblind);

    // 4. Player's hand (bottom)
    this.drawHand(colorblind);

    // 5. Animations overlay
    this.animations.draw(this.ctx);

    // 6. HUD
    this.drawHUD();
  }

  private drawTableCards(colorblind: boolean): void {
    const game = this.state.game;
    if (!game || !game.table.length) return;

    const cx = this.layout.tableCX;
    const cy = this.layout.tableCY;
    const cards = game.table;

    for (let i = 0; i < cards.length; i++) {
      const ang = ((i - 1) * Math.PI) / 3;
      const x = cx + Math.cos(ang) * 80;
      const y = cy + Math.sin(ang) * 50;
      drawCard(
        this.ctx,
        x,
        y,
        this.layout.cardW,
        this.layout.cardH,
        cards[i],
        colorblind
      );
    }
  }

  private drawHand(colorblind: boolean): void {
    const hand = this.state.hand;
    if (!hand.length) return;

    const { startX, spread } = cardSpread(
      hand.length,
      this.layout.handCenterX
    );

    const isExchange = this.state.phase === "exchange" && this.state.isMyTurn;
    const isPlay = this.state.phase === "play" && this.state.isMyTurn;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * spread;
      const isSelected = this.state.selectedCards.has(hand[i].id);
      const isHovered = i === this.hoveredCardIndex;
      const yOffset = isSelected ? -12 : isHovered ? -6 : 0;

      drawCard(
        this.ctx,
        x,
        this.layout.handY + yOffset,
        this.layout.cardW,
        this.layout.cardH,
        hand[i],
        colorblind,
        {
          selected: isSelected,
          hovered: isHovered && (isExchange || isPlay),
        }
      );
    }
  }

  private drawHUD(): void {
    const game = this.state.game;
    if (!game || game.phase === "lobby") return;

    // Phase indicator (top-left)
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0,0,0,0.6)";
    this.roundRect(20, 16, 180, 36, 8);
    this.ctx.fill();
    this.ctx.fillStyle = "#e8f0ff";
    this.ctx.font = "bold 14px Arial";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";

    const phaseLabels: Record<string, string> = {
      dealing: "Dealing...",
      auction: "Auction",
      trump_choice: "Choose Trump",
      exchange: "Exchange",
      play: `Play (Hand ${game.handNo})`,
      post_hand: "Hand Complete",
      scoring: "Scoring",
      match_end: "Match Over",
    };
    this.ctx.fillText(phaseLabels[game.phase] || game.phase, 32, 34);
    this.ctx.restore();

    // Trump indicator (top-right)
    if (game.trump) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(0,0,0,0.6)";
      this.roundRect(this.layout.width - 160, 16, 140, 36, 8);
      this.ctx.fill();
      this.ctx.fillStyle = "#e8f0ff";
      this.ctx.font = "14px Arial";
      this.ctx.textAlign = "right";
      this.ctx.textBaseline = "middle";

      const trumpSymbols: Record<string, string> = {
        oros: "\u2666 Oros",
        copas: "\u2665 Copas",
        espadas: "\u2660 Espadas",
        bastos: "\u2663 Bastos",
      };
      this.ctx.fillText(
        `Trump: ${trumpSymbols[game.trump] || game.trump}`,
        this.layout.width - 30,
        34
      );
      this.ctx.restore();
    }

    // Contract indicator
    if (game.contract) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(0,0,0,0.6)";
      this.roundRect(20, 58, 140, 28, 8);
      this.ctx.fill();
      this.ctx.fillStyle = "#fbbf24";
      this.ctx.font = "12px Arial";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(
        `Contract: ${game.contract}`,
        32,
        72
      );
      this.ctx.restore();
    }

    // Turn indicator
    if (game.turn !== null && this.state.isMyTurn) {
      this.ctx.save();
      const pulseAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 500);
      this.ctx.fillStyle = `rgba(251,191,36,${pulseAlpha * 0.15})`;
      this.roundRect(
        this.layout.tableCX - 80,
        this.layout.handY - 70,
        160,
        30,
        15
      );
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(251,191,36,${pulseAlpha})`;
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("Your Turn", this.layout.tableCX, this.layout.handY - 55);
      this.ctx.restore();
    }

    // Target score
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0,0,0,0.4)";
    this.ctx.font = "11px Arial";
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(
      `Target: ${game.gameTarget}`,
      this.layout.width - 20,
      58
    );
    this.ctx.restore();
  }

  // ---- Hit testing ----
  hitTestCard(canvasX: number, canvasY: number): { card: Card; index: number } | null {
    const hand = this.state.hand;
    if (!hand.length) return null;

    const { startX, spread } = cardSpread(
      hand.length,
      this.layout.handCenterX
    );
    const w = this.layout.cardW;
    const h = this.layout.cardH;
    const yBase = this.layout.handY;

    // Check from last (top) to first (bottom of stack)
    for (let i = hand.length - 1; i >= 0; i--) {
      const cx = startX + i * spread;
      const isSelected = this.state.selectedCards.has(hand[i].id);
      const cy = yBase + (isSelected ? -12 : 0);

      if (
        canvasX >= cx - w / 2 &&
        canvasX <= cx + w / 2 &&
        canvasY >= cy - h / 2 &&
        canvasY <= cy + h / 2
      ) {
        return { card: hand[i], index: i };
      }
    }
    return null;
  }

  canvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = 1024 / rect.width;
    const sy = 720 / rect.height;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.animations.clear();
  }
}
