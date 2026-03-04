import { useState } from "react";
import { useIntent } from "@clapps/renderer";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AccountCardProps {
  item: {
    id: string;
    mode: string;
    enabled: boolean;
    botToken: string;
  };
}

export function AccountCard({ item }: AccountCardProps) {
  const { emit } = useIntent();
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <Card className={cn("p-4", !item.enabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{item.id}</span>
            {!item.enabled && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Disabled</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {item.mode === "socket" ? "Socket Mode" : "HTTP Mode"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Token: {item.botToken}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => emit("slack.disableAccount", { accountId: item.id })}
            className="px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80"
          >
            {item.enabled ? "Disable" : "Enable"}
          </button>
          {confirmRemove ? (
            <>
              <button
                onClick={() => {
                  emit("slack.deleteAccount", { accountId: item.id });
                  setConfirmRemove(false);
                }}
                className="px-3 py-1 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="px-3 py-1 text-sm rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
