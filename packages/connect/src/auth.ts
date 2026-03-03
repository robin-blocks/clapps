import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";

const TOKEN_PATH = resolve(
  homedir(),
  ".openclaw",
  "workspace",
  "ui",
  ".access-token",
);

// --- Token management ---

export function initAccessToken(opts: {
  token?: string;
  noAuth?: boolean;
}): string | null {
  if (opts.noAuth) return null;

  if (opts.token) {
    persistToken(opts.token);
    return opts.token;
  }

  // Try reading existing token
  try {
    const existing = readFileSync(TOKEN_PATH, "utf-8").trim();
    if (existing.length >= 12) return existing;
  } catch {
    // File doesn't exist or unreadable
  }

  // Generate new token: 6 random bytes → 12-char hex (no dashes in alphabet)
  const token = randomBytes(6).toString("hex");
  persistToken(token);
  return token;
}

function persistToken(token: string): void {
  mkdirSync(dirname(TOKEN_PATH), { recursive: true });
  writeFileSync(TOKEN_PATH, token + "\n", { mode: 0o600 });
}

/** Format token for display: insert dashes every 4 chars → kR7m-P2nX-q4Ld */
export function formatToken(token: string): string {
  return token.match(/.{1,4}/g)?.join("-") ?? token;
}

// --- Request authentication ---

export function authenticateRequest(
  req: IncomingMessage,
  accessToken: string | null,
): { authenticated: boolean; source?: string } {
  if (accessToken === null) return { authenticated: true, source: "no-auth" };

  // 1. Check session cookie
  const cookies = parseCookies(req.headers.cookie ?? "");
  if (cookies.clapps_session === accessToken) {
    return { authenticated: true, source: "cookie" };
  }

  // 2. Check Authorization: Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7);
    if (bearer === accessToken) {
      return { authenticated: true, source: "bearer" };
    }
  }

  return { authenticated: false };
}

/** Check WS upgrade requests — cookie or ?token= query param */
export function authenticateWsUpgrade(
  req: IncomingMessage,
  accessToken: string | null,
): boolean {
  if (accessToken === null) return true;

  // Check cookie
  const cookies = parseCookies(req.headers.cookie ?? "");
  if (cookies.clapps_session === accessToken) return true;

  // Check ?token= query param
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.searchParams.get("token") === accessToken) return true;

  return false;
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  }
  return cookies;
}

// --- Rate limiting ---

const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

/** Returns true if the request is allowed, false if rate-limited */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

// --- Session cookie ---

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  req: IncomingMessage,
  remember: boolean,
): void {
  const parts = [
    `clapps_session=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];

  if (remember) {
    parts.push(`Max-Age=${30 * 24 * 60 * 60}`); // 30 days
  }

  // Secure flag when behind HTTPS
  const proto = req.headers["x-forwarded-proto"];
  if (proto === "https") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

// --- Login page ---

export function getLoginPageHtml(error?: string): string {
  const errorBanner = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>clapps – Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0b;
      color: #e4e4e7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 380px;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .subtitle {
      color: #71717a;
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
    }
    .error {
      background: #451a1a;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      padding: 0.6rem 0.8rem;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #a1a1aa;
      margin-bottom: 0.4rem;
    }
    input[type="password"] {
      width: 100%;
      padding: 0.6rem 0.75rem;
      background: #09090b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      color: #e4e4e7;
      font-size: 0.95rem;
      font-family: "SF Mono", "Fira Code", monospace;
      letter-spacing: 0.05em;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="password"]:focus {
      border-color: #6366f1;
    }
    .remember {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1rem 0;
      font-size: 0.85rem;
      color: #a1a1aa;
    }
    .remember input { accent-color: #6366f1; }
    button {
      width: 100%;
      padding: 0.6rem;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #4f46e5; }
    .hint {
      margin-top: 1.25rem;
      font-size: 0.75rem;
      color: #52525b;
      line-height: 1.5;
    }
    .hint code {
      background: #27272a;
      padding: 0.15em 0.35em;
      border-radius: 4px;
      font-size: 0.7rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>clapps</h1>
    <p class="subtitle">Enter the access code to continue</p>
    ${errorBanner}
    <form method="POST" action="/auth/login">
      <label for="password">Access code</label>
      <input type="password" id="password" name="password" autofocus required
             placeholder="xxxx-xxxx-xxxx" autocomplete="current-password" />
      <div class="remember">
        <input type="checkbox" id="remember" name="remember" value="1" checked />
        <label for="remember" style="margin:0">Remember me for 30 days</label>
      </div>
      <button type="submit">Continue</button>
    </form>
    <p class="hint">
      The access code was displayed when the server started.<br />
      You can also find it at <code>~/.openclaw/workspace/ui/.access-token</code>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
