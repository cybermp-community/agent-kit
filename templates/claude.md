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
- Prohibited: `SetEntityCoords(ped, x, y, z)` → Mandated: `mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(player, targetPos, targetRot)`
- Prohibited: `SetPedIntoVehicle(ped, veh, seat)` → Mandated: `mp.game.ScriptGameInstance.GetMountingFacility().Mount(mountRequest)`
- Prohibited: `SetEntityHealth(ped, health)` → Mandated: `mp.game.ScriptGameInstance.GetStatPoolsSystem().RequestSettingStatPoolValueIgnoreChangeMode(...)`
- Prohibited: `SetVehicleDoorOpen` / `SetVehicleDoorBroken` → Mandated: `vehicle.GetVehicleControllerPS().SetDoorState(door, state, immediate)`
- Prohibited: `SetVehicleEngineOn` → Mandated: `vehicle.TurnEngineOn(engineOn)`
- Prohibited: `TaskPlayAnim` / `PlayEntityAnim` → Mandated: `mp.game.ScriptGameInstance.GetWorkspotSystem().PlayInDeviceSimple(device, actor, allowCameraMov)`
- Prohibited: `CreateObject` / `CreateObjectNoOffset` → Mandated: `mp.local.spawnObject(skinHash, appHash, x, y, z, roll, pitch, yaw, streaming)` (client) or `mp.objects.create({ model, position, dimension })` (server)

All REDengine native type instantiations must use `Object.assign(new mp.game.<Type>(), { ... })`.

### Reference Guides Suite
Detailed native implementation patterns are documented in `skills/cybermp-dev/references/`:
- Native [F] Prompt & Markers: `recipes/world-interaction.md`
- Doors & Interior Unlocking: `doors-and-devices.md`
- Props & Interior Streaming: `object-spawning-and-streaming.md`
- Ambient Animations & Workspots: `animations-and-workspots.md`
- Vehicle Tuning, Shaders & Combat 2.0: `vehicles-tuning-combat.md`
- Engine Systems & Lifecycle: `game-natives.md`
- Player Lifecycle & Restrictions: `player-mechanics.md`

## CyberMP MCP Server Tools

When `cybermp-agent-kit` is available, query these tools rather than hallucinating signatures:
- `cybermp_get_event`: Fetch verified event signatures, listener parameters, and execution contexts.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, methods, and doc comments.
- `cybermp_get_rpc_flow`: Generate paired sender and receiver boilerplate code.
- `cybermp_search_docs`: Search official guides and documentation.
- `cybermp_lookup_tweakdb`: Lookup verified Cyberpunk 2077 TweakDB record IDs for status effects, armed vehicles, weapons, and workspots.

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
