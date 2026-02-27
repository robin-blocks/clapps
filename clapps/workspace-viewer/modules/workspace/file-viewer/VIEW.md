---
name: file-viewer
domain: workspace
version: 0.1.0
---

# File Viewer

## State Bindings
- `workspace.current.filename` -> string | null
- `workspace.current.content` -> string | null

## Layout
```clapp-layout
Column(gap=2):
  Conditional(when=workspace.current.filename):
    Heading(level=3): "{{ workspace.current.filename }}"
    MarkdownContent(source=workspace.current.content)
  Conditional(when=!workspace.current.filename):
    Column(gap=2):
      Heading(level=3): "No File Selected"
```

## Intents
| Intent | Payload | Description |
|--------|---------|-------------|
