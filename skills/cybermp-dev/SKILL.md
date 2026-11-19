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
│ • events.on (engine events)    │         │ • Camera, sound, input binding │         │ • window.cybermp.events.on     │
│ • events.onClient(name, (p)...)│         │ • events.onServer(name, cb)    │         │ • window.cybermp.events.emit   │
│ • events.emitClient(player...) │         │ • events.emitServer(name, args)│         │                                │
│ • commands.add(name, cb)       │         │ • events.emitCef(name, args)   │         │                                │
│ • @cybermp/server-types        │         │ • events.onCef(name, cb)       │         │ • @cybermp/browser-types       │
│                                │         │ • @cybermp/client-types        │         │                                │
└────────────────────────────────┘         └────────────────────────────────┘         └────────────────────────────────┘
```

### Context Boundary Rules
1. **Server $\leftrightarrow$ Client**: Communicates via network RPC:
   - Server sends to Client: `events.emitClient(player, eventName, ...args)`
   - Client listens from Server: `events.onServer(eventName, (...args) => ...)`
   - Client sends to Server: `events.emitServer(eventName, ...args)`
   - Server listens from Client: `events.onClient(eventName, (player: MpPlayer, ...args) => ...)`
2. **Client $\leftrightarrow$ CEF Browser**: Communicates via local IPC bridge:
   - Client sends to CEF: `events.emitCef(eventName, ...args)`
   - CEF listens from Client: `cybermp.events.on(eventName, (...args) => ...)`
   - CEF sends to Client: `cybermp.events.emit(eventName, ...args)`
   - Client listens from CEF: `events.onCef(eventName, (...args) => ...)`
3. **Server $\leftrightarrow$ CEF Browser**: **DIRECT COMMUNICATION IS IMPOSSIBLE.** The server and CEF browser cannot connect directly. Every event between server and UI must be forwarded through the client script.

---

## 2. Strict Negative Constraints & Anti-Hallucination Rules

Because CyberMP is newer than legacy multiplayer platforms (FiveM, alt:V, RAGEMP, SA-MP), LLMs often hallucinate incorrect APIs. You must **NEVER** use foreign multiplayer platform APIs.

### ⛔ Prohibited Foreign Functions & Correct CyberMP Equivalents

| Prohibited Foreign API | Platform | Official CyberMP Equivalent |
|---|---|---|
| `RegisterNetEvent('ev')` / `onNet('ev', cb)` | FiveM | `events.onClient('ev', (player, ...args) => ...)` (Server) or `events.onServer('ev', cb)` (Client) |
| `TriggerServerEvent('ev', ...args)` | FiveM | `events.emitServer('ev', ...args)` (Client) |
| `TriggerClientEvent('ev', id, ...args)` | FiveM | `events.emitClient(player, 'ev', ...args)` (Server) |
| `AddEventHandler('ev', cb)` | FiveM | `events.on('ev', cb)` |
| `GetPlayerPed(-1)` | FiveM | `player` instance / local player context |
| `SetEntityCoords(ped, x, y, z)` | FiveM | `player.position = new Vector3(x, y, z)` (Server) or `GetTeleportationFacility().Teleport(...)` (Client) |
| `SetPedIntoVehicle(ped, veh, seat)` | FiveM | `mp.game.ScriptGameInstance.GetMountingFacility().Mount(mountRequest)` (Client) |
| `SetEntityHealth(ped, health)` | FiveM | `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(...)` (Client) |
| `alt.onClient('ev', cb)` / `alt.onServer` | alt:V | `events.onClient('ev', (player, ...args) => ...)` / `events.onServer('ev', cb)` |
| `alt.emitClient(p, 'ev', ...args)` | alt:V | `events.emitClient(player, 'ev', ...args)` |
| `alt.emitServer('ev', ...args)` | alt:V | `events.emitServer('ev', ...args)` |
| `alt.Player.local` | alt:V | Client-side player entity streaming / reference |
| `mp.events.add('ev', cb)` | RAGEMP | `events.on('ev', cb)` |
| `mp.events.callRemote('ev', ...args)` | RAGEMP | `events.emitServer('ev', ...args)` |
| `mp.events.callClient(p, 'ev', ...args)`| RAGEMP | `events.emitClient(player, 'ev', ...args)` |
| `mp.players.local` | RAGEMP | Local client player context |
| `OnPlayerConnect` / `SetPlayerPos` | SA-MP | `events.on('playerConnected', (id, tempId) => ...)` / `player.position` |

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
file = ["./browser/**/*"]
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

   events.on('playerConnected', (playerId: number, tempId: string) => {
     console.log(`Player ${playerId} joined`);
   });

   events.onClient('ping', (player: MpPlayer) => {
     events.emitClient(player, 'pong', Date.now());
   });
   ```

2. **Client (`client.js` or compiled TypeScript)**:
   ```typescript
   events.onServer('pong', (serverTime: number) => {
     console.log('Pong received from server at:', serverTime);
   });

   events.emitServer('ping');
   ```

---

## 4. CEF Web UI Bridge Guide

CyberMP includes an embedded Chromium environment for rich interactive user interfaces (HUDs, inventories, dialogs, character creators).

### 1. Client Setup
In your client script (`src/client/index.ts`), initialize the webview:
```typescript
// Client registers CEF event listeners
events.onCef('login:submit', (credentials: { username: string; hash: string }) => {
  // Forward to server for verification
  events.emitServer('auth:verify', credentials);
});

// Update the UI from game client events
events.onServer('auth:success', (userData) => {
  events.emitCef('ui:setLoggedIn', userData);
});
```

### 2. Browser Web Application (`src/cef/app.ts`)
The game engine automatically injects the `window.cybermp` object into the DOM:
```javascript
// Listen for events sent from client-side script
cybermp.events.on('ui:setLoggedIn', (userData) => {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('welcome-user').innerText = userData.name;
});

// Send events to client-side script upon user actions
document.getElementById('submit-btn').addEventListener('click', () => {
  const username = document.getElementById('user-input').value;
  cybermp.events.emit('login:submit', { username });
});
```

---

## 5. Player Lifecycle & Commands

### Player Lifecycle Events on Server
```typescript
// 1. Connection negotiation
events.on('playerConnecting', (tempId: string, ip: string) => {
  console.log(`Connecting: ${tempId} from ${ip}`);
});

// 2. Fully connected and assigned an ID
events.on('playerConnected', (playerId: number, tempId: string) => {
  console.log(`Connected: ${playerId}`);
});

// 3. Spawning into the world
events.on('playerSpawn', (playerId: number) => {
  console.log(`Spawned player: ${playerId}`);
});

// 4. Damage handling (authoritative, return false to cancel damage)
events.on('damage', (playerId: number, data: DamageEventData) => {
  console.log(`Player ${playerId} took ${data.totalDamage} damage from ${data.killerId}`);
});

// 5. Player death
events.on('playerDeath', (playerId: number, killerId: number, reason: number) => {
  console.log(`Player ${playerId} killed by ${killerId} (reason: ${reason})`);
});

// 6. Disconnect
events.on('playerDisconnected', (playerId: number, reason: number) => {
  console.log(`Player ${playerId} disconnected (code: ${reason})`);
});
```

### Custom Chat & Console Commands
Register commands using `commands.add`:
```typescript
commands.add('teleport', (player: MpPlayer, x: string, y: string, z: string) => {
  if (!x || !y || !z) {
    events.emitClient(player, 'chat:notify', 'Usage: /teleport <x> <y> <z>');
    return;
  }
  player.position = new Vector3(parseFloat(x), parseFloat(y), parseFloat(z));
});
```

---

## 6. MCP Tool Call Instructions

When this agent environment is connected to the `cybermp-agent-kit` MCP server, query the specialized tools before writing code:

1. **`cybermp_get_event`**:
   - Query exact event callback parameters and JSDocs.
   - Example: `cybermp_get_event({ env: "server", name: "damage" })`
2. **`cybermp_get_type`**:
   - Look up class, interface, and enum definitions from `@cybermp/*-types`.
   - Example: `cybermp_get_type({ name: "MpPlayer", env: "server" })`
3. **`cybermp_get_rpc_flow`**:
   - Obtain verified paired snippets for RPC transmission.
   - Example: `cybermp_get_rpc_flow({ from: "client", to: "server" })`
4. **`cybermp_search_docs`**:
   - Search official guides for recipes and implementation patterns.
   - Example: `cybermp_search_docs({ query: "live reload" })`

---

## 7. Offline Fallback Instructions (Without MCP)

If the MCP server is unavailable or running in a skill-only mode:
1. **Consult Local References in `references/`**:
   - [Core Events Catalog](references/events.md): Full listener signatures and event parameters for Server, Client, Browser.
   - [RPC Flows Matrix](references/rpc-flows.md): Complete paired code snippets for inter-process communication.
   - [Resource Structure & Toolchain](references/resource-structure.md): Standard directory layout, `package.json`, and `tsconfig.json`.
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

- **[Game Engine & World Natives](references/game-natives.md)**: Engine lifecycle (`onceGameLoaded`), quest fact management (`vvc_visual_customization_unlocked`), weather and world time systems, loading screen suppression, and world 3D to screen 2D projections.
- **[Vehicles & Physics Reference](references/vehicles-physics.md)**: Low-level vehicle mounting (`GetMountingFacility().Mount`), full 10-part deformation and glass repair (`DestructionResetGrid`), linear impulse physics (nitro boost), and true speedometer calculations via vehicle curve evaluation.
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

Mounting into vehicles requires low-level `MountingFacility.Mount` calls. Full cosmetic and physical repair requires clearing blend shapes, flat tires, and resetting destruction grids:

```typescript
import * as CyberEnums from '@cybermp/client-types/enums';
import type { vehicleBaseObject } from '@cybermp/client-types/game';

/**
 * Mounts the local player into a streamed vehicle seat via REDengine's MountingFacility.
 */
export function mountPlayerInVehicle(
  vehicle: vehicleBaseObject,
  slotName: string = 'seat_front_left',
  instant: boolean = true,
): void {
  const player = mp.game.GetPlayer();
  if (!player || !vehicle) return;

  const mountData = Object.assign(new mp.game.gameMountEventData(), {
    isInstant: instant,
    slotName,
    mountParentEntityId: vehicle.GetEntityID(),
    entryAnimName: 'forcedTransition',
  });

  const slotID = Object.assign(new mp.game.gamemountingMountingSlotId(), {
    id: slotName,
  });

  const mountingInfo = Object.assign(new mp.game.gamemountingMountingInfo(), {
    childId: player.GetEntityID(),
    parentId: vehicle.GetEntityID(),
    slotId: slotID,
  });

  const mountRequest = Object.assign(new mp.game.gamemountingMountingRequest(), {
    lowLevelMountingInfo: mountingInfo,
    mountData,
  });

  mp.game.ScriptGameInstance.GetMountingFacility().Mount(mountRequest);
}

const DEFORMATION_PARTS = [
  'hood_destruction',
  'wheel_f_l_destruction',
  'wheel_f_r_destruction',
  'bumper_b_destruction',
  'bumper_f_destruction',
  'door_f_l_destruction',
  'door_f_r_destruction',
  'trunk_destruction',
  'bumper_b_destruction_side_2',
  'bumper_f_destruction_side_2',
] as const;

/**
 * Performs a 100% complete physical and cosmetic restoration of a vehicle.
 */
export function repairVehicle(vehicle: vehicleBaseObject): void {
  if (!vehicle) return;

  const comp = vehicle.GetVehicleComponent();
  const vehType = vehicle.GetVehicleType();

  if (vehType !== CyberEnums.gamedataVehicleType.Bike) {
    comp.bumperFrontState = 0;
    comp.bumperBackState = 0;
    for (const part of DEFORMATION_PARTS) {
      mp.game.entAnimationControllerComponent.SetInputFloat(vehicle, part, 0.0);
    }
  }

  comp.damageLevel = 0;

  // Restore flat/broken tires if applicable
  const flatTireIndex = (vehicle as any).GetFlatTireIndex?.() ?? -1;
  if (flatTireIndex >= 0) {
    for (let i = 0; i < 4; i++) {
      (vehicle as any).ToggleBrokenTire?.(i, false);
    }
  }

  vehicle.DestructionResetGrid();
  vehicle.DestructionResetGlass();
}
```

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
