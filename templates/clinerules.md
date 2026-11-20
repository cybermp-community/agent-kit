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

## CyberMP MCP Tools

When available, call MCP tools for authoritative verification:
- `cybermp_get_event`: Fetch verified event signatures and parameter lists.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, and methods.
- `cybermp_get_rpc_flow`: Generate paired RPC code across Server, Client, and CEF.
- `cybermp_search_docs`: Search guides, best practices, and runbooks.
- `cybermp_lookup_tweakdb`: Lookup verified Cyberpunk 2077 TweakDB record IDs for status effects, armed vehicles, weapons, and workspots.

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
