import type { ProfileMatchHistoryEntry } from "../protocol";
import {
  PROFILE_MATCH_HISTORY_KEY,
  readStorage,
  writeStorage,
} from "./storage";

const MAX_HISTORY = 8;
const ACCOUNT_HISTORY_PREFIX = "rocambor.accountMatchHistory";
type MatchHistoryListener = (entries: ProfileMatchHistoryEntry[]) => void;

const listeners = new Map<string, Set<MatchHistoryListener>>();

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

function scopeKey(accountId?: string | null): string {
  return accountId || "__guest__";
}

function emit(accountId: string | null | undefined, entries: ProfileMatchHistoryEntry[]): void {
  const scoped = listeners.get(scopeKey(accountId));
  if (!scoped) return;
  for (const listener of scoped) {
    listener(entries);
  }
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
  const next = entries.slice(0, MAX_HISTORY);
  writeStorage(PROFILE_MATCH_HISTORY_KEY, JSON.stringify(next));
  emit(null, next);
}

export function saveAccountProfileMatchHistory(
  accountId: string,
  entries: ProfileMatchHistoryEntry[]
): void {
  const next = entries.slice(0, MAX_HISTORY);
  writeStorage(
    accountHistoryKey(accountId),
    JSON.stringify(next)
  );
  emit(accountId, next);
}

export function recordProfileMatch(entry: ProfileMatchHistoryEntry): void {
  const current = loadProfileMatchHistory().filter((item) => item.id !== entry.id);
  saveProfileMatchHistory([entry, ...current]);
}

export function subscribeProfileMatchHistory(
  accountId: string | null | undefined,
  listener: MatchHistoryListener
): () => void {
  const key = scopeKey(accountId);
  const scoped = listeners.get(key) ?? new Set<MatchHistoryListener>();
  scoped.add(listener);
  listeners.set(key, scoped);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(key);
    }
  };
}
