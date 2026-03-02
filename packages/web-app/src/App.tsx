import { useState, useEffect, useCallback, useRef } from "react";
import { ClappTransport } from "@clapps/transport";
import type { AppEntry } from "@clapps/core";
import { HomeScreen } from "./HomeScreen";
import { ClappRenderer } from "./ClappRenderer";

/** Derive the server URL — same origin in production, proxied in dev */
function getServerUrl(): string {
  return window.location.origin;
}

export function App() {
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const transportRef = useRef<ClappTransport>(undefined);

  if (!transportRef.current) {
    transportRef.current = new ClappTransport({
      serverUrl: getServerUrl(),
      context: { platform: "web" },
    });
  }

  const transport = transportRef.current;

  useEffect(() => {
    transport.connect();

    // Listen for app registry updates
    const unsub = transport.onApps((newApps) => {
      setApps(newApps);
    });

    // Initial fetch
    transport.fetchApps().then(setApps).catch(() => {});

    return () => {
      unsub();
      transport.disconnect();
    };
  }, [transport]);

  const openApp = useCallback((clappId: string) => {
    setActiveApp(clappId);
  }, []);

  const goHome = useCallback(() => {
    setActiveApp(null);
  }, []);

  return (
    <div className="home-shell">
      {/* Home screen layer */}
      <div className={`home-shell-layer home-screen-layer ${activeApp ? "home-screen-hidden" : ""}`}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            clapps
          </h1>
        </header>

        <HomeScreen apps={apps} transport={transport} onOpenApp={openApp} />
      </div>

      {/* App layer */}
      {activeApp && (
        <div className="home-shell-layer app-layer app-layer-visible">
          <button
            onClick={goHome}
            className="app-back-btn"
            aria-label="Back to home"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
          <ClappRenderer clappId={activeApp} transport={transport} />
        </div>
      )}
    </div>
  );
}
