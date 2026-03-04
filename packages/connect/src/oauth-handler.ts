import { randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:http";

interface OAuthState {
  provider: string;
  customName?: string;
  codeVerifier: string;
  state: string;
  timestamp: number;
}

interface AuthProfile {
  type: string;
  provider: string;
  token?: string;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
  customName?: string;
}

interface AuthProfilesFile {
  version?: number;
  profiles: Record<string, AuthProfile>;
}

export class OAuthHandler {
  private pendingStates = new Map<string, OAuthState>();
  private authProfilesPath: string;
  private callbackPort = 1455;
  private callbackServer: any = null;

  constructor(authProfilesPath?: string) {
    this.authProfilesPath =
      authProfilesPath ??
      resolve(homedir(), ".openclaw", "agents", "main", "agent", "auth-profiles.json");

    // Clean up old states every 5 minutes
    setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);

    // Start callback server on port 1455
    this.startCallbackServer();
  }

  private startCallbackServer(): void {
    this.callbackServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      
      console.log(`[oauth] Received callback: ${req.method} ${url.pathname}`);
      
      if (url.pathname === "/auth/callback" && req.method === "GET") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        console.log(`[oauth] Callback params: code=${code ? 'present' : 'missing'}, state=${state?.substring(0, 10)}..., error=${error}`);

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(this.getResultPage(false, `OAuth error: ${error} - ${errorDescription || 'No description'}`));
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(this.getResultPage(false, "Missing code or state parameter"));
          return;
        }

        // Handle callback asynchronously
        this.handleCallback(code, state)
          .then((result) => {
            if (result.success) {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(this.getResultPage(true));
            } else {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(this.getResultPage(false, result.error));
            }
          })
          .catch((error) => {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(this.getResultPage(false, error instanceof Error ? error.message : "Unknown error"));
          });
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    this.callbackServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[oauth] Port ${this.callbackPort} already in use (Codex CLI may be running)`);
      } else {
        console.error(`[oauth] Callback server error:`, err);
      }
    });

    this.callbackServer.listen(this.callbackPort, "127.0.0.1", () => {
      console.log(`[oauth] Callback server listening on http://127.0.0.1:${this.callbackPort}`);
    });
  }

  private getResultPage(success: boolean, error?: string): string {
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

  private cleanupExpiredStates(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    for (const [state, data] of this.pendingStates.entries()) {
      if (now - data.timestamp > maxAge) {
        this.pendingStates.delete(state);
      }
    }
  }

  stop(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
    }
  }

  private generatePKCE(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return { verifier, challenge };
  }

  /** Initiate OAuth flow - returns auth URL */
  initOAuth(provider: string, customName?: string): { authUrl: string } {
    const { verifier, challenge } = this.generatePKCE();
    const state = randomBytes(16).toString("base64url");

    this.pendingStates.set(state, {
      provider,
      customName,
      codeVerifier: verifier,
      state,
      timestamp: Date.now(),
    });

    // Build OAuth URL based on provider
    const authUrl = this.buildAuthUrl(provider, challenge, state);

    console.log(`[oauth] Generated OAuth URL for ${provider}:`);
    console.log(`  State: ${state}`);
    console.log(`  Challenge: ${challenge.substring(0, 20)}...`);
    console.log(`  URL: ${authUrl}`);

    return { authUrl };
  }

  private buildAuthUrl(provider: string, challenge: string, state: string): string {
    // OpenAI Codex OAuth
    if (provider === "openai-codex" || provider === "openai") {
      const params = new URLSearchParams({
        client_id: "codex-cli",
        redirect_uri: "http://127.0.0.1:1455/auth/callback",
        response_type: "code",
        scope: "openid profile email offline_access",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      return `https://auth.openai.com/oauth/authorize?${params}`;
    }

    throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  /** Handle OAuth callback - exchange code for tokens */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ success: boolean; error?: string }> {
    const oauthState = this.pendingStates.get(state);
    if (!oauthState) {
      return { success: false, error: "Invalid or expired OAuth state" };
    }

    this.pendingStates.delete(state);

    try {
      const tokens = await this.exchangeCodeForTokens(
        oauthState.provider,
        code,
        oauthState.codeVerifier,
      );

      this.saveToAuthProfiles(oauthState.provider, tokens, oauthState.customName);

      return { success: true };
    } catch (error) {
      console.error("[oauth] Token exchange failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Token exchange failed",
      };
    }
  }

  private async exchangeCodeForTokens(
    provider: string,
    code: string,
    codeVerifier: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token?: string;
  }> {
    if (provider === "openai-codex" || provider === "openai") {
      const response = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "codex-cli",
          code,
          code_verifier: codeVerifier,
          redirect_uri: "http://127.0.0.1:1455/auth/callback",
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${text}`);
      }

      return await response.json();
    }

    throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  private saveToAuthProfiles(
    provider: string,
    tokens: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      id_token?: string;
    },
    customName?: string,
  ): void {
    let profiles: AuthProfilesFile = { version: 1, profiles: {} };

    try {
      if (existsSync(this.authProfilesPath)) {
        profiles = JSON.parse(readFileSync(this.authProfilesPath, "utf-8"));
      }
    } catch {
      // Start fresh
    }

    // Extract accountId from id_token if available
    let accountId: string | undefined;
    if (tokens.id_token) {
      try {
        const payload = tokens.id_token.split(".")[1];
        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
        accountId = decoded.sub || decoded.account_id;
      } catch {
        // Ignore
      }
    }

    // Generate profile ID
    const normalizedProvider = provider === "openai" ? "openai-codex" : provider;
    const profileId = customName
      ? `${normalizedProvider}:${customName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
      : `${normalizedProvider}:default`;

    profiles.profiles[profileId] = {
      type: "oauth",
      provider: normalizedProvider,
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expires: Date.now() + tokens.expires_in * 1000,
      accountId,
      customName,
    };

    writeFileSync(this.authProfilesPath, JSON.stringify(profiles, null, 2), "utf-8");
    console.log(`✅ Saved OAuth tokens for ${profileId}`);
  }

  /** Check if an OAuth flow is pending */
  isPending(state: string): boolean {
    return this.pendingStates.has(state);
  }
}
