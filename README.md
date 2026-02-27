# Clapps

Modular, intent-driven UI apps for [OpenClaw](https://openclaw.app) agents. The UI emits intents, the agent resolves them.

**Live:** [clapps.clawlab.app](https://clapps.clawlab.app)

## How it works

```
Agent writes files → Connector pushes to relay → Browser fetches, parses, renders
```

1. **Agent** writes state JSON and view markdown files to `ui/state/` and `ui/views/`
2. **Connector** (`@clapps/connect`) watches these directories and pushes changes to the relay
3. **Relay** (Next.js API routes + Vercel KV) stores state and view definitions, queues intents
4. **Browser** fetches raw markdown, parses it client-side (`@clapps/core`), renders with React (`@clapps/renderer`)
5. **Intents** flow back: user clicks button → intent queued in KV → connector polls → agent receives

No direct connection needed between browser and agent.

## Packages

| Package | Description |
|---------|-------------|
| `@clapps/core` | IR types, layout DSL parser, VIEW.md/APP.md parsers, intent schemas, state paths |
| `@clapps/renderer` | React primitives, LayoutNodeRenderer, ClappProvider (Zustand store + transport) |
| `@clapps/transport` | ClappClient (HTTP) + StatePoller |
| `@clapps/connect` | Agent connector CLI — polls relay for intents, watches state/views dirs |
| `@clapps/web` | Next.js app with relay API routes + clapp renderer |

## Agent file structure

```
~/.openclaw/workspace/ui/
  state/
    _apps.json                    # app registry (launcher entries)
    workspace-viewer.json         # app state ({ version, timestamp, state })
  views/
    workspace-viewer.app.md       # app layout (modules + shell)
    workspace.file-list.view.md   # module view (state bindings + layout + intents)
    workspace.file-viewer.view.md # module view
```

## Getting started

### 1. Register an agent

```bash
curl -X POST https://clapps.clawlab.app/api/admin/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLAPPS_ADMIN_SECRET" \
  -d '{"agentId": "my-agent", "label": "My Agent"}'
```

Returns `{ "agentId": "my-agent", "token": "<uuid>" }`.

### 2. Start the connector

```bash
npx @clapps/connect \
  --token <AGENT_TOKEN> \
  --agent-id my-agent \
  --relay https://clapps.clawlab.app \
  --agent http://localhost:18789
```

Options:
- `--relay` — Relay URL (default: `https://clapps.clawlab.app`)
- `--agent` — Agent webhook URL (default: `http://localhost:18789`)
- `--agent-token` — Token for authenticating with the agent
- `--state-dir` — State directory (default: `~/.openclaw/workspace/ui/state`)
- `--views-dir` — Views directory (default: `~/.openclaw/workspace/ui/views`)

### 3. Write app files

Register your app in `ui/state/_apps.json`:

```json
[{ "id": "my-app", "name": "My App", "emoji": "🚀", "pinned": true }]
```

Write state to `ui/state/my-app.json`:

```json
{ "version": 1, "timestamp": "2025-01-01T00:00:00Z", "state": { "hello": "world" } }
```

Optionally define a custom UI in `ui/views/` — see [skill.md](./skill.md) for the full DSL reference.

### 4. Open in browser

```
https://clapps.clawlab.app/apps/my-app?agent=my-agent
```

If no view files exist, a fallback state inspector shows raw state key/values.

## Development

```bash
pnpm install
pnpm build
pnpm dev       # starts Next.js dev server
pnpm test      # runs vitest
```

Requires Node >= 22, pnpm 9+.

## Architecture

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Agent   │────▶│  Connector  │────▶│  Relay (KV)  │◀────│ Browser │
│          │◀────│  @clapps/   │◀────│  @clapps/web │────▶│         │
│ (writes  │     │  connect    │     │              │     │ (parses │
│  files)  │     │ (watches +  │     │ (stores +    │     │  + renders)
│          │     │  pushes)    │     │  serves)     │     │         │
└──────────┘     └─────────────┘     └──────────────┘     └─────────┘
     state/views ──▶  POST /api/agent/{state,views,apps}
                     GET  /api/state/:agent/:clapp
                     GET  /api/views/:agent/:viewId
                 ◀──  GET  /api/agent/intents
     intents     ◀──  POST /hooks/agent (webhook)
```
