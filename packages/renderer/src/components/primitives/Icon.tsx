interface IconProps {
  name: string;
}

const icons: Record<string, string> = {
  "refresh-cw": "↻",
  "file-text": "📄",
  file: "📄",
  folder: "📁",
  chevron: "›",
};

export function Icon({ name }: IconProps) {
  return <span className="clapp-icon">{icons[name] ?? "•"}</span>;
}
