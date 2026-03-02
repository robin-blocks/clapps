import type { LayoutNode } from "@clapps/core";
import type { ComponentType, ReactNode } from "react";
import {
  Column,
  Row,
  Heading,
  IntentButton,
  Icon,
  List,
  ListItem,
  Conditional,
  Skeleton,
  MarkdownContent,
  Card,
  TextInput,
  IntentForm,
  ProviderList,
  SessionList,
} from "./primitives";

/** Map component names from the DSL to React components */
const componentMap: Record<string, ComponentType<any>> = {
  Column,
  Row,
  Heading,
  IntentButton,
  Icon,
  List,
  ListItem,
  Conditional,
  Skeleton,
  MarkdownContent,
  Card,
  TextInput,
  IntentForm,
  ProviderList,
  SessionList,
};

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
