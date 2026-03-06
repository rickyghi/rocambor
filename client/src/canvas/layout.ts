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
  const logicalW = 1280;
  const logicalH = 820;

  return {
    mode: "desktop",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 82,
    cardH: 118,
    handY: 684,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 390,
    positions: {
      self: { x: logicalW / 2, y: 778 },
      left: { x: 132, y: 390 },
      across: { x: logicalW / 2, y: 72 },
      right: { x: logicalW - 132, y: 390 },
    },
    opponentCards: {
      left: { x: 172, y: 318, vertical: true },
      across: { x: logicalW / 2, y: 148, vertical: false },
      right: { x: logicalW - 172, y: 318, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 390 },
      dealSource: { x: logicalW / 2, y: 390 },
      playFrom: {
        self: { x: logicalW / 2, y: 684 },
        left: { x: 172, y: 318 },
        across: { x: logicalW / 2, y: 148 },
        right: { x: logicalW - 172, y: 318 },
      },
    },
  };
}

function mobilePortraitLayout(): Layout {
  const logicalW = 760;
  const logicalH = 1120;

  return {
    mode: "mobile-portrait",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 74,
    cardH: 106,
    handY: 960,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 470,
    positions: {
      self: { x: logicalW / 2, y: 1038 },
      left: { x: 112, y: 496 },
      across: { x: logicalW / 2, y: 94 },
      right: { x: logicalW - 112, y: 496 },
    },
    opponentCards: {
      left: { x: 144, y: 372, vertical: true },
      across: { x: logicalW / 2, y: 178, vertical: false },
      right: { x: logicalW - 144, y: 372, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 470 },
      dealSource: { x: logicalW / 2, y: 470 },
      playFrom: {
        self: { x: logicalW / 2, y: 948 },
        left: { x: 144, y: 372 },
        across: { x: logicalW / 2, y: 178 },
        right: { x: logicalW - 144, y: 372 },
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
