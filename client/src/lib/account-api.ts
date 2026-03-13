import type { AuthManager } from "../auth/supabase-auth";
import type {
  MatchHistoryResponse,
  MeResponse,
  UpdateMeProfileRequest,
  WalletResponse,
} from "../protocol";
import { getApiBaseUrl } from "./runtime-config";

async function buildAuthHeaders(auth: AuthManager): Promise<HeadersInit | null> {
  const accessToken = await auth.getAccessToken();
  if (!accessToken) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchCurrentAccount(
  auth: AuthManager
): Promise<MeResponse | null> {
  if (!auth.isConfigured() || !auth.getUserId()) return null;
  const headers = await buildAuthHeaders(auth);
  if (!headers) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/me`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to load account (${response.status})`);
  }
  return (await response.json()) as MeResponse;
}

export async function patchCurrentAccount(
  auth: AuthManager,
  payload: UpdateMeProfileRequest
): Promise<MeResponse | null> {
  if (!auth.isConfigured() || !auth.getUserId()) return null;
  const headers = await buildAuthHeaders(auth);
  if (!headers) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/me/profile`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to save account (${response.status})`);
  }
  return (await response.json()) as MeResponse;
}

export async function fetchCurrentWallet(
  auth: AuthManager
): Promise<WalletResponse | null> {
  if (!auth.isConfigured() || !auth.getUserId()) return null;
  const headers = await buildAuthHeaders(auth);
  if (!headers) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/me/wallet`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to load wallet (${response.status})`);
  }
  return (await response.json()) as WalletResponse;
}

export async function claimCurrentWalletRescue(
  auth: AuthManager
): Promise<WalletResponse | null> {
  if (!auth.isConfigured() || !auth.getUserId()) return null;
  const headers = await buildAuthHeaders(auth);
  if (!headers) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/me/tokens/rescue`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Failed to claim rescue (${response.status})`);
  }
  return (await response.json()) as WalletResponse;
}

export async function fetchCurrentMatchHistory(
  auth: AuthManager
): Promise<MatchHistoryResponse | null> {
  if (!auth.isConfigured() || !auth.getUserId()) return null;
  const headers = await buildAuthHeaders(auth);
  if (!headers) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/me/matches`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to load match history (${response.status})`);
  }
  return (await response.json()) as MatchHistoryResponse;
}
