import { useIntent } from "@clapps/renderer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Edit } from "lucide-react";

interface Channel {
  id: string;
  name?: string;
  requireMention?: boolean;
  users?: string[];
  skills?: string[];
}

interface ChannelListProps {
  channels: Channel[];
}

export function ChannelList({ channels }: ChannelListProps) {
  const { emit } = useIntent();

  if (!Array.isArray(channels) || channels.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No channels configured
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {channels.map((channel) => (
        <Card key={channel.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-semibold">
                {channel.name || channel.id}
              </div>
              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                {channel.requireMention !== undefined && (
                  <div>
                    Require mention: {channel.requireMention ? "Yes" : "No"}
                  </div>
                )}
                {channel.users && channel.users.length > 0 && (
                  <div>Users: {channel.users.join(", ")}</div>
                )}
                {channel.skills && channel.skills.length > 0 && (
                  <div>Skills: {channel.skills.join(", ")}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => emit("slack.editChannel", { channelId: channel.id })}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => emit("slack.removeChannel", { channelId: channel.id })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
