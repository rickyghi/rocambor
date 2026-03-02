import type { Card, Suit } from "../protocol";
import { getSuitColor, SUIT_SYMBOLS, SUIT_LETTERS } from "./suits";

const RANK_DISPLAY: Record<number, string> = {
  1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
  10: "S", 11: "C", 12: "R",
};

export interface CardDrawOptions {
  selected?: boolean;
  hovered?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
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
  const r = 6; // border radius

  // Card shadow
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Card body
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = face ? "#FEFEFE" : "#2d1b4a";
  ctx.fill();

  ctx.shadowColor = "transparent";

  // Border
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  if (opts.selected) {
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 3;
  } else if (opts.hovered) {
    ctx.strokeStyle = "#74c0fc";
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = face ? "#ccc" : "#ffd700";
    ctx.lineWidth = face ? 1 : 2;
  }
  ctx.stroke();

  if (face && card) {
    drawCardFace(ctx, w, h, card, colorblind);
  } else if (!face) {
    drawCardBack(ctx, w, h);
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
  colorblind: boolean
): void {
  const colors = getSuitColor(card.s, colorblind);
  const sym = SUIT_SYMBOLS[card.s];
  const rank = RANK_DISPLAY[card.r] || String(card.r);

  // Top-left rank + suit
  ctx.fillStyle = colors.primary;
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(rank, -w / 2 + 14, -h / 2 + 6);
  ctx.font = "12px Arial";
  ctx.fillText(sym, -w / 2 + 14, -h / 2 + 22);

  // Bottom-right (rotated)
  ctx.save();
  ctx.translate(w / 2 - 14, h / 2 - 6);
  ctx.rotate(Math.PI);
  ctx.textBaseline = "top";
  ctx.font = "bold 14px Arial";
  ctx.fillText(rank, 0, 0);
  ctx.font = "12px Arial";
  ctx.fillText(sym, 0, 16);
  ctx.restore();

  // Center suit symbol (large)
  ctx.fillStyle = colors.primary;
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sym, 0, 2);

  // Court card indicator
  if (card.r >= 10) {
    ctx.font = "bold 12px Arial";
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
  h: number
): void {
  // Inner border
  const m = 5;
  roundRect(ctx, -w / 2 + m, -h / 2 + m, w - m * 2, h - m * 2, 4);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Diamond pattern
  ctx.fillStyle = "rgba(255,215,0,0.15)";
  const step = 16;
  for (let dy = -h / 2 + 12; dy < h / 2 - 8; dy += step) {
    for (let dx = -w / 2 + 12; dx < w / 2 - 8; dx += step) {
      ctx.beginPath();
      ctx.moveTo(dx, dy - 4);
      ctx.lineTo(dx + 4, dy);
      ctx.lineTo(dx, dy + 4);
      ctx.lineTo(dx - 4, dy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Center R
  ctx.fillStyle = "rgba(255,215,0,0.4)";
  ctx.font = "bold 28px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", 0, 0);
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
