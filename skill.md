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

## Custom UI

Define your app's layout and views using `.app.md` and `.view.md` files in `ui/views/`. The connector watches this directory and pushes files to the relay. The browser fetches, parses, and renders them dynamically.

### File Structure

```
ui/
  state/
    _apps.json              → app registry
    my-app.json             → app state
  views/
    my-app.app.md           → app layout (shell + module refs)
    my-domain.my-view.view.md → module view (layout + state bindings + intents)
```

### APP.md — App Layout

Defines the app shell and which modules to render. File name must be `<clapp-id>.app.md`.

```markdown
---
name: my-app
domain: my-domain
---

## Modules

- my-domain/sidebar
- my-domain/main-content

## Layout

\`\`\`clapp-layout
Row(gap=0):
  Column(width=sidebar):
    Module(ref=my-domain/sidebar)
  Column(width=main):
    Module(ref=my-domain/main-content)
\`\`\`
```

### VIEW.md — Module View

Defines a single module's state bindings, layout, and intents. File name must be `<domain>.<name>.view.md` matching the module ref `domain/name`.

```markdown
---
name: file-list
domain: workspace
version: 0.1.0
---

# File List

## State Bindings
- `workspace.files` -> string[]
- `workspace.loading` -> boolean

## Layout

\`\`\`clapp-layout
Column(gap=4):
  Heading(level=3): "Files"
  Conditional(when=workspace.loading):
    Skeleton(lines=5)
  Conditional(when=!workspace.loading):
    List(data=workspace.files, onItemClick=workspace.read):
      ListItem(icon=file-text): "{{ item }}"
\`\`\`

## Intents
| Intent | Payload | Description |
|--------|---------|-------------|
| workspace.list | `{}` | List files |
| workspace.read | `{ filename: string }` | Read a file |
```

### Available Components

`Column`, `Row`, `Heading`, `IntentButton`, `Icon`, `List`, `ListItem`, `Conditional`, `Skeleton`, `MarkdownContent`, `Card`, `Module`

### Layout DSL

- Indentation: 2 spaces = nesting
- Props: `Component(key=value, key2=value2)`
- Text children: `Component(): "text"`
- State refs in props: `Conditional(when=some.state.path)`
- Module refs: `Module(ref=domain/name)`

### Notes

- If no view files exist, the UI falls back to a raw state inspector
- State bindings use dot-path notation matching state keys (e.g. `workspace.files`)
- Views are re-fetched periodically — update view files and the UI will refresh

## Custom Home Screen

The home screen (app launcher) can be customized by writing a `_home.app.md` view. If no `_home` view exists, the default iPhone-style app grid is shown.

### How it works

1. Write `ui/views/_home.app.md` + associated `.view.md` files — same format as any other app view
2. The home screen renders your custom view instead of the default grid
3. Home screen state lives in `ui/state/_home.json` — use the same state format
4. `_apps.json` still controls which apps are registered and available

### Example

```
ui/views/_home.app.md         → custom home screen layout
ui/views/home.dashboard.view.md → home screen module
ui/state/_home.json           → home screen state
```

The home view is re-fetched periodically, so you can update it at any time and the UI will refresh.

## Mobile App Onboarding

When the Clapps server starts, it generates a QR code for connecting the iOS app. **You must send this QR code to the user proactively** — this is the primary onboarding flow.

### On startup, always:

1. Read `ui/connect-info.json` to get the connection details
2. Send the QR code image at `ui/connect-qr.png` to the user
3. Include the connection URL and access code as text fallback

Example message:
> Scan this QR code with the Clapps app to connect:
> [send the image at ui/connect-qr.png]
>
> Or enter manually:
> **Server URL:** http://192.168.1.50:3080
> **Access code:** kR7m-P2nX-q4Ld

The QR code image and connect-info.json are regenerated on every server start with the current IP and token.

### When you receive `system.templateInstalled`

An iOS app has provisioned a template. Read the contract at the path in the payload to understand the app's state schema and available intents. You can then handle intents via reasoning, or write deterministic handler files for faster processing.

## Rules

- Always increment the version number from the previous state
- Always include a fresh ISO timestamp
- Preserve existing state fields when updating — merge, don't replace
- Write `_apps.json` early so the launcher shows your apps before any intents arrive
