import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

export interface RelayClientOptions {
  relayUrl: string;
  token: string;
  agentId: string;
}

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;

async function retryFetch(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (attempt < MAX_RETRIES - 1 && res.status >= 500) {
        const delay =
          BASE_DELAY_MS * 2 ** attempt + Math.random() * BASE_DELAY_MS;
        console.warn(
          `[relay] Retry ${attempt + 1} for ${label}: HTTP ${res.status}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Failed to push ${label}: HTTP ${res.status}`);
    } catch (err) {
      if (attempt < MAX_RETRIES - 1 && (err as NodeJS.ErrnoException).code) {
        const delay =
          BASE_DELAY_MS * 2 ** attempt + Math.random() * BASE_DELAY_MS;
        console.warn(
          `[relay] Retry ${attempt + 1} for ${label}: ${(err as Error).message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to push ${label} after ${MAX_RETRIES} attempts`);
}

export class RelayClient {
  private relayUrl: string;
  private token: string;
  private agentId: string;

  constructor(options: RelayClientOptions) {
    this.relayUrl = options.relayUrl;
    this.token = options.token;
    this.agentId = options.agentId;
  }

  async pushState(clappId: string, state: object): Promise<void> {
    await retryFetch(
      `${this.relayUrl}/api/agent/state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          agentId: this.agentId,
          clappId,
          ...state,
        }),
      },
      `state/${clappId}`,
    );
  }

  async pushApps(apps: unknown[]): Promise<void> {
    await retryFetch(
      `${this.relayUrl}/api/agent/apps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          agentId: this.agentId,
          apps,
        }),
      },
      "apps",
    );
  }

  async pushView(viewId: string, content: string): Promise<void> {
    await retryFetch(
      `${this.relayUrl}/api/agent/views`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          agentId: this.agentId,
          viewId,
          content,
        }),
      },
      `view/${viewId}`,
    );
  }

  async syncDir(stateDir: string, viewsDir?: string): Promise<void> {
    // Push all .json files from stateDir
    const stateFiles = await readdir(stateDir);
    for (const file of stateFiles) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(resolve(stateDir, file), "utf-8");
        const parsed = JSON.parse(content);
        const name = basename(file, ".json");

        if (name === "_apps") {
          await this.pushApps(parsed);
        } else {
          await this.pushState(name, parsed);
        }
      } catch (err) {
        console.warn(`[relay] Failed to push ${file}: ${(err as Error).message}`);
      }
    }

    // Push all .md files from viewsDir
    if (viewsDir) {
      const viewFiles = await readdir(viewsDir);
      for (const file of viewFiles) {
        if (!file.endsWith(".md")) continue;
        try {
          const content = await readFile(resolve(viewsDir, file), "utf-8");
          const viewId = basename(file, ".md");
          await this.pushView(viewId, content);
        } catch (err) {
          console.warn(`[relay] Failed to push view ${file}: ${(err as Error).message}`);
        }
      }
    }
  }
}
