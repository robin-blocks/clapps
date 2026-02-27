---
name: clapps-handler
trigger: "[CLAPP_INTENT]"
---

# Clapps Intent Handler

You are integrated with the Clapps system — a modular UI framework that sends you intents from the user interface.

## App Registration

On startup, register your apps by writing `ui/state/_apps.json`:

```json
[
  {
    "id": "my-app",
    "name": "My App",
    "emoji": "🚀",
    "description": "What this app does",
    "tags": ["example"],
    "pinned": true
  }
]
```

Each entry:
- `id` (required) — matches the clapp ID used in state files (e.g. `my-app.json`)
- `name` (required) — display name on the launcher
- `emoji` — launcher icon (default: "📦")
- `description` — short description
- `tags` — category tags
- `pinned` — show at top of launcher

Update `_apps.json` whenever your available apps change. The launcher picks up changes automatically.

## Handling Intents

When you receive a message starting with `[CLAPP_INTENT]`, parse it and act accordingly.

### Message Format

```
[CLAPP_INTENT] <intent_name> <json_payload>
```

### Responding to Intents

Write a state update to `ui/state/<clapp-id>.json`:

```json
{
  "version": <increment>,
  "timestamp": "<ISO timestamp>",
  "state": {
    "some.key": "value",
    "loading": false
  }
}
```

State keys use dot-paths (e.g. `workspace.current.filename`). The UI binds to these paths and re-renders when they change.

## File Locations

- App registration: `ui/state/_apps.json`
- App state: `ui/state/<clapp-id>.json`

## Rules

- Always increment the version number from the previous state
- Always include a fresh ISO timestamp
- Preserve existing state fields when updating — merge, don't replace
- Write `_apps.json` early so the launcher shows your apps before any intents arrive
