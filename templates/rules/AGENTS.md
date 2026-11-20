# CyberMP Development Rules

Authoritative guidelines and instructions for CyberMP (Cyberpunk 2077 multiplayer) development in Antigravity.

## Context Boundaries

All calls to CyberMP native methods and systems run through the global `mp.*` namespace (`mp.events.*`, `mp.commands.*`, `mp.players.*`, `mp.vehicles.*`, `mp.local.*` / `mp.localStorage.*`, `mp.game.*`):

1. **Server** (`@cybermp/server-types`): Node.js environment. Authoritative logic, player state, commands, and database access.
   - Listen to engine events: `mp.events.on(name, callback)`
   - Listen to client RPCs: `mp.events.onClient(name, (player: MpPlayer, ...args) => ...)`
   - Send to client: `mp.events.emitClient(player, name, ...args)`
   - Register commands: `mp.commands.add(name, (player: MpPlayer, ...args) => ...)`
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
- Prohibited: `mp.events.add`, `mp.events.callRemote`, `mp.players.local`.

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

Always verify against CyberMP event and RPC signatures.

### Reference Guides Suite
Detailed native implementation patterns are documented in `skills/cybermp-dev/references/`:
- Native [F] Prompt & Markers: `recipes/world-interaction.md`
- Doors & Interior Unlocking: `doors-and-devices.md`
- Props & Interior Streaming: `object-spawning-and-streaming.md`
- Ambient Animations & Workspots: `animations-and-workspots.md`
- Vehicle Tuning, Shaders & Combat 2.0: `vehicles-tuning-combat.md`
- Engine Systems & Lifecycle: `game-natives.md`
- Player Lifecycle & Restrictions: `player-mechanics.md`

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
