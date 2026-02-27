import { watch, type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface StateWatcherOptions {
  stateDir: string;
  viewsDir?: string;
  relayUrl: string;
  token: string;
  agentId: string;
  onError?: (error: Error) => void;
}

/** Watch the agent's ui/state/ directory for changes and push to relay */
export class StateWatcher {
  private options: StateWatcherOptions;
  private stateWatcher: FSWatcher | null = null;
  private viewsWatcher: FSWatcher | null = null;

  constructor(options: StateWatcherOptions) {
    this.options = options;
  }

  start(): void {
    this.stateWatcher = watch(`${this.options.stateDir}/*.json`, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.stateWatcher.on("add", (path) => this.pushState(path));
    this.stateWatcher.on("change", (path) => this.pushState(path));

    if (this.options.viewsDir) {
      this.viewsWatcher = watch(`${this.options.viewsDir}/*.md`, {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 200 },
      });

      this.viewsWatcher.on("add", (path) => this.pushView(path));
      this.viewsWatcher.on("change", (path) => this.pushView(path));
    }
  }

  async stop(): Promise<void> {
    await this.stateWatcher?.close();
    await this.viewsWatcher?.close();
    this.stateWatcher = null;
    this.viewsWatcher = null;
  }

  private async pushState(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const name = basename(filePath, ".json");

      if (name === "_apps") {
        await this.pushApps(parsed);
        return;
      }

      const res = await fetch(`${this.options.relayUrl}/api/agent/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify({
          agentId: this.options.agentId,
          clappId: name,
          ...parsed,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to push state: ${res.status}`);
      }
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }

  private async pushView(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf-8");
      const viewId = basename(filePath, ".md");

      const res = await fetch(`${this.options.relayUrl}/api/agent/views`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify({
          agentId: this.options.agentId,
          viewId,
          content,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to push view: ${res.status}`);
      }
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }

  private async pushApps(apps: unknown[]): Promise<void> {
    const res = await fetch(`${this.options.relayUrl}/api/agent/apps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.token}`,
      },
      body: JSON.stringify({
        agentId: this.options.agentId,
        apps,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to push apps: ${res.status}`);
    }
  }
}
