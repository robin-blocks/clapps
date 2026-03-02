import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { IntentMessage } from "@clapps/core";
import { checkAuthStatus } from "./defaults.js";
import type { RelayClient } from "./relay-client.js";

export interface SettingsHandlerOptions {
  stateDir: string;
  relay: RelayClient;
  authPath?: string;
}

export class SettingsHandler {
  private stateDir: string;
  private relay: RelayClient;
  private authPath: string;

  constructor(options: SettingsHandlerOptions) {
    this.stateDir = options.stateDir;
    this.relay = options.relay;
    this.authPath =
      options.authPath ??
      resolve(homedir(), ".openclaw", "agents", "main", "agent", "auth.json");
  }

  /** Returns true if the intent was handled locally (should not be forwarded to ACP) */
  handleIntent = (intent: IntentMessage): boolean => {
    if (!intent.intent.startsWith("settings.")) return false;

    switch (intent.intent) {
      case "settings.setAnthropicKey": {
        const apiKey = intent.payload.apiKey;
        if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
          console.warn("[settings] Invalid apiKey payload, ignoring");
          return true;
        }
        this.setAnthropicKey(apiKey.trim());
        return true;
      }
      case "settings.setClaudeToken": {
        const token = intent.payload.token;
        if (typeof token !== "string" || token.trim().length === 0) {
          console.warn("[settings] Invalid token payload, ignoring");
          return true;
        }
        this.setClaudeToken(token.trim());
        return true;
      }
      default:
        console.warn(`[settings] Unknown settings intent: ${intent.intent}`);
        return true;
    }
  };

  /** Write auth.json with the Anthropic API key */
  private setAnthropicKey(apiKey: string): void {
    // Read existing auth or start fresh
    let auth: Record<string, unknown> = {};
    try {
      if (existsSync(this.authPath)) {
        auth = JSON.parse(readFileSync(this.authPath, "utf-8"));
      }
    } catch {
      // Start fresh if unreadable
    }

    auth.anthropic = { apiKey };

    // Ensure directory exists
    mkdirSync(dirname(this.authPath), { recursive: true });
    writeFileSync(this.authPath, JSON.stringify(auth, null, 2), "utf-8");
    console.log(`✅ Anthropic API key saved to ${this.authPath}`);

    // Update settings state with masked key and push directly
    this.writeSettingsState();
    this.pushSettingsState().catch((err) =>
      console.error(`[settings] Failed to push settings: ${(err as Error).message}`),
    );

    // Re-check auth status so _status.json reflects the new key, then push
    checkAuthStatus(this.stateDir, this.authPath);
    this.pushStatusState().catch((err) =>
      console.error(`[settings] Failed to push status: ${(err as Error).message}`),
    );
  }

  /** Set Claude subscription token via openclaw CLI */
  private setClaudeToken(token: string): void {
    const result = spawnSync(
      "openclaw",
      ["models", "auth", "paste-token", "--provider", "anthropic"],
      { input: token, encoding: "utf-8", timeout: 15_000 },
    );

    if (result.status !== 0) {
      const msg = (result.stderr || result.error?.message || "unknown error").toString().trim();
      console.error(`[settings] openclaw paste-token failed: ${msg}`);
      return;
    }

    console.log("✅ Claude subscription token saved via openclaw");

    // Update settings state and push
    this.writeSettingsState();
    this.pushSettingsState().catch((err) =>
      console.error(`[settings] Failed to push settings: ${(err as Error).message}`),
    );

    // Re-check auth status so _status.json reflects the new token, then push
    checkAuthStatus(this.stateDir, this.authPath);
    this.pushStatusState().catch((err) =>
      console.error(`[settings] Failed to push status: ${(err as Error).message}`),
    );
  }

  /** Write settings.json state with provider status (masked keys) */
  writeSettingsState(): void {
    let apiKeyConfigured = false;
    let maskedKey = "";
    let subscriptionConfigured = false;

    try {
      if (existsSync(this.authPath)) {
        const auth = JSON.parse(readFileSync(this.authPath, "utf-8"));
        const key = auth?.anthropic?.apiKey;
        if (typeof key === "string" && key.length > 0) {
          apiKeyConfigured = true;
          maskedKey =
            key.length > 8
              ? key.slice(0, 7) + "..." + key.slice(-4)
              : "***";
        }
        const oauthToken = auth?.anthropic?.oauthToken;
        if (typeof oauthToken === "string" && oauthToken.length > 0) {
          subscriptionConfigured = true;
        }
      }
    } catch {
      // Leave as unconfigured
    }

    const isConfigured = apiKeyConfigured || subscriptionConfigured;
    let description = "";
    if (apiKeyConfigured) {
      description = `**Anthropic API Key** — ${maskedKey}`;
    } else if (subscriptionConfigured) {
      description = "**Claude Subscription** — Token configured";
    }

    const statePath = resolve(this.stateDir, "settings.json");
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          version: Date.now(),
          timestamp: new Date().toISOString(),
          state: {
            active: { isConfigured, description },
            providers: {
              anthropic: {
                apiKey: { configured: apiKeyConfigured, maskedKey },
                subscription: {
                  configured: subscriptionConfigured,
                  instructions: "Run `claude setup-token` on your server, then paste the output here.",
                },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  /** Push settings.json state to relay */
  async pushSettingsState(): Promise<void> {
    const statePath = resolve(this.stateDir, "settings.json");
    const content = readFileSync(statePath, "utf-8");
    await this.relay.pushState("settings", JSON.parse(content));
  }

  /** Push _status.json state to relay */
  async pushStatusState(): Promise<void> {
    const statePath = resolve(this.stateDir, "_status.json");
    const content = readFileSync(statePath, "utf-8");
    await this.relay.pushState("_status", JSON.parse(content));
  }
}
