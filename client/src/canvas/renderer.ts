import type { ClientState } from "../state";
import type { SettingsManager } from "../ui/settings";
import type { ProfileManager } from "../lib/profile";
import type { Card, SeatIndex } from "../protocol";
import {
  computeLayout,
  cardSpread,
  type Layout,
  type ViewportMode,
} from "./layout";
import { drawTableBackground } from "./table";
import { drawCard, type CardSkin } from "./cards";
import { drawPlayers } from "./players";
import { AnimationManager, type Animation } from "./animations";
import { getCardSkinDefinition } from "./card-skin-registry";
import { preloadSkinImages } from "./card-image-loader";
import { AVATAR_READY_EVENT } from "./avatar-cache";

const FONT_SANS = '"Inter", system-ui, sans-serif';

interface ResolvedTrickOverlay {
  cards: Card[];
  playOrder: SeatIndex[];
  winner: SeatIndex | null;
  expiresAt: number;
}

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
  private domPlatesEnabled = false;
  private resolvedTrickOverlay: ResolvedTrickOverlay | null = null;
  private viewportMode: ViewportMode = "desktop";
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
    this.layout = computeLayout(this.viewportMode);
    this.applyDpr();
    window.addEventListener(AVATAR_READY_EVENT, this.avatarReadyHandler);
    this.watchDpr();
    this.preloadCurrentSkin();
    this.startLoop();
  }

  private applyDpr(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.layout.width * this.dpr;
    this.canvas.height = this.layout.height * this.dpr;
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

  setViewportMode(mode: ViewportMode): void {
    if (this.viewportMode === mode) return;
    this.viewportMode = mode;
    this.layout = computeLayout(mode);
    this.applyDpr();
    this.requestRender();
  }

  getViewportMode(): ViewportMode {
    return this.viewportMode;
  }

  getLogicalSize(): { width: number; height: number } {
    return { width: this.layout.width, height: this.layout.height };
  }

  getAnimationAnchors(): Layout["anchors"] {
    return this.layout.anchors;
  }

  getCardDimensions(): { w: number; h: number } {
    return { w: this.layout.cardW, h: this.layout.cardH };
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

  setDomPlatesEnabled(enabled: boolean): void {
    if (this.domPlatesEnabled === enabled) return;
    this.domPlatesEnabled = enabled;
    this.requestRender();
  }

  setResolvedTrickOverlay(overlay: ResolvedTrickOverlay | null): void {
    this.resolvedTrickOverlay = overlay;
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
      this.profile.get(),
      this.viewportMode === "mobile-portrait" || this.domPlatesEnabled
    );

    if (this.resolvedTrickOverlay && Date.now() > this.resolvedTrickOverlay.expiresAt) {
      this.resolvedTrickOverlay = null;
    }

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

    // 6. HUD moved to DOM layer (TopStatusBar + PhaseBanner) for better readability.
  }

  private drawTableCards(colorblind: boolean, cardSkin: CardSkin): void {
    const game = this.state.game;
    if (!game) return;

    const liveCards = game.table;
    const liveOrder = game.playOrder || [];
    const cards = liveCards.length ? liveCards : this.resolvedTrickOverlay?.cards || [];
    const playOrder = liveCards.length ? liveOrder : this.resolvedTrickOverlay?.playOrder || [];
    const winner = liveCards.length ? null : this.resolvedTrickOverlay?.winner || null;
    if (!cards.length) return;

    for (let i = 0; i < cards.length; i++) {
      const seat = playOrder[i];
      const rel = seat === undefined ? null : this.state.relativePosition(seat);
      const slot = this.trickSlot(rel, i);
      if (winner !== null && seat === winner) {
        this.drawWinnerHalo(slot.x, slot.y);
      }
      drawCard(
        this.ctx,
        slot.x,
        slot.y,
        this.layout.cardW,
        this.layout.cardH,
        cards[i],
        colorblind,
        { skin: cardSkin }
      );
      if (seat !== undefined) {
        this.drawTrickCardLabel(
          slot.x,
          slot.y + this.layout.cardH / 2 + 18,
          this.trickCardLabel(seat)
        );
      }
    }
  }

  private trickCardLabel(seat: SeatIndex): string {
    const rel = this.state.relativePosition(seat);
    if (rel === "self") return "YOU";
    const pos = rel.toUpperCase();
    const handle = this.state.game?.players[seat]?.handle;
    return handle ? `${pos} · ${handle}` : pos;
  }

  private drawTrickCardLabel(x: number, y: number, label: string): void {
    if (!label) return;
    this.ctx.save();
    this.ctx.font = `700 12px ${FONT_SANS}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const textW = Math.ceil(this.ctx.measureText(label).width);
    const w = Math.max(70, textW + 14);
    const h = 22;
    this.ctx.fillStyle = "rgba(248,246,240,0.95)";
    this.roundRect(x - w / 2, y - h / 2, w, h, 11);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(13,13,13,0.14)";
    this.ctx.lineWidth = 1;
    this.roundRect(x - w / 2, y - h / 2, w, h, 11);
    this.ctx.stroke();
    this.ctx.fillStyle = "#554322";
    this.ctx.fillText(label, x, y);
    this.ctx.restore();
  }

  private trickSlot(
    rel: "self" | "left" | "across" | "right" | null,
    index: number
  ): { x: number; y: number } {
    const cx = this.layout.tableCX;
    const cy = this.layout.tableCY;
    const mobile = this.viewportMode === "mobile-portrait";
    const offsets = mobile
      ? {
          left: { x: -104, y: 12 },
          across: { x: 0, y: -84 },
          right: { x: 104, y: 12 },
          self: { x: 0, y: 108 },
        }
      : {
          left: { x: -156, y: 14 },
          across: { x: 0, y: -116 },
          right: { x: 156, y: 14 },
          self: { x: 0, y: 136 },
        };

    if (rel) {
      const o = offsets[rel];
      return { x: cx + o.x, y: cy + o.y };
    }

    // Fallback when play order is not available.
    const fallback: Array<"left" | "across" | "right" | "self"> = [
      "left",
      "across",
      "right",
      "self",
    ];
    const o = offsets[fallback[index % fallback.length]];
    return { x: cx + o.x, y: cy + o.y };
  }

  private drawWinnerHalo(x: number, y: number): void {
    const w = this.layout.cardW + 10;
    const h = this.layout.cardH + 10;
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(200,166,81,0.88)";
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = "rgba(200,166,81,0.42)";
    this.ctx.shadowBlur = 16;
    this.roundRect(x - w / 2, y - h / 2, w, h, 9);
    this.ctx.stroke();
    this.ctx.restore();
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
      const cardY = this.layout.handY + yOffset;

      // Dim illegal cards during play phase
      const isIllegal = isPlay && legalIds && !legalIds.includes(hand[i].id);
      const isLegal = isPlay && !isIllegal;
      if (isIllegal) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.4;
      }

      // Legal cards get a soft pulse ring in play phase.
      if (isLegal) {
        const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 420 + i * 0.35);
        this.ctx.save();
        this.ctx.strokeStyle = `rgba(200,166,81,${pulse.toFixed(3)})`;
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = "rgba(200,166,81,0.22)";
        this.ctx.shadowBlur = 12;
        this.roundRect(
          x - this.layout.cardW / 2 - 2,
          cardY - this.layout.cardH / 2 - 2,
          this.layout.cardW + 4,
          this.layout.cardH + 4,
          8
        );
        this.ctx.stroke();
        this.ctx.restore();
      }

      if (isSelected) {
        this.ctx.save();
        this.ctx.strokeStyle = "rgba(200,166,81,0.92)";
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = "rgba(200,166,81,0.34)";
        this.ctx.shadowBlur = 16;
        this.roundRect(
          x - this.layout.cardW / 2 - 3,
          cardY - this.layout.cardH / 2 - 3,
          this.layout.cardW + 6,
          this.layout.cardH + 6,
          9
        );
        this.ctx.stroke();
        this.ctx.restore();
      }

      // Hover scale effect
      if (isHovered && (isExchange || (isPlay && !isIllegal))) {
        this.ctx.save();
        this.ctx.translate(x, cardY);
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
          cardY,
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
    const sx = this.layout.width / rect.width;
    const sy = this.layout.height / rect.height;
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
