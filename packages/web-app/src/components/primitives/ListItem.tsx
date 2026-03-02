import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ListItemProps {
  active?: boolean;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ListItem({ active, children, className, onClick }: ListItemProps) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50",
        className
      )}
      onClick={onClick}
    >
      {children}
    </li>
  );
}
