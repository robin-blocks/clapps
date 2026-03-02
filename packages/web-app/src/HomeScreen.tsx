import { useState, useEffect } from "react";
import type { AppEntry, ClappState } from "@clapps/core";
import type { ClappTransport } from "@clapps/transport";

interface StatusInfo {
  setupRequired: boolean;
  message: string;
}

interface HomeScreenProps {
  apps: AppEntry[];
  transport: ClappTransport;
  onOpenApp: (clappId: string) => void;
}

export function HomeScreen({ apps, transport, onOpenApp }: HomeScreenProps) {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [statusDismissed, setStatusDismissed] = useState(false);

  useEffect(() => {
    // Fetch initial status
    transport.fetchState("_status").then((data) => {
      if (data?.state) setStatus(data.state as unknown as StatusInfo);
    }).catch(() => {});

    // Listen for status updates via WS
    const unsub = transport.onState((clappId, state: ClappState) => {
      if (clappId === "_status" && state.state) {
        setStatus(state.state as unknown as StatusInfo);
      }
    });

    return unsub;
  }, [transport]);

  const showBanner = status?.setupRequired && !statusDismissed;

  return (
    <>
      {showBanner && (
        <SetupWarningBanner
          message={status.message}
          onDismiss={() => setStatusDismissed(true)}
        />
      )}
      <DefaultHomeGrid apps={apps} onOpenApp={onOpenApp} />
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
  apps,
  onOpenApp,
}: {
  apps: AppEntry[];
  onOpenApp: (clappId: string) => void;
}) {
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
