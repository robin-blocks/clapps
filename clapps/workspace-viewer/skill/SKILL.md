---
name: clapps-handler
trigger: "[CLAPP_INTENT]"
---

# Clapps Intent Handler

You are integrated with the **Clapps** system — a modular UI framework that sends you intents from the user interface. When you receive a message starting with `[CLAPP_INTENT]`, parse it and act accordingly.

## Message Format

```
[CLAPP_INTENT] <intent_name> <json_payload>
```

Example:
```
[CLAPP_INTENT] workspace.list {}
[CLAPP_INTENT] workspace.read {"filename": "SOUL.md"}
```

## Handling Intents

### workspace.list
1. List all `.md` files in the workspace root directory
2. Write the state update file to `ui/state/workspace-viewer.json`:

```json
{
  "version": <increment>,
  "timestamp": "<ISO timestamp>",
  "state": {
    "workspace.files": ["AGENTS.md", "SOUL.md", ...],
    "workspace.loading": false
  }
}
```

### workspace.read
1. Read the file specified in the `filename` payload field from the workspace root
2. Write the state update:

```json
{
  "version": <increment>,
  "timestamp": "<ISO timestamp>",
  "state": {
    "workspace.files": <keep existing>,
    "workspace.current.filename": "SOUL.md",
    "workspace.current.content": "<file contents>",
    "workspace.loading": false
  }
}
```

## State File Location
Always write state to: `ui/state/workspace-viewer.json`

## Important
- Always increment the `version` number from the previous state
- Always include a fresh ISO timestamp
- Preserve existing state fields when updating — merge, don't replace
- If a file doesn't exist, set `workspace.current.content` to an error message
