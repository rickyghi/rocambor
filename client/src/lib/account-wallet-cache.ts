import type { WalletResponse } from "../protocol";
import { readStorage, removeStorage, writeStorage } from "./storage";

const ACCOUNT_WALLET_PREFIX = "rocambor.accountWallet";

type WalletListener = (wallet: WalletResponse | null) => void;

const listeners = new Map<string, Set<WalletListener>>();

function accountWalletKey(accountId: string): string {
  return `${ACCOUNT_WALLET_PREFIX}:${accountId}`;
}

function emit(accountId: string, wallet: WalletResponse | null): void {
  const scoped = listeners.get(accountId);
  if (!scoped) return;
  for (const listener of scoped) {
    listener(wallet);
  }
}

function parseWallet(raw: string | null): WalletResponse | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WalletResponse>;
    if (
      !parsed ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.balance !== "number" ||
      parsed.currency !== "friendly_tokens" ||
      typeof parsed.rescueThreshold !== "number" ||
      typeof parsed.rescueTarget !== "number" ||
      typeof parsed.rescueCooldownHours !== "number" ||
      typeof parsed.canClaimRescue !== "boolean"
    ) {
      return null;
    }

    return {
      playerId: parsed.playerId,
      balance: parsed.balance,
      currency: "friendly_tokens",
      rescueThreshold: parsed.rescueThreshold,
      rescueTarget: parsed.rescueTarget,
      rescueCooldownHours: parsed.rescueCooldownHours,
      canClaimRescue: parsed.canClaimRescue,
      rescueAvailableAt:
        typeof parsed.rescueAvailableAt === "string"
          ? parsed.rescueAvailableAt
          : null,
      lastRescueAt:
        typeof parsed.lastRescueAt === "string" ? parsed.lastRescueAt : null,
    };
  } catch {
    return null;
  }
}

export function loadAccountWallet(accountId?: string | null): WalletResponse | null {
  if (!accountId) return null;
  return parseWallet(readStorage(accountWalletKey(accountId)));
}

export function saveAccountWallet(
  accountId: string,
  wallet: WalletResponse | null
): void {
  if (!accountId) return;

  if (!wallet) {
    removeStorage(accountWalletKey(accountId));
    emit(accountId, null);
    return;
  }

  writeStorage(accountWalletKey(accountId), JSON.stringify(wallet));
  emit(accountId, wallet);
}

export function subscribeAccountWallet(
  accountId: string,
  listener: WalletListener
): () => void {
  const scoped = listeners.get(accountId) ?? new Set<WalletListener>();
  scoped.add(listener);
  listeners.set(accountId, scoped);
  return () => {
    const current = listeners.get(accountId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(accountId);
    }
  };
}
