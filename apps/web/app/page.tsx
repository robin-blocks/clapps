"use client";

import { useState, useEffect, useCallback } from "react";
import { ClappRenderer } from "./apps/[clappId]/ClappRenderer";
import { HomeScreen } from "./HomeScreen";

const STORAGE_KEY = "clapps:agentId";
const SESSION_STORAGE_KEY = "clapps:session";

export default function Home() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [activeApp, setActiveApp] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("agentId");
    const sessionFromUrl = url.searchParams.get("session");

    if (sessionFromUrl) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionFromUrl);
      setSessionToken(sessionFromUrl);
      url.searchParams.delete("session");
    } else {
      const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (storedSession) setSessionToken(storedSession);
    }

    if (fromUrl) {
      const val = fromUrl.trim().toLowerCase();
      localStorage.setItem(STORAGE_KEY, val);
      setAgentId(val);
      url.searchParams.delete("agentId");
      window.history.replaceState({}, "", url.pathname);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAgentId(stored);
      // Clean URL if session param was present
      if (sessionFromUrl) {
        window.history.replaceState({}, "", url.pathname);
      }
    }
    setLoaded(true);
  }, []);

  const openApp = useCallback((clappId: string) => {
    setActiveApp(clappId);
  }, []);

  const goHome = useCallback(() => {
    setActiveApp(null);
  }, []);

  function saveAgentId() {
    const val = input.trim().toLowerCase();
    if (!val) return;
    localStorage.setItem(STORAGE_KEY, val);
    setAgentId(val);
  }

  function clearAgentId() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setAgentId(null);
    setSessionToken(undefined);
    setActiveApp(null);
    setInput("");
  }

  if (!loaded) return null;

  if (!agentId) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: "1.5rem",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
          clapps
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: "40ch", textAlign: "center" }}>
          Enter your agent ID to get started.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveAgentId();
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. robin"
            autoFocus
            style={{
              padding: "0.625rem 1rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--card-bg)",
              color: "var(--fg)",
              fontSize: "0.875rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
              width: "16rem",
            }}
          />
          <button
            type="submit"
            className="clapp-btn clapp-btn-md"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            Connect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="home-shell">
      {/* Home screen layer */}
      <div className={`home-shell-layer home-screen-layer ${activeApp ? "home-screen-hidden" : ""}`}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            clapps
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontFamily: "var(--font-mono)",
                color: "var(--muted)",
              }}
            >
              {agentId}
            </span>
            <button
              onClick={clearAgentId}
              className="clapp-btn clapp-btn-ghost clapp-btn-sm"
              style={{ color: "var(--muted)", fontSize: "0.75rem" }}
            >
              change
            </button>
          </div>
        </header>

        <HomeScreen agentId={agentId} sessionToken={sessionToken} onOpenApp={openApp} />
      </div>

      {/* App layer */}
      {activeApp && (
        <div className="home-shell-layer app-layer app-layer-visible">
          <button
            onClick={goHome}
            className="app-back-btn"
            aria-label="Back to home"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
          <ClappRenderer clappId={activeApp} agentId={agentId} sessionToken={sessionToken} />
        </div>
      )}
    </div>
  );
}
