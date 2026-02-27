---
name: workspace-viewer
domain: workspace
---

## Modules
- workspace/file-list
- workspace/file-viewer

## Layout
```clapp-layout
Row(gap=0):
  Column(width=sidebar):
    Module(ref=workspace/file-list)
  Column(width=main):
    Module(ref=workspace/file-viewer)
```
