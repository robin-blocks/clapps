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

interface StatusInfo {
  setupRequired: boolean;
  message: string;
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
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await relayFetch(
          `/api/state/${encodeURIComponent(agentId)}/_status`,
          sessionToken,
        );
        if (!res.ok) return;
        const data = (await res.json()) as StatusInfo;
        if (!cancelled) setStatus(data);
      } catch {
        // ignore — status is optional
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agentId, sessionToken]);

  const showBanner = status?.setupRequired && !statusDismissed;

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
      <>
        {showBanner && <SetupWarningBanner message={status.message} onDismiss={() => setStatusDismissed(true)} />}
        <ClappProvider relayUrl={relayUrl} clappId="_home" agentId={agentId} sessionToken={sessionToken}>
          <div className="clapp-app">
            <AppRenderer spec={homeView.appSpec} modules={homeView.modules} />
          </div>
        </ClappProvider>
      </>
    );
  }

  return (
    <>
      {showBanner && <SetupWarningBanner message={status.message} onDismiss={() => setStatusDismissed(true)} />}
      <DefaultHomeGrid agentId={agentId} sessionToken={sessionToken} onOpenApp={onOpenApp} />
    </>
  );
}

function SetupWarningBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        margin: "0.75rem",
        padding: "0.75rem 1rem",
        background: "rgba(234, 179, 8, 0.12)",
        border: "1px solid rgba(234, 179, 8, 0.3)",
        borderRadius: 8,
        fontSize: "0.8125rem",
        lineHeight: 1.5,
        color: "var(--fg)",
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
      }}
    >
      <span style={{ flexShrink: 0, fontSize: "1rem" }}>&#x26A0;&#xFE0F;</span>
      <span style={{ flex: 1, whiteSpace: "pre-line" }}>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--muted)",
          fontSize: "1rem",
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
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
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setApps(data);
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
