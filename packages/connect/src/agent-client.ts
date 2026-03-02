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
      cwd: "/root",
      mcpServers: [],
    });

    this.started = true;
    console.log(`🔌 ACP connected (session: ${this.session})`);
  }

  /** Send an intent to the agent via ACP session/prompt */
  async sendIntent(intent: IntentMessage): Promise<string> {
    if (!this.proc) {
      throw new Error("AgentClient not started — call start() first");
    }

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

  /** Kill the ACP subprocess */
  stop(): void {
    this.started = false;
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
      args.push("--gateway-token", this.agentToken);
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
      if (this.started) {
        const err = new Error(`ACP process exited unexpectedly (code ${code})`);
        this.onError?.(err);
        // Auto-restart
        this.proc = null;
        this.rl = null;
        // Reject pending requests
        for (const [, pending] of this.pending) {
          pending.reject(err);
        }
        this.pending.clear();
        // Attempt restart after a short delay
        setTimeout(() => {
          if (this.started) {
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
    let msg: { id?: number; result?: unknown; error?: { message: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      // Not JSON — ignore
      return;
    }

    // Ignore notifications (no id field — like session/update)
    if (msg.id == null) return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error.message));
    } else {
      pending.resolve(msg.result);
    }
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
