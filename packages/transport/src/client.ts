import type { IntentMessage, ClappState, AppEntry } from "@clapps/core";

export interface ClappTransportOptions {
  serverUrl: string; // e.g. "http://localhost:3080" or tunnel URL
  context?: ClientContext;
  token?: string; // access token for non-browser clients (Bearer header + WS query param)
}

export interface ClientContext {
  platform?: string;
  user?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
}

type StateListener = (clappId: string, state: ClappState) => void;
type AppsListener = (apps: AppEntry[]) => void;
type ViewListener = (viewId: string, content: string) => void;
type ConnectionListener = (connected: boolean) => void;

/**
 * WebSocket-first transport for communicating with a clapps server.
 * Falls back to HTTP for one-shot requests.
 */
export class ClappTransport {
  private serverUrl: string;
  private wsUrl: string;
  private context?: ClientContext;
  private token?: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  private stateListeners = new Set<StateListener>();
  private appsListeners = new Set<AppsListener>();
  private viewListeners = new Set<ViewListener>();
  private connectionListeners = new Set<ConnectionListener>();

  constructor(options: ClappTransportOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, "");
    this.context = options.context;
    this.token = options.token;

    // Derive WS URL from HTTP URL
    const url = new URL(this.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    if (this.token) url.searchParams.set("token", this.token);
    this.wsUrl = url.toString();
  }

  // --- Lifecycle ---

  connect(): void {
    if (this.ws) return;
    this.createWebSocket();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setConnected(false);
  }

  // --- Subscriptions ---

  subscribe(clappIds: string[]): void {
    this.wsSend({ type: "subscribe", clappIds });
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onApps(listener: AppsListener): () => void {
    this.appsListeners.add(listener);
    return () => this.appsListeners.delete(listener);
  }

  onView(listener: ViewListener): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Actions ---

  /** Send an intent via WebSocket (preferred) or HTTP fallback */
  async sendIntent(
    clappId: string,
    intent: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    // Try WebSocket first
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.wsSend({ type: "intent", clappId, intent, payload });
      return;
    }

    // HTTP fallback
    const message: IntentMessage = {
      id: crypto.randomUUID(),
      agentId: "local",
      clappId,
      intent,
      payload,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`${this.serverUrl}/api/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      throw new Error(`Failed to send intent: ${res.status}`);
    }
  }

  /** Fetch apps via HTTP (for initial load before WS connects) */
  async fetchApps(): Promise<AppEntry[]> {
    const res = await fetch(`${this.serverUrl}/api/apps`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch apps: ${res.status}`);
    return res.json() as Promise<AppEntry[]>;
  }

  /** Fetch state via HTTP (for initial load) */
  async fetchState(clappId: string): Promise<ClappState | null> {
    const res = await fetch(`${this.serverUrl}/api/state/${clappId}`, {
      headers: this.authHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
    return res.json() as Promise<ClappState>;
  }

  /** Fetch view markdown via HTTP (for initial load) */
  async fetchView(viewId: string): Promise<string | null> {
    const res = await fetch(`${this.serverUrl}/api/views/${viewId}`, {
      headers: this.authHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch view: ${res.status}`);
    return res.text();
  }

  // --- Auth helpers ---

  private authHeaders(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  // --- WebSocket internals ---

  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.setConnected(true);

      // Send hello with context
      if (this.context) {
        this.wsSend({ type: "hello", context: this.context });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        this.handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setConnected(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case "state": {
        const clappId = msg.clappId as string;
        const state = msg.state as ClappState;
        for (const listener of this.stateListeners) {
          listener(clappId, state);
        }
        break;
      }
      case "apps": {
        const apps = msg.apps as AppEntry[];
        for (const listener of this.appsListeners) {
          listener(apps);
        }
        break;
      }
      case "view": {
        const viewId = msg.viewId as string;
        const content = msg.content as string;
        for (const listener of this.viewListeners) {
          listener(viewId, content);
        }
        break;
      }
    }
  }

  private wsSend(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    for (const listener of this.connectionListeners) {
      listener(value);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createWebSocket();
    }, this.reconnectDelay);
    // Exponential backoff, cap at 10s
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10_000);
  }
}
