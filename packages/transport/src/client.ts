import type { IntentMessage, ClappState } from "@clapps/core";

export interface ClappClientOptions {
  relayUrl: string;
  clappId: string;
  agentId: string;
  sessionToken?: string;
}

/** Client for communicating with the clapps relay */
export class ClappClient {
  private relayUrl: string;
  private clappId: string;
  private agentId: string;
  private sessionToken?: string;

  constructor(options: ClappClientOptions) {
    this.relayUrl = options.relayUrl.replace(/\/$/, "");
    this.clappId = options.clappId;
    this.agentId = options.agentId;
    this.sessionToken = options.sessionToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionToken) {
      h["X-Session-Token"] = this.sessionToken;
    }
    return h;
  }

  /** Send an intent to the relay */
  async sendIntent(
    intent: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const message: IntentMessage = {
      id: crypto.randomUUID(),
      agentId: this.agentId,
      clappId: this.clappId,
      intent,
      payload,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`${this.relayUrl}/api/intent`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      throw new Error(`Failed to send intent: ${res.status}`);
    }
  }

  /** Poll for current state */
  async getState(): Promise<ClappState | null> {
    const res = await fetch(
      `${this.relayUrl}/api/state/${this.agentId}/${this.clappId}`,
      { headers: this.headers() },
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to get state: ${res.status}`);
    }

    return res.json() as Promise<ClappState>;
  }
}
