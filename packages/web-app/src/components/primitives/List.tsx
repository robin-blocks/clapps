import type { ReactNode } from "react";
import { useClappState, useIntent } from "@clapps/renderer";
import { cn } from "@/lib/utils";

interface ListProps {
  data?: string; // State binding path
  onItemClick?: string;
  active?: string;
  children?: ReactNode;
  className?: string;
}

export function List({ data, onItemClick, active, children, className }: ListProps) {
  const items = useClappState<unknown[]>(data || "_empty_") ?? [];
  const activeItem = useClappState<string>(active || "_empty_");
  const { emit } = useIntent();
  
  // If no data prop, just render children
  if (!data) {
    return (
      <ul className={cn("flex flex-col gap-1", className)}>
        {children}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No items
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {items.map((item, i) => {
        const isObject = typeof item === "object" && item !== null;
        const record = isObject ? (item as Record<string, unknown>) : null;
        const label = record ? String(record.text ?? JSON.stringify(item)) : String(item);
        const role = record?.role ? String(record.role) : undefined;
        const key = record?.id ? String(record.id) : `${i}`;
        const isActive = item === activeItem;

        return (
          <li
            key={key}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              onItemClick && "cursor-pointer",
              isActive
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50",
              role === "assistant" && "bg-muted/50",
              role === "user" && "bg-primary/10"
            )}
            onClick={
              onItemClick
                ? () => emit(onItemClick, isObject ? (item as Record<string, unknown>) : { value: item })
                : undefined
            }
            role={onItemClick ? "button" : undefined}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}
