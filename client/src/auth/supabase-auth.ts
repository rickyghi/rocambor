import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

export type OAuthProvider = "google" | "apple";

export interface AuthUserSnapshot {
  id: string;
  email: string | null;
  providers: string[];
}

export interface AuthSnapshot {
  configured: boolean;
  loading: boolean;
  user: AuthUserSnapshot | null;
}

interface AccountRealtimeHandlers {
  onPlayerChanged?: () => void;
  onWalletChanged?: () => void;
  onMatchHistoryChanged?: () => void;
}

type AuthListener = (snapshot: AuthSnapshot) => void;

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function mapUser(user: User | null): AuthUserSnapshot | null {
  if (!user) return null;
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const providers = identities
    .map((identity) => identity.provider)
    .filter((provider): provider is string => typeof provider === "string" && provider.length > 0);

  return {
    id: user.id,
    email: user.email ?? null,
    providers,
  };
}

function inferFileExtension(file: File): string {
  const type = file.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("svg")) return "svg";
  const source = file.name.split(".").pop()?.trim().toLowerCase();
  return source || "png";
}

export class AuthManager {
  private client: SupabaseClient | null = null;
  private snapshot: AuthSnapshot;
  private session: Session | null = null;
  private listeners = new Set<AuthListener>();

  constructor() {
    const supabaseUrl = normalizeBaseUrl(import.meta.env.VITE_SUPABASE_URL);
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

    if (supabaseUrl && anonKey) {
      this.client = createClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }

    this.snapshot = {
      configured: Boolean(this.client),
      loading: Boolean(this.client),
      user: null,
    };

    if (!this.client) return;

    this.client.auth
      .getSession()
      .then(({ data }) => {
        this.applySession(data.session ?? null);
      })
      .catch((error) => {
        console.error("[auth] Failed to restore session:", error);
        this.applySession(null);
      });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
    });
  }

  getSnapshot(): AuthSnapshot {
    return {
      configured: this.snapshot.configured,
      loading: this.snapshot.loading,
      user: this.snapshot.user ? { ...this.snapshot.user, providers: [...this.snapshot.user.providers] } : null,
    };
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isConfigured(): boolean {
    return this.snapshot.configured;
  }

  getUserId(): string | null {
    return this.snapshot.user?.id ?? null;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      console.error("[auth] Failed to read current session:", error);
      return null;
    }
    this.applySession(data.session ?? null);
    return data.session?.access_token ?? null;
  }

  async signInWithProvider(provider: OAuthProvider): Promise<void> {
    if (!this.client) {
      throw new Error("Supabase auth is not configured.");
    }
    const { error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.href,
      },
    });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.applySession(null);
  }

  async uploadAvatar(file: File): Promise<string> {
    if (!this.client || !this.snapshot.user) {
      throw new Error("You need to be signed in to upload a portrait.");
    }
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Portraits must be 5 MB or smaller.");
    }

    const ext = inferFileExtension(file);
    const path = `${this.snapshot.user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await this.client.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type || `image/${ext}`,
      cacheControl: "3600",
    });
    if (error) throw error;

    const { data } = this.client.storage.from("avatars").getPublicUrl(path);
    if (!data.publicUrl) {
      throw new Error("Avatar upload succeeded, but no public URL was returned.");
    }
    return data.publicUrl;
  }

  subscribeToAccountRealtime(
    playerId: string,
    handlers: AccountRealtimeHandlers
  ): () => void {
    if (!this.client || !this.snapshot.user || !playerId) {
      return () => {};
    }

    const channel = this.client.channel(
      `rocambor-account:${playerId}:${Math.random().toString(36).slice(2, 8)}`
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "players",
        filter: `id=eq.${playerId}`,
      },
      () => {
        handlers.onPlayerChanged?.();
        handlers.onWalletChanged?.();
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "token_ledger",
        filter: `player_id=eq.${playerId}`,
      },
      () => {
        handlers.onWalletChanged?.();
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "match_participants",
        filter: `player_id=eq.${playerId}`,
      },
      () => {
        handlers.onMatchHistoryChanged?.();
      }
    );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`[auth] Account realtime channel status: ${status}`);
      }
    });

    return () => {
      void this.client?.removeChannel(channel);
    };
  }

  private applySession(session: Session | null): void {
    this.session = session;
    this.snapshot = {
      configured: this.snapshot.configured,
      loading: false,
      user: mapUser(session?.user ?? null),
    };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
