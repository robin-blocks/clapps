import type { IntentMessage } from "@clapps/core";

export interface AgentClientOptions {
  agentUrl: string;
  agentToken?: string;
}

/** Call the local OpenClaw agent's webhook endpoint */
export class AgentClient {
  private agentUrl: string;
  private agentToken: string | undefined;

  constructor(options: AgentClientOptions) {
    this.agentUrl = options.agentUrl.replace(/\/$/, "");
    this.agentToken = options.agentToken;
  }

  /** Send an intent to the agent as a webhook call */
  async sendIntent(intent: IntentMessage): Promise<string> {
    const message = `[CLAPP_INTENT] ${intent.intent} ${JSON.stringify(intent.payload)}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.agentToken) {
      headers["Authorization"] = `Bearer ${this.agentToken}`;
    }

    const res = await fetch(`${this.agentUrl}/hooks/agent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        sessionKey: "agent:main:main",
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent webhook failed: ${res.status}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }
}
