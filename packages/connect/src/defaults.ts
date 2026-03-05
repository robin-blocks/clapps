import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

interface AppEntry {
  id: string;
  name: string;
  emoji: string;
  description: string;
  pinned?: boolean;
}

// === Bundled defaults (fallback if user hasn't customized) ===

const DEFAULT_CHAT_APP_MD = `---
name: Chat
domain: default
---

## Modules
- default/chat

## Layout
\`\`\`clapp-layout
Module(ref=default/chat):
\`\`\`
`;

const DEFAULT_CHAT_VIEW = `---
name: chat
domain: default
version: 0.1.0
---

## State Bindings
- \`chat.sessions\` -> array
- \`chat.activeSession\` -> string
- \`chat.messages\` -> array
- \`chat.loading\` -> boolean

## Layout
\`\`\`clapp-layout
ChatLayout():
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| chat.init | \`{}\` | Initialize chat and load sessions |
| chat.send | \`{ text: string }\` | Send a message |
| chat.newSession | \`{}\` | Create a new chat session |
| chat.switchSession | \`{ sessionKey: string }\` | Switch to a different session |
| chat.deleteSession | \`{ sessionKey: string }\` | Delete a session |
| chat.loadOlder | \`{}\` | Load older messages for current session |
`;

const DEFAULT_SETTINGS_APP_MD = `---
name: Settings
domain: default
---

## Modules
- default/settings

## Layout
\`\`\`clapp-layout
Module(ref=default/settings):
\`\`\`
`;

const DEFAULT_SETTINGS_VIEW = `---
name: settings
domain: default
version: 0.6.0
---

## State Bindings
- \`active.isConfigured\` -> boolean
- \`active.model\` -> string
- \`configuredProviders\` -> array
- \`sessions.sessions\` -> array
- \`sessions.globalModel\` -> string

## Layout
\`\`\`clapp-layout
Column(gap=5):
  Card(title=AI Providers):
    Column(gap=4):
      Conditional(when=active.isConfigured):
        ProviderList(data=configuredProviders):
      Conditional(when=!active.isConfigured):
        Heading(level=4): "No providers configured"
      SessionList():
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| settings.setAnthropicKey | \`{ apiKey: string, customName?: string }\` | Set an Anthropic API key |
| settings.setClaudeToken | \`{ setupToken: string, customName?: string }\` | Set a Claude subscription token |
| settings.setOpenAIKey | \`{ apiKey: string, customName?: string }\` | Set an OpenAI API key |
| settings.setKimiCodingKey | \`{ apiKey: string, customName?: string }\` | Set a Kimi Coding API key |
| settings.setActiveProvider | \`{ provider: string }\` | Set the active AI provider |
| settings.setActiveModel | \`{ model: string }\` | Set the active AI model |
| settings.deleteProvider | \`{ profileId: string }\` | Delete a provider profile |
| settings.listSessions | \`{}\` | Refresh the list of active sessions |
| settings.resetSessionModel | \`{ sessionKey: string }\` | Reset a session to use the system default |
| settings.applyDefaultToAll | \`{}\` | Apply system default to all sessions |
`;

const DEFAULT_SLACK_APP_MD = `---
name: Slack
domain: default
---

## Modules
- default/slack-connections
- default/slack-channels
- default/slack-settings
- default/slack-status

## Layout
\`\`\`clapp-layout
Module(ref=default/slack-connections):
\`\`\`
`;

const DEFAULT_SLACK_CONNECTIONS_VIEW = `---
name: slack-connections
domain: default
version: 0.1.0
---

## State Bindings
- \`slack.accounts\` -> array
- \`slack.loading\` -> boolean
- \`slack.error\` -> string
- \`slack.editingAccount\` -> object
- \`slack.saving\` -> boolean
- \`slack.saveError\` -> string

## Layout
\`\`\`clapp-layout
Column(gap=5):
  Card(title=Add or Update Slack Account):
    AccountEditor(account=slack.editingAccount, saving=slack.saving, saveError=slack.saveError):

  Card(title=Configured Slack Accounts):
    Column(gap=4):
      Conditional(when=slack.loading):
        Skeleton():
      Conditional(when=!slack.loading):
        Conditional(when=slack.accounts.length):
          List(data=slack.accounts):
            AccountCard():
        Conditional(when=!slack.accounts.length):
          Heading(level=4): "No Slack accounts configured"

  Conditional(when=slack.error):
    Card(variant=destructive):
      Heading(level=4): "Error"
      MarkdownContent(content=slack.error):
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| slack.init | \`{}\` | Load Slack accounts |
| slack.editAccount | \`{ accountId: string }\` | Load account into editor |
| slack.deleteAccount | \`{ accountId: string }\` | Remove account |
| slack.testAccount | \`{ accountId: string }\` | Test connection |
| slack.saveAccount | \`{ accountId: string, mode: string, botToken: string, appToken?: string, signingSecret?: string, webhookPath?: string }\` | Save account config |
`;

const DEFAULT_SLACK_CHANNELS_VIEW = `---
name: slack-channels
domain: default
version: 0.1.0
---

## State Bindings
- \`slack.dmPolicy\` -> string
- \`slack.groupPolicy\` -> string
- \`slack.channels\` -> array
- \`slack.loading\` -> boolean

## Layout
\`\`\`clapp-layout
Column(gap=5):
  Card(title=Access Control):
    Column(gap=4):
      Heading(level=4): "DM Policy"
      PolicySelector(value=slack.dmPolicy, type=dm):
      Heading(level=4): "Channel Policy"
      PolicySelector(value=slack.groupPolicy, type=group):

  Card(title=Allowed Channels):
    Column(gap=4):
      Conditional(when=slack.loading):
        Skeleton():
      Conditional(when=!slack.loading):
        Conditional(when=slack.channels.length):
          ChannelList(channels=slack.channels):
        Conditional(when=!slack.channels.length):
          Heading(level=4): "No channels configured"
      IntentButton(intent=slack.addChannel, label="Add Channel", variant=primary):
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| slack.init | \`{}\` | Load channel config |
| slack.setDmPolicy | \`{ policy: string }\` | Set DM access policy |
| slack.setGroupPolicy | \`{ policy: string }\` | Set channel access policy |
| slack.addChannel | \`{}\` | Add channel to allowlist |
| slack.editChannel | \`{ channelId: string }\` | Edit channel settings |
| slack.removeChannel | \`{ channelId: string }\` | Remove channel from allowlist |
| slack.saveChannel | \`{ channelId: string, requireMention?: boolean, users?: string[], skills?: string[] }\` | Save channel config |
`;

const DEFAULT_SLACK_SETTINGS_VIEW = `---
name: slack-settings
domain: default
version: 0.1.0
---

## State Bindings
- \`slack.streaming\` -> string
- \`slack.replyToMode\` -> string
- \`slack.actions\` -> object
- \`slack.slashCommand\` -> object
- \`slack.loading\` -> boolean

## Layout
\`\`\`clapp-layout
Column(gap=5):
  Card(title=Threading & Streaming):
    Column(gap=4):
      Heading(level=4): "Reply Mode"
      TextInput(value=slack.replyToMode, placeholder="off"):
      Heading(level=4): "Streaming Mode"
      TextInput(value=slack.streaming, placeholder="partial"):

  Card(title=Slash Commands):
    SlashCommandConfig(config=slack.slashCommand):

  Card(title=Actions):
    FeatureToggles(actions=slack.actions):
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| slack.init | \`{}\` | Load settings |
| slack.setReplyMode | \`{ mode: string }\` | Set reply threading mode |
| slack.setStreaming | \`{ mode: string }\` | Set streaming mode |
| slack.toggleAction | \`{ group: string, enabled: boolean }\` | Enable/disable action group |
| slack.setSlashCommand | \`{ enabled: boolean, name?: string }\` | Configure slash command |
`;

const DEFAULT_SLACK_STATUS_VIEW = `---
name: slack-status
domain: default
version: 0.1.0
---

## State Bindings
- \`slack.status\` -> object
- \`slack.pairings\` -> array
- \`slack.loading\` -> boolean

## Layout
\`\`\`clapp-layout
Column(gap=5):
  Card(title=Connection Status):
    Conditional(when=slack.loading):
      Skeleton():
    Conditional(when=!slack.loading):
      ConnectionStatus(status=slack.status):

  Card(title=Pending Pairings):
    Conditional(when=slack.pairings.length):
      List(data=slack.pairings):
        Row(gap=3):
          Column(flex=1):
            Heading(level=4): "{item.code}"
            MarkdownContent(content="{item.user}"):
          IntentButton(intent=slack.approvePairing, payload={code: item.code}, label="Approve", variant=primary):
          IntentButton(intent=slack.rejectPairing, payload={code: item.code}, label="Reject", variant=destructive):
    Conditional(when=!slack.pairings.length):
      Heading(level=4): "No pending pairings"
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| slack.init | \`{}\` | Load status and pairings |
| slack.approvePairing | \`{ code: string }\` | Approve pairing request |
| slack.rejectPairing | \`{ code: string }\` | Reject pairing request |
| slack.refreshStatus | \`{}\` | Refresh connection status |
`;

const DEFAULT_APP_ENTRIES: AppEntry[] = [
  {
    id: "chat",
    name: "Chat",
    emoji: "\u{1F4AC}",
    description: "Chat with the agent",
    pinned: true,
  },
  {
    id: "settings",
    name: "Settings",
    emoji: "\u2699\uFE0F",
    description: "Configure your agent",
    pinned: true,
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "\u{1F4AC}",
    description: "Manage Slack integration",
  },
];

interface ClappView {
  path: string;
  md: string;
}

interface ClappDef {
  id: string;
  appPath: string;
  appMd: string;
  views: ClappView[];
}

const BUNDLED_CLAPPS: ClappDef[] = [
  {
    id: "chat",
    appPath: "chat.app.md",
    appMd: DEFAULT_CHAT_APP_MD,
    views: [{ path: "default.chat.view.md", md: DEFAULT_CHAT_VIEW }],
  },
  {
    id: "settings",
    appPath: "settings.app.md",
    appMd: DEFAULT_SETTINGS_APP_MD,
    views: [{ path: "default.settings.view.md", md: DEFAULT_SETTINGS_VIEW }],
  },
  {
    id: "slack",
    appPath: "slack.app.md",
    appMd: DEFAULT_SLACK_APP_MD,
    views: [
      { path: "default.slack-connections.view.md", md: DEFAULT_SLACK_CONNECTIONS_VIEW },
      { path: "default.slack-channels.view.md", md: DEFAULT_SLACK_CHANNELS_VIEW },
      { path: "default.slack-settings.view.md", md: DEFAULT_SLACK_SETTINGS_VIEW },
      { path: "default.slack-status.view.md", md: DEFAULT_SLACK_STATUS_VIEW },
    ],
  },
];

// === Clapp loading ===

/** Get the user's clapps directory */
export function getUserClappsDir(): string {
  return resolve(homedir(), ".openclaw", "clapps");
}

/** Get the bundled clapps directory (shipped with package) */
export function getBundledClappsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, "..", "..", "..", "clapps");
}

/** Load a view file, checking user dir first, then bundled, then fallback to embedded */
function loadView(
  clappId: string,
  viewFile: string,
  fallback: string
): string {
  const userPath = resolve(getUserClappsDir(), clappId, "views", viewFile);
  if (existsSync(userPath)) {
    try {
      return readFileSync(userPath, "utf-8");
    } catch {
      // Fall through
    }
  }

  const bundledPath = resolve(getBundledClappsDir(), clappId, "views", viewFile);
  if (existsSync(bundledPath)) {
    try {
      return readFileSync(bundledPath, "utf-8");
    } catch {
      // Fall through
    }
  }

  return fallback;
}

/** Install default clapps to user directory if not present */
export function installDefaultClapps(): void {
  const userClappsDir = getUserClappsDir();
  const bundledClappsDir = getBundledClappsDir();

  for (const clapp of BUNDLED_CLAPPS) {
    const userClappDir = resolve(userClappsDir, clapp.id);
    const bundledClappDir = resolve(bundledClappsDir, clapp.id);

    // Skip if user already has this clapp
    if (existsSync(userClappDir)) {
      continue;
    }

    // Copy from bundled if available
    if (existsSync(bundledClappDir)) {
      try {
        mkdirSync(userClappDir, { recursive: true });
        cpSync(bundledClappDir, userClappDir, { recursive: true });
        console.log(`📦 Installed clapp: ${clapp.id} -> ${userClappDir}`);
      } catch (err) {
        console.warn(`⚠️  Failed to install clapp ${clapp.id}: ${err}`);
      }
    }
  }
}

/** Seed default views and apps registry */
export function seedDefaults(viewsDir: string, stateDir: string): void {
  // Install clapps to user directory first
  installDefaultClapps();

  // Seed app definitions and view modules
  for (const clapp of BUNDLED_CLAPPS) {
    const fullAppPath = resolve(viewsDir, clapp.appPath);
    const appContent = loadView(clapp.id, clapp.appPath, clapp.appMd);

    if (!existsSync(fullAppPath)) {
      writeFileSync(fullAppPath, appContent, "utf-8");
      console.log(`📝 Created app: ${fullAppPath}`);
    }

    for (const view of clapp.views) {
      const fullViewPath = resolve(viewsDir, view.path);
      const viewContent = loadView(clapp.id, view.path, view.md);
      writeFileSync(fullViewPath, viewContent, "utf-8");
    }
  }

  // Seed or merge _apps.json
  const appsPath = resolve(stateDir, "_apps.json");
  if (!existsSync(appsPath)) {
    writeFileSync(appsPath, JSON.stringify(DEFAULT_APP_ENTRIES, null, 2), "utf-8");
    console.log(`📝 Created default apps registry: ${appsPath}`);
  } else {
    try {
      const existing: AppEntry[] = JSON.parse(readFileSync(appsPath, "utf-8"));
      let changed = false;
      for (const entry of DEFAULT_APP_ENTRIES) {
        if (!existing.some((app) => app.id === entry.id)) {
          existing.push(entry);
          changed = true;
          console.log(`📝 Added ${entry.id} app to existing apps registry`);
        }
      }
      if (changed) {
        writeFileSync(appsPath, JSON.stringify(existing, null, 2), "utf-8");
      }
    } catch {
      console.warn(`⚠️  Could not parse ${appsPath}, skipping app seeding`);
    }
  }
}

/** Check if the agent has an AI provider configured and write _status.json */
export function checkAuthStatus(stateDir: string, authProfilesPath?: string): void {
  const defaultAuthProfilesPath = resolve(
    homedir(),
    ".openclaw",
    "agents",
    "main",
    "agent",
    "auth-profiles.json",
  );
  const targetPath = authProfilesPath ?? defaultAuthProfilesPath;

  let setupRequired = true;
  let message =
    "Your agent needs an AI provider key to respond to messages. Run:\n" +
    "`openclaw models auth` to configure authentication.";

  try {
    if (existsSync(targetPath)) {
      const raw = readFileSync(targetPath, "utf-8");
      const data = JSON.parse(raw);
      
      // Check if any profile has actual credentials
      const profiles = data.profiles ?? data;
      const hasCredentials = Object.values(profiles).some((profile: unknown) => {
        if (typeof profile === "object" && profile !== null) {
          const p = profile as Record<string, unknown>;
          return (
            (typeof p.token === "string" && p.token.length > 0) ||
            (typeof p.key === "string" && p.key.length > 0) ||
            (typeof p.access === "string" && p.access.length > 0)
          );
        }
        return false;
      });
      
      if (hasCredentials) {
        setupRequired = false;
        message = "";
      }
    }
  } catch {
    // If we can't read auth-profiles.json, assume setup is required
  }

  const statusPath = resolve(stateDir, "_status.json");
  writeFileSync(
    statusPath,
    JSON.stringify({
      version: Date.now(),
      timestamp: new Date().toISOString(),
      state: { setupRequired, message },
    }, null, 2),
    "utf-8",
  );
  if (setupRequired) {
    console.warn("⚠️  No AI provider configured — _status.json written with setupRequired: true");
  }
}
