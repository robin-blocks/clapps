import { describe, it, expect } from "vitest";
import { parseViewMd } from "./view-parser.js";

const SAMPLE_VIEW = `---
name: file-list
domain: workspace
version: 0.1.0
---

# File List

## State Bindings
- \`workspace.files\` -> string[]
- \`workspace.current.filename\` -> string | null
- \`workspace.loading\` -> boolean

## Layout
\`\`\`clapp-layout
Column(gap=4):
  Row(justify=between, align=center):
    Heading(level=3): "Workspace Files"
  Conditional(when=workspace.loading):
    Skeleton(lines=5)
\`\`\`

## Intents
| Intent | Payload | Description |
|--------|---------|-------------|
| workspace.list | \`{}\` | List workspace Markdown files |
| workspace.read | \`{ filename: string }\` | Read a specific file |
`;

describe("parseViewMd", () => {
  it("parses frontmatter", () => {
    const spec = parseViewMd(SAMPLE_VIEW);
    expect(spec.name).toBe("file-list");
    expect(spec.domain).toBe("workspace");
    expect(spec.version).toBe("0.1.0");
  });

  it("parses state bindings", () => {
    const spec = parseViewMd(SAMPLE_VIEW);
    expect(spec.stateBindings).toHaveLength(3);
    expect(spec.stateBindings[0]).toEqual({
      path: "workspace.files",
      type: "string[]",
    });
  });

  it("parses layout", () => {
    const spec = parseViewMd(SAMPLE_VIEW);
    expect(spec.layout.component).toBe("Column");
    expect(spec.layout.children).toHaveLength(2);
  });

  it("parses intents table", () => {
    const spec = parseViewMd(SAMPLE_VIEW);
    expect(spec.intents).toHaveLength(2);
    expect(spec.intents[0].name).toBe("workspace.list");
    expect(spec.intents[1].name).toBe("workspace.read");
    expect(spec.intents[1].payload).toBe("{ filename: string }");
  });
});
