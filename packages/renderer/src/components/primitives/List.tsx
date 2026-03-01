import type { ReactNode } from "react";
import { useClappState, useIntent } from "../../context/ClappProvider.js";

interface ListProps {
  data: string;
  onItemClick?: string;
  active?: string;
  children?: ReactNode;
}

export function List({ data, onItemClick, active }: ListProps) {
  const items = useClappState<unknown[]>(data) ?? [];
  const activeItem = active ? useClappState<string>(active) : null;
  const { emit } = useIntent();

  return (
    <ul className="clapp-list">
      {items.map((item, i) => {
        const isObject = typeof item === "object" && item !== null;
        const record = isObject ? (item as Record<string, unknown>) : null;
        const label = record ? String(record.text ?? JSON.stringify(item)) : String(item);
        const role = record?.role ? String(record.role) : undefined;
        const key = record?.id ? String(record.id) : `${i}`;
        const roleCls = role ? ` clapp-list-item-${role}` : "";

        return (
          <li
            key={key}
            className={`clapp-list-item${item === activeItem ? " active" : ""}${roleCls}`}
            onClick={
              onItemClick
                ? () => emit(onItemClick, isObject ? (item as Record<string, unknown>) : { value: item })
                : undefined
            }
            role={onItemClick ? "button" : undefined}
          >
            {!isObject && <span className="clapp-icon">📄</span>}
            {label}
          </li>
        );
      })}
    </ul>
  );
}
