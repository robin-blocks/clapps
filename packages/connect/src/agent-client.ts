import type { IntentMessage } from "@clapps/core";

export interface AgentClientOptions {
  agentUrl: string;
}

/** Call the local OpenClaw agent's webhook endpoint */
export class AgentClient {
  private agentUrl: string;

  constructor(options: AgentClientOptions) {
    this.agentUrl = options.agentUrl.replace(/\/$/, "");
  }

  /** Send an intent to the agent as a webhook call */
  async sendIntent(intent: IntentMessage): Promise<string> {
    const message = `[CLAPP_INTENT] ${intent.intent} ${JSON.stringify(intent.payload)}`;

    const res = await fetch(`${this.agentUrl}/hooks/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionKey: `clapp:${intent.clappId}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent webhook failed: ${res.status}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? "";
  }
}
