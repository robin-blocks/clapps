import type { LayoutNode } from "../ir/types.js";

interface ParsedLine {
  indent: number;
  component: string;
  props: Record<string, string | number | boolean>;
  textContent: string | null;
}

/**
 * Parse a clapp-layout DSL block into a LayoutNode tree.
 *
 * Syntax:
 *   Component(prop=value, prop2=value2): "text content"
 *   Component(prop=value):
 *     ChildComponent: "text"
 *
 * Indentation (2 spaces) defines parent-child relationships.
 */
export function parseLayoutDSL(input: string): LayoutNode {
  const lines = input.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Empty layout DSL");
  }

  const parsed = lines.map(parseLine);
  return buildTree(parsed);
}

function parseLine(line: string): ParsedLine {
  const stripped = line.replace(/\t/g, "  ");
  const indent = stripped.length - stripped.trimStart().length;
  const trimmed = stripped.trim();

  // Match: Component(props): "text" or Component(props):\n or Component: "text" or Component:\n
  const match = trimmed.match(
    /^(\w+)(?:\(([^)]*)\))?:\s*(?:"([^"]*)"|\{\{\s*([^}]+)\s*\}\})?$/,
  );
  if (!match) {
    // Try without colon — bare component
    const bareMatch = trimmed.match(/^(\w+)(?:\(([^)]*)\))?$/);
    if (bareMatch) {
      return {
        indent,
        component: bareMatch[1],
        props: parseProps(bareMatch[2] || ""),
        textContent: null,
      };
    }
    // Might be a plain text node like "{{ item }}"
    const textMatch = trimmed.match(/^"([^"]*)"$/);
    if (textMatch) {
      return {
        indent,
        component: "__text__",
        props: {},
        textContent: textMatch[1],
      };
    }
    throw new Error(`Invalid layout DSL line: "${trimmed}"`);
  }

  const component = match[1];
  const propsStr = match[2] || "";
  const textContent = match[3] ?? (match[4] ? `{{ ${match[4].trim()} }}` : null);

  return {
    indent,
    component,
    props: parseProps(propsStr),
    textContent,
  };
}

function parseProps(input: string): Record<string, string | number | boolean> {
  if (!input.trim()) return {};
  const props: Record<string, string | number | boolean> = {};

  // Split on commas that aren't inside quotes
  const parts = input.split(/,\s*/);
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const raw = part.slice(eqIdx + 1).trim();

    if (raw === "true") props[key] = true;
    else if (raw === "false") props[key] = false;
    else if (/^\d+(\.\d+)?$/.test(raw)) props[key] = Number(raw);
    else props[key] = raw;
  }
  return props;
}

function buildTree(lines: ParsedLine[]): LayoutNode {
  if (lines.length === 0) {
    throw new Error("No lines to build tree from");
  }

  // If the first line's indent is not 0, normalize
  const baseIndent = lines[0].indent;

  function buildChildren(
    startIdx: number,
    parentIndent: number,
  ): { nodes: (LayoutNode | string)[]; nextIdx: number } {
    const nodes: (LayoutNode | string)[] = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const relativeIndent = line.indent - baseIndent;

      if (relativeIndent <= parentIndent && i > startIdx) {
        break;
      }

      if (relativeIndent === parentIndent + 2 || (parentIndent === -2 && relativeIndent === 0)) {
        if (line.component === "__text__" && line.textContent !== null) {
          nodes.push(line.textContent);
          i++;
          continue;
        }

        const node: LayoutNode = {
          component: line.component,
          props: { ...line.props },
          children: [],
        };

        if (line.textContent !== null) {
          node.children.push(line.textContent);
        }

        i++;

        // Check for children at deeper indent
        if (i < lines.length && lines[i].indent - baseIndent > relativeIndent) {
          const result = buildChildren(i, relativeIndent);
          node.children.push(...result.nodes);
          i = result.nextIdx;
        }

        nodes.push(node);
      } else {
        // Skip lines that don't match expected indent
        i++;
      }
    }

    return { nodes, nextIdx: i };
  }

  const firstLine = lines[0];
  const root: LayoutNode = {
    component: firstLine.component,
    props: { ...firstLine.props },
    children: [],
  };

  if (firstLine.textContent !== null) {
    root.children.push(firstLine.textContent);
  }

  if (lines.length > 1) {
    const result = buildChildren(1, 0);
    root.children.push(...result.nodes);
  }

  return root;
}
