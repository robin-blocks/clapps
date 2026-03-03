import { useState } from "react";
import { useIntent } from "@clapps/renderer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle } from "lucide-react";

interface AccountEditorProps {
  account?: {
    id: string;
    mode: string;
    botToken: string;
    appToken?: string;
    signingSecret?: string;
    webhookPath?: string;
  } | null;
  saving?: boolean;
  saveError?: string;
}

export function AccountEditor({ account, saving, saveError }: AccountEditorProps) {
  const { emit } = useIntent();
  const [accountId, setAccountId] = useState(account?.id || "");
  const [mode, setMode] = useState<"socket" | "http">(account?.mode as any || "socket");
  const [botToken, setBotToken] = useState(account?.botToken || "");
  const [appToken, setAppToken] = useState(account?.appToken || "");
  const [signingSecret, setSigningSecret] = useState(account?.signingSecret || "");
  const [webhookPath, setWebhookPath] = useState(account?.webhookPath || "/slack/events");

  const handleSave = () => {
    emit("slack.saveAccount", {
      accountId: accountId || "default",
      mode,
      botToken,
      appToken: mode === "socket" ? appToken : undefined,
      signingSecret: mode === "http" ? signingSecret : undefined,
      webhookPath: mode === "http" ? webhookPath : undefined,
    });
  };

  const handleCancel = () => {
    emit("slack.cancelEdit", {});
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {account ? "Edit Account" : "Add Account"}
          </h2>
          {saving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Testing connection...</span>
            </div>
          )}
        </div>

        {saveError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1 text-sm text-destructive">
              {saveError}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Account ID</label>
          <Input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="default"
            disabled={!!account || saving}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use "default" for main account, or a custom name
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Mode</label>
          <div className="flex gap-2 mt-2">
            <Button
              variant={mode === "socket" ? "default" : "outline"}
              onClick={() => setMode("socket")}
              disabled={saving}
            >
              Socket Mode
            </Button>
            <Button
              variant={mode === "http" ? "default" : "outline"}
              onClick={() => setMode("http")}
              disabled={saving}
            >
              HTTP Events API
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Bot Token</label>
          <Input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="xoxb-..."
            type="password"
            disabled={saving}
          />
        </div>

        {mode === "socket" && (
          <div>
            <label className="text-sm font-medium">App Token</label>
            <Input
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              placeholder="xapp-..."
              type="password"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Requires connections:write scope
            </p>
          </div>
        )}

        {mode === "http" && (
          <>
            <div>
              <label className="text-sm font-medium">Signing Secret</label>
              <Input
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="Your signing secret"
                type="password"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Webhook Path</label>
              <Input
                value={webhookPath}
                onChange={(e) => setWebhookPath(e.target.value)}
                placeholder="/slack/events"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use unique paths for multi-account HTTP
              </p>
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!botToken || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Save Account"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
