#!/usr/bin/env node

import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AgentClient } from "./agent-client.js";
import { AgentHandler } from "./agent-handler.js";
import { StateStore } from "./state-store.js";
import { startServer } from "./server.js";
import { seedDefaults, checkAuthStatus } from "./defaults.js";
import { SettingsHandler } from "./settings-handler.js";
import { ChatHandler } from "./chat-handler.js";
import { SlackHandler } from "./slack-handler.js";
import { initAccessToken, formatToken } from "./auth.js";

function parseArgs(args: string[]) {
  const opts: Record<string, string> = {};
  const flags: Record<string, boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--no-auth") {
      flags["no-auth"] = true;
    } else if (arg.startsWith("--") && i + 1 < args.length) {
      opts[arg.slice(2)] = args[i + 1];
      i++;
    }
  }
  return { opts, flags };
}

async function main() {
  const { opts, flags } = parseArgs(process.argv.slice(2));
  const port = parseInt(opts.port ?? "3080", 10);
  const agentToken = opts["agent-token"];
  const session = opts.session ?? "agent:main:main";

  // Initialize access token for auth
  const accessToken = initAccessToken({
    token: opts.token,
    noAuth: flags["no-auth"],
  });
  const stateDir =
    opts["state-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "state");
  const viewsDir =
    opts["views-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "views");

  // Ensure directories exist
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(viewsDir, { recursive: true });

  // 1. Create in-memory state store
  const store = new StateStore();

  // 2. Seed defaults to disk
  seedDefaults(viewsDir, stateDir);
  checkAuthStatus(stateDir);

  const settingsHandler = new SettingsHandler({ stateDir, store });
  settingsHandler.writeSettingsState();

  // 3. Start ACP subprocess for intents
  const agentClient = new AgentClient({
    session,
    agentToken,
    onError: (err) => console.error("[acp]", err.message),
  });

  // 4. Start separate ACP subprocess for chat (dedicated session)
  const chatSession = "agent:main:clapps-chat";
  const chatAgentClient = new AgentClient({
    session: chatSession,
    agentToken,
    onError: (err) => console.error("[acp:chat]", err.message),
  });

  // 5. Start separate ACP subprocess for title generation (isolated session)
  const titleSession = "agent:main:clapps-title";
  const titleAgentClient = new AgentClient({
    session: titleSession,
    agentToken,
    onError: (err) => console.error("[acp:title]", err.message),
  });

  let agentStarted = false;
  try {
    await agentClient.start();
    await chatAgentClient.start();
    await titleAgentClient.start();
    agentStarted = true;
  } catch (err) {
    console.error(`⚠️  ACP failed to start: ${err instanceof Error ? err.message : err}`);
    console.error("   Intent processing will not work until ACP is available.");
  }

  // Create chat handler (uses dedicated chat and title sessions)
  const chatHandler = new ChatHandler({ stateDir, store, agentClient: chatAgentClient, titleAgentClient });

  // Create slack handler
  const slackHandler = new SlackHandler({ stateDir, store });

  // 4. Create agent handler (syncs disk → store after intents)
  const agentHandler = new AgentHandler({
    agentClient,
    store,
    stateDir,
    viewsDir,
  });

  // 5. Initial sync: load all disk state into the store
  await agentHandler.syncToStore();

  // 6. Resolve static SPA directory
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const staticDir = resolve(__dirname, "..", "web-app");

  // 7. Start HTTP + WebSocket server
  const server = startServer({
    port,
    store,
    staticDir,
    accessToken,
    agentConnected: () => agentStarted,
    onConnect: () => {
      // Refresh settings state when a client connects (catches external changes)
      settingsHandler.refreshSettingsState();
    },
    onIntent: (intent, _context) => {
      // Let handlers intercept first
      if (settingsHandler.handleIntent(intent)) return;
      if (chatHandler.handleIntent(intent)) return;
      if (slackHandler.handleIntent(intent)) return;
      // Forward to agent
      agentHandler.handleIntent(intent).catch((err) => {
        console.error(`[intent] ${(err as Error).message}`);
      });
    },
  });

  // 8. Periodic refresh to detect external config changes (every 60s)
  const refreshInterval = setInterval(() => {
    settingsHandler.refreshSettingsState();
  }, 60_000);

  console.log(`📁 State dir: ${stateDir}`);
  console.log(`📄 Views dir: ${viewsDir}`);
  if (accessToken) {
    console.log(`🔐 Access code: ${formatToken(accessToken)}`);
    console.log(`   Saved to ~/.openclaw/workspace/ui/.access-token`);
  } else {
    console.log(`⚠️  Auth disabled (--no-auth). Server is open to all.`);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    clearInterval(refreshInterval);
    server.close();
    agentClient.stop();
    chatAgentClient.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
