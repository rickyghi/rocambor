import type { ClientState } from "../state";
import type { SettingsManager } from "../ui/settings";
import type { ProfileManager } from "../lib/profile";
import type { Card } from "../protocol";
import { computeLayout, cardSpread, type Layout } from "./layout";
import { drawTableBackground } from "./table";
import { drawCard, type CardSkin } from "./cards";
import { drawPlayers } from "./players";
import { AnimationManager, type Animation } from "./animations";
import { getCardSkinDefinition } from "./card-skin-registry";
import { preloadSkinImages } from "./card-image-loader";
import { AVATAR_READY_EVENT } from "./avatar-cache";

const FONT_SANS = '"Inter", system-ui, sans-serif';

export class GameRenderer {
  private animationId: number | null = null;
  private dirty = true;
  private layout: Layout;
  readonly animations = new AnimationManager();
  private hoveredCardIndex = -1;
  private currentSkin = "";
  private dpr = 1;
  private drawHandOnCanvas = true;
  private drawTableCardsOnCanvas = true;
  private avatarReadyHandler = () => {
    this.requestRender();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private state: ClientState,
    private settings: SettingsManager,
    private profile: ProfileManager
  ) {
    this.layout = computeLayout(1024, 720);
    this.applyDpr();
    window.addEventListener(AVATAR_READY_EVENT, this.avatarReadyHandler);
    this.watchDpr();
    this.preloadCurrentSkin();
    this.startLoop();
  }

  private applyDpr(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = 1024 * this.dpr;
    this.canvas.height = 720 * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.dirty = true;
  }

  private watchDpr(): void {
    const mq = window.matchMedia(`(resolution: ${this.dpr}dppx)`);
    mq.addEventListener("change", () => {
      this.applyDpr();
      this.watchDpr(); // re-register for next change
    }, { once: true });
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

  setCanvasCardLayers(layers: { hand?: boolean; table?: boolean }): void {
    if (typeof layers.hand === "boolean") this.drawHandOnCanvas = layers.hand;
    if (typeof layers.table === "boolean") this.drawTableCardsOnCanvas = layers.table;
    this.requestRender();
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

      // Force continuous render when countdown is active
      if (this.state.game?.turnDeadline && this.state.game.turn !== null) {
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
    drawPlayers(
      this.ctx,
      this.state,
      this.layout,
      colorblind,
      cardSkin,
      this.profile.get()
    );

    // 3. Table cards (center)
    if (this.drawTableCardsOnCanvas) {
      this.drawTableCards(colorblind, cardSkin);
    }

    // 4. Player's hand (bottom)
    if (this.drawHandOnCanvas) {
      this.drawHand(colorblind, cardSkin);
    }

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

    const isExchange = this.state.phase === "exchange" && this.state.canExchangeNow;
    const isPlay = this.state.phase === "play" && this.state.isMyTurn;
    const legalIds = this.state.game?.legalIds;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * spread;
      const isSelected = this.state.selectedCards.has(hand[i].id);
      const isHovered = i === this.hoveredCardIndex;
      const yOffset = isSelected ? -12 : isHovered ? -6 : 0;

      // Dim illegal cards during play phase
      const isIllegal = isPlay && legalIds && !legalIds.includes(hand[i].id);
      if (isIllegal) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.4;
      }

      // Hover scale effect
      if (isHovered && (isExchange || (isPlay && !isIllegal))) {
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

      if (isIllegal) {
        this.ctx.restore();
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

    // Ivory rounded rect bar
    this.ctx.save();
    this.ctx.fillStyle = "rgba(248,246,240,0.92)";
    this.roundRect(barX, barY, barW, barH, barR);
    this.ctx.fill();

    // Border + subtle gold top highlight
    this.ctx.strokeStyle = "rgba(13,13,13,0.1)";
    this.ctx.lineWidth = 1;
    this.roundRect(barX, barY, barW, barH, barR);
    this.ctx.stroke();
    this.ctx.strokeStyle = "rgba(200,166,81,0.25)";
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
    this.ctx.fillStyle = "#0D0D0D";
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
      this.ctx.fillStyle = "#8a6a24";
      this.ctx.font = `bold 14px ${FONT_SANS}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(centerParts.join("  \u00b7  "), W / 2, barCY);
      this.ctx.restore();
    }

    // Right: Target
    if (game.gameTarget) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(13,13,13,0.62)";
      this.ctx.font = `11px ${FONT_SANS}`;
      this.ctx.textAlign = "right";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(`Target: ${game.gameTarget}`, barX + barW - 16, barCY);
      this.ctx.restore();
    }

    // --- Turn countdown ---
    const deadline = game.turnDeadline;
    if (deadline && game.turn !== null) {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining <= 25) {
        this.ctx.save();
        this.ctx.fillStyle = remaining <= 5 ? "#B02E2E" : "rgba(13,13,13,0.5)";
        this.ctx.font = `700 12px ${FONT_SANS}`;
        this.ctx.textAlign = "right";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(`${remaining}s`, barX + barW - 80, barCY);
        this.ctx.restore();
      }
    }

    // --- Turn indicator (below table, near hand) ---
    if (game.turn !== null && this.state.isMyTurn) {
      this.ctx.save();
      const pulseAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 500);
      this.ctx.fillStyle = `rgba(248,246,240,${0.88 + pulseAlpha * 0.08})`;
      this.roundRect(
        this.layout.tableCX - 80,
        this.layout.handY - 70,
        160,
        30,
        15
      );
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(200,166,81,${0.25 + pulseAlpha * 0.35})`;
      this.ctx.lineWidth = 1.5;
      this.roundRect(
        this.layout.tableCX - 80,
        this.layout.handY - 70,
        160,
        30,
        15
      );
      this.ctx.stroke();
      this.ctx.fillStyle = "#8a6a24";
      this.ctx.font = `bold 14px ${FONT_SANS}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("Your Turn", this.layout.tableCX, this.layout.handY - 55);
      this.ctx.restore();
    }
  }

  // ---- Hit testing ----
  hitTestCard(canvasX: number, canvasY: number): { card: Card; index: number } | null {
    if (!this.drawHandOnCanvas) return null;
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
    window.removeEventListener(AVATAR_READY_EVENT, this.avatarReadyHandler);
    this.animations.clear();
  }
}
