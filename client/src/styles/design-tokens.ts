export const COLORS = {
  // Table
  feltGreen: "#1a3b2e",
  feltDark: "#0c1912",
  feltLight: "#245a43",

  // UI backgrounds
  bgPrimary: "#0c1912",
  bgSecondary: "#13251b",
  bgTertiary: "#1c2f24",
  bgCard: "#ffffff",

  // Text
  textPrimary: "#e8f0ff",
  textSecondary: "#a0b0c0",
  textAccent: "#fbbf24",
  textDark: "#1a1a1a",

  // Suits
  oros: "#FFD700",
  copas: "#FF4444",
  espadas: "#C0C0C0",
  bastos: "#228B22",

  // Suits colorblind-safe
  orosCB: "#FFD700",
  copasCB: "#0072B2",
  espadasCB: "#E0E0E0",
  bastosCB: "#D55E00",

  // Feedback
  success: "#4ade80",
  error: "#ff6b6b",
  info: "#74c0fc",
  warning: "#fbbf24",

  // Borders
  border: "#345",
  borderLight: "#456",
  borderAccent: "#fbbf24",
} as const;

export const TABLE_THEMES = {
  classic: { felt: "#1a3b2e", dark: "#0c1912", light: "#245a43" },
  royal: { felt: "#1a1a3b", dark: "#0c0c19", light: "#24245a" },
  rustic: { felt: "#3b2a1a", dark: "#19120c", light: "#5a4324" },
} as const;

export type TableTheme = keyof typeof TABLE_THEMES;

export const FONT = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  familyMono: "'SF Mono', 'Fira Code', Consolas, monospace",
  sizeXs: "11px",
  sizeSm: "13px",
  sizeMd: "15px",
  sizeLg: "18px",
  sizeXl: "24px",
  size2xl: "32px",
  size3xl: "48px",
  weightNormal: "400",
  weightMedium: "500",
  weightBold: "700",
} as const;

export const SPACING = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
  xxxl: "48px",
} as const;

export const RADIUS = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  pill: "999px",
} as const;
