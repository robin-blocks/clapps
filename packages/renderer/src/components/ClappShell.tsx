import type { ReactNode } from "react";
import { ClappProvider, type ClappProviderProps } from "../context/ClappProvider.js";

interface ClappShellProps extends ClappProviderProps {
  children: ReactNode;
}

/** Top-level shell: wraps app in ClappProvider */
export function ClappShell({ children, ...providerProps }: ClappShellProps) {
  return (
    <ClappProvider {...providerProps}>
      <div className="clapp-shell">{children}</div>
    </ClappProvider>
  );
}
