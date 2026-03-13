import type { ProfileMatchHistoryEntry } from "../protocol";
import {
  PROFILE_MATCH_HISTORY_KEY,
  readStorage,
  writeStorage,
} from "./storage";

const MAX_HISTORY = 8;
const ACCOUNT_HISTORY_PREFIX = "rocambor.accountMatchHistory";

function parseHistory(raw: string | null): ProfileMatchHistoryEntry[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry): ProfileMatchHistoryEntry[] => {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        (entry.mode !== "tresillo" && entry.mode !== "quadrille") ||
        (entry.outcome !== "win" && entry.outcome !== "loss") ||
        (entry.role !== "ombre" &&
          entry.role !== "contra" &&
          entry.role !== "resting") ||
        typeof entry.score !== "number" ||
        typeof entry.recordedAt !== "string"
      ) {
        return [];
      }

      return [
        {
          id: entry.id,
          mode: entry.mode,
          outcome: entry.outcome,
          role: entry.role,
          score: entry.score,
          recordedAt: entry.recordedAt,
          placement:
            typeof entry.placement === "number" ? entry.placement : null,
          stakeMode: entry.stakeMode === "tokens" ? "tokens" : "free",
          ante: typeof entry.ante === "number" ? entry.ante : 0,
          pot: typeof entry.pot === "number" ? entry.pot : 0,
        },
      ];
    });
  } catch {
    return [];
  }
}

function accountHistoryKey(accountId: string): string {
  return `${ACCOUNT_HISTORY_PREFIX}:${accountId}`;
}

export function loadProfileMatchHistory(
  accountId?: string | null
): ProfileMatchHistoryEntry[] {
  const raw = accountId
    ? readStorage(accountHistoryKey(accountId))
    : readStorage(PROFILE_MATCH_HISTORY_KEY);
  return parseHistory(raw);
}

export function saveProfileMatchHistory(entries: ProfileMatchHistoryEntry[]): void {
  writeStorage(PROFILE_MATCH_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

export function saveAccountProfileMatchHistory(
  accountId: string,
  entries: ProfileMatchHistoryEntry[]
): void {
  writeStorage(
    accountHistoryKey(accountId),
    JSON.stringify(entries.slice(0, MAX_HISTORY))
  );
}

export function recordProfileMatch(entry: ProfileMatchHistoryEntry): void {
  const current = loadProfileMatchHistory().filter((item) => item.id !== entry.id);
  saveProfileMatchHistory([entry, ...current]);
}
