import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

interface AppEntry {
  id: string;
  name: string;
  emoji: string;
  description: string;
  pinned?: boolean;
}

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
- \`messages\` -> array
- \`loading\` -> boolean

## Layout
\`\`\`clapp-layout
Column(gap=4):
  List(data=messages):
  Conditional(when=loading):
    Skeleton:
  IntentForm(intent=chat.send, submitLabel=Send):
    TextInput(name=text, placeholder=Type a message...):
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| chat.send | \`{ text: string }\` | Send a chat message |
`;

const DEFAULT_CHAT_APP_ENTRY: AppEntry = {
  id: "chat",
  name: "Chat",
  emoji: "\u{1F4AC}",
  description: "Chat with the agent",
  pinned: true,
};

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
version: 0.3.0
---

## State Bindings
- \`active.isConfigured\` -> boolean
- \`active.description\` -> string
- \`providers.anthropic.apiKey.configured\` -> boolean
- \`providers.anthropic.apiKey.maskedKey\` -> string
- \`providers.anthropic.subscription.configured\` -> boolean
- \`providers.anthropic.subscription.instructions\` -> string

## Layout
\`\`\`clapp-layout
Column(gap=4):
  Heading(level=2): "Settings"
  Card(title=Authentication Status):
    Column(gap=2):
      Conditional(when=active.isConfigured):
        MarkdownContent(source=active.description):
      Conditional(when=!active.isConfigured):
        Heading(level=4): "No authentication configured"
  Card(title=Anthropic API Key):
    Column(gap=3):
      Conditional(when=providers.anthropic.apiKey.configured):
        Heading(level=4): "Configured"
      Conditional(when=!providers.anthropic.apiKey.configured):
        Heading(level=4): "Not configured"
      IntentForm(intent=settings.setAnthropicKey, submitLabel=Save Key):
        TextInput(name=apiKey, type=password, placeholder=sk-ant-...):
  Card(title=Claude Subscription):
    Column(gap=3):
      Conditional(when=providers.anthropic.subscription.configured):
        Heading(level=4): "Configured"
      Conditional(when=!providers.anthropic.subscription.configured):
        Heading(level=4): "Not configured"
      MarkdownContent(source=providers.anthropic.subscription.instructions):
      IntentForm(intent=settings.setClaudeToken, submitLabel=Save Token):
        TextInput(name=token, type=password, placeholder=Paste setup-token here...):
\`\`\`

## Intents
| Name | Payload | Description |
|------|---------|-------------|
| settings.setAnthropicKey | \`{ apiKey: string }\` | Set the Anthropic API key |
| settings.setClaudeToken | \`{ token: string }\` | Set Claude subscription setup-token |
`;

const DEFAULT_SETTINGS_APP_ENTRY: AppEntry = {
  id: "settings",
  name: "Settings",
  emoji: "\u2699\uFE0F",
  description: "Configure your agent",
  pinned: true,
};

const DEFAULT_APP_ENTRIES: AppEntry[] = [
  DEFAULT_CHAT_APP_ENTRY,
  DEFAULT_SETTINGS_APP_ENTRY,
];

const DEFAULT_APPS: { appPath: string; viewPath: string; appMd: string; viewMd: string }[] = [
  {
    appPath: "chat.app.md",
    viewPath: "default.chat.view.md",
    appMd: DEFAULT_CHAT_APP_MD,
    viewMd: DEFAULT_CHAT_VIEW,
  },
  {
    appPath: "settings.app.md",
    viewPath: "default.settings.view.md",
    appMd: DEFAULT_SETTINGS_APP_MD,
    viewMd: DEFAULT_SETTINGS_VIEW,
  },
];

export function seedDefaults(viewsDir: string, stateDir: string): void {
  // Seed app definitions and always overwrite default view modules
  for (const { appPath, viewPath, appMd, viewMd } of DEFAULT_APPS) {
    const fullAppPath = resolve(viewsDir, appPath);
    if (!existsSync(fullAppPath)) {
      writeFileSync(fullAppPath, appMd, "utf-8");
      console.log(`📝 Created default app: ${fullAppPath}`);
    }

    const fullViewPath = resolve(viewsDir, viewPath);
    writeFileSync(fullViewPath, viewMd, "utf-8");
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

/** Check if the agent has an AI provider API key configured and write _status.json */
export function checkAuthStatus(stateDir: string, authPath?: string): void {
  const defaultAuthPath = resolve(
    homedir(),
    ".openclaw",
    "agents",
    "main",
    "agent",
    "auth.json",
  );
  const targetPath = authPath ?? defaultAuthPath;

  let setupRequired = true;
  let message =
    "Your agent needs an AI provider key to respond to messages. SSH into your server and run:\n" +
    'openclaw config set agents.main.auth.anthropic.apiKey "sk-ant-..."';

  try {
    if (existsSync(targetPath)) {
      const raw = readFileSync(targetPath, "utf-8");
      const auth = JSON.parse(raw);
      const hasKey = Object.values(auth).some((provider) => {
        if (typeof provider === "object" && provider !== null) {
          return Object.values(provider as Record<string, unknown>).some(
            (v) => typeof v === "string" && v.length > 0,
          );
        }
        return typeof provider === "string" && provider.length > 0;
      });
      if (hasKey) {
        setupRequired = false;
        message = "";
      }
    }
  } catch {
    // If we can't read auth.json, assume setup is required
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
    console.warn("⚠️  No AI provider key configured — _status.json written with setupRequired: true");
  }
}
