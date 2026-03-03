import type { Card, Suit } from "../protocol";
import { getSuitColor, SUIT_SYMBOLS, SUIT_LETTERS } from "./suits";
import { getCardSkinDefinition, type CardSkin, type CardSkinDefinition } from "./card-skin-registry";
import { getLoadedAtlas, type CardImageAtlas } from "./card-image-loader";
export type { CardSkin } from "./card-skin-registry";

const RANK_DISPLAY: Record<number, string> = {
  1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
  10: "S", 11: "C", 12: "R",
};

export interface CardDrawOptions {
  selected?: boolean;
  hovered?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  skin?: CardSkin;
}

export function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  card: Card | null,
  colorblind: boolean,
  opts: CardDrawOptions = {}
): void {
  ctx.save();
  ctx.translate(x, y);

  const face = !opts.faceDown && card !== null;
  const skin = getCardSkinDefinition(opts.skin);
  const r = 6; // border radius

  // Try image-based rendering for image skins
  if (skin.imageMode) {
    const atlas = getLoadedAtlas(skin.id);
    if (atlas?.loaded) {
      const img = face && card ? atlas.get(card.s, card.r) : atlas.getBack();
      if (img) {
        drawImageCard(ctx, w, h, img, skin, opts);
        ctx.restore();
        return;
      }
      // Image missing for this specific card — fall through to procedural
    }
  }

  // Card shadow
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Card body
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = face ? skin.faceColor : skin.backColor;
  ctx.fill();

  ctx.shadowColor = "transparent";

  // Border
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  if (opts.selected) {
    ctx.strokeStyle = skin.selectionBorderColor;
    ctx.lineWidth = 3;
  } else if (opts.hovered) {
    ctx.strokeStyle = skin.hoverBorderColor;
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = face ? skin.faceBorderColor : skin.backBorderColor;
    ctx.lineWidth = face ? 1 : 2;
  }
  ctx.stroke();

  if (face && card) {
    drawCardFace(ctx, w, h, card, colorblind, skin);
  } else if (!face) {
    drawCardBack(ctx, w, h, skin);
  }

  if (opts.disabled) {
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();
  }

  ctx.restore();
}

function drawCardFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  card: Card,
  colorblind: boolean,
  skin: CardSkinDefinition
): void {
  const colors = getSkinSuitColor(card.s, colorblind, skin);
  const sym = SUIT_SYMBOLS[card.s];
  const rank = RANK_DISPLAY[card.r] || String(card.r);

  // Top-left rank + suit
  ctx.fillStyle = colors.primary;
  ctx.font = skin.cornerFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(rank, -w / 2 + 14, -h / 2 + 6);
  ctx.font = skin.suitFont;
  ctx.fillText(sym, -w / 2 + 14, -h / 2 + 22);

  // Bottom-right (rotated)
  ctx.save();
  ctx.translate(w / 2 - 14, h / 2 - 6);
  ctx.rotate(Math.PI);
  ctx.textBaseline = "top";
  ctx.font = skin.cornerFont;
  ctx.fillText(rank, 0, 0);
  ctx.font = skin.suitFont;
  ctx.fillText(sym, 0, 16);
  ctx.restore();

  // Center suit symbol (large)
  ctx.fillStyle = colors.primary;
  ctx.font = skin.centerFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sym, 0, 2);

  // Court card indicator
  if (card.r >= 10) {
    ctx.font = skin.courtFont;
    ctx.fillStyle = colors.secondary;
    ctx.fillText(rank, 0, 24);
  }

  // Colorblind letter
  if (colorblind) {
    ctx.font = "bold 10px Arial";
    ctx.fillStyle = colors.secondary;
    ctx.fillText(SUIT_LETTERS[card.s], -w / 2 + 14, -h / 2 + 38);
  }
}

function drawCardBack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  skin: CardSkinDefinition
): void {
  const m = 5;
  roundRect(ctx, -w / 2 + m, -h / 2 + m, w - m * 2, h - m * 2, 4);
  ctx.strokeStyle = skin.backBorderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawBackPattern(ctx, w, h, skin);
  ctx.fillStyle = skin.emblemColor;
  ctx.font = skin.emblemFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(skin.emblem, 0, 0);
}

function drawBackPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  skin: CardSkinDefinition
): void {
  ctx.save();
  ctx.strokeStyle = skin.backPatternColor;
  ctx.fillStyle = skin.backPatternColor;
  ctx.lineWidth = 1;

  if (skin.backPattern === "vertical") {
    for (let i = -w / 2 + 10; i < w / 2 - 6; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, -h / 2 + 8);
      ctx.lineTo(i, h / 2 - 8);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (skin.backPattern === "horizontal") {
    for (let i = -h / 2 + 10; i < h / 2 - 8; i += 10) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 10, i);
      ctx.lineTo(w / 2 - 10, i);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (skin.backPattern === "crosshatch") {
    for (let i = -w / 2 - h; i < w / 2 + h; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, -h / 2 + 8);
      ctx.lineTo(i + h, h / 2 - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, h / 2 - 8);
      ctx.lineTo(i + h, -h / 2 + 8);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (skin.backPattern === "ornate") {
    const step = 18;
    for (let y = -h / 2 + 12; y < h / 2 - 8; y += step) {
      for (let x = -w / 2 + 12; x < w / 2 - 8; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  // Default diamond pattern
  const step = 16;
  for (let y = -h / 2 + 12; y < h / 2 - 8; y += step) {
    for (let x = -w / 2 + 12; x < w / 2 - 8; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function getSkinSuitColor(
  suit: Suit,
  colorblind: boolean,
  skin: CardSkinDefinition
): { primary: string; secondary: string } {
  const fallback = getSuitColor(suit, colorblind);
  const overrides = colorblind ? skin.suitOverridesColorblind : skin.suitOverrides;
  const custom = overrides?.[suit];
  if (!custom) return fallback;
  return {
    primary: custom.primary || fallback.primary,
    secondary: custom.secondary || fallback.secondary,
  };
}

function drawImageCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  img: HTMLImageElement,
  skin: CardSkinDefinition,
  opts: CardDrawOptions
): void {
  const r = 6;

  // Card shadow
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Clip to rounded rect and draw image
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  ctx.shadowColor = "transparent";
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  // Shadow for the shape (draw filled rect behind for shadow to apply)
  ctx.shadowColor = "transparent";

  // Border
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  if (opts.selected) {
    ctx.strokeStyle = skin.selectionBorderColor;
    ctx.lineWidth = 3;
    // Gold glow for selection
    ctx.shadowColor = skin.selectionBorderColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowColor = "transparent";
  } else if (opts.hovered) {
    ctx.strokeStyle = skin.hoverBorderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Disabled overlay
  if (opts.disabled) {
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
