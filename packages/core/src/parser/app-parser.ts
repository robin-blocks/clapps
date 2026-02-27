import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Heading, Code, List, ListItem, Paragraph, Text } from "mdast";
import type { AppSpec } from "../ir/types.js";
import { parseLayoutDSL } from "./layout-dsl.js";

/** Parse an APP.md file into an AppSpec */
export function parseAppMd(source: string): AppSpec {
  const { data: frontmatter, content } = matter(source);
  const tree = unified().use(remarkParse).parse(content) as Root;

  const sections = splitByH2(tree);

  return {
    name: frontmatter.name ?? "",
    domain: frontmatter.domain ?? "",
    modules: parseModulesList(sections["Modules"]),
    layout: parseLayoutSection(sections["Layout"]),
  };
}

function splitByH2(tree: Root): Record<string, Root["children"]> {
  const sections: Record<string, Root["children"]> = {};
  let currentSection = "__intro__";
  sections[currentSection] = [];

  for (const node of tree.children) {
    if (node.type === "heading" && (node as Heading).depth === 2) {
      const heading = node as Heading;
      currentSection = heading.children
        .map((c) => (c.type === "text" ? (c as Text).value : ""))
        .join("");
      sections[currentSection] = [];
    } else {
      sections[currentSection]?.push(node);
    }
  }
  return sections;
}

function parseModulesList(nodes: Root["children"] | undefined): string[] {
  if (!nodes) return [];
  const modules: string[] = [];

  for (const node of nodes) {
    if (node.type !== "list") continue;
    const list = node as List;
    for (const item of list.children as ListItem[]) {
      const text = item.children
        .map((child) => {
          if (child.type === "paragraph") {
            return (child as Paragraph).children
              .map((c) => (c.type === "text" ? (c as Text).value : ""))
              .join("");
          }
          return "";
        })
        .join("")
        .trim();
      if (text) modules.push(text);
    }
  }
  return modules;
}

function parseLayoutSection(nodes: Root["children"] | undefined) {
  if (!nodes) throw new Error("Missing Layout section in APP.md");

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
