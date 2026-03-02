import type { AppSpec, ViewSpec, LayoutNode } from "@clapps/core";
import { LayoutNodeRenderer } from "./LayoutNodeRenderer";
import { useMemo } from "react";

interface AppRendererProps {
  spec: AppSpec;
  modules: ViewSpec[];
}

/** Render a full app from its AppSpec with resolved modules */
export function AppRenderer({ spec, modules }: AppRendererProps) {
  const moduleMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const mod of modules) {
      map.set(`${mod.domain}/${mod.name}`, mod.layout);
    }
    return map;
  }, [modules]);

  return (
    <div className="h-full overflow-y-auto p-4" data-app={spec.name}>
      <LayoutNodeRenderer node={spec.layout} moduleMap={moduleMap} />
    </div>
  );
}
