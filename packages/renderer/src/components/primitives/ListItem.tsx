import type { ReactNode } from "react";

interface ListItemProps {
  icon?: string;
  children?: ReactNode;
}

export function ListItem({ children }: ListItemProps) {
  // ListItem is rendered inline by List component — this is a fallback
  return <li className="clapp-list-item">{children}</li>;
}
