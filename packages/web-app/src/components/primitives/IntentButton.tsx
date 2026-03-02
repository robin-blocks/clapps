import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useClappContext } from "@clapps/renderer";

interface IntentButtonProps {
  intent: string;
  payload?: Record<string, unknown>;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  children?: ReactNode;
}

export function IntentButton({
  intent,
  payload = {},
  variant = "outline",
  size = "default",
  children,
}: IntentButtonProps) {
  const { sendIntent } = useClappContext();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => sendIntent(intent, payload)}
    >
      {children}
    </Button>
  );
}
