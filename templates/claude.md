# CyberMP Development Guidelines (CLAUDE.md)

Guidelines for developing Cyberpunk 2077 multiplayer resources using the CyberMP platform.

## Architecture & Context Separation

CyberMP features three strictly isolated runtime environments:
- **Server (`@cybermp/server-types`)**: Node.js runtime. Authoritative game logic, persistence, and console/chat commands.
- **Client (`@cybermp/client-types`)**: In-game V8 runtime inside Cyberpunk 2077. Entity management, streaming, camera, sound, and local input.
- **CEF Browser (`@cybermp/browser-types`)**: Isolated Chromium web browser runtime. User interface, HUD, and interactive web elements.

### Communication Channels
- **Server to Client RPC**:
  - Server emits: `events.emitClient(player, 'eventName', ...args)`
  - Client listens: `events.onServer('eventName', (...args) => ...)`
- **Client to Server RPC**:
  - Client emits: `events.emitServer('eventName', ...args)`
  - Server listens: `events.onClient('eventName', (player: MpPlayer, ...args) => ...)`
- **Client to CEF IPC**:
  - Client emits: `events.emitCef('eventName', ...args)`
  - CEF listens: `cybermp.events.on('eventName', (...args) => ...)`
- **CEF to Client IPC**:
  - CEF emits: `cybermp.events.emit('eventName', ...args)`
  - Client listens: `events.onCef('eventName', (...args) => ...)`
- **Server <-> CEF Direct Communication**: IMPOSSIBLE. Every event between server and CEF browser UI must be routed through the client runtime.

## Strict Negative Constraints & Anti-Hallucination

CyberMP is not FiveM, alt:V, RAGEMP, or SA-MP. DO NOT use APIs from other multiplayer platforms:
- **FiveM Prohibited**: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler`, `GetPlayerPed`, `SetEntityCoords`.
- **alt:V Prohibited**: `alt.onClient`, `alt.onServer`, `alt.emitClient`, `alt.emitServer`, `alt.Player.local`.
- **RAGEMP Prohibited**: `mp.events.add`, `mp.events.callRemote`, `mp.events.callClient`, `mp.players.local`.
- **SA-MP Prohibited**: `OnPlayerConnect`, `SetPlayerPos`.

Always use official CyberMP events (`events.on`, `events.onClient`, `events.onServer`, `events.onCef`, `cybermp.events.on`).

## CyberMP MCP Server Tools

When `cybermp-agent-kit` is available, query these tools rather than hallucinating signatures:
- `cybermp_get_event`: Fetch verified event signatures, listener parameters, and execution contexts.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, methods, and doc comments.
- `cybermp_get_rpc_flow`: Generate paired sender and receiver boilerplate code.
- `cybermp_search_docs`: Search official guides and documentation.

## TypeScript Configuration & Coding Conventions

- Do not import `events` as a value import from `@cybermp/*`. `events` is a runtime global provided by the host environment.
- Use explicit type-only imports:
  ```typescript
  import type { MpPlayer } from '@cybermp/server-types';
  import type { Vector3 } from '@cybermp/client-types';
  ```
- Use separate `tsconfig.server.json` and `tsconfig.client.json` files.
- Bundle client and CEF code using `esbuild` or modern bundlers with ESM or IIFE output formats.

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
