"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import appsData from "./apps.json";

const STORAGE_KEY = "clapps:agentId";

interface AppEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  pinned: boolean;
}

const apps: AppEntry[] = appsData;

const ICONS: Record<string, string> = {
  "folder-open": "\uD83D\uDCC2",
};

export default function Home() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setAgentId(stored);
    setLoaded(true);
  }, []);

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
          padding: "2rem 1.5rem",
          maxWidth: "48rem",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <h2
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "1rem",
          }}
        >
          Apps
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
            gap: "0.75rem",
          }}
        >
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/apps/${app.id}?agent=${agentId}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "1rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--card-bg)",
                color: "var(--fg)",
                textDecoration: "none",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--card-bg)";
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>
                {ICONS[app.icon] ?? app.icon}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {app.name}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                  {app.description}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
