import type { Suit } from "../protocol";

// Suit colors
export const SUIT_COLORS: Record<Suit, { primary: string; secondary: string }> = {
  oros: { primary: "#FFD700", secondary: "#B8860B" },
  copas: { primary: "#DC143C", secondary: "#8B0000" },
  espadas: { primary: "#C0C0C0", secondary: "#708090" },
  bastos: { primary: "#228B22", secondary: "#006400" },
};

export const SUIT_COLORS_CB: Record<Suit, { primary: string; secondary: string }> = {
  oros: { primary: "#FFD700", secondary: "#B8860B" },
  copas: { primary: "#0072B2", secondary: "#005580" },
  espadas: { primary: "#E0E0E0", secondary: "#999999" },
  bastos: { primary: "#D55E00", secondary: "#993800" },
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  oros: "\u2666",    // diamond
  copas: "\u2665",   // heart
  espadas: "\u2660", // spade
  bastos: "\u2663",  // club
};

export const SUIT_LETTERS: Record<Suit, string> = {
  oros: "O",
  copas: "C",
  espadas: "E",
  bastos: "B",
};

export function getSuitColor(suit: Suit, colorblind: boolean): { primary: string; secondary: string } {
  return colorblind ? SUIT_COLORS_CB[suit] : SUIT_COLORS[suit];
}

export function drawSuitIcon(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  x: number,
  y: number,
  size: number,
  colorblind: boolean
): void {
  const colors = getSuitColor(suit, colorblind);
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = colors.primary;
  ctx.font = `${size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SUIT_SYMBOLS[suit], 0, 0);

  // Colorblind mode: add letter underneath
  if (colorblind) {
    ctx.font = `bold ${size * 0.4}px Arial`;
    ctx.fillStyle = colors.secondary;
    ctx.fillText(SUIT_LETTERS[suit], 0, size * 0.6);
  }

  ctx.restore();
}
