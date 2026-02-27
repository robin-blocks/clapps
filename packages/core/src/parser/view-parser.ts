import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Heading, Code, Table, TableRow, TableCell, List, ListItem, Paragraph, Text } from "mdast";
import type { ViewSpec, StateBinding, IntentDef } from "../ir/types.js";
import { parseLayoutDSL } from "./layout-dsl.js";

/** Parse a VIEW.md file into a ViewSpec */
export function parseViewMd(source: string): ViewSpec {
  const { data: frontmatter, content } = matter(source);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content) as Root;

  const sections = splitByH2(tree);

  return {
    name: frontmatter.name ?? "",
    domain: frontmatter.domain ?? "",
    version: frontmatter.version ?? "0.1.0",
    stateBindings: parseStateBindings(sections["State Bindings"]),
    layout: parseLayoutSection(sections["Layout"]),
    intents: parseIntentsTable(sections["Intents"]),
  };
}

/** Split markdown AST into sections by H2 headings */
function splitByH2(tree: Root): Record<string, Root["children"]> {
  const sections: Record<string, Root["children"]> = {};
  let currentSection = "__intro__";
  sections[currentSection] = [];

  for (const node of tree.children) {
    if (node.type === "heading" && (node as Heading).depth === 2) {
      const heading = node as Heading;
      currentSection = getTextContent(heading);
      sections[currentSection] = [];
    } else {
      sections[currentSection]?.push(node);
    }
  }

  return sections;
}

/** Extract text from heading node */
function getTextContent(node: Heading): string {
  return node.children
    .map((c) => (c.type === "text" ? (c as Text).value : ""))
    .join("");
}

/** Parse state bindings from a bullet list */
function parseStateBindings(
  nodes: Root["children"] | undefined,
): StateBinding[] {
  if (!nodes) return [];
  const bindings: StateBinding[] = [];

  for (const node of nodes) {
    if (node.type !== "list") continue;
    const list = node as List;
    for (const item of list.children as ListItem[]) {
      const text = extractListItemText(item);
      // Match: `path` -> type
      const match = text.match(/`([^`]+)`\s*->\s*(.+)/);
      if (match) {
        bindings.push({ path: match[1], type: match[2].trim() });
      }
    }
  }
  return bindings;
}

function extractListItemText(item: ListItem): string {
  return item.children
    .map((child) => {
      if (child.type === "paragraph") {
        return (child as Paragraph).children
          .map((c) => {
            if (c.type === "text") return (c as Text).value;
            if (c.type === "inlineCode") return `\`${(c as { value: string }).value}\``;
            return "";
          })
          .join("");
      }
      return "";
    })
    .join("");
}

/** Parse layout section — find the clapp-layout code block */
function parseLayoutSection(nodes: Root["children"] | undefined) {
  if (!nodes) throw new Error("Missing Layout section in VIEW.md");

  for (const node of nodes) {
    if (node.type === "code") {
      const code = node as Code;
      if (code.lang === "clapp-layout") {
        return parseLayoutDSL(code.value);
      }
    }
  }

  throw new Error("No clapp-layout code block found in Layout section");
}

/** Parse intents table */
function parseIntentsTable(
  nodes: Root["children"] | undefined,
): IntentDef[] {
  if (!nodes) return [];
  const intents: IntentDef[] = [];

  for (const node of nodes) {
    if (node.type !== "table") continue;
    const table = node as Table;
    // Skip header row
    for (let i = 1; i < table.children.length; i++) {
      const row = table.children[i] as TableRow;
      const cells = row.children as TableCell[];
      if (cells.length >= 3) {
        intents.push({
          name: getCellText(cells[0]),
          payload: getCellText(cells[1]),
          description: getCellText(cells[2]),
        });
      }
    }
  }

  return intents;
}

function getCellText(cell: TableCell): string {
  return cell.children
    .map((c) => {
      if (c.type === "text") return (c as Text).value;
      if (c.type === "inlineCode") return (c as { value: string }).value;
      return "";
    })
    .join("");
}
