---
name: file-list
domain: workspace
version: 0.1.0
---

# File List

## State Bindings
- `workspace.files` -> string[]
- `workspace.current.filename` -> string | null
- `workspace.loading` -> boolean

## Layout
```clapp-layout
Column(gap=4):
  Row(justify=between, align=center):
    Heading(level=3): "Workspace Files"
    IntentButton(intent=workspace.list, variant=ghost, size=sm):
      Icon(name=refresh-cw)
  Conditional(when=workspace.loading):
    Skeleton(lines=5)
  Conditional(when=!workspace.loading):
    List(data=workspace.files, onItemClick=workspace.read, active=workspace.current.filename):
      ListItem(icon=file-text): "{{ item }}"
```

## Intents
| Intent | Payload | Description |
|--------|---------|-------------|
| workspace.list | `{}` | List workspace Markdown files |
| workspace.read | `{ filename: string }` | Read a specific file |
