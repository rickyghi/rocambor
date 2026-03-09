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
  const logicalH = 760;

  return {
    mode: "desktop",
    width: logicalW,
    height: logicalH,
    scale: 1,
    cardW: 128,
    cardH: 192,
    handY: 560,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 310,
    positions: {
      self: { x: logicalW / 2, y: 700 },
      left: { x: 166, y: 310 },
      across: { x: logicalW / 2, y: 66 },
      right: { x: logicalW - 166, y: 310 },
    },
    opponentCards: {
      left: { x: 210, y: 256, vertical: true },
      across: { x: logicalW / 2, y: 130, vertical: false },
      right: { x: logicalW - 210, y: 256, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 310 },
      dealSource: { x: logicalW / 2, y: 310 },
      playFrom: {
        self: { x: logicalW / 2, y: 560 },
        left: { x: 210, y: 256 },
        across: { x: logicalW / 2, y: 130 },
        right: { x: logicalW - 210, y: 256 },
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
    cardW: 96,
    cardH: 144,
    handY: 860,
    handCenterX: logicalW / 2,
    tableCX: logicalW / 2,
    tableCY: 420,
    positions: {
      self: { x: logicalW / 2, y: 938 },
      left: { x: 118, y: 440 },
      across: { x: logicalW / 2, y: 86 },
      right: { x: logicalW - 118, y: 440 },
    },
    opponentCards: {
      left: { x: 156, y: 320, vertical: true },
      across: { x: logicalW / 2, y: 162, vertical: false },
      right: { x: logicalW - 156, y: 320, vertical: true },
    },
    anchors: {
      trickCenter: { x: logicalW / 2, y: 420 },
      dealSource: { x: logicalW / 2, y: 420 },
      playFrom: {
        self: { x: logicalW / 2, y: 844 },
        left: { x: 156, y: 320 },
        across: { x: logicalW / 2, y: 162 },
        right: { x: logicalW - 156, y: 320 },
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
  maxSpread = 100,
  maxWidth = 720
): { startX: number; spread: number } {
  const spread = Math.min(maxSpread, maxWidth / Math.max(1, count - 1));
  const startX = centerX - ((count - 1) * spread) / 2;
  return { startX, spread };
}
