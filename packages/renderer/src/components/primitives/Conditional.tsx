import type { ReactNode } from "react";
import { useClappState } from "../../context/ClappProvider.js";

interface ConditionalProps {
  when: string;
  children?: ReactNode;
}

export function Conditional({ when, children }: ConditionalProps) {
  const negate = when.startsWith("!");
  const path = negate ? when.slice(1) : when;
  const value = useClappState<unknown>(path);
  const truthful = negate ? !value : !!value;

  if (!truthful) return null;
  return <>{children}</>;
}
