import { useState, useEffect, useCallback, useRef } from "react";
import { ClappTransport } from "@clapps/transport";
import type { AppEntry } from "@clapps/core";
import { HomeScreen } from "./HomeScreen";
import { ClappRenderer } from "./ClappRenderer";
import { cn } from "./lib/utils";

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

    const unsub = transport.onApps((newApps) => {
      setApps(newApps);
    });

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

  // Find app info for the active app
  const activeAppInfo = apps.find((a) => a.id === activeApp);

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      {/* Home screen layer */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-y-auto transition-all duration-300 ease-out z-10",
          activeApp && "translate-x-[-30%] opacity-0 pointer-events-none"
        )}
      >
        <header className="flex items-center justify-center px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-lg font-bold tracking-tight">clapps</h1>
        </header>

        <HomeScreen apps={apps} transport={transport} onOpenApp={openApp} />
      </div>

      {/* App layer */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden transition-all duration-300 ease-out z-20",
          activeApp
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0 pointer-events-none"
        )}
      >
        {/* Proper navigation header */}
        <header className="flex items-center px-4 py-3 border-b border-border shrink-0 min-h-[52px]">
          {/* Back button - left aligned */}
          <button
            onClick={goHome}
            className="flex items-center gap-0.5 text-primary text-sm font-medium -ml-1 pr-2"
            aria-label="Back to home"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M12.5 15L7.5 10L12.5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Home
          </button>

          {/* App title - centered with flex-1 */}
          <div className="flex-1 text-center">
            <span className="text-sm font-semibold">
              {activeAppInfo?.emoji && (
                <span className="mr-1.5">{activeAppInfo.emoji}</span>
              )}
              {activeAppInfo?.name ?? activeApp}
            </span>
          </div>

          {/* Right spacer for centering */}
          <div className="w-[60px]" />
        </header>

        {/* App content */}
        {activeApp && (
          <div className="flex-1 overflow-hidden">
            <ClappRenderer clappId={activeApp} transport={transport} />
          </div>
        )}
      </div>
    </div>
  );
}
