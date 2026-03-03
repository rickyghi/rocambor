import type { ClientState } from "../state";
import type { SettingsManager } from "../ui/settings";
import type { Card } from "../protocol";
import { computeLayout, cardSpread, type Layout } from "./layout";
import { drawTableBackground } from "./table";
import { drawCard, type CardSkin } from "./cards";
import { drawPlayers } from "./players";
import { AnimationManager, type Animation } from "./animations";
import { getCardSkinDefinition } from "./card-skin-registry";
import { preloadSkinImages } from "./card-image-loader";

const FONT_SANS = '"Inter", system-ui, sans-serif';

export class GameRenderer {
  private animationId: number | null = null;
  private dirty = true;
  private layout: Layout;
  readonly animations = new AnimationManager();
  private hoveredCardIndex = -1;
  private currentSkin = "";

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private state: ClientState,
    private settings: SettingsManager
  ) {
    this.layout = computeLayout(1024, 720);
    this.canvas.width = 1024;
    this.canvas.height = 720;
    this.preloadCurrentSkin();
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

  addAnimation(anim: Animation): void {
    this.animations.add(anim);
  }

  private preloadCurrentSkin(): void {
    const skinId = this.settings.get("cardSkin");
    if (skinId === this.currentSkin) return;
    this.currentSkin = skinId;
    const skin = getCardSkinDefinition(skinId);
    if (skin.imageMode && skin.imagePath) {
      preloadSkinImages(skinId, skin.imagePath).then(() => {
        this.dirty = true;
      });
    }
  }

  private startLoop(): void {
    const loop = () => {
      // Check if skin changed
      const skinId = this.settings.get("cardSkin");
      if (skinId !== this.currentSkin) {
        this.preloadCurrentSkin();
        this.dirty = true;
      }

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
    const cardSkin = this.settings.get("cardSkin");

    // 1. Table background
    drawTableBackground(
      this.ctx,
      width,
      height,
      this.settings.get("tableTheme")
    );

    // 2. Players (names, scores, opponent cards)
    const colorblind = this.settings.get("colorblindMode");
    drawPlayers(this.ctx, this.state, this.layout, colorblind, cardSkin);

    // 3. Table cards (center)
    this.drawTableCards(colorblind, cardSkin);

    // 4. Player's hand (bottom)
    this.drawHand(colorblind, cardSkin);

    // 5. Animations overlay
    this.animations.draw(this.ctx);

    // 6. HUD
    this.drawHUD();
  }

  private drawTableCards(colorblind: boolean, cardSkin: CardSkin): void {
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
        colorblind,
        { skin: cardSkin }
      );
    }
  }

  private drawHand(colorblind: boolean, cardSkin: CardSkin): void {
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

      // Hover scale effect
      if (isHovered && (isExchange || isPlay)) {
        this.ctx.save();
        this.ctx.translate(x, this.layout.handY + yOffset);
        this.ctx.scale(1.03, 1.03);
        drawCard(
          this.ctx,
          0,
          0,
          this.layout.cardW,
          this.layout.cardH,
          hand[i],
          colorblind,
          {
            selected: isSelected,
            hovered: true,
            skin: cardSkin,
          }
        );
        this.ctx.restore();
      } else {
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
            hovered: false,
            skin: cardSkin,
          }
        );
      }
    }
  }

  private drawHUD(): void {
    const game = this.state.game;
    if (!game || game.phase === "lobby") return;

    const W = this.layout.width;

    // --- Unified top HUD strip ---
    const barX = 16;
    const barY = 12;
    const barW = W - 32;
    const barH = 44;
    const barR = 12;

    // Dark rounded rect bar
    this.ctx.save();
    this.ctx.fillStyle = "rgba(13,13,13,0.6)";
    this.roundRect(barX, barY, barW, barH, barR);
    this.ctx.fill();

    // Subtle gold top border
    this.ctx.strokeStyle = "rgba(200,166,81,0.2)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(barX + barR, barY + 0.5);
    this.ctx.lineTo(barX + barW - barR, barY + 0.5);
    this.ctx.stroke();
    this.ctx.restore();

    const barCY = barY + barH / 2;

    // Left: Phase label
    this.ctx.save();
    const phaseLabels: Record<string, string> = {
      dealing: "Dealing",
      auction: "Auction",
      trump_choice: "Choose Trump",
      exchange: "Exchange",
      play: `Play — Hand ${game.handNo}`,
      post_hand: "Hand Complete",
      scoring: "Scoring",
      match_end: "Match Over",
    };
    this.ctx.fillStyle = "#F8F6F0";
    this.ctx.font = `600 13px ${FONT_SANS}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(phaseLabels[game.phase] || game.phase, barX + 16, barCY);
    this.ctx.restore();

    // Center: Contract + Trump
    const centerParts: string[] = [];
    if (game.contract) {
      const contractLabels: Record<string, string> = {
        entrada: "Entrada",
        oros: "Oros",
        volteo: "Volteo",
        solo: "Solo",
        solo_oros: "Solo Oros",
        bola: "Bola",
      };
      centerParts.push(contractLabels[game.contract] || game.contract);
    }
    if (game.trump) {
      const trumpSymbols: Record<string, string> = {
        oros: "\u2666 Oros",
        copas: "\u2665 Copas",
        espadas: "\u2660 Espadas",
        bastos: "\u2663 Bastos",
      };
      centerParts.push(trumpSymbols[game.trump] || game.trump);
    }

    if (centerParts.length > 0) {
      this.ctx.save();
      this.ctx.fillStyle = "#C8A651";
      this.ctx.font = `bold 14px ${FONT_SANS}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(centerParts.join("  \u00b7  "), W / 2, barCY);
      this.ctx.restore();
    }

    // Right: Target
    if (game.gameTarget) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(248,246,240,0.45)";
      this.ctx.font = `11px ${FONT_SANS}`;
      this.ctx.textAlign = "right";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(`Target: ${game.gameTarget}`, barX + barW - 16, barCY);
      this.ctx.restore();
    }

    // --- Turn indicator (below table, near hand) ---
    if (game.turn !== null && this.state.isMyTurn) {
      this.ctx.save();
      const pulseAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 500);
      this.ctx.fillStyle = `rgba(200,166,81,${pulseAlpha * 0.12})`;
      this.roundRect(
        this.layout.tableCX - 80,
        this.layout.handY - 70,
        160,
        30,
        15
      );
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(200,166,81,${pulseAlpha})`;
      this.ctx.font = `bold 14px ${FONT_SANS}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("Your Turn", this.layout.tableCX, this.layout.handY - 55);
      this.ctx.restore();
    }
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
