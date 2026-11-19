# CyberMP Rules for Cline & Roo Code

Follow these core instructions when developing CyberMP multiplayer resources for Cyberpunk 2077.

## Core Runtimes & Boundaries

CyberMP code is strictly isolated into three runtimes. Never mix their APIs:

1. **Server (`@cybermp/server-types`)**:
   - `mp.events.on(eventName, callback)` - Native engine events.
   - `mp.events.onClient(eventName, (player: MpPlayer, ...args) => ...)` - RPC from client.
   - `mp.events.emitClient(player, eventName, ...args)` - RPC to client.
   - `mp.commands.add(commandName, (player: MpPlayer, ...args) => ...)` - Chat/console commands.

2. **Client (`@cybermp/client-types`)**:
   - `mp.events.onServer(eventName, (...args) => ...)` - RPC from server.
   - `mp.events.emitServer(eventName, ...args)` - RPC to server.
   - `mp.events.onCef(eventName, (...args) => ...)` - IPC from CEF browser UI.
   - `mp.events.emitCef(eventName, ...args)` - IPC to CEF browser UI.

3. **CEF Browser UI (`@cybermp/browser-types`)**:
   - `mp.events.on(eventName, (...args) => ...)` - IPC from client.
   - `mp.events.emit(eventName, ...args)` - IPC to client.
   - Note: Server and CEF cannot communicate directly; all data must bridge through the Client script.

## Strict Negative Constraints & Anti-Hallucination

Never import or use functions from FiveM, alt:V, RAGEMP, or SA-MP:
- Prohibited: `RegisterNetEvent`, `TriggerServerEvent`, `TriggerClientEvent`, `AddEventHandler`.
- Prohibited: `alt.onClient`, `alt.emitServer`, `alt.Player.local`.
- Prohibited: `mp.events.add`, `mp.events.callRemote`, `mp.players.local`.
- Prohibited: `SetEntityCoords`, `GetPlayerPed`, `OnPlayerConnect`.

Always use official CyberMP events (`mp.events.on`, `mp.events.onClient`, `mp.events.onServer`, `mp.events.onCef`).

## CyberMP MCP Tools

When available, call MCP tools for authoritative verification:
- `cybermp_get_event`: Fetch verified event signatures and parameter lists.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, and methods.
- `cybermp_get_rpc_flow`: Generate paired RPC code across Server, Client, and CEF.
- `cybermp_search_docs`: Search guides, best practices, and runbooks.

## Resource Architecture & Configuration

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
