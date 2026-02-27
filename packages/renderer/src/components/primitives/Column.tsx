import type { ReactNode } from "react";

interface ColumnProps {
  gap?: number;
  width?: string;
  children?: ReactNode;
}

export function Column({ gap = 0, width, children }: ColumnProps) {
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: gap ? `${gap * 0.25}rem` : undefined,
    flex: width === "sidebar" ? "0 0 280px" : width === "main" ? "1 1 0%" : undefined,
    minWidth: 0,
  };

  return <div style={style}>{children}</div>;
}
