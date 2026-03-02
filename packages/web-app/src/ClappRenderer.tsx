import { useEffect, useState, useCallback } from "react";
import {
  ClappProvider,
  useClappContext,
} from "@clapps/renderer";
import { useStore } from "zustand";
import { parseAppMd, parseViewMd } from "@clapps/core";
import type { AppSpec, ViewSpec } from "@clapps/core";
import type { ClappTransport } from "@clapps/transport";
import { AppRenderer } from "./components/AppRenderer";

interface ClappRendererProps {
  clappId: string;
  transport: ClappTransport;
}

export function ClappRenderer({ clappId, transport }: ClappRendererProps) {
  const serverUrl = window.location.origin;

  return (
    <ClappProvider serverUrl={serverUrl} clappId={clappId} transport={transport}>
      <div className="flex flex-col h-full">
        <DynamicView clappId={clappId} transport={transport} />
      </div>
    </ClappProvider>
  );
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
      const appMd = await transport.fetchView(`${clappId}.app`);

      if (!appMd) {
        setViewState({ status: "no-view" });
        return;
      }

      const appSpec = parseAppMd(appMd);

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
        <div className="h-full p-4 animate-pulse">
          <div className="space-y-4">
            <div className="h-8 w-40 rounded-md bg-muted" />
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-10 w-full rounded bg-muted" />
              <div className="h-10 w-full rounded bg-muted" />
              <div className="h-10 w-36 rounded bg-muted" />
            </div>
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-20 w-full rounded bg-muted" />
            </div>
          </div>
        </div>
      );
    case "no-view":
      return <StateInspector />;
    case "error":
      return (
        <div className="p-4">
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {viewState.message}
          </div>
          <div className="mt-4">
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
    <div className="p-4">
      <div className="text-xs text-muted-foreground mb-3 italic">
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
    return <div className="text-muted-foreground text-sm">Waiting for state...</div>;
  }

  if (!state || Object.keys(state).length === 0) {
    return <div className="text-muted-foreground text-sm">No state available.</div>;
  }

  return (
    <div className="font-mono text-xs leading-relaxed">
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
          <div className="text-muted-foreground font-semibold">{fullPath}</div>
          <div className="pl-4">
            {renderEntries(value as Record<string, unknown>, fullPath)}
          </div>
        </div>
      );
    }

    return (
      <div key={fullPath} className="flex gap-2 py-0.5">
        <span className="text-muted-foreground">{fullPath}:</span>
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
      </div>
    );
  });
}
