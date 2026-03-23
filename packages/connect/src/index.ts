#!/usr/bin/env node

import { resolve, dirname } from "node:path";
import { homedir, networkInterfaces } from "node:os";
import { writeFile } from "node:fs/promises";
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

// --- Agent session helpers ---

function createAgentClient(session: string, agentToken?: string, label = "acp"): AgentClient {
  return new AgentClient({
    session,
    agentToken,
    onError: (err) => console.error(`[${label}]`, err.message),
  });
}

async function startAgentClients(clients: AgentClient[]): Promise<boolean> {
  try {
    await Promise.all(clients.map((c) => c.start()));
    return true;
  } catch (err) {
    console.error(`⚠️  ACP failed to start: ${err instanceof Error ? err.message : err}`);
    console.error("   Intent processing will not work until ACP is available.");
    return false;
  }
}

// --- QR code / connection info ---

async function generateConnectAssets(
  port: number,
  accessToken: string | null,
  openclawHome: string,
): Promise<void> {
  const localIP = getLocalIP();
  const serverURL = `http://${localIP}:${port}`;
  const qrPayload = JSON.stringify({ url: serverURL, token: accessToken ?? "" });

  // Terminal QR
  const qr = await QRCode.toString(qrPayload, { type: "terminal", small: true });
  console.log(`\n📱 Scan to connect the Clapps app:\n${qr}`);
  console.log(`   Or visit ${serverURL}/connect in a browser\n`);

  // Save PNG + connection info for the agent
  const uiDir = resolve(openclawHome, ".openclaw", "workspace", "ui");
  const qrPngPath = resolve(uiDir, "connect-qr.png");
  await QRCode.toFile(qrPngPath, qrPayload, { width: 400, margin: 2 });
  await writeFile(resolve(uiDir, "connect-info.json"), JSON.stringify({
    url: serverURL,
    token: accessToken ? formatToken(accessToken) : null,
    connectPage: `${serverURL}/connect`,
    qrCodePath: qrPngPath,
  }, null, 2));
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

// --- Startup info ---

function printStartupInfo(
  stateDir: string,
  viewsDir: string,
  templatesDir: string,
  openclawHome: string,
  accessToken: string | null,
): void {
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
}

// --- Main ---

async function main() {
  const { opts, flags } = parseArgs(process.argv.slice(2));
  const port = parseInt(opts.port ?? "3080", 10);
  const agentToken = opts["agent-token"];
  const session = opts.session ?? "agent:main:main";
  const openclawHome = opts["openclaw-home"] ?? process.env.OPENCLAW_HOME ?? homedir();

  const accessToken = initAccessToken({
    token: opts.token,
    noAuth: flags["no-auth"],
  });

  // Directories
  const stateDir = opts["state-dir"] ?? resolve(openclawHome, ".openclaw", "workspace", "ui", "state");
  const viewsDir = opts["views-dir"] ?? resolve(openclawHome, ".openclaw", "workspace", "ui", "views");
  const templatesDir = resolve(openclawHome, ".openclaw", "workspace", "ui", "templates");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(viewsDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  // State store + disk defaults
  const store = new StateStore();
  const authPath = resolve(openclawHome, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
  seedDefaults(viewsDir, stateDir);
  checkAuthStatus(stateDir, authPath);

  // Settings handler
  const needsOwnershipFix = openclawHome !== homedir();
  const configPath = resolve(openclawHome, ".openclaw", "openclaw.json");

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
      spawnSync("systemctl", ["restart", "openclaw"], { encoding: "utf-8", timeout: 15_000 });
      spawnSync("sleep", ["3"]);
    } : undefined,
  });
  settingsHandler.writeSettingsState();

  // ACP agent sessions
  const agentClient = createAgentClient(session, agentToken, "acp");
  const chatAgentClient = createAgentClient("agent:main:clapps-chat", agentToken, "acp:chat");
  const titleAgentClient = createAgentClient("agent:main:clapps-title", agentToken, "acp:title");
  const agentStarted = await startAgentClients([agentClient, chatAgentClient, titleAgentClient]);

  // Handlers
  const chatHandler = new ChatHandler({ stateDir, store, agentClient: chatAgentClient, titleAgentClient });
  const slackHandler = new SlackHandler({ stateDir, store, openclawHome });
  const oauthHandler = new OAuthHandler(authPath);

  const agentHandler = new AgentHandler({ agentClient, store, stateDir, viewsDir });
  await agentHandler.syncToStore();

  // Clapp handlers (deterministic intent handlers from disk)
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

  // HTTP + WebSocket server
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const server = startServer({
    port,
    store,
    staticDir: resolve(__dirname, "..", "web-app"),
    accessToken,
    oauthHandler,
    openclawHome,
    templatesDir,
    stateDir,
    agentConnected: () => agentStarted,
    onConnect: () => settingsHandler.refreshSettingsState(),
    onIntent: (intent, _context) => {
      if (settingsHandler.handleIntent(intent)) return;
      if (chatHandler.handleIntent(intent)) return;
      if (slackHandler.handleIntent(intent)) return;

      if (intent.intent === "system.reloadHandlers") {
        loadClappHandlers(clappsDir, clappHandlerCtx).then((handlers) => {
          clappHandlers = handlers;
          console.log(`[clapp-loader] Reloaded ${handlers.length} handler(s)`);
        });
        return;
      }

      for (const handler of clappHandlers) {
        if (handler.handleIntent(intent)) return;
      }

      agentHandler.handleIntent(intent).catch((err) => {
        console.error(`[intent] ${(err as Error).message}`);
      });
    },
  });

  // Periodic settings refresh
  const refreshInterval = setInterval(() => settingsHandler.refreshSettingsState(), 60_000);

  // Startup output
  printStartupInfo(stateDir, viewsDir, templatesDir, openclawHome, accessToken);
  try {
    await generateConnectAssets(port, accessToken, openclawHome);
  } catch { /* QR generation failed, not critical */ }

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
