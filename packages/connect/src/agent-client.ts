import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { IntentMessage } from "@clapps/core";

export interface AgentClientOptions {
  session: string;
  agentToken?: string;
  onError?: (error: Error) => void;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface StreamUpdate {
  kind: "thought" | "status";
  text: string;
}

/** Communicate with the local OpenClaw agent via ACP (Agent Client Protocol) subprocess */
export class AgentClient {
  private session: string;
  private agentToken: string | undefined;
  private onError: ((error: Error) => void) | undefined;
  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private started = false;
  private loadedSessions = new Set<string>();
  private streamListeners = new Map<string, (update: StreamUpdate) => void>();

  constructor(options: AgentClientOptions) {
    this.session = options.session;
    this.agentToken = options.agentToken;
    this.onError = options.onError;
  }

  /** Spawn the ACP subprocess and run the initialize + session/load handshake */
  async start(): Promise<void> {
    if (this.started) return;

    this.spawnProcess();

    // ACP handshake (must be sequential)
    await this.rpc("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "clapps-connect", version: "1.0.0" },
      clientCapabilities: {},
    });

    await this.rpc("session/load", {
      sessionId: this.session,
      cwd: process.cwd(),
      mcpServers: [],
    });
    this.loadedSessions.add(this.session);

    this.started = true;
    console.log(`🔌 ACP connected (session: ${this.session})`);
  }

  /** Send an intent to the agent via ACP session/prompt */
  async sendIntent(intent: IntentMessage): Promise<string> {
    if (!this.proc) {
      throw new Error("AgentClient not started — call start() first");
    }

    await this.ensureSessionLoaded(this.session);

    const prompt = `[CLAPP_INTENT] ${intent.intent} ${JSON.stringify(intent.payload)}`;

    const result = (await this.rpc("session/prompt", {
      sessionId: this.session,
      prompt: [{ type: "text", text: prompt }],
    })) as { content?: Array<{ text?: string }> } | null;

    // Extract text from the response
    if (result && typeof result === "object" && "content" in result) {
      const texts = (result.content ?? [])
        .map((c: { text?: string }) => c.text)
        .filter(Boolean);
      return texts.join("\n");
    }

    return "";
  }

  /** Send a chat message to the agent and get a response */
  async sendMessage(text: string, sessionKey?: string, onStreamUpdate?: (update: StreamUpdate) => void): Promise<string> {
    if (!this.proc) {
      throw new Error("AgentClient not started — call start() first");
    }

    const targetSession = sessionKey ?? this.session;
    await this.ensureSessionLoaded(targetSession);

    const sentAt = Date.now();
    const before = (await this.readLatestAssistantMessage(targetSession)) ?? (await this.readLatestAssistantMessage(this.session));

    console.log(`[acp:sendMessage] Sending to session ${targetSession}: "${text.slice(0, 50)}..."`);

    if (onStreamUpdate) {
      this.streamListeners.set(targetSession, onStreamUpdate);
    }

    let result: { content?: Array<{ text?: string }> } | null = null;
    try {
      result = (await this.rpc("session/prompt", {
        sessionId: targetSession,
        prompt: [{ type: "text", text }],
      })) as { content?: Array<{ text?: string }> } | null;
    } finally {
      if (onStreamUpdate) {
        this.streamListeners.delete(targetSession);
      }
    }

    console.log(`[acp:sendMessage] Got result:`, JSON.stringify(result)?.slice(0, 200));

    // 1) Try direct RPC content first
    if (result && typeof result === "object" && "content" in result) {
      const texts = (result.content ?? [])
        .map((c: { text?: string }) => c.text)
        .filter(Boolean);
      const joined = texts.join("\n").trim();
      if (joined && !this.isControlReply(joined)) return joined;
    }

    // 2) Fallback: pull latest assistant text from session logs (target first, then base session)
    return await this.readAssistantReplyFromSessionLog(targetSession, before?.text, sentAt);
  }

  private async readAssistantReplyFromSessionLog(sessionKey: string, previous?: string, sentAtMs?: number): Promise<string> {
    const deadline = Date.now() + 10_000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    while (Date.now() < deadline) {
      const candidate = await this.readLatestAssistantMessage(sessionKey);
      if (this.isUsableCandidate(candidate?.text, previous, sentAtMs, candidate?.timestampMs)) return candidate!.text;

      const fallback = await this.readLatestAssistantMessage(this.session);
      if (this.isUsableCandidate(fallback?.text, previous, sentAtMs, fallback?.timestampMs)) return fallback!.text;

      await sleep(500);
    }

    return "";
  }

  private isUsableCandidate(text?: string, previous?: string, sentAtMs?: number, candidateTs?: number): boolean {
    if (!text || text === previous) return false;
    if (this.isControlReply(text)) return false;
    if (sentAtMs && candidateTs && candidateTs < sentAtMs - 1000) return false;
    return true;
  }

  private isControlReply(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return normalized.startsWith("model reset to default") || normalized.startsWith("model set to ");
  }

  private async readLatestAssistantMessage(sessionKey: string): Promise<{ text: string; timestampMs: number } | null> {
    try {
      const { homedir } = await import("node:os");
      const { resolve } = await import("node:path");
      const { readFile } = await import("node:fs/promises");

      const sessionsPath = resolve(homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json");
      const sessionsRaw = await readFile(sessionsPath, "utf-8");
      const sessions = JSON.parse(sessionsRaw) as Record<string, { sessionId?: string }>;
      const meta = sessions[sessionKey];
      if (!meta?.sessionId) return null;

      const jsonlPath = resolve(homedir(), ".openclaw", "agents", "main", "sessions", `${meta.sessionId}.jsonl`);
      const jsonlRaw = await readFile(jsonlPath, "utf-8");
      const lines = jsonlRaw.trim().split("\n");

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const row = JSON.parse(lines[i]);
          if (row?.type !== "message") continue;
          const msg = row?.message;
          if (!msg || msg.role !== "assistant") continue;

          const parts = Array.isArray(msg.content) ? msg.content : [];
          const texts = parts
            .filter((p: { type?: string; text?: string }) => p?.type === "text" && typeof p?.text === "string")
            .map((p: { text: string }) => p.text)
            .filter(Boolean);

          const joined = texts.join("\n").trim();
          if (!joined) continue;

          const tsRaw = msg.timestamp ?? row.timestamp ?? Date.now();
          const ts = typeof tsRaw === "number" ? tsRaw : Date.parse(tsRaw);
          return { text: joined, timestampMs: Number.isFinite(ts) ? ts : Date.now() };
        } catch {
          // ignore malformed line
        }
      }
    } catch (err) {
      console.warn(`[acp:sendMessage] Log read failed: ${(err as Error).message}`);
    }

    return null;
  }

  private async ensureSessionLoaded(sessionId: string): Promise<void> {
    if (this.loadedSessions.has(sessionId)) return;

    await this.rpc("session/load", {
      sessionId,
      cwd: process.cwd(),
      mcpServers: [],
    });

    this.loadedSessions.add(sessionId);
  }

  /** Kill the ACP subprocess */
  stop(): void {
    this.started = false;
    this.loadedSessions.clear();
    this.rl?.close();
    this.rl = null;
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
    // Reject any pending requests
    for (const [, pending] of this.pending) {
      pending.reject(new Error("AgentClient stopped"));
    }
    this.pending.clear();
  }

  // ---- internals ----

  private spawnProcess(): void {
    const args = ["acp", "--session", this.session];
    if (this.agentToken) {
      args.push("--token", this.agentToken);
    }

    this.proc = spawn("openclaw", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on("line", (line) => this.handleLine(line));

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.error(`[acp stderr] ${msg}`);
      }
    });

    this.proc.on("exit", (code) => {
      const err = new Error(`ACP process exited unexpectedly (code ${code})`);

      // Always reject pending requests (including during initial start() handshake)
      for (const [, pending] of this.pending) {
        pending.reject(err);
      }
      this.pending.clear();

      if (this.started) {
        this.onError?.(err);
        this.proc = null;
        this.rl = null;
        this.loadedSessions.clear();
        this.started = false;

        // Attempt restart after a short delay
        setTimeout(() => {
          if (!this.started) {
            console.log("🔄 Restarting ACP subprocess...");
            this.start().catch((e) => this.onError?.(e as Error));
          }
        }, 2000);
      }
    });

    this.proc.on("error", (err) => {
      this.onError?.(err);
    });
  }

  private handleLine(line: string): void {
    let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      // Not JSON — ignore
      return;
    }

    // Notification path (no request id)
    if (msg.id == null) {
      if (msg.method === "session/update") {
        this.handleSessionUpdate(msg.params as Record<string, unknown> | undefined);
      }
      return;
    }

    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error.message));
    } else {
      pending.resolve(msg.result);
    }
  }

  private handleSessionUpdate(params?: Record<string, unknown>): void {
    if (!params || typeof params !== "object") return;
    const sessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
    const listener = sessionId
      ? this.streamListeners.get(sessionId)
      : (this.streamListeners.size === 1 ? Array.from(this.streamListeners.values())[0] : undefined);
    if (!listener) return;

    const update = (params.update ?? {}) as Record<string, unknown>;
    const tag = typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";

    const getText = (): string => {
      const content = update.content;
      if (typeof content === "string") return content;
      if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") {
        return (content as { text: string }).text;
      }
      if (typeof update.text === "string") return update.text;
      if (typeof update.title === "string" && typeof update.status === "string") return `${update.title} (${update.status})`;
      if (typeof update.title === "string") return update.title;
      if (typeof update.summary === "string") return update.summary;
      return "";
    };

    const text = getText().trim();
    if (!text) return;

    if (tag === "agent_thought_chunk") {
      listener({ kind: "thought", text });
      return;
    }

    if (tag === "agent_message_chunk") {
      listener({ kind: "status", text: `Drafting: ${text}` });
      return;
    }

    if (tag === "tool_call" || tag === "tool_call_update" || tag === "session_info_update" || tag === "plan") {
      listener({ kind: "status", text });
      return;
    }

    // Fallback: surface any textual update so the UI doesn't stay static.
    listener({ kind: "status", text });
  }

  private rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin?.writable) {
        reject(new Error("ACP process not running"));
        return;
      }

      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      this.proc.stdin.write(request + "\n", (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }
}
