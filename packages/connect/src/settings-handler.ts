import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { IntentMessage } from "@clapps/core";
import { checkAuthStatus } from "./defaults.js";

export interface SettingsHandlerOptions {
  stateDir: string;
  authPath?: string;
}

export class SettingsHandler {
  private stateDir: string;
  private authPath: string;

  constructor(options: SettingsHandlerOptions) {
    this.stateDir = options.stateDir;
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

    // Update settings state with masked key
    this.writeSettingsState();

    // Re-check auth status so _status.json reflects the new key
    checkAuthStatus(this.stateDir, this.authPath);
  }

  /** Write settings.json state with provider status (masked keys) */
  writeSettingsState(): void {
    let configured = false;
    let maskedKey = "";

    try {
      if (existsSync(this.authPath)) {
        const auth = JSON.parse(readFileSync(this.authPath, "utf-8"));
        const key = auth?.anthropic?.apiKey;
        if (typeof key === "string" && key.length > 0) {
          configured = true;
          maskedKey =
            key.length > 8
              ? key.slice(0, 7) + "..." + key.slice(-4)
              : "***";
        }
      }
    } catch {
      // Leave as unconfigured
    }

    const statePath = resolve(this.stateDir, "settings.json");
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          version: Date.now(),
          timestamp: new Date().toISOString(),
          state: {
            providers: {
              anthropic: { configured, maskedKey },
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
  }
}
