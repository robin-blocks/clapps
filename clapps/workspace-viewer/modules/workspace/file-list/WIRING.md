---
module: workspace/file-list
---

## workspace.list
**Meaning**: List all .md files in the workspace root directory.
**How**: Use your file tools to list *.md files in the workspace root.
**State Updates**: Write the filenames array to `workspace.files`, set `workspace.loading` to false.

## workspace.read
**Meaning**: Read the content of a specific workspace Markdown file.
**How**: Use your file tools to read the specified file from the workspace root.
**State Updates**: Write the file content to `workspace.current.content`, set `workspace.current.filename` to the filename.
