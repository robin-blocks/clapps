"use client";

import { useClappState, useIntent } from "@clapps/renderer";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";

/**
 * Hardcoded workspace viewer component.
 * In the future this will be dynamically rendered from APP.md / VIEW.md definitions,
 * but for Phase 1 we build it directly as a React component that uses the
 * same state paths and intent names that the parsed DSL would produce.
 */
export function WorkspaceViewer() {
  const { emit } = useIntent();

  // Auto-list files on mount
  useEffect(() => {
    emit("workspace.list");
  }, []);

  return (
    <div className="clapp-app" style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <FileListPanel />
      <FileViewerPanel />
    </div>
  );
}

function FileListPanel() {
  const files = useClappState<string[]>("workspace.files") ?? [];
  const currentFile = useClappState<string | null>("workspace.current.filename");
  const loading = useClappState<boolean>("workspace.loading");
  const { emit } = useIntent();

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h3
          className="clapp-heading"
          style={{ fontSize: "0.875rem" }}
        >
          Workspace Files
        </h3>
        <button
          className="clapp-btn clapp-btn-ghost clapp-btn-sm"
          onClick={() => emit("workspace.list")}
        >
          ↻
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.25rem" }}>
        {loading ? (
          <div className="clapp-skeleton" style={{ padding: "0.5rem" }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="clapp-skeleton-line" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="clapp-empty">No files found</div>
        ) : (
          <ul className="clapp-list">
            {files.map((file) => (
              <li
                key={file}
                className={`clapp-list-item${file === currentFile ? " active" : ""}`}
                onClick={() => emit("workspace.read", { filename: file })}
                role="button"
              >
                <span className="clapp-icon">📄</span>
                {file}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileViewerPanel() {
  const filename = useClappState<string | null>("workspace.current.filename");
  const content = useClappState<string | null>("workspace.current.content");

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {filename && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
            fontSize: "0.875rem",
            fontFamily: "var(--font-mono)",
          }}
        >
          {filename}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
        {content ? (
          <div className="clapp-markdown">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="clapp-empty">
            {filename ? "Loading..." : "Select a file to view"}
          </div>
        )}
      </div>
    </div>
  );
}
