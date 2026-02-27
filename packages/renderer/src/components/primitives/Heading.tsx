import { createElement, type ReactNode } from "react";

interface HeadingProps {
  level?: number;
  children?: ReactNode;
}

export function Heading({ level = 2, children }: HeadingProps) {
  const tag = `h${Math.min(Math.max(level, 1), 6)}`;
  return createElement(tag, { className: "clapp-heading" }, children);
}
