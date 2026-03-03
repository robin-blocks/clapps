import { useIntent } from "@clapps/renderer";

interface PolicySelectorProps {
  value: string;
  type: "dm" | "group";
}

export function PolicySelector({ value, type }: PolicySelectorProps) {
  const { emit } = useIntent();

  const policies = type === "dm"
    ? [
        { value: "pairing", label: "Pairing (default)" },
        { value: "allowlist", label: "Allowlist" },
        { value: "open", label: "Open" },
        { value: "disabled", label: "Disabled" },
      ]
    : [
        { value: "open", label: "Open" },
        { value: "allowlist", label: "Allowlist (recommended)" },
        { value: "disabled", label: "Disabled" },
      ];

  const handleChange = (newValue: string) => {
    if (type === "dm") {
      emit("slack.setDmPolicy", { policy: newValue });
    } else {
      emit("slack.setGroupPolicy", { policy: newValue });
    }
  };

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full px-3 py-2 border rounded-md bg-background"
    >
      {policies.map((policy) => (
        <option key={policy.value} value={policy.value}>
          {policy.label}
        </option>
      ))}
    </select>
  );
}
