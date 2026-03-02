#!/usr/bin/env node

import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { AgentClient } from "./agent-client.js";
import { IntentPoller } from "./intent-poller.js";
import { StateWatcher } from "./state-watcher.js";
import { loadToken, saveToken, CREDENTIALS_PATH } from "./credentials.js";
import { seedDefaults, checkAuthStatus } from "./defaults.js";

function parseArgs(args: string[]) {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      opts[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return opts;
}

async function selfRegister(
  relayUrl: string,
  agentId: string,
): Promise<string> {
  const res = await fetch(`${relayUrl}/api/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });

  if (res.status === 409) {
    console.error(
      `❌ Agent ID "${agentId}" is already registered. If this is your agent, use --token YOUR_TOKEN`,
    );
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration failed (${res.status}): ${body}`);
  }

  const { token } = (await res.json()) as { agentId: string; token: string };
  return token;
}

async function resolveToken(
  relayUrl: string,
  agentId: string,
  explicitToken: string | undefined,
): Promise<string> {
  // 1. Explicit --token flag wins
  if (explicitToken) return explicitToken;

  // 2. Try saved credentials
  const saved = loadToken(relayUrl, agentId);
  if (saved) return saved;

  // 3. Self-register
  const token = await selfRegister(relayUrl, agentId);
  saveToken(relayUrl, agentId, token);
  console.log(
    `✅ Registered agent "${agentId}" (token saved to ${CREDENTIALS_PATH})`,
  );
  return token;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const relayUrl = opts.relay ?? "https://clapps.clawlab.app";
  const explicitToken = opts.token;
  const agentId = opts["agent-id"];
  const agentToken = opts["agent-token"];
  const session = opts.session ?? "agent:main:main";
  const stateDir =
    opts["state-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "state");
  const viewsDir =
    opts["views-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "views");

  if (!agentId) {
    console.error(
      "Usage: clapps-connect --agent-id AGENT_ID [--token TOKEN] [--relay URL] [--agent-token TOKEN] [--session SESSION] [--views-dir PATH]",
    );
    process.exit(1);
  }

  console.log(`🔗 Connecting to relay: ${relayUrl}`);

  const token = await resolveToken(relayUrl, agentId, explicitToken);

  // Ensure directories exist
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(viewsDir, { recursive: true });

  const agentClient = new AgentClient({
    session,
    agentToken,
    onError: (err) => console.error("[acp]", err.message),
  });

  const intentPoller = new IntentPoller({
    relayUrl,
    token,
    agentId,
    agentClient,
    onError: (err) => console.error("[intent-poller]", err.message),
  });

  const stateWatcher = new StateWatcher({
    stateDir,
    viewsDir,
    relayUrl,
    token,
    agentId,
    onError: (err) => console.error("[state-watcher]", err.message),
  });

  console.log(`🤖 Agent ID: ${agentId}`);
  console.log(`📁 Watching state: ${stateDir}`);
  console.log(`📄 Watching views: ${viewsDir}`);

  // Create/reuse a stable link token for browser access
  try {
    const linkRes = await fetch(`${relayUrl}/api/agent/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentId }),
    });

    if (linkRes.ok) {
      const link = (await linkRes.json()) as { linkToken: string };
      const browserUrl = `${relayUrl}/?agentId=${encodeURIComponent(agentId)}&link=${encodeURIComponent(link.linkToken)}`;
      console.log(`\n🌐 Open in browser: ${browserUrl}`);
      console.log(`   (stable link — reuse across restarts)\n`);
    } else {
      console.warn(`⚠️  Failed to create link: ${linkRes.status}`);
    }
  } catch (err) {
    console.warn(
      `⚠️  Could not create link: ${err instanceof Error ? err.message : err}`,
    );
  }

  // Start ACP subprocess before accepting intents
  await agentClient.start();

  intentPoller.start();
  stateWatcher.start();

  // Wait for chokidar to finish initial scan, then seed defaults so writes are detected
  await stateWatcher.waitReady();
  seedDefaults(viewsDir, stateDir);
  checkAuthStatus(stateDir);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    intentPoller.stop();
    agentClient.stop();
    await stateWatcher.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
