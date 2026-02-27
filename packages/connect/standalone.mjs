#!/usr/bin/env node

// Standalone clapps connector — no npm dependencies required.
// Usage: node standalone.mjs --relay https://clapps.clawlab.app --token YOUR_TOKEN --agent-id robin [--agent-token AGENT_TOKEN]
//
// Requires Node.js 18+ (for native fetch and watch).

import { readFile, watch, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { homedir } from "node:os";

// --- Parse args ---
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--") && i + 1 < args.length) {
    opts[args[i].slice(2)] = args[i + 1];
    i++;
  }
}

const RELAY_URL = (opts.relay ?? "https://clapps.clawlab.app").replace(/\/$/, "");
const TOKEN = opts.token;
const AGENT_ID = opts["agent-id"];
const AGENT_URL = (opts.agent ?? "http://localhost:18789").replace(/\/$/, "");
const AGENT_TOKEN = opts["agent-token"] ?? null;
const STATE_DIR = opts["state-dir"] ?? resolve(homedir(), ".openclaw", "workspace", "ui", "state");
const POLL_MS = Number(opts.interval ?? 1500);

if (!TOKEN || !AGENT_ID) {
  console.error("Usage: node standalone.mjs --token YOUR_TOKEN --agent-id AGENT_ID [--relay URL] [--agent URL] [--state-dir PATH]");
  process.exit(1);
}

// --- Ensure state dir exists ---
if (!existsSync(STATE_DIR)) {
  await mkdir(STATE_DIR, { recursive: true });
}

console.log(`🔗 Relay:    ${RELAY_URL}`);
console.log(`🤖 Agent:    ${AGENT_URL}`);
console.log(`👤 Agent ID: ${AGENT_ID}`);
console.log(`📁 State:    ${STATE_DIR}`);
console.log();

// --- Intent poller ---
async function pollIntents() {
  try {
    const res = await fetch(`${RELAY_URL}/api/agent/intents?token=${TOKEN}&agentId=${AGENT_ID}`);
    if (!res.ok) return;
    const { intents } = await res.json();
    for (const intent of intents) {
      console.log(`→ Intent: ${intent.intent}`, JSON.stringify(intent.payload));
      try {
        const message = `[CLAPP_INTENT] ${intent.intent} ${JSON.stringify(intent.payload)}`;
        const headers = { "Content-Type": "application/json" };
        if (AGENT_TOKEN) headers["Authorization"] = `Bearer ${AGENT_TOKEN}`;
        const agentRes = await fetch(`${AGENT_URL}/hooks/agent`, {
          method: "POST",
          headers,
          body: JSON.stringify({ message, sessionKey: "agent:main:main" }),
        });
        if (!agentRes.ok) {
          console.error(`  ✗ Agent returned ${agentRes.status}`);
        } else {
          console.log(`  ✓ Forwarded to agent`);
        }
      } catch (err) {
        console.error(`  ✗ Agent error: ${err.message}`);
      }
    }
  } catch (err) {
    // Silently retry on network errors
  }
}

// --- State watcher ---
async function pushState(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    const state = JSON.parse(content);
    const clappId = basename(filePath, ".json");

    const res = await fetch(`${RELAY_URL}/api/agent/state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ agentId: AGENT_ID, clappId, ...state }),
    });

    if (res.ok) {
      console.log(`← State pushed: ${clappId} (v${state.version})`);
    } else {
      console.error(`✗ State push failed: ${res.status}`);
    }
  } catch (err) {
    console.error(`✗ State push error: ${err.message}`);
  }
}

// Watch state directory for changes
async function watchState() {
  try {
    const watcher = watch(STATE_DIR, { recursive: false });
    for await (const event of watcher) {
      if (event.filename?.endsWith(".json")) {
        // Small delay to let writes finish
        await new Promise((r) => setTimeout(r, 200));
        await pushState(resolve(STATE_DIR, event.filename));
      }
    }
  } catch (err) {
    console.error(`State watcher error: ${err.message}`);
  }
}

// --- Main loop ---
console.log("✓ Connector running. Ctrl+C to stop.\n");

setInterval(pollIntents, POLL_MS);
pollIntents();
watchState();

process.on("SIGINT", () => {
  console.log("\nStopped.");
  process.exit(0);
});
