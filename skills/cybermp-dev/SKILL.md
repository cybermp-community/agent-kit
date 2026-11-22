---
name: cybermp-dev
description: Comprehensive developer guide and runbook for building CyberMP multiplayer resources (Cyberpunk 2077). Use when creating resources, writing server/client scripts, wiring CEF web UIs, or configuring multiplayer TypeScript environments.
---

# CyberMP Development Runbook & Agent Skill

Welcome to the CyberMP development guide. This skill provides AI agents and human developers with authoritative instructions, runbooks, context boundaries, and anti-hallucination rules for building multiplayer modifications and resources for **Cyberpunk 2077** using the **CyberMP** platform.

---

## 1. The Three-Tier Architecture & Context Separation

CyberMP isolates execution across three completely separate JavaScript runtimes. Never mix their APIs or assumptions:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐         ┌────────────────────────────────┐
│             Server             │         │             Client             │         │          CEF Browser           │
│         (Node.js Host)         │ ◄─────► │        (Game Client V8)        │ ◄─────► │        (Chromium UI)           │
├────────────────────────────────┤         ├────────────────────────────────┤         ├────────────────────────────────┤
│ • Authority over state         │         │ • Runs in Cyberpunk 2077       │         │ • HTML, CSS, React, Vue        │
│ • Database & file system       │         │ • Local entities, streaming    │         │ • Isolated web DOM context     │
│ • mp.events.on (engine events) │         │ • Camera, sound, input binding │         │ • mp.events.on (or window.mp)  │
│ • mp.events.onClient / emit    │         │ • mp.events.onServer / emit    │         │ • mp.events.emit               │
│ • mp.events.emitClient         │         │ • mp.events.emitServer         │         │                                │
│ • mp.commands.add(name, cb)    │         │ • mp.events.emitCef / onCef    │         │                                │
│ • @cybermp/server-types        │         │ • @cybermp/client-types        │         │ • @cybermp/browser-types       │
│                                │         │                                │         │                                │
└────────────────────────────────┘         └────────────────────────────────┘         └────────────────────────────────┘
```

### Context Boundary Rules
1. **Server $\leftrightarrow$ Client**: Communicates via network RPC:
   - Server sends to Client: `mp.events.emitClient(player, eventName, ...args)`
   - Client listens from Server: `mp.events.onServer(eventName, (...args) => ...)`
   - Client sends to Server: `mp.events.emitServer(eventName, ...args)`
   - Server listens from Client: `mp.events.onClient(eventName, (player: MpPlayer, ...args) => ...)`
2. **Client $\leftrightarrow$ CEF Browser**: Communicates via local IPC bridge:
   - Client sends to CEF: `mp.events.emitCef(eventName, ...args)`
   - CEF listens from Client: `mp.events.on(eventName, (...args) => ...)`
   - CEF sends to Client: `mp.events.emit(eventName, ...args)`
   - Client listens from CEF: `mp.events.onCef(eventName, (...args) => ...)`
3. **Server $\leftrightarrow$ CEF Browser**: **DIRECT COMMUNICATION IS IMPOSSIBLE.** The server and CEF browser cannot connect directly. Every event between server and UI must be forwarded through the client script.

---

## 2. Strict Negative Constraints & Anti-Hallucination Rules

Because CyberMP is newer than legacy multiplayer platforms (FiveM, alt:V, RAGEMP, SA-MP), LLMs often hallucinate incorrect APIs. You must **NEVER** use foreign multiplayer platform APIs. CyberMP's JavaScript API uses the global `mp.*` namespace (`mp.events.*`, `mp.commands.*`, `mp.players.*`, `mp.vehicles.*`, `mp.game.*`, `mp.cef.*`, `mp.discord.*`, `mp.localStorage.*`).

### ⛔ Prohibited Foreign Functions & Correct CyberMP Equivalents

| Prohibited Foreign API | Platform | Official CyberMP Equivalent |
|---|---|---|
| `RegisterNetEvent('ev')` / `onNet('ev', cb)` | FiveM | `mp.events.onClient('ev', (player, ...args) => ...)` (Server) or `mp.events.onServer('ev', cb)` (Client) |
| `TriggerServerEvent('ev', ...args)` | FiveM | `mp.events.emitServer('ev', ...args)` (Client) |
| `TriggerClientEvent('ev', id, ...args)` | FiveM | `mp.events.emitClient(player, 'ev', ...args)` (Server) |
| `AddEventHandler('ev', cb)` | FiveM | `mp.events.on('ev', cb)` |
| `GetPlayerPed(-1)` | FiveM | `player` instance / local player context |
| `SetEntityCoords(ped, x, y, z)` | FiveM | Server authorizes a client request; client uses `GetTeleportationFacility().Teleport(...)` (see player mechanics) |
| `SetPedIntoVehicle(ped, veh, seat)` | FiveM | `mp.game.ScriptGameInstance.GetMountingFacility().Mount(mountRequest)` (Client) |
| `SetEntityHealth(ped, health)` | FiveM | `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(...)` (Client) |
| `alt.onClient('ev', cb)` / `alt.onServer` | alt:V | `mp.events.onClient('ev', (player, ...args) => ...)` / `mp.events.onServer('ev', cb)` |
| `alt.emitClient(p, 'ev', ...args)` | alt:V | `mp.events.emitClient(player, 'ev', ...args)` |
| `alt.emitServer('ev', ...args)` | alt:V | `mp.events.emitServer('ev', ...args)` |
| `alt.Player.local` | alt:V | Client-side player entity streaming / reference |
| `mp.events.callRemote('ev', ...args)` | RAGEMP | `mp.events.emitServer('ev', ...args)` |
| `mp.events.callClient(p, 'ev', ...args)`| RAGEMP | `mp.events.emitClient(player, 'ev', ...args)` |
| `mp.players.local` | RAGEMP | Local client player context |
| `OnPlayerConnect` / `SetPlayerPos` | SA-MP | `mp.events.on('playerConnected', (id, tempId) => ...)` / server-authorized client teleport |

For CyberMP Lua, use `mp.events.add(name, fn)` for local listeners. The JavaScript and TypeScript listener is `mp.events.on(name, fn)`. See `skills/cybermp-dev/references/lua-events.md`.

---

## 3. Step-by-Step Resource Creation Runbook

Follow this checklist whenever creating or scaffolding a new CyberMP resource:

### Step 1: Resource Directory Structure
In CyberMP, resources live in the server's `resources/` folder. Every resource requires a `resource.toml` manifest:
```
resources/
└── my-resource/
    ├── resource.toml           # Official CyberMP resource manifest (REQUIRED)
    ├── server.js               # Server-side script (Node.js)
    ├── client.js               # Client-side script (V8 game client)
    └── browser/                # CEF Web UI files
        ├── index.html
        ├── style.css
        └── app.js
```

### Step 2: Configure `resource.toml`
Create `resource.toml` in your resource folder:
```toml
#:schema https://schemas.cyber.mp/resource/schema.json

server_script = ["./server.js"]
client_script = ["./client.js"]
file = ["./browser/*", "./browser/assets/*"]
cef_url = "./browser/index.html"
use_game_natives = true
hotreload = true

author = "YourName"
description = "My CyberMP Resource"
version = "1.0.0"
```

### Step 3: Register in `server.toml`
Add your resource name to the `resources` array in the server root `server.toml`:
```toml
resources = [
  "my-resource"
]
```

### Step 4: Write Core Scripts
1. **Server (`server.js` or compiled TypeScript)**:
   ```typescript
   import type { MpPlayer } from '@cybermp/server-types';

   mp.events.on('playerConnected', (playerId: number, tempId: string) => {
     console.log(`Player ${playerId} joined`);
   });

   mp.events.onClient('ping', (player: MpPlayer) => {
     mp.events.emitClient(player, 'pong', Date.now());
   });
   ```

2. **Client (`client.js` or compiled TypeScript)**:
   ```typescript
   mp.events.onServer('pong', (serverTime: number) => {
     console.log('Pong received from server at:', serverTime);
   });

   mp.events.emitServer('ping');
   ```

---

## 4. CEF Web UI Bridge Guide

CyberMP includes an embedded Chromium environment for rich interactive user interfaces (HUDs, inventories, dialogs, character creators).

### 1. Client Setup
In your client script (`src/client/index.ts`), initialize the webview:
```typescript
// Client registers CEF event listeners
mp.events.onCef('login:submit', (credentials: { username: string; hash: string }) => {
  // Forward to server for verification
  mp.events.emitServer('auth:verify', credentials);
});

// Update the UI from game client events
mp.events.onServer('auth:success', (userData) => {
  mp.events.emitCef('ui:setLoggedIn', userData);
});
```

### 2. Browser Web Application (`src/cef/app.ts`)
The game engine automatically injects the `mp.events` object into the DOM:
```javascript
// Listen for events sent from client-side script
mp.events.on('ui:setLoggedIn', (userData) => {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('welcome-user').innerText = userData.name;
});

// Send events to client-side script upon user actions
document.getElementById('submit-btn').addEventListener('click', () => {
  const username = document.getElementById('user-input').value;
  mp.events.emit('login:submit', { username });
});
```

---

## 5. Player Lifecycle & Commands

### Player Lifecycle Events on Server
```typescript
// 1. Connection negotiation
mp.events.on('playerConnecting', (tempId, name) => {
  console.log(`Connecting: ${tempId} (${name})`);
});

// 2. Fully connected and assigned an ID
mp.events.on('playerConnected', (playerId: number, tempId: string) => {
  console.log(`Connected: ${playerId}`);
});

// 3. Spawning into the world
mp.events.on('playerSpawn', (playerId: number) => {
  console.log(`Spawned player: ${playerId}`);
});

// 4. Damage handling (authoritative, return false to cancel damage)
mp.events.on('damage', (_playerId, data) => {
  console.log(`Player ${data.victimId} took ${data.totalDamage} damage`);
});

// 5. Player death
mp.events.on('playerDeath', (playerId, { killerId }) => {
  console.log(`Player ${playerId} died (killer: ${killerId ?? 'unknown'})`);
});

// 6. Disconnect
mp.events.on('playerDisconnected', (playerId, reason) => {
  console.log(`Player ${playerId} disconnected (reason: ${reason})`);
});
```

### Spawn, Respawn & Health Diagnostics

Server `MpPlayer.position` is readonly in `@cybermp/server-types@3.2.8`; its `Vector3` is a tuple, not a constructor. Read coordinates on the server and authorize movement through a client handler. The command below only dispatches a request: wire `mode:teleport` to the guarded client helper in [player mechanics](references/player-mechanics.md#coordinate-teleportation-implementation).

For falling through the map, zero HP or missing respawn, follow [Spawn and health diagnostics](references/recipes/player-spawn-health.md): check competing spawn resources, then entity readiness, maximum health and current HP, then destination streaming.

### Custom Chat & Console Commands
Register commands using `mp.commands.add`:
```typescript
mp.commands.add('teleport', (player, args) => {
  if (!player) return;
  const [x, y, z] = args.map(Number);
  if (args.length !== 3 || ![x, y, z].every(Number.isFinite)) {
    mp.events.emitClient(player, 'chat:notify', 'Usage: /teleport <x> <y> <z>');
    return;
  }
  // Add server-side permission and destination checks before dispatch.
  mp.events.emitClient(player, 'mode:teleport', x, y, z);
});
```

---

## 6. MCP Tool Call Instructions

<!-- cybermp-evidence:start -->
1. Identify the runtime, CyberMP build, game build and installed type package versions.
2. Use `cybermp_get_type` for declarations, `cybermp_get_event` for event signatures and `cybermp_get_rpc_flow` for cross-runtime event examples.
3. Use `cybermp_search_docs` to check lifecycle, asset dependencies, and the evidence behind a recipe. `cybermp_lookup_tweakdb` searches a curated subset.
4. Run a minimal check on the target build for any behavior the sources leave uncertain. Record the versions and observed result.
<!-- cybermp-evidence:end -->

---

## 7. Offline Fallback Instructions (Without MCP)

If the MCP server is unavailable or running in a skill-only mode:
1. **Consult Local References in `references/`**:
   - [INK HUD and Minimap](references/ui-ink-and-minimap.md)
   - [Archive Prop Workflow](references/recipes/archive-prop.md)
   - [Archive Mod Compatibility](references/archive-mod-compatibility.md): Identify loader dependencies and verify delivery, engine loading, local effects and replication.
   - [Core Events Catalog](references/events.md): Full listener signatures and event parameters for Server, Client, Browser.
   - [RPC Flows Matrix](references/rpc-flows.md): Complete paired code snippets for inter-process communication.
   - [Resource Structure & Toolchain](references/resource-structure.md): Standard directory layout, `package.json`, and `tsconfig.json`.
   - [World Interaction Recipe](references/recipes/world-interaction.md): Native `[F]` prompt via `SendInputHintData`, `MappinSystem`, and `onInputKeyEvent`.
   - [Doors & Scriptable Devices](references/doors-and-devices.md): Local door targeting, device state inspection, and multiplayer reconciliation.
   - [Object Spawning & World Streaming](references/object-spawning-and-streaming.md): Client-local props (`mp.local.spawnObject`) vs server props (`mp.objects.create`), curated `.ent` catalog, and interior occlusion.
   - [Animations & Workspots](references/animations-and-workspots.md): Contextual full-body animations via `gameWorkspotGameSystem` (`PlayInDeviceSimple`, `SendFastExitSignal`, `SendSlowExitSignal`).
   - [Vehicles Tuning, Aesthetics & Combat 2.0](references/vehicles-tuning-combat.md): Apertures via `vehicleControllerPS` (hood, trunk, windows), ignition (`TurnEngineOn`), CrystalCoat shaders, and drive-by shooting.
   - [Native Bridge Setup](references/native-bridge.md) for client manifest settings, lifecycle and value conversions in JavaScript, TypeScript and Lua.
   - [Game Engine & World Natives](references/game-natives.md): REDengine initialization, world time/weather systems, loading screen suppression, 3D to 2D projections.
   - [Vehicles & Physics Reference](references/vehicles-physics.md): Low-level mounting requests, cosmetic/physical deformation repair, nitro impulses, and speedometer curves.
   - [Player Mechanics & Inventory Reference](references/player-mechanics.md): Safe coordinate teleportation, health/god mode, status effect gameplay restrictions, item spawning, and customization mirrors.
   - [Cameras, Input & CEF Integration](references/cameras-input-cef.md): Free camera spawning, player spectating, hardware key events (`onInputKeyEvent`), and CEF focus/cursor control.
   - [Server Mechanics & World Entities](references/server-mechanics.md): Server entity creation, virtual dimensions, spatial safezones, entity metadata synchronization, and persistence.
2. **Inspect Installed Types**:
   Check the TypeScript definition files directly in `node_modules/@cybermp/`:
   - Server: `node_modules/@cybermp/server-types/src/index.ts`
   - Client: `node_modules/@cybermp/client-types/precomputed/index.d.ts`
   - Browser: `node_modules/@cybermp/browser-types/index.d.ts`
3. **Starter Examples**:
   - [Server Starter Example](examples/basic-resource/server.ts)
   - [Client Starter Example](examples/basic-resource/client.ts)

---

## Real-World Mechanics & REDengine Natives (from cybermp-freeroam)

CyberMP client scripts have direct access to REDengine 4 natives when `use_game_natives = true` is configured in `resource.toml`. Below are offline developer guides and practical procedural recipes extracted and verified against production implementations (`cybermp-freeroam`).

### Deep-Dive Reference Guides

- **[World Interaction Recipe](references/recipes/world-interaction.md)**: Native HUD prompt on `[F]` (`mp.game.SendInputHintData`), 3D marker (`MappinSystem.RegisterMappin`), hardware key capture (`onInputKeyEvent`), and singleplayer device caveats.
- **[Doors & Scriptable Devices](references/doors-and-devices.md)**: Door targeting, local `OpenDoor` and `CloseDoor` requests, and verification of shared state.
- **[Object Spawning & World Streaming](references/object-spawning-and-streaming.md)**: Client props (`mp.local.spawnObject`) vs server props (`mp.objects.create`), curated `.ent` depot paths, and interior occlusion culling.
- **[Animations & Workspots](references/animations-and-workspots.md)**: Full-body native animations via `gameWorkspotGameSystem` (`PlayInDeviceSimple`, `SendFastExitSignal`, `SendSlowExitSignal`) for sitting, smoking, leaning, drinking, and dancing.
- **[Vehicles Tuning, Aesthetics & Combat 2.0](references/vehicles-tuning-combat.md)**: Aperture control via `vehicleControllerPS` (hood, trunk, windows), engine toggle (`TurnEngineOn`), CrystalCoat color shaders, body part detachment, and Vehicle Combat 2.0.
- **[Game Engine & World Natives](references/game-natives.md)**: Engine lifecycle (`onceGameLoaded`), quest fact management (`vvc_visual_customization_unlocked`), weather and world time systems, loading screen suppression, and world 3D to screen 2D projections.
- **[Vehicles & Physics Reference](references/vehicles-physics.md)**: Low-level vehicle mounting (`GetMountingFacility().Mount`), deformation and glass reset (`DestructionResetGrid`), velocity changes, and HUD speed calibration.
- **[Player Mechanics & Inventory Reference](references/player-mechanics.md)**: Safe coordinate teleportation (`GetTeleportationFacility().Teleport`) vs physical respawning (`mp.local.spawnPlayer`), stat pool health/god mode, status effect gameplay restrictions, item spawning via `AddToInventory`, and appearance mirror customization.
- **[Cameras, Input & CEF Integration](references/cameras-input-cef.md)**: Custom free camera spawning (`simple_free_camera.ent`), player spectating camera synchronization, hardware key handling via `mp.game.onInputKeyEvent`, and CEF browser focus/cursor control.
- **[Server Mechanics & World Entities](references/server-mechanics.md)**: Authoritative server object creation (`mp.objects.create`), virtual dimension routing, 2D polygon ray-casting safezones, entity metadata synchronization, and persistence patterns.

---

### Procedural Recipes & Snippets

#### 1. Teleport Player Safely (with `GetTeleportationFacility`)

Use REDengine's `TeleportationFacility` to move a spawned player entity without desynchronizing camera rigs or vehicle states:

```typescript
/**
 * Safely teleports the local player entity using REDengine's TeleportationFacility.
 */
export function teleportPlayer(x: number, y: number, z: number, yaw: number = 0): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  const targetPos = Object.assign(new mp.game.Vector4(), {
    x,
    y,
    z,
    w: 1.0,
  });

  const targetRot = Object.assign(new mp.game.EulerAngles(), {
    roll: 0,
    pitch: 0,
    yaw,
  });

  mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(
    player,
    targetPos,
    targetRot,
  );
}
```

#### 2. Vehicle Seat Mounting and Repair

Use the [vehicle physics reference](references/vehicles-physics.md) for authorized mounting, local repair requests, speed telemetry, and tests across vehicle ownership changes.

#### 3. Spawning Weapons and Items

Items are added to the player's inventory using `AddToInventory` and verified with REDengine's `TransactionSystem`:

```typescript
import type { gameItemData } from '@cybermp/client-types/game';

/**
 * Spawns an item or weapon directly into the player's inventory by TweakDB ID.
 */
export function spawnItem(itemKey: string, count: number = 1): void {
  mp.game.AddToInventory(itemKey, count);
}

/**
 * Checks if the player has a specific item in their inventory.
 */
export function hasItem(itemKey: string): boolean {
  const player = mp.game.GetPlayerObject();
  if (!player) return false;

  const transactionSystem = mp.game.ScriptGameInstance.GetTransactionSystem();
  const [, itemsList] = transactionSystem.GetItemList(player) as [boolean, gameItemData[]];
  const targetId = mp.game.gameItemID.FromTDBID(itemKey);

  return itemsList.some((item) => item.GetID().id === targetId.id);
}
```

#### 4. Binding Key Inputs (`onInputKeyEvent`)

CyberMP captures hardware key actions through `mp.game.onInputKeyEvent`:

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

type KeyCallback = (action: EInputAction) => void;
const keyListeners = new Map<EInputKey, Set<KeyCallback>>();
let inputInitialized = false;

/**
 * Binds a callback to a hardware key event (press/release).
 */
export function bindKey(key: EInputKey, callback: KeyCallback): () => void {
  if (!inputInitialized) {
    inputInitialized = true;
    mp.game.onInputKeyEvent((action: EInputAction, pressedKey: EInputKey) => {
      const callbacks = keyListeners.get(pressedKey);
      if (callbacks) {
        for (const cb of callbacks) cb(action);
      }
    });
  }

  if (!keyListeners.has(key)) {
    keyListeners.set(key, new Set());
  }
  keyListeners.get(key)!.add(callback);

  return () => {
    const set = keyListeners.get(key);
    if (set) {
      set.delete(callback);
      if (set.size === 0) keyListeners.delete(key);
    }
  };
}
```

#### 5. Controlling CEF Focus and Cursor

When an HTML menu or dialog is open, pass input focus to CEF and unhide the cursor:

```typescript
/**
 * Toggles CEF browser input focus and cursor visibility.
 * When focus is enabled, keyboard input is routed to the HTML DOM.
 */
export function setCefFocus(enabled: boolean): void {
  mp.cef.setFocus(enabled, enabled);
}

/**
 * Checks if the CEF browser currently holds input focus.
 */
export function isCefFocused(): boolean {
  return mp.cef.isInFocus();
}
```
