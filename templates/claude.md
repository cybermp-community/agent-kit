# CyberMP Development Guidelines (CLAUDE.md)

Guidelines for developing Cyberpunk 2077 multiplayer resources using the CyberMP platform.

## Architecture & Context Separation

CyberMP features three strictly isolated runtime environments:
- **Server (`@cybermp/server-types`)**: Node.js runtime. Authoritative game logic, persistence, and console/chat commands.
- **Client (`@cybermp/client-types`)**: In-game V8 runtime inside Cyberpunk 2077. Entity management, streaming, camera, sound, and local input.
- **CEF Browser (`@cybermp/browser-types`)**: Isolated Chromium web browser runtime. User interface, HUD, and interactive web elements.

### Communication Channels
All native calls run through the global `mp.*` namespace:
- **Server to Client RPC**:
  - Server emits: `mp.events.emitClient(player, 'eventName', ...args)`
  - Client listens: `mp.events.onServer('eventName', (...args) => ...)`
- **Client to Server RPC**:
  - Client emits: `mp.events.emitServer('eventName', ...args)`
  - Server listens: `mp.events.onClient('eventName', (player: MpPlayer, ...args) => ...)`
- **Client to CEF IPC**:
  - Client emits: `mp.events.emitCef('eventName', ...args)`
  - CEF listens: `mp.events.on('eventName', (...args) => ...)`
- **CEF to Client IPC**:
  - CEF emits: `mp.events.emit('eventName', ...args)`
  - Client listens: `mp.events.onCef('eventName', (...args) => ...)`
- **Server <-> CEF Direct Communication**: IMPOSSIBLE. Every event between server and CEF browser UI must be routed through the client runtime.

## Strict Negative Constraints & Anti-Hallucination

CyberMP is not FiveM, alt:V, RAGEMP, or SA-MP. DO NOT use APIs from other multiplayer platforms:
- **FiveM Prohibited**: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler`, `GetPlayerPed`, `SetEntityCoords`.
- **alt:V Prohibited**: `alt.onClient`, `alt.onServer`, `alt.emitClient`, `alt.emitServer`, `alt.Player.local`.
- **RAGEMP Prohibited**: `mp.events.add`, `mp.events.callRemote`, `mp.events.callClient`, `mp.players.local`.
- **SA-MP Prohibited**: `OnPlayerConnect`, `SetPlayerPos`.

Always use official CyberMP events (`mp.events.on`, `mp.events.onClient`, `mp.events.onServer`, `mp.events.onCef`).

### REDengine Game Natives Guidance
When `use_game_natives = true` is configured in `resource.toml`, client scripts gain direct access to `mp.game.*` for REDengine native classes, systems, and facilities.

DO NOT hallucinate FiveM or GTA native methods for player, vehicle, door, prop, or animation manipulation:

When initializing native data, use the constructor and field assignments supported by the target binding.

### Reference Guides Suite
- Map tasks and HUD: `ui-ink-and-minimap.md`
- Custom asset delivery: `recipes/archive-prop.md`
Detailed native implementation patterns are documented in `skills/cybermp-dev/references/`:
- Native [F] Prompt & Markers: `recipes/world-interaction.md`
- Doors & Interior Unlocking: `doors-and-devices.md`
- Props & Interior Streaming: `object-spawning-and-streaming.md`
- Ambient Animations & Workspots: `animations-and-workspots.md`
- Vehicle Tuning, Shaders & Combat 2.0: `vehicles-tuning-combat.md`
- Engine Systems & Lifecycle: `game-natives.md`
- Player Lifecycle & Restrictions: `player-mechanics.md`

## CyberMP MCP Server Tools

<!-- cybermp-evidence:start -->
1. Identify the runtime, CyberMP build, game build and installed type package versions.
2. Use `cybermp_get_type` for declarations, `cybermp_get_event` for event signatures and `cybermp_get_rpc_flow` for cross-runtime event examples.
3. Use `cybermp_search_docs` to check lifecycle, asset dependencies, and the evidence behind a recipe. `cybermp_lookup_tweakdb` searches a curated subset.
4. Run a minimal check on the target build for any behavior the sources leave uncertain. Record the versions and observed result.
<!-- cybermp-evidence:end -->

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
file = ["./browser/*", "./browser/assets/*"]
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
