import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";
import type { IntentMessage } from "@clapps/core";
import { StateStore, type ClientContext, type WsMessage } from "./state-store.js";
import {
  authenticateRequest,
  authenticateWsUpgrade,
  checkRateLimit,
  setSessionCookie,
  getLoginPageHtml,
} from "./auth.js";
import { OAuthHandler } from "./oauth-handler.js";

export interface ServerOptions {
  port: number;
  store: StateStore;
  onIntent: (intent: IntentMessage, context?: ClientContext) => void;
  staticDir?: string; // path to built SPA files
  agentConnected?: () => boolean;
  onConnect?: () => void; // called when a client connects (for state refresh)
  accessToken?: string | null; // null = no auth
  oauthHandler?: OAuthHandler;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function startServer(options: ServerOptions): { close: () => void } {
  const { port, store, onIntent, staticDir, agentConnected, onConnect, accessToken, oauthHandler } = options;

  const server = createServer((req, res) => {
    handleRequest(req, res, store, onIntent, staticDir, agentConnected, accessToken ?? null, oauthHandler);
  });

  // Use noServer mode so we can authenticate WS upgrades
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!authenticateWsUpgrade(req, accessToken ?? null)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

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
  accessToken: string | null,
  oauthHandler?: OAuthHandler,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS headers
  if (accessToken != null) {
    // With auth: reflect origin and allow credentials
    const origin = req.headers.origin;
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth-exempt routes
  if (path === "/api/health") {
    return handleApi(req, res, path, store, onIntent, agentConnected);
  }

  // OAuth callback (public - redirected from OAuth provider)
  if (path === "/api/oauth/callback" && oauthHandler) {
    return handleOAuthCallback(req, res, oauthHandler);
  }

  // Login routes
  if (path === "/auth/login") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getLoginPageHtml());
      return;
    }
    if (req.method === "POST") {
      return handleLogin(req, res, accessToken);
    }
  }

  // Auth check for everything else
  if (accessToken != null) {
    const { authenticated } = authenticateRequest(req, accessToken);
    if (!authenticated) {
      if (path.startsWith("/api/")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      // Browser routes → show login page
      res.writeHead(401, { "Content-Type": "text/html" });
      res.end(getLoginPageHtml());
      return;
    }
  }

  // OAuth init (authenticated)
  if (path === "/api/oauth/init" && oauthHandler) {
    return handleOAuthInit(req, res, oauthHandler);
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

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  accessToken: string | null,
): Promise<void> {
  // If no auth, just redirect
  if (accessToken === null) {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (!checkRateLimit(ip)) {
    res.writeHead(429, { "Content-Type": "text/html" });
    res.end(getLoginPageHtml("Too many attempts. Please wait a minute."));
    return;
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const password = params.get("password")?.trim() ?? "";
  const remember = params.get("remember") === "1";

  // Normalize: strip dashes for comparison (user may paste formatted code)
  const normalized = password.replace(/-/g, "");

  if (normalized !== accessToken) {
    res.writeHead(401, { "Content-Type": "text/html" });
    res.end(getLoginPageHtml("Invalid access code."));
    return;
  }

  setSessionCookie(res, accessToken, req, remember);
  res.writeHead(302, { Location: "/" });
  res.end();
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

  // GET /api/chat-assets/:sessionKey/:fileName
  const assetMatch = path.match(/^\/api\/chat-assets\/([^/]+)\/([^/]+)$/);
  if (assetMatch && req.method === "GET") {
    const { homedir } = await import("node:os");
    const sessionKey = decodeURIComponent(assetMatch[1]);
    const fileName = decodeURIComponent(assetMatch[2]);

    if (!/^session-\d+$/.test(sessionKey) || fileName.includes("..") || fileName.includes("/")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid asset path" }));
      return;
    }

    const assetPath = resolve(homedir(), ".openclaw", "workspace", "chat-sessions", "assets", sessionKey, fileName);
    if (!existsSync(assetPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "asset not found" }));
      return;
    }

    try {
      const content = await readFile(assetPath);
      const ext = extname(assetPath);
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable" });
      res.end(content);
      return;
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "failed to read asset" }));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

async function handleOAuthInit(
  req: IncomingMessage,
  res: ServerResponse,
  oauthHandler: OAuthHandler,
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const provider = data.provider as string | undefined;
    const customName = data.customName as string | undefined;

    if (!provider) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "provider is required" }));
      return;
    }

    const result = oauthHandler.initOAuth(provider, customName);
    json(res, result);
  } catch (error) {
    console.error("[oauth] Init failed:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      error: error instanceof Error ? error.message : "OAuth init failed" 
    }));
  }
}

async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  oauthHandler: OAuthHandler,
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/html" });
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(getOAuthResultPage(false, "Missing code or state parameter"));
    return;
  }

  try {
    const result = await oauthHandler.handleCallback(code, state);
    
    if (result.success) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getOAuthResultPage(true));
    } else {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(getOAuthResultPage(false, result.error));
    }
  } catch (error) {
    console.error("[oauth] Callback failed:", error);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(getOAuthResultPage(false, error instanceof Error ? error.message : "Unknown error"));
  }
}

function getOAuthResultPage(success: boolean, error?: string): string {
  if (success) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body { font-family: system-ui; text-align: center; padding: 50px; }
    .success { color: #22c55e; font-size: 24px; margin-bottom: 20px; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="success">✓ Authentication Successful</div>
  <p>You can close this window now.</p>
  <button onclick="window.close()">Close Window</button>
  <script>
    // Auto-close after 2 seconds
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>
    `;
  } else {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body { font-family: system-ui; text-align: center; padding: 50px; }
    .error { color: #ef4444; font-size: 24px; margin-bottom: 20px; }
    .message { color: #666; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="error">✗ Authentication Failed</div>
  <div class="message">${error || "Unknown error"}</div>
  <p>Please try again or contact support.</p>
</body>
</html>
    `;
  }
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
