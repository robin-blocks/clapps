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

// --- Types ---

export interface ServerOptions {
  port: number;
  store: StateStore;
  onIntent: (intent: IntentMessage, context?: ClientContext) => void;
  staticDir?: string;
  agentConnected?: () => boolean;
  onConnect?: () => void;
  accessToken?: string | null;
  oauthHandler?: OAuthHandler;
  openclawHome?: string;
  templatesDir?: string;
  stateDir?: string;
}

/** Shared context passed to all route handlers (replaces positional params). */
interface RequestContext {
  store: StateStore;
  onIntent: ServerOptions["onIntent"];
  agentConnected?: () => boolean;
  accessToken: string | null;
  oauthHandler?: OAuthHandler;
  openclawHome?: string;
  templatesDir?: string;
  stateDir?: string;
  staticDir?: string;
}

// --- Response helpers ---

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function jsonError(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error }));
}

// --- Rate limiting for write endpoints ---

const apiRateMap = new Map<string, { count: number; resetAt: number }>();
const API_RATE_LIMIT = 60; // requests per window
const API_RATE_WINDOW = 60_000; // 1 minute

function checkApiRateLimit(req: IncomingMessage): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const entry = apiRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    apiRateMap.set(ip, { count: 1, resetAt: now + API_RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= API_RATE_LIMIT;
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/** Validate that a template/clapp ID is safe for use in file paths. */
function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) && !id.includes("..");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Server entrypoint ---

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
  const { port, store, onIntent, onConnect, accessToken, oauthHandler } = options;

  const ctx: RequestContext = {
    store,
    onIntent,
    agentConnected: options.agentConnected,
    accessToken: accessToken ?? null,
    oauthHandler,
    openclawHome: options.openclawHome,
    templatesDir: options.templatesDir,
    stateDir: options.stateDir,
    staticDir: options.staticDir,
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, ctx);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!authenticateWsUpgrade(req, ctx.accessToken)) {
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

// --- Request router ---

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS — only allow same-host origins (different ports are OK for local dev)
  const origin = req.headers.origin;
  if (origin) {
    try {
      const reqHost = req.headers.host?.split(":")[0] ?? "";
      const originHost = new URL(origin).hostname;
      if (originHost === reqHost || originHost === "localhost" || originHost === "127.0.0.1") {
        res.setHeader("Access-Control-Allow-Origin", origin);
        if (ctx.accessToken != null) {
          res.setHeader("Access-Control-Allow-Credentials", "true");
        }
      }
    } catch { /* invalid origin, skip CORS headers */ }
  } else if (ctx.accessToken == null) {
    // No auth mode: allow all origins (development only)
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
    return handleHealth(res, ctx);
  }
  if (path === "/auth/login") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(getLoginPageHtml());
      return;
    }
    if (req.method === "POST") {
      return handleLogin(req, res, ctx.accessToken);
    }
  }

  // Auth check
  if (ctx.accessToken != null) {
    const { authenticated } = authenticateRequest(req, ctx.accessToken);
    if (!authenticated) {
      if (path.startsWith("/api/")) {
        jsonError(res, 401, "unauthorized");
        return;
      }
      res.writeHead(401, { "Content-Type": "text/html" });
      res.end(getLoginPageHtml());
      return;
    }
  }

  // Authenticated routes
  if (path === "/api/oauth/init" && ctx.oauthHandler) {
    return handleOAuthInit(req, res, ctx.oauthHandler);
  }
  if (path === "/api/oauth/callback" && ctx.oauthHandler) {
    return handleOAuthCallback(req, res, ctx.oauthHandler);
  }
  if (path === "/connect") {
    return handleConnectPage(req, res, ctx.accessToken);
  }

  // API routes
  if (path.startsWith("/api/")) {
    return routeApi(req, res, path, ctx);
  }

  // Static SPA
  if (ctx.staticDir) {
    return serveStatic(res, path, ctx.staticDir);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

// --- API router (dispatches to individual handlers) ---

async function routeApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  ctx: RequestContext,
): Promise<void> {
  if (path === "/api/apps" && req.method === "GET") {
    return handleApps(res, ctx);
  }

  const stateMatch = path.match(/^\/api\/state\/([^/]+)$/);
  if (stateMatch && req.method === "GET") {
    return handleState(res, ctx, stateMatch[1]);
  }

  const viewMatch = path.match(/^\/api\/views\/([^/]+)$/);
  if (viewMatch && req.method === "GET") {
    return handleView(res, ctx, viewMatch[1]);
  }

  // Rate-limit write endpoints
  if (req.method === "POST" && !checkApiRateLimit(req)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "too many requests" }));
    return;
  }

  if (path === "/api/templates" && req.method === "POST") {
    return handleTemplates(req, res, ctx);
  }

  if (path === "/api/intent" && req.method === "POST") {
    return handleIntentRoute(req, res, ctx);
  }

  if (path === "/api/health" && req.method === "GET") {
    return handleHealth(res, ctx);
  }

  const assetMatch = path.match(/^\/api\/chat-assets\/([^/]+)\/([^/]+)$/);
  if (assetMatch && req.method === "GET") {
    return handleChatAsset(res, ctx, decodeURIComponent(assetMatch[1]), decodeURIComponent(assetMatch[2]));
  }

  jsonError(res, 404, "not found");
}

// --- Individual API route handlers ---

async function handleApps(res: ServerResponse, ctx: RequestContext): Promise<void> {
  const storeApps = ctx.store.getApps();
  if (!ctx.templatesDir || !existsSync(ctx.templatesDir)) {
    json(res, storeApps);
    return;
  }

  try {
    const dirs = await readdir(ctx.templatesDir, { withFileTypes: true });
    const storeIds = new Set(storeApps.map((a) => a.id));
    const allApps: unknown[] = [...storeApps];

    for (const dir of dirs) {
      if (!dir.isDirectory() || storeIds.has(dir.name)) continue;
      const mPath = resolve(ctx.templatesDir, dir.name, "manifest.json");
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
}

async function handleState(res: ServerResponse, ctx: RequestContext, clappId: string): Promise<void> {
  const state = ctx.store.getState(clappId);
  if (!state) {
    jsonError(res, 404, "not found");
    return;
  }

  // Inject _views from templates if available
  if (ctx.templatesDir) {
    const viewsPath = resolve(ctx.templatesDir, clappId, "views");
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
      } catch { /* fall through */ }
    }
  }

  json(res, state);
}

function handleView(res: ServerResponse, ctx: RequestContext, viewId: string): void {
  const content = ctx.store.getView(viewId);
  if (!content) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(content);
}

async function handleTemplates(req: IncomingMessage, res: ServerResponse, ctx: RequestContext): Promise<void> {
  if (!ctx.templatesDir || !ctx.stateDir) {
    jsonError(res, 500, "templates not configured");
    return;
  }

  const body = await readBody(req);
  try {
    const data = JSON.parse(body);
    const { id, name, version, icon, color, entryView, contract, views, initialState } = data;

    if (!id || !version) {
      jsonError(res, 400, "id and version required");
      return;
    }

    if (!isValidId(id)) {
      jsonError(res, 400, "invalid template id");
      return;
    }

    const templateDir = resolve(ctx.templatesDir, id);
    if (!templateDir.startsWith(resolve(ctx.templatesDir))) {
      jsonError(res, 400, "invalid template id");
      return;
    }
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

    // Create directory structure and write files
    const viewsPath = resolve(templateDir, "views");
    await mkdir(viewsPath, { recursive: true });
    await writeFile(manifestPath, JSON.stringify({ id, name, version, icon, color, entryView }, null, 2));

    if (contract) {
      await writeFile(resolve(templateDir, "contract.json"), JSON.stringify(contract, null, 2));
    }

    if (views && typeof views === "object") {
      for (const [viewName, viewData] of Object.entries(views)) {
        await writeFile(resolve(viewsPath, `${viewName}.json`), JSON.stringify(viewData, null, 2));
      }
    }

    // Write initial state if none exists on disk
    if (initialState) {
      const statePath = resolve(ctx.stateDir, `${id}.json`);
      if (!existsSync(statePath)) {
        await writeFile(statePath, JSON.stringify(initialState, null, 2));
        ctx.store.setState(id, initialState);
      }
    }

    // Notify agent on first provision
    if (isNew) {
      ctx.onIntent({
        id: crypto.randomUUID(),
        agentId: "system",
        clappId: id,
        intent: "system.templateInstalled",
        payload: { name: name ?? id, contractPath: resolve(templateDir, "contract.json") },
        timestamp: new Date().toISOString(),
      });
    }

    json(res, { status: "provisioned" });
  } catch {
    jsonError(res, 400, "invalid JSON");
  }
}

async function handleIntentRoute(req: IncomingMessage, res: ServerResponse, ctx: RequestContext): Promise<void> {
  const body = await readBody(req);
  try {
    const data = JSON.parse(body);
    ctx.onIntent({
      id: data.id ?? crypto.randomUUID(),
      agentId: data.agentId ?? "local",
      clappId: data.clappId ?? "",
      intent: data.intent,
      payload: data.payload ?? {},
      timestamp: data.timestamp ?? new Date().toISOString(),
    });
    json(res, { ok: true });
  } catch {
    jsonError(res, 400, "invalid JSON");
  }
}

function handleHealth(res: ServerResponse, ctx: RequestContext): void {
  json(res, {
    status: "ok",
    agent: ctx.agentConnected ? ctx.agentConnected() : false,
  });
}

async function handleChatAsset(
  res: ServerResponse,
  ctx: RequestContext,
  sessionKey: string,
  fileName: string,
): Promise<void> {
  if (!/^session-\d+$/.test(sessionKey) || fileName.includes("..") || fileName.includes("/")) {
    jsonError(res, 400, "invalid asset path");
    return;
  }

  const { homedir } = await import("node:os");
  const home = ctx.openclawHome ?? homedir();
  const assetPath = resolve(home, ".openclaw", "workspace", "chat-sessions", "assets", sessionKey, fileName);

  if (!existsSync(assetPath)) {
    jsonError(res, 404, "asset not found");
    return;
  }

  try {
    const content = await readFile(assetPath);
    const ext = extname(assetPath);
    const mime = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable" });
    res.end(content);
  } catch {
    jsonError(res, 500, "failed to read asset");
  }
}

// --- Non-API route handlers ---

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  accessToken: string | null,
): Promise<void> {
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

async function handleOAuthInit(
  req: IncomingMessage,
  res: ServerResponse,
  oauthHandler: OAuthHandler,
): Promise<void> {
  if (req.method !== "POST") {
    jsonError(res, 405, "method not allowed");
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const provider = data.provider as string | undefined;
    if (!provider) {
      jsonError(res, 400, "provider is required");
      return;
    }
    json(res, oauthHandler.initOAuth(provider, data.customName as string | undefined));
  } catch (error) {
    console.error("[oauth] Init failed:", error);
    jsonError(res, 500, "OAuth init failed");
  }
}

async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  oauthHandler: OAuthHandler,
): Promise<void> {
  if (req.method !== "POST") {
    jsonError(res, 405, "method not allowed");
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const callbackUrl = data.callbackUrl as string | undefined;
    if (!callbackUrl) {
      jsonError(res, 400, "callbackUrl is required");
      return;
    }

    const parsed = new URL(callbackUrl);
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");
    if (!code || !state) {
      jsonError(res, 400, "URL must contain code and state parameters");
      return;
    }

    json(res, await oauthHandler.handleCallback(code, state));
  } catch (error) {
    console.error("[oauth] Callback failed:", error);
    jsonError(res, 500, "OAuth callback failed");
  }
}

async function handleConnectPage(
  req: IncomingMessage,
  res: ServerResponse,
  accessToken: string | null,
): Promise<void> {
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
    ? `<div class="field"><div class="label">Access Code</div><code>${escapeHtml(accessToken)}</code></div>`
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

async function serveStatic(res: ServerResponse, path: string, staticDir: string): Promise<void> {
  let filePath = path === "/" ? "/index.html" : path;

  const resolved = resolve(staticDir, filePath.slice(1));
  if (!resolved.startsWith(resolve(staticDir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

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
