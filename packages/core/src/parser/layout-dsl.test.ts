import { describe, it, expect } from "vitest";
import { parseLayoutDSL } from "./layout-dsl.js";

describe("parseLayoutDSL", () => {
  it("parses a single component with text", () => {
    const result = parseLayoutDSL('Heading(level=3): "Hello"');
    expect(result).toEqual({
      component: "Heading",
      props: { level: 3 },
      children: ["Hello"],
    });
  });

  it("parses nested components", () => {
    const input = `Column(gap=4):
  Row(justify=between):
    Heading(level=3): "Title"`;
    const result = parseLayoutDSL(input);
    expect(result.component).toBe("Column");
    expect(result.props).toEqual({ gap: 4 });
    expect(result.children).toHaveLength(1);

    const row = result.children[0];
    expect(typeof row).not.toBe("string");
    if (typeof row !== "string") {
      expect(row.component).toBe("Row");
      expect(row.children).toHaveLength(1);
      const heading = row.children[0];
      if (typeof heading !== "string") {
        expect(heading.component).toBe("Heading");
        expect(heading.children).toEqual(["Title"]);
      }
    }
  });

  it("parses boolean and numeric props", () => {
    const result = parseLayoutDSL("IntentButton(intent=workspace.list, variant=ghost, size=sm)");
    expect(result.props).toEqual({
      intent: "workspace.list",
      variant: "ghost",
      size: "sm",
    });
  });

  it("parses template expressions", () => {
    const result = parseLayoutDSL('ListItem(icon=file-text): {{ item }}');
    expect(result.children).toEqual(["{{ item }}"]);
  });

  it("parses the workspace file-list layout", () => {
    const input = `Column(gap=4):
  Row(justify=between, align=center):
    Heading(level=3): "Workspace Files"
    IntentButton(intent=workspace.list, variant=ghost, size=sm):
      Icon(name=refresh-cw)
  Conditional(when=workspace.loading):
    Skeleton(lines=5)
  Conditional(when=!workspace.loading):
    List(data=workspace.files, onItemClick=workspace.read, active=workspace.current.filename):
      ListItem(icon=file-text): "{{ item }}"`;

    const result = parseLayoutDSL(input);
    expect(result.component).toBe("Column");
    expect(result.children).toHaveLength(3); // Row, Conditional, Conditional
  });

  it("parses the app layout with Module refs", () => {
    const input = `Row(gap=0):
  Column(width=sidebar):
    Module(ref=workspace/file-list)
  Column(width=main):
    Module(ref=workspace/file-viewer)`;

    const result = parseLayoutDSL(input);
    expect(result.component).toBe("Row");
    expect(result.children).toHaveLength(2);

    const sidebar = result.children[0];
    if (typeof sidebar !== "string") {
      const mod = sidebar.children[0];
      if (typeof mod !== "string") {
        expect(mod.component).toBe("Module");
        expect(mod.props.ref).toBe("workspace/file-list");
      }
    }
  });

  it("throws on empty input", () => {
    expect(() => parseLayoutDSL("")).toThrow("Empty layout DSL");
  });
});
