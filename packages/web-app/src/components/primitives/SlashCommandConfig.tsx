import { useState } from "react";
import { useIntent } from "@clapps/renderer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SlashCommandConfigProps {
  config: {
    enabled: boolean;
    name: string;
  };
}

export function SlashCommandConfig({ config }: SlashCommandConfigProps) {
  const { emit } = useIntent();
  const [enabled, setEnabled] = useState(config?.enabled || false);
  const [name, setName] = useState(config?.name || "openclaw");

  const handleSave = () => {
    emit("slack.setSlashCommand", { enabled, name });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          id="slashEnabled"
          className="rounded border-gray-300"
        />
        <label htmlFor="slashEnabled" className="text-sm font-medium cursor-pointer">
          Enable single slash command
        </label>
      </div>

      {enabled && (
        <div>
          <label className="text-sm font-medium">Command Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="openclaw"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Register /{name} in Slack app settings
          </p>
        </div>
      )}

      <Button onClick={handleSave} size="sm">
        Save
      </Button>

      <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted rounded-md">
        <p className="font-medium mb-1">Note:</p>
        <p>
          For native command support, set{" "}
          <code className="bg-background px-1 py-0.5 rounded">
            channels.slack.commands.native: true
          </code>{" "}
          and register matching slash commands in Slack (use /agentstatus for the
          status command).
        </p>
      </div>
    </div>
  );
}
