# CyberMP Multiplayer Development Rules (Universal)

Universal rules and reference for AI coding assistants developing CyberMP multiplayer resources for Cyberpunk 2077.

## Three-Tier Architecture

CyberMP code runs in three strictly isolated execution contexts:
- **Server**: Authoritative Node.js runtime (`@cybermp/server-types`).
  - Native engine events: `events.on(eventName, callback)`
  - Client RPC handler: `events.onClient(eventName, (player: MpPlayer, ...args) => ...)`
  - Emit to client: `events.emitClient(player, eventName, ...args)`
  - Server commands: `commands.add(commandName, callback)`
- **Client**: In-game client runtime (`@cybermp/client-types`).
  - Server RPC handler: `events.onServer(eventName, (...args) => ...)`
  - Emit to server: `events.emitServer(eventName, ...args)`
  - CEF IPC handler: `events.onCef(eventName, (...args) => ...)`
  - Emit to CEF: `events.emitCef(eventName, ...args)`
- **CEF**: Embedded Chromium UI (`@cybermp/browser-types`).
  - Client IPC handler: `mp.events.on(eventName, (...args) => ...)`
  - Emit to client: `mp.events.emit(eventName, ...args)`
  - Important: Server and CEF have no direct connection.

## Strict Anti-Hallucination Guardrails

Do not confuse CyberMP with older multiplayer platforms:
- Prohibited: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler` (FiveM).
- Prohibited: `alt.onClient`, `alt.emitServer`, `alt.Player.local` (alt:V).
- Prohibited: `mp.events.callRemote`, `mp.players.local` (RAGEMP).
- Prohibited: `OnPlayerConnect`, `SetPlayerPos` (SA-MP).

For CyberMP Lua, use `mp.events.add(name, fn)` for local listeners. The JavaScript and TypeScript listener is `mp.events.on(name, fn)`. See `skills/cybermp-dev/references/lua-events.md`.

Use CyberMP's native APIs and TypeScript type definitions.

### REDengine Game Natives Guidance
When `use_game_natives = true` is configured in `resource.toml`, client scripts can access REDengine through `mp.game` in JavaScript and TypeScript or `Game` in Lua.

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

## MCP Tools Integration

<!-- cybermp-evidence:start -->
1. Identify the runtime, CyberMP build, game build and installed type package versions.
2. Use `cybermp_get_type` for declarations, `cybermp_get_event` for event signatures and `cybermp_get_rpc_flow` for cross-runtime event examples.
3. Use `cybermp_search_docs` to check lifecycle, asset dependencies, and the evidence behind a recipe. `cybermp_lookup_tweakdb` searches a curated subset.
4. Run a minimal check on the target build for any behavior the sources leave uncertain. Record the versions and observed result.
<!-- cybermp-evidence:end -->

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
