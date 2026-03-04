import { useEffect, useState } from "react";
import { useClappState, useIntent } from "@clapps/renderer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AccountEditorProps {
  account?: {
    id: string;
    mode: string;
    botToken: string;
    appToken?: string;
    signingSecret?: string;
    webhookPath?: string;
  } | null;
}

export function AccountEditor({ account }: AccountEditorProps) {
  const { emit } = useIntent();
  const backendSaving = useClappState<boolean>("slack.saving") ?? false;
  const saveError = useClappState<string | null>("slack.saveError") ?? null;
  const [saveClicked, setSaveClicked] = useState(false);

  const [accountId, setAccountId] = useState(account?.id || "");
  const [mode, setMode] = useState<"socket" | "http">((account?.mode as "socket" | "http") || "socket");
  const [botToken, setBotToken] = useState(account?.botToken || "");
  const [appToken, setAppToken] = useState(account?.appToken || "");
  const [signingSecret, setSigningSecret] = useState(account?.signingSecret || "");
  const [webhookPath, setWebhookPath] = useState(account?.webhookPath || "/slack/events");

  const showSaving = saveClicked && backendSaving;

  useEffect(() => {
    if (!saveClicked) return;
    if (!backendSaving) {
      setSaveClicked(false);
    }
  }, [saveClicked, backendSaving]);

  useEffect(() => {
    if (!saveClicked) return;
    const timer = setTimeout(() => setSaveClicked(false), 15000);
    return () => clearTimeout(timer);
  }, [saveClicked]);

  const handleSave = () => {
    setSaveClicked(true);
    emit("slack.saveAccount", {
      accountId: accountId || "default",
      mode,
      botToken,
      appToken: mode === "socket" ? appToken : undefined,
      signingSecret: mode === "http" ? signingSecret : undefined,
      webhookPath: mode === "http" ? webhookPath : undefined,
    });
  };

  const handleClear = () => {
    setAccountId("");
    setMode("socket");
    setBotToken("");
    setAppToken("");
    setSigningSecret("");
    setWebhookPath("/slack/events");
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Account ID</label>
          <Input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="default"
            disabled={showSaving}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Mode</label>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant={mode === "socket" ? "default" : "outline"}
              onClick={() => setMode("socket")}
              disabled={showSaving}
            >
              Socket Mode
            </Button>
            <Button
              type="button"
              variant={mode === "http" ? "default" : "outline"}
              onClick={() => setMode("http")}
              disabled={showSaving}
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
            disabled={showSaving}
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
              disabled={showSaving}
            />
          </div>
        )}

        {mode === "http" && (
          <>
            <div>
              <label className="text-sm font-medium">Signing Secret</label>
              <Input
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="Signing secret"
                type="password"
                disabled={showSaving}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Webhook Path</label>
              <Input
                value={webhookPath}
                onChange={(e) => setWebhookPath(e.target.value)}
                placeholder="/slack/events"
                disabled={showSaving}
              />
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={handleClear} disabled={showSaving}>
            Clear
          </Button>
          <Button type="button" onClick={handleSave} disabled={!botToken || showSaving}>
            {showSaving ? "Saving…" : "Save Account"}
          </Button>
        </div>

        {saveError && (
          <p className="text-xs text-rose-500">{saveError}</p>
        )}
      </div>
    </Card>
  );
}
