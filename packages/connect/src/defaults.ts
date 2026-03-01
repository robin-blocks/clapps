import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface AppEntry {
  id: string;
  name: string;
  emoji: string;
  description: string;
  pinned?: boolean;
}

const DEFAULT_CHAT_VIEW = `---
name: Chat
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

const DEFAULT_CHAT_APP: AppEntry = {
  id: "chat",
  name: "Chat",
  emoji: "\u{1F4AC}",
  description: "Chat with the agent",
  pinned: true,
};

export function seedDefaults(viewsDir: string, stateDir: string): void {
  // Seed chat.view.md if missing
  const viewPath = resolve(viewsDir, "chat.view.md");
  if (!existsSync(viewPath)) {
    writeFileSync(viewPath, DEFAULT_CHAT_VIEW, "utf-8");
    console.log(`📝 Created default chat view: ${viewPath}`);
  }

  // Seed or merge _apps.json
  const appsPath = resolve(stateDir, "_apps.json");
  if (!existsSync(appsPath)) {
    writeFileSync(appsPath, JSON.stringify([DEFAULT_CHAT_APP], null, 2), "utf-8");
    console.log(`📝 Created default apps registry: ${appsPath}`);
  } else {
    try {
      const existing: AppEntry[] = JSON.parse(readFileSync(appsPath, "utf-8"));
      const hasChatEntry = existing.some((app) => app.id === "chat");
      if (!hasChatEntry) {
        existing.push(DEFAULT_CHAT_APP);
        writeFileSync(appsPath, JSON.stringify(existing, null, 2), "utf-8");
        console.log(`📝 Added chat app to existing apps registry`);
      }
    } catch {
      // If _apps.json is malformed, don't overwrite — let the user fix it
      console.warn(`⚠️  Could not parse ${appsPath}, skipping chat app seeding`);
    }
  }
}
