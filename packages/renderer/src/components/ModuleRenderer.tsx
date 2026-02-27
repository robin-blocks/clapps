import type { ViewSpec } from "@clapps/core";
import { LayoutNodeRenderer } from "./LayoutNodeRenderer.js";

interface ModuleRendererProps {
  spec: ViewSpec;
}

/** Render a single module from its ViewSpec */
export function ModuleRenderer({ spec }: ModuleRendererProps) {
  return (
    <div className="clapp-module" data-module={`${spec.domain}/${spec.name}`}>
      <LayoutNodeRenderer node={spec.layout} />
    </div>
  );
}
