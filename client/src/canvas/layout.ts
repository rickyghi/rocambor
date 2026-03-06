export interface Layout {
  mode: ViewportMode;
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
  // Animation anchors
  anchors: {
    trickCenter: { x: number; y: number };
    dealSource: { x: number; y: number };
    playFrom: {
      self: { x: number; y: number };
      left: { x: number; y: number };
      across: { x: number; y: number };
      right: { x: number; y: number };
    };
  };
}

export type ViewportMode = "desktop" | "mobile-portrait";

function desktopLayout(): Layout {
  const logicalW = 1320;
  const logicalH = 700;

  return {
    mode: "desktop",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 96,
    cardH: 138,
    handY: 570,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 332,
    positions: {
      self: { x: logicalW / 2, y: 652 },
      left: { x: 166, y: 332 },
      across: { x: logicalW / 2, y: 66 },
      right: { x: logicalW - 166, y: 332 },
    },
    opponentCards: {
      left: { x: 210, y: 278, vertical: true },
      across: { x: logicalW / 2, y: 130, vertical: false },
      right: { x: logicalW - 210, y: 278, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 332 },
      dealSource: { x: logicalW / 2, y: 332 },
      playFrom: {
        self: { x: logicalW / 2, y: 570 },
        left: { x: 210, y: 278 },
        across: { x: logicalW / 2, y: 130 },
        right: { x: logicalW - 210, y: 278 },
      },
    },
  };
}

function mobilePortraitLayout(): Layout {
  const logicalW = 760;
  const logicalH = 1020;

  return {
    mode: "mobile-portrait",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 82,
    cardH: 118,
    handY: 870,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 430,
    positions: {
      self: { x: logicalW / 2, y: 938 },
      left: { x: 118, y: 446 },
      across: { x: logicalW / 2, y: 86 },
      right: { x: logicalW - 118, y: 446 },
    },
    opponentCards: {
      left: { x: 156, y: 328, vertical: true },
      across: { x: logicalW / 2, y: 162, vertical: false },
      right: { x: logicalW - 156, y: 328, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 430 },
      dealSource: { x: logicalW / 2, y: 430 },
      playFrom: {
        self: { x: logicalW / 2, y: 854 },
        left: { x: 156, y: 328 },
        across: { x: logicalW / 2, y: 162 },
        right: { x: logicalW - 156, y: 328 },
      },
    },
  };
}

export function computeLayout(mode: ViewportMode = "desktop"): Layout {
  return mode === "mobile-portrait" ? mobilePortraitLayout() : desktopLayout();
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
