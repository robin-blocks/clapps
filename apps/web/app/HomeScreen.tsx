"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClappProvider,
  AppRenderer,
} from "@clapps/renderer";
import { parseAppMd, parseViewMd } from "@clapps/core";
import type { AppSpec, ViewSpec } from "@clapps/core";
import { relayFetch } from "@/lib/relay-fetch";

interface AppEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  icon: string;
  tags: string[];
  pinned: boolean;
}

interface HomeScreenProps {
  agentId: string;
  sessionToken?: string;
  onOpenApp: (clappId: string) => void;
}

export function HomeScreen({ agentId, sessionToken, onOpenApp }: HomeScreenProps) {
  const [homeView, setHomeView] = useState<{
    appSpec: AppSpec;
    modules: ViewSpec[];
  } | null>(null);
  const [checked, setChecked] = useState(false);

  const fetchHomeView = useCallback(async () => {
    try {
      const appRes = await relayFetch(
        `/api/views/${encodeURIComponent(agentId)}/_home.app`,
        sessionToken,
      );
      if (appRes.status === 404 || !appRes.ok) {
        setHomeView(null);
        setChecked(true);
        return;
      }

      const appMarkdown = await appRes.text();
      const appSpec = parseAppMd(appMarkdown);

      const moduleResults = await Promise.all(
        appSpec.modules.map(async (moduleRef) => {
          const viewId = moduleRef.replace("/", ".");
          const modRes = await relayFetch(
            `/api/views/${encodeURIComponent(agentId)}/${encodeURIComponent(viewId)}.view`,
            sessionToken,
          );
          if (!modRes.ok) return null;
          const markdown = await modRes.text();
          return parseViewMd(markdown);
        })
      );

      const modules = moduleResults.filter((m): m is ViewSpec => m !== null);
      setHomeView({ appSpec, modules });
    } catch {
      setHomeView(null);
    } finally {
      setChecked(true);
    }
  }, [agentId, sessionToken]);

  useEffect(() => {
    fetchHomeView();
    const interval = setInterval(fetchHomeView, 10000);
    return () => clearInterval(interval);
  }, [fetchHomeView]);

  if (!checked) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "0.875rem", padding: "2rem", textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  if (homeView) {
    const relayUrl = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <ClappProvider relayUrl={relayUrl} clappId="_home" agentId={agentId} sessionToken={sessionToken}>
        <div className="clapp-app">
          <AppRenderer spec={homeView.appSpec} modules={homeView.modules} />
        </div>
      </ClappProvider>
    );
  }

  return <DefaultHomeGrid agentId={agentId} sessionToken={sessionToken} onOpenApp={onOpenApp} />;
}

function DefaultHomeGrid({
  agentId,
  sessionToken,
  onOpenApp,
}: {
  agentId: string;
  sessionToken?: string;
  onOpenApp: (clappId: string) => void;
}) {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchApps() {
      try {
        const res = await relayFetch(
          `/api/apps/${encodeURIComponent(agentId)}`,
          sessionToken,
        );
        const data = await res.json();
        if (!cancelled) setApps(data);
      } catch {
        if (!cancelled) setApps([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchApps();
    const interval = setInterval(fetchApps, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agentId, sessionToken]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          Loading apps...
        </p>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          No apps registered yet.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 76px)",
          gap: "1.5rem",
          justifyContent: "center",
        }}
      >
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onOpenApp(app.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.375rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--fg)",
              padding: 0,
              font: "inherit",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, var(--card-bg) 0%, var(--hover-bg, var(--card-bg)) 100%)",
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
          </button>
        ))}
      </div>
    </div>
  );
}
