import type { IntentMessage } from "@clapps/core";
import type { AgentClient } from "./agent-client.js";
import type { StateStore } from "./state-store.js";

export interface AgentHandlerOptions {
  agentClient: AgentClient;
  store: StateStore;
  stateDir: string;
  viewsDir?: string;
}

export class AgentHandler {
  private agentClient: AgentClient;
  private store: StateStore;
  private stateDir: string;
  private viewsDir: string | undefined;

  constructor(options: AgentHandlerOptions) {
    this.agentClient = options.agentClient;
    this.store = options.store;
    this.stateDir = options.stateDir;
    this.viewsDir = options.viewsDir;
  }

  async handleIntent(intent: IntentMessage): Promise<void> {
    await this.agentClient.sendIntent(intent);
    await this.syncToStore();
  }

  /** Read state/views from disk and push into the in-memory store */
  async syncToStore(): Promise<void> {
    const { readdir, readFile } = await import("node:fs/promises");
    const { resolve, basename } = await import("node:path");

    // Sync state files
    try {
      const stateFiles = await readdir(this.stateDir);
      for (const file of stateFiles) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(resolve(this.stateDir, file), "utf-8");
          const parsed = JSON.parse(content);
          const name = basename(file, ".json");

          if (name === "_apps") {
            this.store.setApps(parsed);
          } else {
            this.store.setState(name, parsed);
          }
        } catch (err) {
          console.warn(`[sync] Failed to read ${file}: ${(err as Error).message}`);
        }
      }
    } catch {
      // stateDir may not exist yet
    }

    // Sync view files
    if (this.viewsDir) {
      try {
        const viewFiles = await readdir(this.viewsDir);
        for (const file of viewFiles) {
          if (!file.endsWith(".md")) continue;
          try {
            const content = await readFile(resolve(this.viewsDir, file), "utf-8");
            const viewId = basename(file, ".md");
            this.store.setView(viewId, content);
          } catch (err) {
            console.warn(`[sync] Failed to read view ${file}: ${(err as Error).message}`);
          }
        }
      } catch {
        // viewsDir may not exist yet
      }
    }
  }
}
