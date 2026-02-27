import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children?: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <div className="clapp-card">
      {title && <div className="clapp-card-header">{title}</div>}
      <div className="clapp-card-body">{children}</div>
    </div>
  );
}
