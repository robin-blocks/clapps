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
];

interface ClappDef {
  id: string;
  appPath: string;
  viewPath: string;
  appMd: string;
  viewMd: string;
}

const BUNDLED_CLAPPS: ClappDef[] = [
  {
    id: "chat",
    appPath: "chat.app.md",
    viewPath: "default.chat.view.md",
    appMd: DEFAULT_CHAT_APP_MD,
    viewMd: DEFAULT_CHAT_VIEW,
  },
  {
    id: "settings",
    appPath: "settings.app.md",
    viewPath: "default.settings.view.md",
    appMd: DEFAULT_SETTINGS_APP_MD,
    viewMd: DEFAULT_SETTINGS_VIEW,
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
    const appContent = loadView(clapp.id, clapp.appPath.replace(".app.md", ".app.md"), clapp.appMd);
    
    if (!existsSync(fullAppPath)) {
      writeFileSync(fullAppPath, appContent, "utf-8");
      console.log(`📝 Created app: ${fullAppPath}`);
    }

    const fullViewPath = resolve(viewsDir, clapp.viewPath);
    const viewFile = clapp.viewPath.replace("default.", "").replace(".view.md", ".view.md");
    const viewContent = loadView(clapp.id, `default.${clapp.id}.view.md`, clapp.viewMd);
    writeFileSync(fullViewPath, viewContent, "utf-8");
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
