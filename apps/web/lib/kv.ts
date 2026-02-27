import { kv } from "@vercel/kv";
import type { IntentMessage, ClappState, AppEntry } from "@clapps/core";

const INTENT_QUEUE_KEY = (agentId: string, clappId: string) =>
  `intents:${agentId}:${clappId}`;
const STATE_KEY = (agentId: string, clappId: string) =>
  `state:${agentId}:${clappId}`;
const APPS_KEY = (agentId: string) => `apps:${agentId}`;
const AGENT_KEY = (agentId: string) => `agent:${agentId}`;

// --- Intents ---

/** Push an intent to the agent-scoped queue */
export async function pushIntent(intent: IntentMessage): Promise<void> {
  const key = INTENT_QUEUE_KEY(intent.agentId, intent.clappId);
  await kv.rpush(key, JSON.stringify(intent));
  await kv.expire(key, 3600);
}

/** Pop pending intents for a specific agent+clapp */
export async function popIntents(
  agentId: string,
  clappId: string,
  limit = 10,
): Promise<IntentMessage[]> {
  const key = INTENT_QUEUE_KEY(agentId, clappId);
  const intents: IntentMessage[] = [];
  for (let i = 0; i < limit; i++) {
    const raw = await kv.lpop<string>(key);
    if (!raw) break;
    intents.push(typeof raw === "string" ? JSON.parse(raw) : raw);
  }
  return intents;
}

/** Get all pending intents for an agent across all clapps */
export async function getAgentIntents(
  agentId: string,
): Promise<IntentMessage[]> {
  const prefix = `intents:${agentId}:`;
  const keys: string[] = [];
  let scanCursor = 0;
  let done = false;
  while (!done) {
    const result: [string, string[]] = await kv.scan(scanCursor, {
      match: `${prefix}*`,
      count: 100,
    });
    scanCursor = Number(result[0]);
    keys.push(...result[1]);
    if (scanCursor === 0) done = true;
  }

  const allIntents: IntentMessage[] = [];
  for (const key of keys) {
    const clappId = key.slice(prefix.length);
    const intents = await popIntents(agentId, clappId);
    allIntents.push(...intents);
  }
  return allIntents;
}

// --- State ---

/** Store state for an agent's clapp */
export async function setState(
  agentId: string,
  clappId: string,
  state: ClappState,
): Promise<void> {
  await kv.set(STATE_KEY(agentId, clappId), JSON.stringify(state));
}

/** Get current state for an agent's clapp */
export async function getState(
  agentId: string,
  clappId: string,
): Promise<ClappState | null> {
  const raw = await kv.get<string>(STATE_KEY(agentId, clappId));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// --- Apps ---

/** Store registered apps for an agent */
export async function setApps(
  agentId: string,
  apps: AppEntry[],
): Promise<void> {
  await kv.set(APPS_KEY(agentId), JSON.stringify(apps));
}

/** Get registered apps for an agent */
export async function getApps(agentId: string): Promise<AppEntry[] | null> {
  const raw = await kv.get<string>(APPS_KEY(agentId));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// --- Agent registration ---

interface AgentRecord {
  agentId: string;
  token: string;
  label: string;
  createdAt: string;
}

/** Register a new agent (or overwrite existing) */
export async function registerAgent(
  agentId: string,
  token: string,
  label: string,
): Promise<void> {
  const record: AgentRecord = {
    agentId,
    token,
    label,
    createdAt: new Date().toISOString(),
  };
  await kv.set(AGENT_KEY(agentId), JSON.stringify(record));
}

/** Validate an agent's token. Returns true if valid. */
export async function validateAgentToken(
  agentId: string,
  token: string,
): Promise<boolean> {
  const raw = await kv.get<string>(AGENT_KEY(agentId));
  if (!raw) return false;
  const record: AgentRecord =
    typeof raw === "string" ? JSON.parse(raw) : raw;
  return record.token === token;
}
