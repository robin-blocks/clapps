import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RowProps {
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  children?: ReactNode;
  className?: string;
}

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const justifyMap = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
};

export function Row({
  gap = 2,
  align = "center",
  justify = "start",
  children,
  className,
}: RowProps) {
  return (
    <div
      className={cn(
        "flex flex-row",
        `gap-${gap}`,
        alignMap[align],
        justifyMap[justify],
        className
      )}
    >
      {children}
    </div>
  );
}
