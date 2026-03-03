import { useState } from "react";
import { useIntent } from "@clapps/renderer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChannelEditorProps {
  channel?: {
    id: string;
    name?: string;
    requireMention?: boolean;
    users?: string[];
    skills?: string[];
  };
  onClose?: () => void;
}

export function ChannelEditor({ channel, onClose }: ChannelEditorProps) {
  const { emit } = useIntent();
  const [channelId, setChannelId] = useState(channel?.id || "");
  const [requireMention, setRequireMention] = useState(channel?.requireMention ?? true);
  const [users, setUsers] = useState((channel?.users || []).join(", "));
  const [skills, setSkills] = useState((channel?.skills || []).join(", "));

  const handleSave = () => {
    emit("slack.saveChannel", {
      channelId,
      requireMention,
      users: users.split(",").map((u) => u.trim()).filter(Boolean),
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
    });
    onClose?.();
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          {channel ? "Edit Channel" : "Add Channel"}
        </h2>

        <div>
          <label className="text-sm font-medium">Channel ID</label>
          <Input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="C1234567890"
            disabled={!!channel}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use Slack channel ID or name
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requireMention}
            onChange={(e) => setRequireMention(e.target.checked)}
            id="requireMention"
            className="rounded border-gray-300"
          />
          <label htmlFor="requireMention" className="text-sm font-medium cursor-pointer">
            Require mention to respond
          </label>
        </div>

        <div>
          <label className="text-sm font-medium">Allowed Users (optional)</label>
          <Input
            value={users}
            onChange={(e) => setUsers(e.target.value)}
            placeholder="user:U123, user:U456"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated list of user IDs or names
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Custom Skills (optional)</label>
          <Input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="weather, calendar"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated list of skill IDs
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={!channelId}>
            Save Channel
          </Button>
        </div>
      </div>
    </Card>
  );
}
