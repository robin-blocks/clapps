import type { IntentMessage, ClappState } from "@clapps/core";

export interface ClappClientOptions {
  relayUrl: string;
  clappId: string;
}

/** Client for communicating with the clapps relay */
export class ClappClient {
  private relayUrl: string;
  private clappId: string;

  constructor(options: ClappClientOptions) {
    this.relayUrl = options.relayUrl.replace(/\/$/, "");
    this.clappId = options.clappId;
  }

  /** Send an intent to the relay */
  async sendIntent(
    intent: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const message: IntentMessage = {
      id: crypto.randomUUID(),
      clappId: this.clappId,
      intent,
      payload,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(`${this.relayUrl}/api/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      throw new Error(`Failed to send intent: ${res.status}`);
    }
  }

  /** Poll for current state */
  async getState(): Promise<ClappState | null> {
    const res = await fetch(
      `${this.relayUrl}/api/state/${this.clappId}`,
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to get state: ${res.status}`);
    }

    return res.json() as Promise<ClappState>;
  }
}
