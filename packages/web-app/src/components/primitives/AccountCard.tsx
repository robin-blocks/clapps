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

  return (
    <Card className={cn("p-4", !item.enabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-semibold">{item.id}</div>
          <div className="text-sm text-muted-foreground">
            {item.mode === "socket" ? "Socket Mode" : "HTTP Mode"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Token: {item.botToken}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => emit("slack.testAccount", { accountId: item.id })}
            className="px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80"
          >
            Test
          </button>
          <button
            onClick={() => emit("slack.editAccount", { accountId: item.id })}
            className="px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80"
          >
            Edit
          </button>
          <button
            onClick={() => emit("slack.deleteAccount", { accountId: item.id })}
            className="px-3 py-1 text-sm rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30"
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}
