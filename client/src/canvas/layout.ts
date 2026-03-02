export interface Layout {
  width: number;
  height: number;
  scale: number;
  // Card dimensions
  cardW: number;
  cardH: number;
  // Player hand (bottom)
  handY: number;
  handCenterX: number;
  // Table center
  tableCX: number;
  tableCY: number;
  // Player positions (x, y for name/score badges)
  positions: {
    self: { x: number; y: number };
    left: { x: number; y: number };
    across: { x: number; y: number };
    right: { x: number; y: number };
  };
  // Opponent card-back positions
  opponentCards: {
    left: { x: number; y: number; vertical: boolean };
    across: { x: number; y: number; vertical: boolean };
    right: { x: number; y: number; vertical: boolean };
  };
}

const LOGICAL_W = 1024;
const LOGICAL_H = 720;
const CARD_W = 76;
const CARD_H = 108;

export function computeLayout(canvasW: number, canvasH: number): Layout {
  const scale = Math.min(canvasW / LOGICAL_W, canvasH / LOGICAL_H);

  return {
    width: LOGICAL_W,
    height: LOGICAL_H,
    scale,
    cardW: CARD_W,
    cardH: CARD_H,
    handY: 570,
    handCenterX: LOGICAL_W / 2,
    tableCX: LOGICAL_W / 2,
    tableCY: 340,
    positions: {
      self: { x: LOGICAL_W / 2, y: 660 },
      left: { x: 70, y: 340 },
      across: { x: LOGICAL_W / 2, y: 40 },
      right: { x: LOGICAL_W - 70, y: 340 },
    },
    opponentCards: {
      left: { x: 120, y: 280, vertical: true },
      across: { x: LOGICAL_W / 2, y: 100, vertical: false },
      right: { x: LOGICAL_W - 120, y: 280, vertical: true },
    },
  };
}

export function cardSpread(
  count: number,
  centerX: number,
  maxSpread = 86,
  maxWidth = 600
): { startX: number; spread: number } {
  const spread = Math.min(maxSpread, maxWidth / Math.max(1, count - 1));
  const startX = centerX - ((count - 1) * spread) / 2;
  return { startX, spread };
}
