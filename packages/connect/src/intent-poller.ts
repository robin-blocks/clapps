import type { IntentMessage } from "@clapps/core";
import { AgentClient } from "./agent-client.js";

export interface IntentPollerOptions {
  relayUrl: string;
  token: string;
  agentClient: AgentClient;
  intervalMs?: number;
  onError?: (error: Error) => void;
}

/** Poll the relay for pending intents and forward them to the agent */
export class IntentPoller {
  private options: IntentPollerOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeen = "";

  constructor(options: IntentPollerOptions) {
    this.options = options;
  }

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(
      () => this.poll(),
      this.options.intervalMs ?? 1500,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const url = new URL("/api/agent/intents", this.options.relayUrl);
      url.searchParams.set("token", this.options.token);
      if (this.lastSeen) {
        url.searchParams.set("since", this.lastSeen);
      }

      const res = await fetch(url.toString());
      if (!res.ok) return;

      const data = (await res.json()) as { intents: IntentMessage[] };
      for (const intent of data.intents) {
        this.lastSeen = intent.id;
        try {
          await this.options.agentClient.sendIntent(intent);
        } catch (err) {
          this.options.onError?.(err as Error);
        }
      }
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }
}
