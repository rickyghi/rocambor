import type { C2SMessage, S2CMessage } from "./protocol";
import { ClientState } from "./state";

type MessageHandler = (msg: S2CMessage) => void;

export class ConnectionManager {
  private ws: WebSocket | null = null;
  private clientId: string | null;
  private playerId: string | null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatTimer: number | null = null;
  private listeners = new Map<string, Set<MessageHandler>>();
  private globalListeners = new Set<MessageHandler>();
  private _connected = false;

  constructor(private state: ClientState) {
    this.clientId = localStorage.getItem("rocambor_clientId");
    this.playerId = localStorage.getItem("rocambor_playerId");
  }

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    const baseUrl = this.getWebSocketUrl();
    const params = new URLSearchParams();
    if (this.clientId) params.set("resume", this.clientId);
    if (this.playerId) params.set("playerId", this.playerId);
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
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.startHeartbeat();
      this.emit("_connected", {} as any);
    };

    this.ws.onclose = (event) => {
      this._connected = false;
      this.stopHeartbeat();

      if (
        event.code === 1006 ||
        event.code === 1011 ||
        event.code === 1001
      ) {
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
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "User disconnect");
      this.ws = null;
    }
    this._connected = false;
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

  private handleMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "WELCOME":
        this.clientId = msg.clientId;
        localStorage.setItem("rocambor_clientId", msg.clientId);
        if (msg.playerId) {
          this.playerId = msg.playerId;
          localStorage.setItem("rocambor_playerId", msg.playerId);
        }
        break;

      case "ROOM_JOINED":
        this.state.setSeat(msg.seat);
        break;

      case "ROOM_LEFT":
        this.state.reset();
        break;

      case "STATE":
        this.state.update(msg.state, msg.hand);
        break;

      case "PONG":
        // Heartbeat acknowledged
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[connection] Max reconnect attempts reached");
      return;
    }
    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `[connection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );
    setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: "PING" });
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
