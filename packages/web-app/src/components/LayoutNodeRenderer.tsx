import type { LayoutNode } from "@clapps/core";
import type { ReactNode } from "react";
import { componentMap } from "./_component-map";

interface LayoutNodeRendererProps {
  node: LayoutNode;
  moduleMap?: Map<string, LayoutNode>;
}

/** Recursively render a LayoutNode tree into React elements */
export function LayoutNodeRenderer({
  node,
  moduleMap,
}: LayoutNodeRendererProps): ReactNode {
  // Handle Module refs — replace with the resolved module's layout
  if (node.component === "Module" && node.props.ref && moduleMap) {
    const ref = String(node.props.ref);
    const moduleLayout = moduleMap.get(ref);
    if (moduleLayout) {
      return <LayoutNodeRenderer node={moduleLayout} moduleMap={moduleMap} />;
    }
    return (
      <div className="text-destructive text-sm p-2">
        Module not found: {ref}
      </div>
    );
  }

  const Component = componentMap[node.component];
  if (!Component) {
    return (
      <div className="text-destructive text-sm p-2">
        Unknown component: {node.component}
      </div>
    );
  }

  const children = node.children.map((child, i) => {
    if (typeof child === "string") {
      return <span key={i}>{child}</span>;
    }
    return <LayoutNodeRenderer key={i} node={child} moduleMap={moduleMap} />;
  });

  return <Component {...node.props}>{children}</Component>;
}
