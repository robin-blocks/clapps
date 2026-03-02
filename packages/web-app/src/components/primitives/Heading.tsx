import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
  className?: string;
}

const levelStyles = {
  1: "text-2xl font-bold tracking-tight",
  2: "text-xl font-semibold tracking-tight",
  3: "text-lg font-semibold",
  4: "text-base font-medium",
  5: "text-sm font-medium",
  6: "text-sm font-medium text-muted-foreground",
};

export function Heading({ level = 2, children, className }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cn(levelStyles[level], className)}>
      {children}
    </Tag>
  );
}
