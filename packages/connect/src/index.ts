#!/usr/bin/env node

import { resolve, dirname } from "node:path";
import { homedir, networkInterfaces } from "node:os";
import QRCode from "qrcode";
import { mkdirSync, existsSync, statSync, chownSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AgentClient } from "./agent-client.js";
import { AgentHandler } from "./agent-handler.js";
import { StateStore } from "./state-store.js";
import { startServer } from "./server.js";
import { seedDefaults, checkAuthStatus } from "./defaults.js";
import { SettingsHandler } from "./settings-handler.js";
import { ChatHandler } from "./chat-handler.js";
import { SlackHandler } from "./slack-handler.js";
import { OAuthHandler } from "./oauth-handler.js";
import { initAccessToken, formatToken } from "./auth.js";
import { loadClappHandlers } from "./clapp-loader.js";
import type { ClappHandler } from "./clapp-handler.js";

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

  // openclaw home: where openclaw config lives (may differ from process homedir
  // when clapps-connect runs as root but the gateway runs as a different user)
  const openclawHome = opts["openclaw-home"] ?? process.env.OPENCLAW_HOME ?? homedir();

  // Initialize access token for auth
  const accessToken = initAccessToken({
    token: opts.token,
    noAuth: flags["no-auth"],
  });
  const stateDir =
    opts["state-dir"] ??
    resolve(openclawHome, ".openclaw", "workspace", "ui", "state");
  const viewsDir =
    opts["views-dir"] ??
    resolve(openclawHome, ".openclaw", "workspace", "ui", "views");
  const templatesDir = resolve(openclawHome, ".openclaw", "workspace", "ui", "templates");

  // Ensure directories exist
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(viewsDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  // 1. Create in-memory state store
  const store = new StateStore();

  // 2. Seed defaults to disk
  seedDefaults(viewsDir, stateDir);
  checkAuthStatus(stateDir, resolve(openclawHome, ".openclaw", "agents", "main", "agent", "auth-profiles.json"));

  const needsOwnershipFix = openclawHome !== homedir();
  const configPath = resolve(openclawHome, ".openclaw", "openclaw.json");
  const authPath = resolve(openclawHome, ".openclaw", "agents", "main", "agent", "auth-profiles.json");

  const settingsHandler = new SettingsHandler({
    stateDir,
    store,
    openclawHome,
    onConfigChanged: needsOwnershipFix ? () => {
      try {
        const { uid, gid } = statSync(openclawHome);
        for (const p of [configPath, authPath]) {
          if (existsSync(p)) chownSync(p, uid, gid);
        }
      } catch { /* best effort */ }
    } : undefined,
    onModelDefaultChanged: needsOwnershipFix ? () => {
      spawnSync("systemctl", ["restart", "openclaw"], {
        encoding: "utf-8",
        timeout: 15_000,
      });
      // Wait for gateway to come back
      spawnSync("sleep", ["3"]);
    } : undefined,
  });
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
  const slackHandler = new SlackHandler({
    stateDir,
    store,
    openclawHome,
  });

  // Create OAuth handler (uses openclawHome for auth-profiles.json)
  const oauthHandler = new OAuthHandler(
    resolve(openclawHome, ".openclaw", "agents", "main", "agent", "auth-profiles.json"),
  );

  // 4. Create agent handler (syncs disk → store after intents)
  const agentHandler = new AgentHandler({
    agentClient,
    store,
    stateDir,
    viewsDir,
  });

  // 5. Initial sync: load all disk state into the store
  await agentHandler.syncToStore();

  // 6. Load clapp handlers
  const clappsDir = resolve(openclawHome, ".openclaw", "clapps");
  const clappHandlerCtx = {
    stateDir,
    setState: (clappId: string, state: unknown) => {
      writeFileSync(resolve(stateDir, `${clappId}.json`), JSON.stringify(state, null, 2));
      store.setState(clappId, state as Parameters<typeof store.setState>[1]);
    },
    checkAuthStatus: () => checkAuthStatus(stateDir, authPath),
  };
  let clappHandlers: ClappHandler[] = await loadClappHandlers(clappsDir, clappHandlerCtx);

  // 7. Resolve static SPA directory
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const staticDir = resolve(__dirname, "..", "web-app");

  // 8. Start HTTP + WebSocket server
  const server = startServer({
    port,
    store,
    staticDir,
    accessToken,
    oauthHandler,
    openclawHome,
    templatesDir,
    stateDir,
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

      // Handle handler reload
      if (intent.intent === "system.reloadHandlers") {
        loadClappHandlers(clappsDir, clappHandlerCtx).then((handlers) => {
          clappHandlers = handlers;
          console.log(`[clapp-loader] Reloaded ${handlers.length} handler(s)`);
        });
        return;
      }

      // Try clapp handlers
      for (const handler of clappHandlers) {
        if (handler.handleIntent(intent)) return;
      }

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
  console.log(`📦 Templates dir: ${templatesDir}`);
  if (openclawHome !== homedir()) {
    console.log(`🏠 OpenClaw home: ${openclawHome}`);
  }
  if (accessToken) {
    console.log(`🔐 Access code: ${formatToken(accessToken)}`);
    console.log(`   Saved to ~/.openclaw/workspace/ui/.access-token`);
  } else {
    console.log(`⚠️  Auth disabled (--no-auth). Server is open to all.`);
  }

  // Print QR code for mobile app setup
  const localIP = getLocalIP();
  const serverURL = `http://${localIP}:${port}`;
  const qrPayload = JSON.stringify({ url: serverURL, token: accessToken ?? "" });
  try {
    const qr = await QRCode.toString(qrPayload, { type: "terminal", small: true });
    console.log(`\n📱 Scan to connect the Clapps app:\n${qr}`);
    console.log(`   Or visit ${serverURL}/connect in a browser\n`);
  } catch { /* qr generation failed, not critical */ }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    clearInterval(refreshInterval);
    server.close();
    oauthHandler.stop();
    agentClient.stop();
    chatAgentClient.stop();
    process.exit(0);
  });
}

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
