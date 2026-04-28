import type { CSSProperties } from "react";
import type { SeatIndex } from "../../protocol";

type AccentStyle = CSSProperties & Record<string, string>;

const SEAT_ACCENTS: Record<SeatIndex, { base: string; border: string; soft: string; glow: string }> = {
  0: {
    base: "#d6a64a",
    border: "rgba(214, 166, 74, 0.46)",
    soft: "rgba(214, 166, 74, 0.18)",
    glow: "rgba(214, 166, 74, 0.3)",
  },
  1: {
    base: "#40b7c8",
    border: "rgba(64, 183, 200, 0.46)",
    soft: "rgba(64, 183, 200, 0.18)",
    glow: "rgba(64, 183, 200, 0.3)",
  },
  2: {
    base: "#8d63da",
    border: "rgba(141, 99, 218, 0.46)",
    soft: "rgba(141, 99, 218, 0.18)",
    glow: "rgba(141, 99, 218, 0.3)",
  },
  3: {
    base: "#d77a5f",
    border: "rgba(215, 122, 95, 0.46)",
    soft: "rgba(215, 122, 95, 0.18)",
    glow: "rgba(215, 122, 95, 0.3)",
  },
};

export function seatAccentVars(seat: SeatIndex): AccentStyle {
  const accent = SEAT_ACCENTS[seat];
  return {
    "--player-accent": accent.base,
    "--player-accent-border": accent.border,
    "--player-accent-soft": accent.soft,
    "--player-accent-glow": accent.glow,
  };
}
