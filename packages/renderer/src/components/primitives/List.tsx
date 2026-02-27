import type { ReactNode } from "react";
import { useClappState, useIntent } from "../../context/ClappProvider.js";

interface ListProps {
  data: string;
  onItemClick?: string;
  active?: string;
  children?: ReactNode;
}

export function List({ data, onItemClick, active }: ListProps) {
  const items = useClappState<string[]>(data) ?? [];
  const activeItem = active ? useClappState<string>(active) : null;
  const { emit } = useIntent();

  return (
    <ul className="clapp-list">
      {items.map((item) => (
        <li
          key={item}
          className={`clapp-list-item${item === activeItem ? " active" : ""}`}
          onClick={
            onItemClick
              ? () => emit(onItemClick, { filename: item })
              : undefined
          }
          role={onItemClick ? "button" : undefined}
        >
          <span className="clapp-icon">📄</span>
          {item}
        </li>
      ))}
    </ul>
  );
}
