import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { AuthUserSummary, WsTicketResponse } from "../../shared/types";

const WS_TICKET_TTL_MS = 5 * 60 * 1000;

interface WsTicketPayload {
  sub: string;
  email: string | null;
  iat: number;
  exp: number;
  nonce: string;
}

export interface VerifiedWsTicket {
  user: AuthUserSummary;
  expiresAt: string;
}

function trimTrailingSlash(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function getSupabaseProjectUrl(): string | null {
  return trimTrailingSlash(process.env.SUPABASE_PROJECT_URL);
}

function getSupabasePublishableKey(): string | null {
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  return key || null;
}

function getWsAuthSecret(): string | null {
  const secret = process.env.WS_AUTH_SECRET?.trim() || "";
  return secret || null;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const paddingLength = (4 - (value.length % 4 || 4)) % 4;
  const base64 = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(paddingLength)}`;
  return Buffer.from(base64, "base64").toString("utf8");
}

function signPayload(serializedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(serializedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseUserSummary(data: unknown): AuthUserSummary | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  return {
    id: candidate.id,
    email: typeof candidate.email === "string" ? candidate.email : null,
  };
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    getSupabaseProjectUrl() &&
      getSupabasePublishableKey() &&
      getWsAuthSecret()
  );
}

export async function verifySupabaseAccessToken(
  accessToken: string
): Promise<AuthUserSummary | null> {
  const projectUrl = getSupabaseProjectUrl();
  const publishableKey = getSupabasePublishableKey();
  if (!projectUrl || !publishableKey) {
    return null;
  }
  if (!accessToken.trim()) {
    return null;
  }

  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  return parseUserSummary(payload);
}

export function createWsTicket(user: AuthUserSummary): WsTicketResponse {
  const secret = getWsAuthSecret();
  if (!secret) {
    throw new Error("WS_AUTH_SECRET is not configured.");
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + WS_TICKET_TTL_MS;
  const payload: WsTicketPayload = {
    sub: user.id,
    email: user.email,
    iat: issuedAt,
    exp: expiresAt,
    nonce: randomBytes(12).toString("hex"),
  };
  const serializedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(serializedPayload, secret);

  return {
    ticket: `${serializedPayload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
    user,
  };
}

export function verifyWsTicket(ticket: string): VerifiedWsTicket | null {
  const secret = getWsAuthSecret();
  if (!secret) {
    return null;
  }

  const [serializedPayload, signature] = ticket.split(".");
  if (!serializedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(serializedPayload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  let parsedPayload: WsTicketPayload;
  try {
    parsedPayload = JSON.parse(
      decodeBase64Url(serializedPayload)
    ) as WsTicketPayload;
  } catch {
    return null;
  }

  if (
    typeof parsedPayload.sub !== "string" ||
    parsedPayload.sub.length === 0 ||
    typeof parsedPayload.iat !== "number" ||
    typeof parsedPayload.exp !== "number"
  ) {
    return null;
  }

  if (Date.now() >= parsedPayload.exp) {
    return null;
  }

  return {
    user: {
      id: parsedPayload.sub,
      email: typeof parsedPayload.email === "string" ? parsedPayload.email : null,
    },
    expiresAt: new Date(parsedPayload.exp).toISOString(),
  };
}
