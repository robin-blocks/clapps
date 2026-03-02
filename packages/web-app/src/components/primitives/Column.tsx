import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ColumnProps {
  gap?: number;
  children?: ReactNode;
  className?: string;
}

export function Column({ gap = 2, children, className }: ColumnProps) {
  const gapClass = `gap-${gap}`;
  return (
    <div className={cn("flex flex-col", gapClass, className)}>
      {children}
    </div>
  );
}
