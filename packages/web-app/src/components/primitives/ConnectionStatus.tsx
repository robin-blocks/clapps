import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ConnectionStatusProps {
  status: {
    connected: boolean;
    accounts: Array<{ id: string; connected: boolean }>;
  };
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading status...</span>
      </div>
    );
  }

  const connectedCount = status.accounts?.filter((a) => a.connected).length || 0;
  const totalCount = status.accounts?.length || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {status.connected ? (
          <>
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-medium">Connected</span>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium">Disconnected</span>
          </>
        )}
      </div>

      {status.accounts && status.accounts.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {connectedCount} of {totalCount} accounts connected
          </div>
          <div className="space-y-1">
            {status.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-2 text-sm"
              >
                {account.connected ? (
                  <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-600" />
                )}
                <span>{account.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
