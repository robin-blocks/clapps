"use client";

import { ClappProvider, useClappLoading } from "@clapps/renderer";
import { WorkspaceViewer } from "./WorkspaceViewer";

interface ClappRendererProps {
  clappId: string;
  agentId: string;
}

export function ClappRenderer({ clappId, agentId }: ClappRendererProps) {
  const relayUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <ClappProvider relayUrl={relayUrl} clappId={clappId} agentId={agentId}>
      <div className="clapp-shell">
        <ClappHeader clappId={clappId} agentId={agentId} />
        <WorkspaceViewer />
      </div>
    </ClappProvider>
  );
}

function ClappHeader({ clappId, agentId }: { clappId: string; agentId: string }) {
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
      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
        {clappId}
      </span>
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
  return (
    <span style={{ marginRight: "0.5rem" }}>
      connecting...
    </span>
  );
}
