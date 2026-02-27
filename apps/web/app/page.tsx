"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "clapps:agentId";

interface AppEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  icon: string;
  tags: string[];
  pinned: boolean;
}

export default function Home() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  useEffect(() => {
    // Priority: URL param → localStorage → prompt
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("agentId");
    if (fromUrl) {
      const val = fromUrl.trim().toLowerCase();
      localStorage.setItem(STORAGE_KEY, val);
      setAgentId(val);
      // Clean the URL so it doesn't stick around
      url.searchParams.delete("agentId");
      window.history.replaceState({}, "", url.pathname);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAgentId(stored);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!agentId) {
      setApps([]);
      return;
    }
    setAppsLoading(true);
    fetch(`/api/apps/${agentId}`)
      .then((res) => res.json())
      .then((data) => setApps(data))
      .catch(() => setApps([]))
      .finally(() => setAppsLoading(false));
  }, [agentId]);

  function saveAgentId() {
    const val = input.trim().toLowerCase();
    if (!val) return;
    localStorage.setItem(STORAGE_KEY, val);
    setAgentId(val);
  }

  function clearAgentId() {
    localStorage.removeItem(STORAGE_KEY);
    setAgentId(null);
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid var(--border)",
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

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
        }}
      >
        {appsLoading ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Loading apps...
          </p>
        ) : apps.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            No apps registered yet.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 76px)",
              gap: "1.5rem",
              justifyContent: "center",
            }}
          >
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/apps/${app.id}?agent=${agentId}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.375rem",
                  textDecoration: "none",
                  color: "var(--fg)",
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 14,
                    background: "linear-gradient(135deg, var(--card-bg) 0%, var(--hover-bg, var(--card-bg)) 100%)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.75rem",
                  }}
                >
                  {app.emoji}
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    textAlign: "center",
                    lineHeight: 1.2,
                    maxWidth: 76,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {app.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
