import { useEffect, useRef, useState } from "react";
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
  const saveSuccess = useClappState<string | null>("slack.saveSuccess") ?? null;
  const [saving, setSaving] = useState(false);
  const prevBackendSaving = useRef(backendSaving);

  const [accountId, setAccountId] = useState(account?.id || "");
  const [mode, setMode] = useState<"socket" | "http">((account?.mode as "socket" | "http") || "socket");
  const [botToken, setBotToken] = useState(account?.botToken || "");
  const [appToken, setAppToken] = useState(account?.appToken || "");
  const [signingSecret, setSigningSecret] = useState(account?.signingSecret || "");
  const [webhookPath, setWebhookPath] = useState(account?.webhookPath || "/slack/events");

  // Track backend saving transitions: show loading until backend confirms done
  useEffect(() => {
    if (backendSaving && !prevBackendSaving.current) {
      // Backend started saving — keep our saving state
    } else if (!backendSaving && prevBackendSaving.current) {
      // Backend finished — clear saving
      setSaving(false);
    }
    prevBackendSaving.current = backendSaving;
  }, [backendSaving]);

  // Safety timeout in case backend never responds
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSaving(false), 20000);
    return () => clearTimeout(timer);
  }, [saving]);

  const handleSave = () => {
    setSaving(true);
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

  if (saveSuccess) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <p className="text-sm text-green-600 font-medium">{saveSuccess}</p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => emit("slack.cancelEdit")}>
              Done
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Account ID</label>
          <Input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="default"
            disabled={saving}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Mode</label>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant={mode === "socket" ? "default" : "outline"}
              onClick={() => setMode("socket")}
              disabled={saving}
            >
              Socket Mode
            </Button>
            <Button
              type="button"
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
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={handleClear} disabled={saving}>
            Clear
          </Button>
          <Button type="button" onClick={handleSave} disabled={!botToken || saving}>
            {saving ? "Saving…" : "Save Account"}
          </Button>
        </div>

        {saveError && (
          <p className="text-xs text-rose-500">{saveError}</p>
        )}
      </div>
    </Card>
  );
}
