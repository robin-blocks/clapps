import { watch, type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface StateWatcherOptions {
  stateDir: string;
  relayUrl: string;
  token: string;
  onError?: (error: Error) => void;
}

/** Watch the agent's ui/state/ directory for changes and push to relay */
export class StateWatcher {
  private options: StateWatcherOptions;
  private watcher: FSWatcher | null = null;

  constructor(options: StateWatcherOptions) {
    this.options = options;
  }

  start(): void {
    this.watcher = watch(`${this.options.stateDir}/*.json`, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on("add", (path) => this.pushState(path));
    this.watcher.on("change", (path) => this.pushState(path));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  private async pushState(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf-8");
      const state = JSON.parse(content);
      const clappId = basename(filePath, ".json");

      const res = await fetch(`${this.options.relayUrl}/api/agent/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify({ clappId, ...state }),
      });

      if (!res.ok) {
        throw new Error(`Failed to push state: ${res.status}`);
      }
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }
}
