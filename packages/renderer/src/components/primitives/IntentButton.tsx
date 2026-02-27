import type { ReactNode } from "react";
import { useIntent } from "../../context/ClappProvider.js";

interface IntentButtonProps {
  intent: string;
  variant?: string;
  size?: string;
  payloadPath?: string;
  children?: ReactNode;
}

export function IntentButton({
  intent,
  variant = "default",
  size = "md",
  children,
}: IntentButtonProps) {
  const { emit } = useIntent();

  return (
    <button
      className={`clapp-btn clapp-btn-${variant} clapp-btn-${size}`}
      onClick={() => emit(intent)}
    >
      {children}
    </button>
  );
}
