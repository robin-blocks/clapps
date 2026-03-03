import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useClappContext } from "@clapps/renderer";

interface IntentButtonProps {
  intent: string;
  payload?: Record<string, unknown>;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "primary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  children?: ReactNode;
}

export function IntentButton({
  intent,
  payload = {},
  variant = "outline",
  size = "default",
  label,
  children,
}: IntentButtonProps) {
  const { sendIntent } = useClappContext();

  // Map 'primary' variant to 'default' (shadcn doesn't have 'primary')
  const buttonVariant = variant === "primary" ? "default" : variant;

  return (
    <Button
      variant={buttonVariant}
      size={size}
      onClick={() => sendIntent(intent, payload)}
    >
      {children || label}
    </Button>
  );
}
