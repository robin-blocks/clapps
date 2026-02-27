#!/usr/bin/env node

import { resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { AgentClient } from "./agent-client.js";
import { IntentPoller } from "./intent-poller.js";
import { StateWatcher } from "./state-watcher.js";

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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const relayUrl = opts.relay ?? "https://clapps.clawlab.app";
  const token = opts.token;
  const agentId = opts["agent-id"];
  const agentUrl = opts.agent ?? "http://localhost:18789";
  const agentToken = opts["agent-token"];
  const stateDir =
    opts["state-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "state");
  const viewsDir =
    opts["views-dir"] ??
    resolve(homedir(), ".openclaw", "workspace", "ui", "views");

  if (!token || !agentId) {
    console.error("Usage: clapps-connect --token YOUR_TOKEN --agent-id AGENT_ID [--relay URL] [--agent URL] [--agent-token TOKEN] [--views-dir PATH]");
    process.exit(1);
  }

  // Ensure directories exist
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(viewsDir, { recursive: true });

  const agentClient = new AgentClient({ agentUrl, agentToken });

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

  console.log(`🔗 Connecting to relay: ${relayUrl}`);
  console.log(`🤖 Agent at: ${agentUrl}`);
  console.log(`👤 Agent ID: ${agentId}`);
  console.log(`📁 Watching state: ${stateDir}`);
  console.log(`📄 Watching views: ${viewsDir}`);

  // Create a browser session
  try {
    const sessionRes = await fetch(`${relayUrl}/api/agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentId }),
    });

    if (sessionRes.ok) {
      const session = (await sessionRes.json()) as {
        sessionToken: string;
        expiresAt: string;
      };
      const browserUrl = `${relayUrl}/?agentId=${encodeURIComponent(agentId)}&session=${encodeURIComponent(session.sessionToken)}`;
      console.log(`\n🌐 Open in browser: ${browserUrl}\n`);
    } else {
      console.warn(`⚠️  Failed to create session: ${sessionRes.status}`);
    }
  } catch (err) {
    console.warn(
      `⚠️  Could not create session: ${err instanceof Error ? err.message : err}`,
    );
  }

  intentPoller.start();
  stateWatcher.start();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    intentPoller.stop();
    await stateWatcher.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
