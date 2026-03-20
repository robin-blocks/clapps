import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
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
import QRCode from "qrcode";

export interface ServerOptions {
  port: number;
  store: StateStore;
  onIntent: (intent: IntentMessage, context?: ClientContext) => void;
  staticDir?: string; // path to built SPA files
  agentConnected?: () => boolean;
  onConnect?: () => void; // called when a client connects (for state refresh)
  accessToken?: string | null; // null = no auth
  oauthHandler?: OAuthHandler;
  openclawHome?: string; // override homedir for openclaw paths
  templatesDir?: string;
  stateDir?: string;
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
  const { port, store, onIntent, staticDir, agentConnected, onConnect, accessToken, oauthHandler, openclawHome, templatesDir, stateDir } = options;

  const server = createServer((req, res) => {
    handleRequest(req, res, store, onIntent, staticDir, agentConnected, accessToken ?? null, oauthHandler, openclawHome, templatesDir, stateDir);
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
  openclawHome?: string,
  templatesDir?: string,
  stateDir?: string,
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
    return handleApi(req, res, path, store, onIntent, agentConnected, openclawHome, templatesDir, stateDir);
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

  // OAuth routes (authenticated)
  if (path === "/api/oauth/init" && oauthHandler) {
    return handleOAuthInit(req, res, oauthHandler);
  }
  if (path === "/api/oauth/callback" && oauthHandler) {
    return handleOAuthCallback(req, res, oauthHandler);
  }

  // Connect page (QR code for mobile app setup)
  if (path === "/connect") {
    return handleConnectPage(req, res, accessToken);
  }

  // API routes
  if (path.startsWith("/api/")) {
    return handleApi(req, res, path, store, onIntent, agentConnected, openclawHome, templatesDir, stateDir);
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
  openclawHome?: string,
  templatesDir?: string,
  stateDir?: string,
): Promise<void> {
  // GET /api/apps (merge agent-registered apps with provisioned template manifests)
  if (path === "/api/apps" && req.method === "GET") {
    const storeApps = store.getApps();
    if (!templatesDir || !existsSync(templatesDir)) {
      json(res, storeApps);
      return;
    }

    try {
      const dirs = await readdir(templatesDir, { withFileTypes: true });
      const storeIds = new Set(storeApps.map((a) => a.id));
      const allApps: unknown[] = [...storeApps];

      for (const dir of dirs) {
        if (!dir.isDirectory() || storeIds.has(dir.name)) continue;
        const mPath = resolve(templatesDir, dir.name, "manifest.json");
        if (!existsSync(mPath)) continue;
        try {
          const m = JSON.parse(await readFile(mPath, "utf-8"));
          allApps.push({ id: m.id, name: m.name, icon: m.icon, color: m.color });
        } catch { /* skip invalid manifests */ }
      }

      json(res, allApps);
    } catch {
      json(res, storeApps);
    }
    return;
  }

  // GET /api/state/:clappId (injects _views from provisioned templates)
  const stateMatch = path.match(/^\/api\/state\/([^/]+)$/);
  if (stateMatch && req.method === "GET") {
    const clappId = stateMatch[1];
    const state = store.getState(clappId);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    // Inject _views from templates if available
    if (templatesDir) {
      const viewsPath = resolve(templatesDir, clappId, "views");
      if (existsSync(viewsPath)) {
        try {
          const viewFiles = await readdir(viewsPath);
          const views: Record<string, unknown> = {};
          for (const file of viewFiles) {
            if (!file.endsWith(".json")) continue;
            const content = await readFile(resolve(viewsPath, file), "utf-8");
            views[file.replace(/\.json$/, "")] = JSON.parse(content);
          }
          if (Object.keys(views).length > 0) {
            json(res, { ...(state as unknown as Record<string, unknown>), _views: views });
            return;
          }
        } catch { /* fall through to normal response */ }
      }
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

  // POST /api/templates (provision iOS template bundle)
  if (path === "/api/templates" && req.method === "POST") {
    if (!templatesDir || !stateDir) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "templates not configured" }));
      return;
    }

    const body = await readBody(req);
    try {
      const data = JSON.parse(body);
      const { id, name, version, icon, color, entryView, contract, views, initialState } = data;

      if (!id || !version) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "id and version required" }));
        return;
      }

      const templateDir = resolve(templatesDir, id);
      const manifestPath = resolve(templateDir, "manifest.json");

      // Check if same version already stored
      if (existsSync(manifestPath)) {
        try {
          const existing = JSON.parse(await readFile(manifestPath, "utf-8"));
          if (existing.version === version) {
            json(res, { status: "unchanged" });
            return;
          }
        } catch { /* proceed with overwrite */ }
      }

      const isNew = !existsSync(templateDir);

      // Create directory structure
      const viewsPath = resolve(templateDir, "views");
      await mkdir(viewsPath, { recursive: true });

      // Write manifest
      await writeFile(manifestPath, JSON.stringify({ id, name, version, icon, color, entryView }, null, 2));

      // Write contract
      if (contract) {
        await writeFile(resolve(templateDir, "contract.json"), JSON.stringify(contract, null, 2));
      }

      // Write views
      if (views && typeof views === "object") {
        for (const [viewName, viewData] of Object.entries(views)) {
          await writeFile(resolve(viewsPath, `${viewName}.json`), JSON.stringify(viewData, null, 2));
        }
      }

      // Write initial state if none exists on disk
      if (initialState) {
        const statePath = resolve(stateDir, `${id}.json`);
        if (!existsSync(statePath)) {
          await writeFile(statePath, JSON.stringify(initialState, null, 2));
          store.setState(id, initialState);
        }
      }

      // Notify agent on first provision
      if (isNew) {
        const installIntent: IntentMessage = {
          id: crypto.randomUUID(),
          agentId: "system",
          clappId: id,
          intent: "system.templateInstalled",
          payload: {
            name: name ?? id,
            contractPath: resolve(templateDir, "contract.json"),
          },
          timestamp: new Date().toISOString(),
        };
        onIntent(installIntent);
      }

      json(res, { status: "provisioned" });
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
    }
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
    const sessionKey = decodeURIComponent(assetMatch[1]);
    const fileName = decodeURIComponent(assetMatch[2]);

    if (!/^session-\d+$/.test(sessionKey) || fileName.includes("..") || fileName.includes("/")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid asset path" }));
      return;
    }

    const { homedir } = await import("node:os");
    const home = openclawHome ?? homedir();
    const assetPath = resolve(home, ".openclaw", "workspace", "chat-sessions", "assets", sessionKey, fileName);
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
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const callbackUrl = data.callbackUrl as string | undefined;

    if (!callbackUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "callbackUrl is required" }));
      return;
    }

    const parsed = new URL(callbackUrl);
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");

    if (!code || !state) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "URL must contain code and state parameters" }));
      return;
    }

    const result = await oauthHandler.handleCallback(code, state);
    json(res, result);
  } catch (error) {
    console.error("[oauth] Callback failed:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : "OAuth callback failed",
    }));
  }
}

async function handleConnectPage(
  req: IncomingMessage,
  res: ServerResponse,
  accessToken: string | null,
): Promise<void> {
  // Derive server URL from the request Host header
  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const serverURL = `${protocol}://${host}`;
  const token = accessToken ?? "";

  const qrPayload = JSON.stringify({ url: serverURL, token });
  let qrDataURL: string;
  try {
    qrDataURL = await QRCode.toDataURL(qrPayload, { width: 280, margin: 2 });
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Failed to generate QR code");
    return;
  }

  const tokenDisplay = accessToken
    ? `<div class="field"><div class="label">Access Code</div><code>${accessToken}</code></div>`
    : `<div class="field"><div class="label">Auth</div><code>disabled</code></div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Mobile App</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f7; color: #1d1d1f; }
    .card { background: white; border-radius: 20px; padding: 40px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 380px; width: 90%; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { color: #86868b; font-size: 15px; margin-bottom: 24px; }
    .qr { margin: 0 auto 24px; }
    .qr img { border-radius: 12px; }
    .divider { display: flex; align-items: center; gap: 12px; margin: 24px 0; color: #86868b; font-size: 13px; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: #e5e5e7; }
    .field { margin-bottom: 12px; }
    .label { font-size: 11px; color: #86868b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    code { display: block; background: #f5f5f7; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-family: "SF Mono", Menlo, monospace; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect Mobile App</h1>
    <p class="subtitle">Scan with the Clapps app to connect</p>
    <div class="qr"><img src="${qrDataURL}" width="280" height="280" alt="QR Code" /></div>
    <div class="divider">or enter manually</div>
    <div class="field"><div class="label">Server URL</div><code>${serverURL}</code></div>
    ${tokenDisplay}
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
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
