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

export function seedDefaults(viewsDir: string, stateDir: string): void {
  // Seed chat.app.md (app definition) if missing
  const appPath = resolve(viewsDir, "chat.app.md");
  if (!existsSync(appPath)) {
    writeFileSync(appPath, DEFAULT_CHAT_APP_MD, "utf-8");
    console.log(`📝 Created default chat app: ${appPath}`);
  }

  // Seed default.chat.view.md (view module) if missing
  const viewPath = resolve(viewsDir, "default.chat.view.md");
  if (!existsSync(viewPath)) {
    writeFileSync(viewPath, DEFAULT_CHAT_VIEW, "utf-8");
    console.log(`📝 Created default chat view: ${viewPath}`);
  }

  // Seed or merge _apps.json
  const appsPath = resolve(stateDir, "_apps.json");
  if (!existsSync(appsPath)) {
    writeFileSync(appsPath, JSON.stringify([DEFAULT_CHAT_APP_ENTRY], null, 2), "utf-8");
    console.log(`📝 Created default apps registry: ${appsPath}`);
  } else {
    try {
      const existing: AppEntry[] = JSON.parse(readFileSync(appsPath, "utf-8"));
      const hasChatEntry = existing.some((app) => app.id === "chat");
      if (!hasChatEntry) {
        existing.push(DEFAULT_CHAT_APP_ENTRY);
        writeFileSync(appsPath, JSON.stringify(existing, null, 2), "utf-8");
        console.log(`📝 Added chat app to existing apps registry`);
      }
    } catch {
      // If _apps.json is malformed, don't overwrite — let the user fix it
      console.warn(`⚠️  Could not parse ${appsPath}, skipping chat app seeding`);
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
      // Check if there's any non-empty key value in the auth config
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
    JSON.stringify({ setupRequired, message }, null, 2),
    "utf-8",
  );
  if (setupRequired) {
    console.warn("⚠️  No AI provider key configured — _status.json written with setupRequired: true");
  }
}
