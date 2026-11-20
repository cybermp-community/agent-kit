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
- Prohibited: `mp.events.add`, `mp.events.callRemote`, `mp.players.local` (RAGEMP).
- Prohibited: `OnPlayerConnect`, `SetPlayerPos` (SA-MP).

Use CyberMP's native APIs and TypeScript type definitions.

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

## MCP Tools Integration

If the `cybermp-agent-kit` server is configured:
- `cybermp_get_event`: Query event names and listener callback signatures.
- `cybermp_get_type`: Inspect TypeScript interfaces, properties, and methods.
- `cybermp_get_rpc_flow`: Retrieve bidirectional sender/receiver RPC code snippets.
- `cybermp_search_docs`: Search guides, best practices, and runbooks.
- `cybermp_lookup_tweakdb`: Query verified Cyberpunk 2077 TweakDB record IDs for status effects, armed vehicles, weapons, and workspots.

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
