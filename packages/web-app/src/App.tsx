import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { ClappTransport } from "@clapps/transport";
import type { AppEntry } from "@clapps/core";
import { HomeScreen } from "./HomeScreen";
import { ClappRenderer } from "./ClappRenderer";

function getServerUrl(): string {
  return window.location.origin;
}

function AppRoutes({ transport, apps }: { transport: ClappTransport; apps: AppEntry[] }) {
  return (
    <Routes>
      <Route path="/" element={<AppLauncher transport={transport} apps={apps} />} />
      <Route path="/apps/:appId" element={<AppView transport={transport} apps={apps} />} />
    </Routes>
  );
}

function AppLauncher({ transport, apps }: { transport: ClappTransport; apps: AppEntry[] }) {
  const navigate = useNavigate();

  const openApp = (clappId: string) => {
    navigate(`/apps/${clappId}`);
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <header className="flex items-center justify-center px-4 py-3 border-b border-border shrink-0">
        <h1 className="text-lg font-bold tracking-tight">clapps</h1>
      </header>
      <HomeScreen apps={apps} transport={transport} onOpenApp={openApp} />
    </div>
  );
}

function AppView({ transport, apps }: { transport: ClappTransport; apps: AppEntry[] }) {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const goHome = () => {
    navigate("/");
  };

  const activeAppInfo = apps.find((a) => a.id === appId);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <header className="flex items-center px-4 py-3 border-b border-border shrink-0 min-h-[52px]">
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

        <div className="flex-1 text-center">
          <span className="text-sm font-semibold">
            {activeAppInfo?.emoji && (
              <span className="mr-1.5">{activeAppInfo.emoji}</span>
            )}
            {activeAppInfo?.name ?? appId}
          </span>
        </div>

        <div className="w-[60px]" />
      </header>

      {appId && (
        <div className="flex-1 overflow-hidden">
          <ClappRenderer clappId={appId} transport={transport} />
        </div>
      )}
    </div>
  );
}

export function App() {
  const transportRef = useRef<ClappTransport>(undefined);

  if (!transportRef.current) {
    transportRef.current = new ClappTransport({
      serverUrl: getServerUrl(),
      context: { platform: "web" },
    });
  }

  const transport = transportRef.current;
  const [apps, setApps] = useState<AppEntry[]>([]);

  useEffect(() => {
    transport.connect();

    const unsubApps = transport.onApps((newApps) => {
      setApps(newApps);
    });

    transport.fetchApps().then(setApps).catch(() => {});

    return () => {
      unsubApps();
      transport.disconnect();
    };
  }, [transport]);

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <BrowserRouter>
        <AppRoutes transport={transport} apps={apps} />
      </BrowserRouter>
    </div>
  );
}
