"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ClappProvider,
  useClappLoading,
  useClappContext,
  AppRenderer,
} from "@clapps/renderer";
import { useStore } from "zustand";
import { parseAppMd, parseViewMd } from "@clapps/core";
import type { AppSpec, ViewSpec } from "@clapps/core";

interface ClappRendererProps {
  clappId: string;
  agentId: string;
  homeHref?: string;
}

export function ClappRenderer({ clappId, agentId, homeHref }: ClappRendererProps) {
  const relayUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <ClappProvider relayUrl={relayUrl} clappId={clappId} agentId={agentId}>
      <div className="clapp-shell">
        <ClappHeader clappId={clappId} agentId={agentId} homeHref={homeHref} />
        <DynamicView clappId={clappId} agentId={agentId} />
      </div>
    </ClappProvider>
  );
}

function ClappHeader({
  clappId,
  agentId,
  homeHref,
}: {
  clappId: string;
  agentId: string;
  homeHref?: string;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {homeHref && (
          <a
            href={homeHref}
            style={{
              color: "var(--accent)",
              fontSize: "0.8125rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.125rem",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </a>
        )}
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{clappId}</span>
      </div>
      <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
        <LoadingIndicator />
        {agentId}
      </span>
    </header>
  );
}

function LoadingIndicator() {
  const loading = useClappLoading();
  if (!loading) return null;
  return <span style={{ marginRight: "0.5rem" }}>connecting...</span>;
}

// --- Dynamic view fetching + rendering ---

type ViewState =
  | { status: "loading" }
  | { status: "no-view" }
  | { status: "error"; message: string }
  | { status: "ready"; appSpec: AppSpec; modules: ViewSpec[] };

function DynamicView({
  clappId,
  agentId,
}: {
  clappId: string;
  agentId: string;
}) {
  const [viewState, setViewState] = useState<ViewState>({ status: "loading" });

  const fetchViews = useCallback(async () => {
    try {
      // Fetch the app definition
      const appRes = await fetch(
        `/api/views/${encodeURIComponent(agentId)}/${encodeURIComponent(clappId)}.app`
      );

      if (appRes.status === 404) {
        setViewState({ status: "no-view" });
        return;
      }

      if (!appRes.ok) {
        setViewState({
          status: "error",
          message: `Failed to fetch app definition: ${appRes.status}`,
        });
        return;
      }

      const appMarkdown = await appRes.text();
      const appSpec = parseAppMd(appMarkdown);

      // Fetch each module view in parallel
      const modules: ViewSpec[] = [];
      const moduleResults = await Promise.all(
        appSpec.modules.map(async (moduleRef) => {
          // Module refs are "domain/name" — the viewId is the full ref
          const viewId = moduleRef.replace("/", ".");
          const modRes = await fetch(
            `/api/views/${encodeURIComponent(agentId)}/${encodeURIComponent(viewId)}.view`
          );
          if (!modRes.ok) return null;
          const markdown = await modRes.text();
          return parseViewMd(markdown);
        })
      );

      for (const mod of moduleResults) {
        if (mod) modules.push(mod);
      }

      setViewState({ status: "ready", appSpec, modules });
    } catch (err) {
      setViewState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load views",
      });
    }
  }, [clappId, agentId]);

  useEffect(() => {
    fetchViews();

    // Re-fetch views periodically in case the agent updates them
    const interval = setInterval(fetchViews, 10000);
    return () => clearInterval(interval);
  }, [fetchViews]);

  switch (viewState.status) {
    case "loading":
      return (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          Loading view...
        </div>
      );
    case "no-view":
      return <StateInspector />;
    case "error":
      return (
        <div style={{ padding: "1rem" }}>
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "var(--error-bg, #fef2f2)",
              color: "var(--error, #dc2626)",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
            }}
          >
            {viewState.message}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <StateInspector />
          </div>
        </div>
      );
    case "ready":
      return <AppRenderer spec={viewState.appSpec} modules={viewState.modules} />;
  }
}

// --- Fallback state inspector ---

function StateInspector() {
  return (
    <div style={{ padding: "1rem" }}>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--muted)",
          marginBottom: "0.75rem",
          fontStyle: "italic",
        }}
      >
        No view definition found. Showing raw state:
      </div>
      <StateTree />
    </div>
  );
}

function StateTree() {
  const { store } = useClappContext();
  const state = useStore(store, (s) => s.state);
  const loading = useClappLoading();

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
        Waiting for state...
      </div>
    );
  }

  if (!state || Object.keys(state).length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
        No state available.
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "0.8125rem",
        lineHeight: "1.6",
      }}
    >
      {renderEntries(state, "")}
    </div>
  );
}

function renderEntries(
  obj: Record<string, unknown>,
  prefix: string
): React.ReactNode[] {
  return Object.entries(obj).map(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return (
        <div key={fullPath}>
          <div style={{ color: "var(--muted)", fontWeight: 600 }}>
            {fullPath}
          </div>
          <div style={{ paddingLeft: "1rem" }}>
            {renderEntries(value as Record<string, unknown>, fullPath)}
          </div>
        </div>
      );
    }

    return (
      <div
        key={fullPath}
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.125rem 0",
        }}
      >
        <span style={{ color: "var(--muted)" }}>{fullPath}:</span>
        <span style={{ color: "var(--foreground)" }}>
          {typeof value === "string" ? value : JSON.stringify(value)}
        </span>
      </div>
    );
  });
}
