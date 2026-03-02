import type { ReactNode } from "react";
import { useClappState } from "@clapps/renderer";

interface ConditionalProps {
  when: string; // State binding path, can be prefixed with ! for negation
  children?: ReactNode;
}

export function Conditional({ when, children }: ConditionalProps) {
  // Handle negation
  const negate = when?.startsWith("!") ?? false;
  const path = negate ? when.slice(1) : (when ?? "");
  
  // useClappState requires a valid path - use a fallback if empty
  const value = useClappState<unknown>(path || "_empty_");
  const shouldShow = negate ? !value : !!value;

  if (!shouldShow) return null;
  return <>{children}</>;
}
