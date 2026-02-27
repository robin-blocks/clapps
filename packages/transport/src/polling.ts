import type { ClappState } from "@clapps/core";
import { ClappClient } from "./client.js";

export interface PollingOptions {
  intervalMs?: number;
  onState: (state: ClappState) => void;
  onError?: (error: Error) => void;
}

/** Poll the relay for state updates */
export class StatePoller {
  private client: ClappClient;
  private options: PollingOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastVersion = -1;

  constructor(client: ClappClient, options: PollingOptions) {
    this.client = client;
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
      const state = await this.client.getState();
      if (state && state.version > this.lastVersion) {
        this.lastVersion = state.version;
        this.options.onState(state);
      }
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }
}
