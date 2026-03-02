import type { AppEntry, ClappState } from "@clapps/core";
import type { WebSocket } from "ws";

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface ConnectedClient {
  ws: WebSocket;
  subscriptions: Set<string>; // clappIds to receive state updates for
  context?: ClientContext;
}

export interface ClientContext {
  platform?: string;
  user?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
}

/**
 * In-memory store for apps, state, and views.
 * Broadcasts changes to connected WebSocket clients.
 */
export class StateStore {
  private apps: AppEntry[] = [];
  private state = new Map<string, ClappState>();
  private views = new Map<string, string>();
  private clients = new Set<ConnectedClient>();

  // --- Client management ---

  addClient(ws: WebSocket, context?: ClientContext): ConnectedClient {
    const client: ConnectedClient = { ws, subscriptions: new Set(), context };
    this.clients.add(client);
    return client;
  }

  removeClient(client: ConnectedClient): void {
    this.clients.delete(client);
  }

  subscribe(client: ConnectedClient, clappIds: string[]): void {
    for (const id of clappIds) {
      client.subscriptions.add(id);
    }
  }

  // --- Apps ---

  getApps(): AppEntry[] {
    return this.apps;
  }

  setApps(apps: AppEntry[]): void {
    this.apps = apps;
    this.broadcast({ type: "apps", apps });
  }

  // --- State ---

  getState(clappId: string): ClappState | undefined {
    return this.state.get(clappId);
  }

  setState(clappId: string, state: ClappState): void {
    this.state.set(clappId, state);
    this.broadcastToSubscribers(clappId, {
      type: "state",
      clappId,
      state,
    });
  }

  // --- Views ---

  getView(viewId: string): string | undefined {
    return this.views.get(viewId);
  }

  setView(viewId: string, content: string): void {
    this.views.set(viewId, content);
    this.broadcast({ type: "view", viewId, content });
  }

  // --- Broadcast ---

  private broadcast(msg: WsMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      this.safeSend(client.ws, data);
    }
  }

  private broadcastToSubscribers(clappId: string, msg: WsMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      // Send to clients subscribed to this clappId, or to all if they have no subscriptions (broadcast mode)
      if (client.subscriptions.size === 0 || client.subscriptions.has(clappId)) {
        this.safeSend(client.ws, data);
      }
    }
  }

  private safeSend(ws: WebSocket, data: string): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}
