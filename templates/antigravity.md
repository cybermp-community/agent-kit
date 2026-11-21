# CyberMP Development Rules

Authoritative guidelines and instructions for CyberMP (Cyberpunk 2077 multiplayer) development in Antigravity.

## Context Boundaries

All calls to CyberMP native methods and systems run through the global `mp.*` namespace (`mp.events.*`, `mp.commands.*`, `mp.players.*`, `mp.vehicles.*`, `mp.local.*` / `mp.localStorage.*`, `mp.game.*`):

1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative logic, player state, commands, and database access.
   - Listen to engine events: `mp.events.on(name, callback)`
   - Listen to client RPCs: `mp.events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `mp.events.emitClient(player, name, ...args)`
   - Register commands: `mp.commands.add(name, (player: MpPlayer | null, args: string[]) => ...)`
2. **Client** (`@cybermp/client-types`): In-game V8 environment inside Cyberpunk 2077. Local entities, camera, sound, and input.
   - Listen to server: `mp.events.onServer(name, callback)`
   - Send to server: `mp.events.emitServer(name, ...args)`
   - Listen to CEF: `mp.events.onCef(name, callback)`
   - Send to CEF: `mp.events.emitCef(name, ...args)`
3. **CEF Browser** (`@cybermp/browser-types`): Chromium web runtime for HUD, menus, and UI.
   - Listen to client: `mp.events.on(name, callback)`
   - Send to client: `mp.events.emit(name, ...args)`
   - Direct connection to Server is impossible; all data must bridge through the Client.

## Anti-Hallucination & Negative Constraints

DO NOT hallucinate APIs from FiveM, alt:V, RAGEMP, or SA-MP:
- Prohibited: `RegisterNetEvent`, `TriggerClientEvent`, `TriggerServerEvent`, `AddEventHandler`, `GetPlayerPed`, `SetEntityCoords`, `SetPedIntoVehicle`, `SetEntityHealth`.
- Prohibited: `alt.onClient`, `alt.emitServer`, `alt.Player.local`.
- Prohibited: `mp.events.callRemote`, `mp.players.local`.

For CyberMP Lua, use `mp.events.add(name, fn)` for local listeners. The JavaScript and TypeScript listener is `mp.events.on(name, fn)`. See `skills/cybermp-dev/references/lua-events.md`.

### REDengine Game Natives Guidance
When `use_game_natives = true` is configured in `resource.toml`, client scripts can access REDengine through `mp.game` in JavaScript and TypeScript or `Game` in Lua.

DO NOT hallucinate FiveM or GTA native methods for player, vehicle, door, prop, or animation manipulation:

When initializing native data, use the constructor and field assignments supported by the target binding.

Always verify against CyberMP event and RPC signatures.

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

## MCP Tools

<!-- cybermp-evidence:start -->
1. Identify the runtime, CyberMP build, game build and installed type package versions.
2. Use `cybermp_get_type` for declarations, `cybermp_get_event` for event signatures and `cybermp_get_rpc_flow` for cross-runtime event examples.
3. Use `cybermp_search_docs` to check lifecycle, asset dependencies, and the evidence behind a recipe. `cybermp_lookup_tweakdb` searches a curated subset.
4. Run a minimal check on the target build for any behavior the sources leave uncertain. Record the versions and observed result.
<!-- cybermp-evidence:end -->

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
