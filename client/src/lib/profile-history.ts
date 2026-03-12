import type { Mode } from "../protocol";
import {
  PROFILE_MATCH_HISTORY_KEY,
  readStorage,
  writeStorage,
} from "./storage";

export interface ProfileMatchHistoryEntry {
  id: string;
  mode: Mode;
  outcome: "win" | "loss";
  role: "ombre" | "contra" | "resting";
  score: number;
  recordedAt: string;
}

const MAX_HISTORY = 8;

export function loadProfileMatchHistory(): ProfileMatchHistoryEntry[] {
  const raw = readStorage(PROFILE_MATCH_HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is ProfileMatchHistoryEntry => {
      return Boolean(
        entry &&
          typeof entry.id === "string" &&
          (entry.mode === "tresillo" || entry.mode === "quadrille") &&
          (entry.outcome === "win" || entry.outcome === "loss") &&
          (entry.role === "ombre" || entry.role === "contra" || entry.role === "resting") &&
          typeof entry.score === "number" &&
          typeof entry.recordedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function saveProfileMatchHistory(entries: ProfileMatchHistoryEntry[]): void {
  writeStorage(PROFILE_MATCH_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

export function recordProfileMatch(entry: ProfileMatchHistoryEntry): void {
  const current = loadProfileMatchHistory().filter((item) => item.id !== entry.id);
  saveProfileMatchHistory([entry, ...current]);
}
