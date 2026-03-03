import { useIntent } from "@clapps/renderer";

interface FeatureTogglesProps {
  actions: Record<string, boolean>;
}

export function FeatureToggles({ actions }: FeatureTogglesProps) {
  const { emit } = useIntent();

  const actionGroups = [
    { key: "messages", label: "Messages" },
    { key: "reactions", label: "Reactions" },
    { key: "pins", label: "Pins" },
    { key: "memberInfo", label: "Member Info" },
    { key: "emojiList", label: "Emoji List" },
  ];

  const handleToggle = (group: string, enabled: boolean) => {
    emit("slack.toggleAction", { group, enabled });
  };

  return (
    <div className="space-y-3">
      {actionGroups.map((group) => {
        const isEnabled = actions[group.key] !== false; // default enabled
        return (
          <div key={group.key} className="flex items-center justify-between">
            <span className="text-sm font-medium">{group.label}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => handleToggle(group.key, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        );
      })}
    </div>
  );
}
