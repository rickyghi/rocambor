import type { C2SMessage, S2CMessage, WsTicketResponse } from "./protocol";
import type { AuthManager } from "./auth/supabase-auth";
import { getApiBaseUrl } from "./lib/runtime-config";
import { ClientState } from "./state";

type MessageHandler = (msg: S2CMessage) => void;

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private clientId: string | null;
  private guestPlayerId: string | null;
  private playerId: string | null;
  private reconnectAttempts = 0;
  private reconnectBaseDelay = 1000;
  private reconnectMaxDelay = 15000;
  private reconnectTimer: number | null = null;
  private manualDisconnect = false;
  private heartbeatTimer: number | null = null;
  private listeners = new Map<string, Set<MessageHandler>>();
  private globalListeners = new Set<MessageHandler>();
  private _connected = false;
  private lastPingSentAt: number | null = null;
  private _latencyMs: number | null = null;
  private connectAttempt = 0;
  private identityRefreshPending = false;

  constructor(
    private state: ClientState,
    private auth?: AuthManager
  ) {
    this.clientId = localStorage.getItem("rocambor_clientId");
    this.guestPlayerId = localStorage.getItem("rocambor_playerId");
    this.playerId = this.auth?.getUserId() ?? this.guestPlayerId;

    if (this.auth) {
      let lastAuthUserId = this.auth.getUserId();
      this.auth.subscribe((snapshot) => {
        const nextAuthUserId = snapshot.user?.id ?? null;
        if (nextAuthUserId === lastAuthUserId) return;
        lastAuthUserId = nextAuthUserId;
        this.playerId = nextAuthUserId ?? this.guestPlayerId;
        this.reconnectForIdentityChange();
      });
    }
  }

  connect(): void {
    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    const connectAttempt = ++this.connectAttempt;
    this.manualDisconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const baseUrl = this.getWebSocketUrl();
    const params = new URLSearchParams();
    if (this.clientId) params.set("resume", this.clientId);
    const wsTicket = await this.fetchWsTicket();
    if (connectAttempt !== this.connectAttempt || this.manualDisconnect) return;
    if (wsTicket) {
      params.set("ticket", wsTicket.ticket);
      this.playerId = wsTicket.user.id;
    } else if (this.guestPlayerId) {
      params.set("playerId", this.guestPlayerId);
      this.playerId = this.guestPlayerId;
    }
    const url = params.toString() ? `${baseUrl}/?${params.toString()}` : baseUrl;

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.error("[connection] Failed to create WebSocket:", error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._connected = true;
      this._latencyMs = null;
      this.reconnectAttempts = 0;
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.startHeartbeat();
      this.sendPing();
      this.emit("_connected", {} as any);
    };

    this.ws.onclose = (event) => {
      this._connected = false;
      this._latencyMs = null;
      this.stopHeartbeat();
      this.ws = null;

      if (this.identityRefreshPending) {
        this.identityRefreshPending = false;
        this.connect();
      } else if (!this.manualDisconnect) {
        this.scheduleReconnect();
      }
      this.emit("_disconnected", {} as any);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as S2CMessage;
        this.handleMessage(msg);
      } catch (error) {
        console.error("[connection] Failed to parse message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[connection] WebSocket error:", error);
      this._connected = false;
      this.stopHeartbeat();
    };
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.identityRefreshPending = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "User disconnect");
      this.ws = null;
    }
    this._connected = false;
    this._latencyMs = null;
  }

  send(msg: C2SMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (error) {
        console.error("[connection] Failed to send:", error);
      }
    } else {
      console.warn("[connection] Not connected, cannot send");
    }
  }

  on(messageType: string, handler: MessageHandler): () => void {
    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, new Set());
    }
    this.listeners.get(messageType)!.add(handler);
    return () => this.listeners.get(messageType)?.delete(handler);
  }

  onAny(handler: MessageHandler): () => void {
    this.globalListeners.add(handler);
    return () => this.globalListeners.delete(handler);
  }

  get connected(): boolean {
    return this._connected;
  }

  get currentClientId(): string | null {
    return this.clientId;
  }

  get latencyMs(): number | null {
    return this._latencyMs;
  }

  private handleMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "WELCOME":
        this.clientId = msg.clientId;
        localStorage.setItem("rocambor_clientId", msg.clientId);
        if (msg.playerId) {
          this.playerId = msg.playerId;
          localStorage.setItem("rocambor_currentPlayerId", msg.playerId);
          const authUserId = this.auth?.getUserId() ?? null;
          if (!authUserId || authUserId !== msg.playerId) {
            this.guestPlayerId = msg.playerId;
            localStorage.setItem("rocambor_playerId", msg.playerId);
          }
        }
        break;

      case "ROOM_JOINED":
        this.state.setRoomJoin(msg.code, msg.seat);
        break;

      case "ROOM_LEFT":
        this.state.reset();
        break;

      case "STATE":
        this.state.update(msg.state, msg.hand);
        break;

      case "PONG":
        if (this.lastPingSentAt !== null) {
          this._latencyMs = Math.max(0, Date.now() - this.lastPingSentAt);
          this.lastPingSentAt = null;
          this.emit("_latency", {} as any);
        }
        break;
    }

    // Dispatch to typed listeners
    const handlers = this.listeners.get(msg.type);
    if (handlers) {
      for (const h of handlers) {
        try {
          h(msg);
        } catch (e) {
          console.error("[connection] Handler error:", e);
        }
      }
    }

    // Dispatch to global listeners
    for (const h of this.globalListeners) {
      try {
        h(msg);
      } catch (e) {
        console.error("[connection] Global handler error:", e);
      }
    }
  }

  private emit(type: string, msg: S2CMessage): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const h of handlers) h(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect) {
      return;
    }
    if (this.reconnectTimer !== null) return;
    this.reconnectAttempts++;
    const expDelay = Math.min(
      this.reconnectMaxDelay,
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1)
    );
    const jitter = Math.floor(Math.random() * Math.min(800, expDelay * 0.25));
    const delay = Math.round(expDelay + jitter);
    console.log(
      `[connection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.sendPing();
    }, 25_000);
  }

  private sendPing(): void {
    this.lastPingSentAt = Date.now();
    this.send({ type: "PING" });
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private reconnectForIdentityChange(): void {
    if (this.manualDisconnect) return;
    if (!this.ws) {
      this.connect();
      return;
    }
    if (
      this.ws.readyState !== WebSocket.CONNECTING &&
      this.ws.readyState !== WebSocket.OPEN
    ) {
      this.connect();
      return;
    }
    this.identityRefreshPending = true;
    try {
      this.ws.close(4001, "Identity refresh");
    } catch {
      this.identityRefreshPending = false;
      this.connect();
    }
  }

  private async fetchWsTicket(): Promise<WsTicketResponse | null> {
    if (!this.auth?.isConfigured()) return null;
    const accessToken = await this.auth.getAccessToken();
    if (!accessToken) return null;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/ws-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        console.warn("[connection] Failed to fetch WebSocket auth ticket:", response.status);
        return null;
      }

      return (await response.json()) as WsTicketResponse;
    } catch (error) {
      console.warn("[connection] WebSocket auth ticket request failed:", error);
      return null;
    }
  }

  private getWebSocketUrl(): string {
    // Env var override for split deployments (e.g. Netlify client + Railway server)
    if (import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL;
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";

    // In development with Vite proxy
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      return `ws://localhost:8080`;
    }

    // Production: same host
    return `${protocol}//${location.host}`;
  }
}
