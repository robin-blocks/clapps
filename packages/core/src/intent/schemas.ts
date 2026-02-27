import { z } from "zod";

/** An intent emitted from the UI */
export const IntentMessageSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  clappId: z.string(),
  intent: z.string(),
  payload: z.record(z.unknown()),
  timestamp: z.string(),
});

export type IntentMessage = z.infer<typeof IntentMessageSchema>;

/** State update pushed by the agent connector */
export const StateUpdateSchema = z.object({
  agentId: z.string(),
  clappId: z.string(),
  version: z.number(),
  timestamp: z.string(),
  state: z.record(z.unknown()),
});

export type StateUpdate = z.infer<typeof StateUpdateSchema>;
