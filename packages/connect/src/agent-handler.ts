import type { IntentMessage } from "@clapps/core";
import type { AgentClient } from "./agent-client.js";
import type { RelayClient } from "./relay-client.js";

export interface AgentHandlerOptions {
  agentClient: AgentClient;
  relay: RelayClient;
  stateDir: string;
  viewsDir?: string;
}

export class AgentHandler {
  private agentClient: AgentClient;
  private relay: RelayClient;
  private stateDir: string;
  private viewsDir: string | undefined;

  constructor(options: AgentHandlerOptions) {
    this.agentClient = options.agentClient;
    this.relay = options.relay;
    this.stateDir = options.stateDir;
    this.viewsDir = options.viewsDir;
  }

  async handleIntent(intent: IntentMessage): Promise<void> {
    await this.agentClient.sendIntent(intent);
    await this.relay.syncDir(this.stateDir, this.viewsDir);
  }
}
