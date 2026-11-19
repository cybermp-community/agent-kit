# CyberMP Development Rules

Authoritative guidelines and instructions for CyberMP (Cyberpunk 2077 multiplayer) development in Antigravity.

## Context Boundaries

CyberMP operates in three distinct, isolated environments:
1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative logic, player state, commands, and database access.
   - Listen to engine events: `events.on(name, callback)`
   - Listen to client RPCs: `events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `events.emitClient(player, name, ...args)`
   - Register commands: `commands.add(name, (player: MpPlayer, ...args) => ...)`
2. **Client** (`@cybermp/client-types`): In-game V8 environment inside Cyberpunk 2077. Local entities, camera, sound, and input.
   - Listen to server: `events.onServer(name, callback)`
   - Send to server: `events.emitServer(name, ...args)`
   - Listen to CEF: `events.onCef(name, callback)`
   - Send to CEF: `events.emitCef(name, ...args)`
3. **CEF Browser** (`@cybermp/browser-types`): Chromium web runtime for HUD, menus, and UI.
   - Listen to client: `cybermp.events.on(name, callback)`
   - Send to client: `cybermp.events.emit(name, ...args)`
   - Direct connection to Server is impossible; all data must bridge through the Client.

## Anti-Hallucination & Negative Constraints

DO NOT hallucinate APIs from FiveM, alt:V, RAGEMP, or SA-MP:
- Prohibited: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler`, `GetPlayerPed`, `SetEntityCoords`.
- Prohibited: `alt.onClient`, `alt.emitServer`, `alt.Player.local`.
- Prohibited: `mp.events.add`, `mp.events.callRemote`, `mp.players.local`.

Always verify against CyberMP event and RPC signatures.

## MCP Tools

Consult the CyberMP MCP server whenever needed:
- `cybermp_get_event`: Fetch verified event signatures, contexts, and payload details.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, and methods.
- `cybermp_get_rpc_flow`: Generate paired RPC code across Server, Client, and CEF.
- `cybermp_search_docs`: Search guides, architecture patterns, and setup instructions.

## Resource Architecture

In CyberMP, resources reside in the server's `resources/` folder. Every resource MUST contain a `resource.toml` manifest, and be listed in the root `server.toml`:

```toml
# server.toml (in server root)
resources = ["my-resource"]
```

```toml
# resources/my-resource/resource.toml
#:schema https://schemas.cyber.mp/resource/schema.json

server_script = ["./server.js"]
client_script = ["./client.js"]
file = ["./browser/**/*"]
cef_url = "./browser/index.html"
use_game_natives = true
hotreload = true
```

Folder layout:
```
resources/my-resource/
├── resource.toml           # Official manifest (REQUIRED)
├── server.js               # Node.js server script
├── client.js               # V8 in-game client script
└── browser/                # CEF Web UI files (HTML/CSS/JS)
    └── index.html
```
