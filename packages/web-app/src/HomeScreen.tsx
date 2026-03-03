import { useState, useEffect } from "react";
import type { AppEntry, ClappState } from "@clapps/core";
import type { ClappTransport } from "@clapps/transport";
import { Button } from "./components/ui/button";
import { X } from "lucide-react";

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
    transport.fetchState("_status").then((data) => {
      if (data?.state) setStatus(data.state as unknown as StatusInfo);
    }).catch(() => {});

    const unsub = transport.onState((clappId, state: ClappState) => {
      if (clappId === "_status" && state.state) {
        setStatus(state.state as unknown as StatusInfo);
      }
    });

    return unsub;
  }, [transport]);

  const showBanner = status?.setupRequired && !statusDismissed;

  return (
    <div className="flex flex-col h-full">
      {showBanner && (
        <SetupWarningBanner
          message={status.message}
          onDismiss={() => setStatusDismissed(true)}
        />
      )}
      <DefaultHomeGrid apps={apps} onOpenApp={onOpenApp} />
    </div>
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
    <div className="m-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm flex gap-3 items-start">
      <span className="shrink-0 text-base">⚠️</span>
      <span className="flex-1 whitespace-pre-line">{message}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
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
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8">
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-6 max-w-6xl">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 animate-pulse"
            >
              <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] lg:w-[90px] lg:h-[90px] rounded-2xl bg-muted" />
              <div className="h-2.5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8">
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-6 max-w-6xl">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onOpenApp(app.id)}
            className="flex flex-col items-center gap-2 bg-transparent border-none cursor-pointer text-foreground p-0 font-inherit group"
          >
            <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] lg:w-[90px] lg:h-[90px] rounded-[18px] sm:rounded-[20px] lg:rounded-[22px] bg-gradient-to-br from-card to-accent/20 border border-border flex items-center justify-center text-[2rem] sm:text-[2.25rem] lg:text-[2.5rem] transition-all group-hover:scale-105 active:scale-95 shadow-sm"
              style={{ 
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)'
              }}
            >
              {app.emoji}
            </div>
            <span className="text-[11px] sm:text-[12px] text-center leading-tight max-w-[90px] line-clamp-2 opacity-90">
              {app.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
