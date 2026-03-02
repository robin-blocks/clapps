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
import type { ClappTransport } from "@clapps/transport";

interface ClappRendererProps {
  clappId: string;
  transport: ClappTransport;
}

export function ClappRenderer({ clappId, transport }: ClappRendererProps) {
  const serverUrl = window.location.origin;

  return (
    <ClappProvider serverUrl={serverUrl} clappId={clappId} transport={transport}>
      <div className="clapp-shell">
        <ClappHeader clappId={clappId} />
        <DynamicView clappId={clappId} transport={transport} />
      </div>
    </ClappProvider>
  );
}

function ClappHeader({ clappId }: { clappId: string }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        paddingLeft: "5.5rem", // leave space for back button
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{clappId}</span>
      <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
        <LoadingIndicator />
      </span>
    </header>
  );
}

function LoadingIndicator() {
  const loading = useClappLoading();
  if (!loading) return null;
  return <span>connecting...</span>;
}

// --- Dynamic view fetching + rendering ---

type ViewState =
  | { status: "loading" }
  | { status: "no-view" }
  | { status: "error"; message: string }
  | { status: "ready"; appSpec: AppSpec; modules: ViewSpec[] };

function DynamicView({
  clappId,
  transport,
}: {
  clappId: string;
  transport: ClappTransport;
}) {
  const [viewState, setViewState] = useState<ViewState>({ status: "loading" });

  const fetchViews = useCallback(async () => {
    try {
      // Fetch the app definition
      const appMd = await transport.fetchView(`${clappId}.app`);

      if (!appMd) {
        setViewState({ status: "no-view" });
        return;
      }

      const appSpec = parseAppMd(appMd);

      // Fetch each module view in parallel
      const moduleResults = await Promise.all(
        appSpec.modules.map(async (moduleRef) => {
          const viewId = moduleRef.replace("/", ".");
          const md = await transport.fetchView(`${viewId}.view`);
          if (!md) return null;
          return parseViewMd(md);
        })
      );

      const modules = moduleResults.filter((m): m is ViewSpec => m !== null);
      setViewState({ status: "ready", appSpec, modules });
    } catch (err) {
      setViewState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load views",
      });
    }
  }, [clappId, transport]);

  useEffect(() => {
    fetchViews();

    // Also re-fetch when views update via WS
    const unsub = transport.onView((viewId) => {
      if (viewId === `${clappId}.app` || viewId.endsWith(".view")) {
        fetchViews();
      }
    });

    return unsub;
  }, [fetchViews, transport, clappId]);

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
              background: "rgba(220, 38, 38, 0.1)",
              color: "#ef4444",
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
        <span>
          {typeof value === "string" ? value : JSON.stringify(value)}
        </span>
      </div>
    );
  });
}
