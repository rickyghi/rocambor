export const COLORS = {
  // Brand Core
  ivory: "#F8F6F0",
  black: "#0D0D0D",
  gold: "#C8A651",
  crimson: "#B02E2E",
  forest: "#2A4D41",

  // Neutrals
  ink80: "#2A2A2A",
  ink60: "#5A5A5A",
  ink40: "#8A8A8A",
  line: "#E6E0D6",
  surface: "#FFFFFF",
  overlay: "rgba(13,13,13,0.55)",

  // UI backgrounds (ivory-based light theme)
  bgPrimary: "#F8F6F0",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#F0EDE6",
  bgCard: "#ffffff",

  // Text
  textPrimary: "#0D0D0D",
  textSecondary: "#5A5A5A",
  textAccent: "#C8A651",
  textDark: "#1a1a1a",

  // Game table felt (stays dark for canvas)
  feltGreen: "#2A4D41",
  feltDark: "#1A2F28",
  feltLight: "#3A5D51",

  // Suits
  oros: "#FFD700",
  copas: "#DC143C",
  espadas: "#C0C0C0",
  bastos: "#228B22",

  // Suits colorblind-safe
  orosCB: "#FFD700",
  copasCB: "#0072B2",
  espadasCB: "#E0E0E0",
  bastosCB: "#D55E00",

  // Feedback
  success: "#1F7A4D",
  error: "#B02E2E",
  info: "#74c0fc",
  warning: "#B7791F",

  // Borders
  border: "#E6E0D6",
  borderLight: "#D8D2C6",
  borderAccent: "#C8A651",
} as const;

export const TABLE_THEMES = {
  classic: { felt: "#2A4D41", dark: "#1A2F28", light: "#3A5D51" },
  royal: { felt: "#1a1a3b", dark: "#0c0c19", light: "#24245a" },
  rustic: { felt: "#3b2a1a", dark: "#19120c", light: "#5a4324" },
} as const;

export type TableTheme = keyof typeof TABLE_THEMES;

export const FONT = {
  family: '"Inter", system-ui, -apple-system, sans-serif',
  familySerif: '"Playfair Display", Georgia, serif',
  familyDisplay: '"NoeDisplay Bold", "Playfair Display", Georgia, serif',
  familyMono: "'SF Mono', 'Fira Code', Consolas, monospace",
  sizeXs: "11px",
  sizeSm: "13px",
  sizeMd: "15px",
  sizeLg: "18px",
  sizeXl: "24px",
  size2xl: "36px",
  size3xl: "56px",
  weightNormal: "400",
  weightMedium: "500",
  weightBold: "700",
} as const;

export const SPACING = {
  xs: "8px",
  sm: "16px",
  md: "24px",
  lg: "32px",
  xl: "48px",
  xxl: "64px",
} as const;

export const RADIUS = {
  sm: "6px",
  md: "12px",
  lg: "20px",
  pill: "999px",
} as const;

export const MOTION = {
  durMicro: 120,
  durFast: 150,
  durBase: 240,
  durSlow: 400,
} as const;

export const SURFACES = {
  parchment: "#F8F6F0",
  felt: "#2A4D41",
  feltDark: "#1A2F28",
  card: "#FFFFFF",
} as const;
