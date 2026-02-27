import type { ReactNode } from "react";

interface RowProps {
  gap?: number;
  justify?: string;
  align?: string;
  children?: ReactNode;
}

const justifyMap: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  between: "space-between",
  around: "space-around",
};

const alignMap: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
};

export function Row({ gap = 0, justify, align, children }: RowProps) {
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    gap: gap ? `${gap * 0.25}rem` : undefined,
    justifyContent: justify ? justifyMap[justify] ?? justify : undefined,
    alignItems: align ? alignMap[align] ?? align : undefined,
  };

  return <div style={style}>{children}</div>;
}
