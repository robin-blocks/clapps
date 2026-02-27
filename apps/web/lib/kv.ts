import { kv } from "@vercel/kv";
import type { IntentMessage, ClappState } from "@clapps/core";

const INTENT_QUEUE_KEY = (clappId: string) => `intents:${clappId}`;
const STATE_KEY = (clappId: string) => `state:${clappId}`;

/** Push an intent to the queue */
export async function pushIntent(intent: IntentMessage): Promise<void> {
  await kv.rpush(INTENT_QUEUE_KEY(intent.clappId), JSON.stringify(intent));
  // Expire after 1 hour to prevent unbounded growth
  await kv.expire(INTENT_QUEUE_KEY(intent.clappId), 3600);
}

/** Get pending intents (and remove them from the queue) */
export async function popIntents(
  clappId: string,
  limit = 10,
): Promise<IntentMessage[]> {
  const intents: IntentMessage[] = [];
  for (let i = 0; i < limit; i++) {
    const raw = await kv.lpop<string>(INTENT_QUEUE_KEY(clappId));
    if (!raw) break;
    intents.push(typeof raw === "string" ? JSON.parse(raw) : raw);
  }
  return intents;
}

/** Get all pending intents for any clapp (for the agent connector) */
export async function getAllPendingIntents(
  since?: string,
): Promise<IntentMessage[]> {
  // Scan for all intent queue keys
  const keys: string[] = [];
  let done = false;
  let scanCursor = 0;
  while (!done) {
    const c = scanCursor;
    const result: [string, string[]] = await kv.scan(c, {
      match: "intents:*",
      count: 100,
    });
    scanCursor = Number(result[0]);
    keys.push(...result[1]);
    if (scanCursor === 0) done = true;
  }

  const allIntents: IntentMessage[] = [];
  for (const key of keys) {
    const clappId = key.replace("intents:", "");
    const intents = await popIntents(clappId);
    allIntents.push(...intents);
  }

  if (since) {
    const sinceIdx = allIntents.findIndex((i) => i.id === since);
    if (sinceIdx >= 0) {
      return allIntents.slice(sinceIdx + 1);
    }
  }

  return allIntents;
}

/** Store state for a clapp */
export async function setState(
  clappId: string,
  state: ClappState,
): Promise<void> {
  await kv.set(STATE_KEY(clappId), JSON.stringify(state));
}

/** Get current state for a clapp */
export async function getState(clappId: string): Promise<ClappState | null> {
  const raw = await kv.get<string>(STATE_KEY(clappId));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
