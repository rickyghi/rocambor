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
  const logicalW = 1024;
  const logicalH = 720;

  return {
    mode: "desktop",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 76,
    cardH: 108,
    handY: 570,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 340,
    positions: {
      self: { x: logicalW / 2, y: 660 },
      left: { x: 70, y: 340 },
      across: { x: logicalW / 2, y: 40 },
      right: { x: logicalW - 70, y: 340 },
    },
    opponentCards: {
      left: { x: 120, y: 280, vertical: true },
      across: { x: logicalW / 2, y: 100, vertical: false },
      right: { x: logicalW - 120, y: 280, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 340 },
      dealSource: { x: logicalW / 2, y: 340 },
      playFrom: {
        self: { x: logicalW / 2, y: 570 },
        left: { x: 120, y: 280 },
        across: { x: logicalW / 2, y: 100 },
        right: { x: logicalW - 120, y: 280 },
      },
    },
  };
}

function mobilePortraitLayout(): Layout {
  const logicalW = 720;
  const logicalH = 1024;

  return {
    mode: "mobile-portrait",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 70,
    cardH: 100,
    handY: 890,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 430,
    positions: {
      self: { x: logicalW / 2, y: 958 },
      left: { x: 92, y: 468 },
      across: { x: logicalW / 2, y: 84 },
      right: { x: logicalW - 92, y: 468 },
    },
    opponentCards: {
      left: { x: 122, y: 340, vertical: true },
      across: { x: logicalW / 2, y: 150, vertical: false },
      right: { x: logicalW - 122, y: 340, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 430 },
      dealSource: { x: logicalW / 2, y: 430 },
      playFrom: {
        self: { x: logicalW / 2, y: 860 },
        left: { x: 122, y: 340 },
        across: { x: logicalW / 2, y: 150 },
        right: { x: logicalW - 122, y: 340 },
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
