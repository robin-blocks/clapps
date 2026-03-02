import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";
import type { IntentMessage } from "@clapps/core";
import { StateStore, type ClientContext, type WsMessage } from "./state-store.js";

export interface ServerOptions {
  port: number;
  store: StateStore;
  onIntent: (intent: IntentMessage, context?: ClientContext) => void;
  staticDir?: string; // path to built SPA files
  agentConnected?: () => boolean;
  onConnect?: () => void; // called when a client connects (for state refresh)
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function startServer(options: ServerOptions): { close: () => void } {
  const { port, store, onIntent, staticDir, agentConnected, onConnect } = options;

  const server = createServer((req, res) => {
    handleRequest(req, res, store, onIntent, staticDir, agentConnected);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    const client = store.addClient(ws);

    // Notify that a client connected (for state refresh)
    onConnect?.();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as WsMessage;
        handleWsMessage(msg, client, store, onIntent);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      store.removeClient(client);
    });
  });

  server.listen(port, () => {
    console.log(`\n🌐 Server running at http://localhost:${port}`);
  });

  return {
    close: () => {
      wss.close();
      server.close();
    },
  };
}

function handleWsMessage(
  msg: WsMessage,
  client: ReturnType<StateStore["addClient"]>,
  store: StateStore,
  onIntent: ServerOptions["onIntent"],
): void {
  switch (msg.type) {
    case "hello": {
      client.context = msg.context as ClientContext | undefined;
      break;
    }
    case "subscribe": {
      const clappIds = msg.clappIds as string[] | undefined;
      if (Array.isArray(clappIds)) {
        store.subscribe(client, clappIds);
      }
      break;
    }
    case "intent": {
      const intent: IntentMessage = {
        id: crypto.randomUUID(),
        agentId: "local",
        clappId: (msg.clappId as string) ?? "",
        intent: msg.intent as string,
        payload: (msg.payload as Record<string, unknown>) ?? {},
        timestamp: new Date().toISOString(),
      };
      onIntent(intent, client.context);
      break;
    }
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: StateStore,
  onIntent: ServerOptions["onIntent"],
  staticDir: string | undefined,
  agentConnected: (() => boolean) | undefined,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (path.startsWith("/api/")) {
    return handleApi(req, res, path, store, onIntent, agentConnected);
  }

  // Serve static SPA files
  if (staticDir) {
    return serveStatic(req, res, path, staticDir);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  store: StateStore,
  onIntent: ServerOptions["onIntent"],
  agentConnected: (() => boolean) | undefined,
): Promise<void> {
  // GET /api/apps
  if (path === "/api/apps" && req.method === "GET") {
    json(res, store.getApps());
    return;
  }

  // GET /api/state/:clappId
  const stateMatch = path.match(/^\/api\/state\/([^/]+)$/);
  if (stateMatch && req.method === "GET") {
    const state = store.getState(stateMatch[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    json(res, state);
    return;
  }

  // GET /api/views/:viewId
  const viewMatch = path.match(/^\/api\/views\/([^/]+)$/);
  if (viewMatch && req.method === "GET") {
    const content = store.getView(viewMatch[1]);
    if (!content) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(content);
    return;
  }

  // POST /api/intent
  if (path === "/api/intent" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const data = JSON.parse(body);
      const intent: IntentMessage = {
        id: data.id ?? crypto.randomUUID(),
        agentId: data.agentId ?? "local",
        clappId: data.clappId ?? "",
        intent: data.intent,
        payload: data.payload ?? {},
        timestamp: data.timestamp ?? new Date().toISOString(),
      };
      onIntent(intent);
      json(res, { ok: true });
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
    }
    return;
  }

  // GET /api/health
  if (path === "/api/health" && req.method === "GET") {
    json(res, {
      status: "ok",
      agent: agentConnected ? agentConnected() : false,
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

async function serveStatic(
  _req: IncomingMessage,
  res: ServerResponse,
  path: string,
  staticDir: string,
): Promise<void> {
  // Normalize path
  let filePath = path === "/" ? "/index.html" : path;

  // Security: prevent directory traversal
  const resolved = resolve(staticDir, filePath.slice(1));
  if (!resolved.startsWith(resolve(staticDir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Try the exact file, then fall back to index.html (SPA routing)
  let target = resolved;
  if (!existsSync(target)) {
    target = resolve(staticDir, "index.html");
  }

  try {
    const content = await readFile(target);
    const ext = extname(target);
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
}

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
