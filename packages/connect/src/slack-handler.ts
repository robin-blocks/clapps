import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { IntentMessage } from "@clapps/core";
import type { StateStore } from "./state-store.js";

const execAsync = promisify(exec);

/** Run `openclaw config set <path> <value>` with proper arg splitting */
function configSet(pathAndValue: string): Promise<{ stdout: string; stderr: string }> {
  const eqIdx = pathAndValue.indexOf("=");
  const cfgPath = pathAndValue.slice(0, eqIdx);
  const cfgValue = pathAndValue.slice(eqIdx + 1);
  return execAsync(`openclaw config set ${cfgPath} ${JSON.stringify(cfgValue)}`);
}

export interface SlackHandlerOptions {
  stateDir: string;
  store: StateStore;
}

interface SlackAccount {
  id: string;
  mode: "socket" | "http";
  enabled: boolean;
  botToken: string;
  appToken?: string;
  signingSecret?: string;
  webhookPath?: string;
}

interface SlackChannel {
  id: string;
  name?: string;
  requireMention?: boolean;
  users?: string[];
  skills?: string[];
}

interface SlackState {
  accounts: SlackAccount[];
  dmPolicy: string;
  groupPolicy: string;
  channels: SlackChannel[];
  streaming: string;
  replyToMode: string;
  actions: Record<string, boolean>;
  slashCommand: {
    enabled: boolean;
    name: string;
  };
  status: {
    connected: boolean;
    accounts: Array<{ id: string; connected: boolean }>;
  };
  pairings: Array<{ code: string; user: string }>;
  loading: boolean;
  error?: string;
  showAccountEditor?: boolean;
  editingAccount?: SlackAccount | null;
  saving?: boolean;
  saveError?: string;
  saveSuccess?: string;
}

export class SlackHandler {
  private stateDir: string;
  private store: StateStore;
  private configPath: string;

  constructor(options: SlackHandlerOptions) {
    this.stateDir = options.stateDir;
    this.store = options.store;
    this.configPath = resolve(homedir(), ".openclaw", "openclaw.json");
  }

  handleIntent = (intent: IntentMessage): boolean => {
    if (!intent.intent.startsWith("slack.")) return false;

    switch (intent.intent) {
      case "slack.init":
        this.init();
        return true;
      case "slack.addAccount":
        this.addAccount();
        return true;
      case "slack.editAccount":
        this.editAccount(intent.payload.accountId as string);
        return true;
      case "slack.cancelEdit":
        this.cancelEdit();
        return true;
      case "slack.saveAccount":
        this.saveAccount(intent.payload);
        return true;
      case "slack.deleteAccount":
        this.deleteAccount(intent.payload.accountId as string);
        return true;
      case "slack.disableAccount":
        this.disableAccount(intent.payload.accountId as string);
        return true;
      case "slack.testAccount":
        this.testAccount(intent.payload.accountId as string);
        return true;
      case "slack.setDmPolicy":
        this.setDmPolicy(intent.payload.policy as string);
        return true;
      case "slack.setGroupPolicy":
        this.setGroupPolicy(intent.payload.policy as string);
        return true;
      case "slack.saveChannel":
        this.saveChannel(intent.payload);
        return true;
      case "slack.removeChannel":
        this.removeChannel(intent.payload.channelId as string);
        return true;
      case "slack.setReplyMode":
        this.setReplyMode(intent.payload.mode as string);
        return true;
      case "slack.setStreaming":
        this.setStreaming(intent.payload.mode as string);
        return true;
      case "slack.toggleAction":
        this.toggleAction(intent.payload.group as string, intent.payload.enabled as boolean);
        return true;
      case "slack.setSlashCommand":
        this.setSlashCommand(intent.payload);
        return true;
      case "slack.approvePairing":
        this.approvePairing(intent.payload.code as string);
        return true;
      case "slack.rejectPairing":
        this.rejectPairing(intent.payload.code as string);
        return true;
      case "slack.refreshStatus":
        this.refreshStatus();
        return true;
      default:
        return false;
    }
  };

  private init(): void {
    this.refreshState();
  }

  /** Rebuild data state from config, preserving transient UI fields */
  private async refreshState(): Promise<void> {
    try {
      const config = this.loadConfig();
      const slackConfig = config.channels?.slack || {};

      const accounts: SlackAccount[] = [];

      // Load default account
      if (slackConfig.botToken) {
        accounts.push({
          id: "default",
          mode: slackConfig.mode || "socket",
          enabled: slackConfig.enabled !== false,
          botToken: this.maskToken(slackConfig.botToken),
          appToken: slackConfig.appToken ? this.maskToken(slackConfig.appToken) : undefined,
          signingSecret: slackConfig.signingSecret ? this.maskToken(slackConfig.signingSecret) : undefined,
          webhookPath: slackConfig.webhookPath,
        });
      }

      // Load named accounts
      if (slackConfig.accounts) {
        for (const [id, acc] of Object.entries(slackConfig.accounts)) {
          if (typeof acc === "object" && acc !== null) {
            accounts.push({
              id,
              mode: (acc as any).mode || "socket",
              enabled: (acc as any).enabled !== false,
              botToken: this.maskToken((acc as any).botToken),
              appToken: (acc as any).appToken ? this.maskToken((acc as any).appToken) : undefined,
              signingSecret: (acc as any).signingSecret ? this.maskToken((acc as any).signingSecret) : undefined,
              webhookPath: (acc as any).webhookPath,
            });
          }
        }
      }

      const channels: SlackChannel[] = [];
      if (slackConfig.channels) {
        for (const [id, ch] of Object.entries(slackConfig.channels)) {
          if (typeof ch === "object" && ch !== null) {
            channels.push({
              id,
              name: (ch as any).name,
              requireMention: (ch as any).requireMention,
              users: (ch as any).users,
              skills: (ch as any).skills,
            });
          }
        }
      }

      // Preserve transient UI fields from current state
      const current = this.getCurrentState();

      const state: SlackState = {
        accounts,
        dmPolicy: slackConfig.dmPolicy || "pairing",
        groupPolicy: slackConfig.groupPolicy || "allowlist",
        channels,
        streaming: slackConfig.streaming || "partial",
        replyToMode: slackConfig.replyToMode || "off",
        actions: slackConfig.actions || {},
        slashCommand: slackConfig.slashCommand || { enabled: false, name: "openclaw" },
        status: { connected: false, accounts: [] },
        pairings: [],
        loading: false,
        // Preserve UI state
        showAccountEditor: current.showAccountEditor,
        editingAccount: current.editingAccount,
        saving: current.saving,
        saveError: current.saveError,
        saveSuccess: current.saveSuccess,
      };

      // Try to get status
      try {
        const statusResult = await execAsync("openclaw channels status --json", { timeout: 5000 });
        const statusData = JSON.parse(statusResult.stdout);
        if (statusData.slack) {
          state.status = statusData.slack;
        }
      } catch {
        // Ignore status errors
      }

      // Try to get pairings
      try {
        const pairingsResult = await execAsync("openclaw pairing list slack --json", { timeout: 5000 });
        const pairingsData = JSON.parse(pairingsResult.stdout);
        state.pairings = pairingsData.pending || [];
      } catch {
        // Ignore pairing errors
      }

      this.pushState(state);
    } catch (err) {
      this.pushError((err as Error).message);
    }
  }

  private addAccount(): void {
    const state = this.getCurrentState();
    state.showAccountEditor = true;
    state.editingAccount = null;
    state.saving = false;
    state.saveError = undefined;
    state.saveSuccess = undefined;
    this.pushState(state);
  }

  private editAccount(accountId: string): void {
    const state = this.getCurrentState();
    const account = state.accounts.find((a) => a.id === accountId);
    state.showAccountEditor = true;
    state.editingAccount = account || null;
    state.saving = false;
    state.saveError = undefined;
    state.saveSuccess = undefined;
    this.pushState(state);
  }

  private cancelEdit(): void {
    const state = this.getCurrentState();
    state.showAccountEditor = false;
    state.editingAccount = null;
    state.saving = false;
    state.saveError = undefined;
    state.saveSuccess = undefined;
    this.pushState(state);
  }

  private async saveAccount(payload: Record<string, unknown>): Promise<void> {
    // Set saving state
    const state = this.getCurrentState();
    state.saving = true;
    state.saveError = undefined;
    state.saveSuccess = undefined;
    this.pushState(state);

    try {
      const accountId = payload.accountId as string;
      const mode = payload.mode as string;
      const botToken = payload.botToken as string;
      const appToken = payload.appToken as string | undefined;
      const signingSecret = payload.signingSecret as string | undefined;
      const webhookPath = payload.webhookPath as string | undefined;

      // Validate token format
      if (!botToken.startsWith("xoxb-")) {
        throw new Error("Bot token must start with xoxb-");
      }
      if (mode === "socket" && appToken && !appToken.startsWith("xapp-")) {
        throw new Error("App token must start with xapp-");
      }

      // Test Slack connection
      const slackInfo = await this.testSlackConnection(botToken);

      const configUpdates: string[] = [];

      if (accountId === "default") {
        configUpdates.push(`channels.slack.enabled=true`);
        configUpdates.push(`channels.slack.mode=${mode}`);
        configUpdates.push(`channels.slack.botToken=${botToken}`);
        if (appToken) configUpdates.push(`channels.slack.appToken=${appToken}`);
        if (signingSecret) configUpdates.push(`channels.slack.signingSecret=${signingSecret}`);
        if (webhookPath) configUpdates.push(`channels.slack.webhookPath=${webhookPath}`);
      } else {
        configUpdates.push(`channels.slack.accounts.${accountId}.enabled=true`);
        configUpdates.push(`channels.slack.accounts.${accountId}.mode=${mode}`);
        configUpdates.push(`channels.slack.accounts.${accountId}.botToken=${botToken}`);
        if (appToken) configUpdates.push(`channels.slack.accounts.${accountId}.appToken=${appToken}`);
        if (signingSecret) configUpdates.push(`channels.slack.accounts.${accountId}.signingSecret=${signingSecret}`);
        if (webhookPath) configUpdates.push(`channels.slack.accounts.${accountId}.webhookPath=${webhookPath}`);
      }

      // Apply config changes
      for (const update of configUpdates) {
        await configSet(update);
      }

      // Sync config to gateway user and restart
      await this.syncConfigToGateway();

      // Success — show message, refresh accounts list in background
      const successState = this.getCurrentState();
      successState.saving = false;
      successState.saveError = undefined;
      successState.saveSuccess = `Account "${accountId}" saved. Connected to ${slackInfo.team} (${slackInfo.user}).`;
      this.pushState(successState);

      // Refresh data (preserves UI fields including saveSuccess)
      setTimeout(() => this.refreshState(), 1000);
    } catch (err) {
      // Error - keep editor open and show error
      const errorState = this.getCurrentState();
      errorState.saving = false;
      errorState.saveError = (err as Error).message;
      this.pushState(errorState);
    }
  }

  private async testSlackConnection(botToken: string): Promise<{ team: string; user: string }> {
    try {
      const https = await import("node:https");

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: "slack.com",
            path: "/api/auth.test",
            method: "POST",
            headers: {
              "Authorization": `Bearer ${botToken}`,
              "Content-Type": "application/json",
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                const result = JSON.parse(data);
                if (result.ok) {
                  console.log(`[slack] Token validated: ${result.team} (${result.user})`);
                  resolve({ team: result.team, user: result.user });
                } else {
                  reject(new Error(`Slack API error: ${result.error || "Unknown error"}`));
                }
              } catch (err) {
                reject(new Error("Failed to parse Slack API response"));
              }
            });
          }
        );
        req.on("error", (err) => reject(new Error(`Connection failed: ${err.message}`)));
        req.end();
      });
    } catch (err) {
      throw new Error(`Token validation failed: ${(err as Error).message}`);
    }
  }

  /** Copy root's openclaw config to the gateway user and restart the service */
  private async syncConfigToGateway(): Promise<void> {
    try {
      const rootConfig = resolve(homedir(), ".openclaw", "openclaw.json");
      await execAsync(`cp ${rootConfig} /home/openclaw/.openclaw/openclaw.json && chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json`);
      await execAsync("systemctl restart openclaw", { timeout: 10000 });
      console.log("[slack] Config synced to gateway user and service restarted");
    } catch (err) {
      console.warn(`[slack] Failed to sync config to gateway: ${(err as Error).message}`);
    }
  }

  private async disableAccount(accountId: string): Promise<void> {
    try {
      const config = this.loadConfig();
      const slackConfig = config.channels?.slack || {};

      // Toggle enabled state
      let currentlyEnabled: boolean;
      if (accountId === "default") {
        currentlyEnabled = slackConfig.enabled !== false;
        await configSet(`channels.slack.enabled=${!currentlyEnabled}`);
      } else {
        currentlyEnabled = slackConfig.accounts?.[accountId]?.enabled !== false;
        await configSet(`channels.slack.accounts.${accountId}.enabled=${!currentlyEnabled}`);
      }

      await this.syncConfigToGateway();
      await this.refreshState();
    } catch (err) {
      this.pushError((err as Error).message);
    }
  }

  private async deleteAccount(accountId: string): Promise<void> {
    try {
      // Remove from config using direct JSON manipulation (openclaw config delete has issues)
      const config = this.loadConfig();
      const slackConfig = config.channels?.slack;
      if (!slackConfig) return;

      if (accountId === "default") {
        delete slackConfig.botToken;
        delete slackConfig.appToken;
        delete slackConfig.signingSecret;
      } else if (slackConfig.accounts) {
        delete slackConfig.accounts[accountId];
      }

      writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
      await this.syncConfigToGateway();
      await this.refreshState();
    } catch (err) {
      this.pushError((err as Error).message);
    }
  }

  private async testAccount(accountId: string): Promise<void> {
    const state = this.getCurrentState();
    state.saving = true;
    state.saveError = undefined;
    state.saveSuccess = undefined;
    this.pushState(state);

    try {
      const config = this.loadConfig();
      const slackConfig = config.channels?.slack || {};
      let botToken: string | undefined;

      if (accountId === "default") {
        botToken = slackConfig.botToken;
      } else {
        botToken = slackConfig.accounts?.[accountId]?.botToken;
      }

      if (!botToken) {
        throw new Error(`No bot token found for account "${accountId}"`);
      }

      const info = await this.testSlackConnection(botToken);

      const resultState = this.getCurrentState();
      resultState.saving = false;
      resultState.saveSuccess = `Account "${accountId}" connected to ${info.team} (${info.user}).`;
      this.pushState(resultState);

      // Auto-clear after 5 seconds
      setTimeout(() => {
        const s = this.getCurrentState();
        if (s.saveSuccess?.includes(accountId)) {
          s.saveSuccess = undefined;
          this.pushState(s);
        }
      }, 5000);
    } catch (err) {
      const errorState = this.getCurrentState();
      errorState.saving = false;
      errorState.saveError = (err as Error).message;
      this.pushState(errorState);
    }
  }

  private setDmPolicy(policy: string): void {
    configSet(`channels.slack.dmPolicy=${policy}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private setGroupPolicy(policy: string): void {
    configSet(`channels.slack.groupPolicy=${policy}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private saveChannel(payload: Record<string, unknown>): void {
    try {
      const channelId = payload.channelId as string;
      const configUpdates: string[] = [];

      if (payload.requireMention !== undefined) {
        configUpdates.push(`channels.slack.channels.${channelId}.requireMention=${payload.requireMention}`);
      }
      if (Array.isArray(payload.users)) {
        configUpdates.push(`channels.slack.channels.${channelId}.users=${JSON.stringify(payload.users)}`);
      }
      if (Array.isArray(payload.skills)) {
        configUpdates.push(`channels.slack.channels.${channelId}.skills=${JSON.stringify(payload.skills)}`);
      }

      for (const update of configUpdates) {
        configSet(update).catch(console.error);
      }

      setTimeout(() => this.refreshState(), 500);
    } catch (err) {
      this.pushError((err as Error).message);
    }
  }

  private removeChannel(channelId: string): void {
    execAsync(`openclaw config delete channels.slack.channels.${channelId}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private setReplyMode(mode: string): void {
    configSet(`channels.slack.replyToMode=${mode}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private setStreaming(mode: string): void {
    configSet(`channels.slack.streaming=${mode}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private toggleAction(group: string, enabled: boolean): void {
    configSet(`channels.slack.actions.${group}=${enabled}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private setSlashCommand(payload: Record<string, unknown>): void {
    const enabled = payload.enabled as boolean;
    const name = payload.name as string | undefined;

    const updates: string[] = [];
    updates.push(`channels.slack.slashCommand.enabled=${enabled}`);
    if (name) updates.push(`channels.slack.slashCommand.name=${name}`);

    for (const update of updates) {
      configSet(update).catch(console.error);
    }

    setTimeout(() => this.refreshState(), 500);
  }

  private approvePairing(code: string): void {
    execAsync(`openclaw pairing approve slack ${code}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private rejectPairing(code: string): void {
    execAsync(`openclaw pairing reject slack ${code}`)
      .then(() => setTimeout(() => this.refreshState(), 500))
      .catch((err) => this.pushError(err.message));
  }

  private refreshStatus(): void {
    this.refreshState();
  }

  private loadConfig(): any {
    if (!existsSync(this.configPath)) return {};
    try {
      return JSON.parse(readFileSync(this.configPath, "utf-8"));
    } catch {
      return {};
    }
  }

  private maskToken(token: string): string {
    if (!token) return "";
    if (token.length <= 8) return "***";
    return token.slice(0, 4) + "***" + token.slice(-4);
  }

  private pushState(slackState: SlackState): void {
    const state = {
      version: Date.now(),
      timestamp: new Date().toISOString(),
      state: {
        slack: slackState,
      },
    };

    const statePath = resolve(this.stateDir, "slack.json");
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    this.store.setState("slack", state);
  }

  private pushError(error: string): void {
    console.error(`[slack] ${error}`);
    const state = this.getCurrentState();
    state.error = error;
    state.loading = false;
    this.pushState(state);
  }

  private getCurrentState(): SlackState {
    const statePath = resolve(this.stateDir, "slack.json");
    if (existsSync(statePath)) {
      try {
        const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
        return parsed.state?.slack || this.getDefaultState();
      } catch {
        return this.getDefaultState();
      }
    }
    return this.getDefaultState();
  }

  private getDefaultState(): SlackState {
    return {
      accounts: [],
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      channels: [],
      streaming: "partial",
      replyToMode: "off",
      actions: {},
      slashCommand: { enabled: false, name: "openclaw" },
      status: { connected: false, accounts: [] },
      pairings: [],
      loading: false,
      showAccountEditor: false,
      editingAccount: null,
      saving: false,
      saveError: undefined,
      saveSuccess: undefined,
    };
  }
}
