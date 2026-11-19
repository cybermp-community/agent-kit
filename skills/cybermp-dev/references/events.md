# CyberMP Core Events Reference

This offline reference documents the event system and core events available across the three CyberMP execution environments: **Server**, **Client**, and **CEF Browser**.

---

## 1. Listener Syntaxes by Environment

### Server Environment (`@cybermp/server-types`)
The server environment runs on Node.js. Event listeners are registered through the global `events` object:

```typescript
// 1. Internal & Game Engine Events (Strongly typed)
events.on('playerConnected', (playerId: number, tempId: string) => {
  console.log(`Player connected with ID ${playerId} (tempId: ${tempId})`);
});

// 2. Client-to-Server RPC Events (First argument is ALWAYS the sending MpPlayer instance)
events.onClient('buyItem', (player: MpPlayer, itemId: string, amount: number) => {
  console.log(`Player ${player.name} requested to buy ${amount}x ${itemId}`);
});

// 3. Emitting to Client
events.emitClient(player, 'purchaseSuccess', { itemId, balance: 5000 });

// 4. Deregistering listeners
events.off('playerConnected', handler);
```

### Client Environment (`@cybermp/client-types`)
The client environment runs within the Cyberpunk 2077 V8 runtime. Event listeners are registered through the global `events` object:

```typescript
// 1. Engine & Streaming Events
events.on('remotePlayerStreamIn', (player: MpPlayer) => {
  console.log(`Remote player streamed in: ${player.name}`);
});

// 2. Server-to-Client RPC Events (Triggered by events.emitClient on server)
events.onServer('purchaseSuccess', (data: { itemId: string; balance: number }) => {
  console.log(`Purchased ${data.itemId}, new balance: ${data.balance}`);
});

// 3. Browser (CEF) to Client Events (Triggered by cybermp.events.emit in CEF)
events.onCef('submitLogin', (username: string, passHash: string) => {
  events.emitServer('authLogin', username, passHash);
});

// 4. Emitting to Server
events.emitServer('requestInventory');

// 5. Emitting to Browser (CEF)
events.emitCef('updateHealth', 85);
```

### Browser Environment (`@cybermp/browser-types`)
The CEF browser runs inside Chromium for web UIs. Events communicate with the game client via `window.cybermp.events`:

```javascript
// 1. Listen for messages from client-side script
cybermp.events.on('updateHealth', (health) => {
  document.getElementById('health-bar').style.width = `${health}%`;
});

// 2. Send messages back to client-side script
cybermp.events.emit('uiReady');

// 3. Remove listener
cybermp.events.off('updateHealth', handler);
```

---

## 2. Server Events Catalog (`events.on`)

### Player Lifecycle
| Event | Signature | Description |
|---|---|---|
| `playerConnecting` | `(tempId: string, ip: string): void` | Triggered when a player begins connection negotiation. |
| `playerConnected` | `(playerId: number, tempId: string): void` | Triggered when a player has fully joined and received an entity ID. |
| `playerSpawn` | `(playerId: number): void` | Triggered when a player's character spawns into the world. |
| `playerRespawn` | `(playerId: number): void` | Triggered when a player respawns after death. |
| `playerDespawn` | `(playerId: number): void` | Triggered when a player entity is despawned from the world. |
| `playerDeath` | `(playerId: number, data: PlayerDeathEventData): void` | Triggered when a player character dies (`data.killerId?: number`). |
| `playerDisconnected` | `(playerId: number, reason: string): void` | Triggered when a player disconnects from the server. |
| `playerAppearanceChange` | `(playerId: number, data: PlayerAppearanceChangeEventData): void \| boolean` | Triggered when player clothing/morph attributes update. |

### Combat & Actions
| Event | Signature | Description |
|---|---|---|
| `damage` | `(playerId: number, data: DamageEventData): void \| boolean` | Triggered when a player takes damage. Return `false` to cancel. |
| `meleeAction` | `(playerId: number, actionType: MeleeActionType): void` | Triggered when a player executes a melee attack/combo. |
| `shootAction` | `(playerId: number, weaponHash: GameHash): void` | Triggered when a weapon is fired. |
| `weaponReload` | `(playerId: number): void` | Triggered when a player reloads their weapon. |
| `throwGrenade` | `(playerId: number, grenadeHash: GameHash): void` | Triggered when a grenade projectile is thrown. |
| `playerHealing` | `(playerId: number, amount: number): void` | Triggered when healing items/boosters are used. |
| `playerKnockdown` | `(playerId: number): void` | Triggered when player enters knockdown state. |

### Vehicles
| Event | Signature | Description |
|---|---|---|
| `playerEnterVehicle` | `(playerId: number, vehicleId: number, seatIndex: number): void` | Player starts occupying vehicle seat. |
| `playerExitVehicle` | `(playerId: number, vehicleId: number, seatIndex: number): void` | Player exits vehicle. |
| `vehicleSpawn` | `(vehicleId: number): void` | Server creates a vehicle entity. |
| `vehicleDespawn` | `(vehicleId: number): void` | Server removes a vehicle entity. |
| `vehicleWeaponShoot` | `(vehicleId: number, data: VehicleWeaponShootEventData): void \| boolean` | Vehicle-mounted weaponry is discharged. |
| `vehicleHittedByPlayer` | `(vehicleId: number, data: VehicleHittedByPlayerEventData): void \| boolean` | Player collides with or damages a vehicle. |
| `vehicleCustomizationChange` | `(playerId: number, data: VehicleCustomizationChangeEventData): void` | CrystalCoat or vehicle appearance altered. |
| `vehicleDestructionChange` | `(playerId: number, data: VehicleDestructionChangeEventData): void` | Vehicle body deformation or blowout updated. |

### In-World Pickups & Loot
| Event | Signature | Description |
|---|---|---|
| `pickupSpawn` | `(pickupId: number): void` | In-world loot pickup spawned. |
| `pickupDespawn` | `(pickupId: number): void` | In-world loot pickup removed. |
| `pickupRaise` | `(playerId: number, data: PickupDespawnEventData): void \| boolean` | Player picks up loot item. |
| `pickupDrop` | `(playerId: number, data: PickupCreateEventData): void \| boolean` | Player drops item onto the ground. |
| `pickupChange` | `(playerId: number, data: PickupChangeEventData): void \| boolean` | State of pickup altered. |

### Peds & Static Entities
| Event | Signature | Description |
|---|---|---|
| `pedSpawn` | `(pedId: number): void` | Synced NPC ped spawned. |
| `pedDespawn` | `(pedId: number): void` | Synced NPC ped despawned. |
| `objectSpawn` | `(objectId: number): void` | Synced static object spawned. |
| `objectDespawn` | `(objectId: number): void` | Synced static object despawned. |
| `gameObjectSpawn` | `(gameObjectId: number): void` | Synced game object spawned. |
| `gameObjectDespawn` | `(gameObjectId: number): void` | Synced game object despawned. |

### World & Metadata
| Event | Signature | Description |
|---|---|---|
| `entitySpawn` | `(entityId: number, entityType: EntityType): void` | Any generic entity spawns. |
| `entityDespawn` | `(entityId: number, entityType: EntityType): void` | Any generic entity despawns. |
| `entityMetaChange` | `(id: string, key: string, oldValue: any, newValue: any): void` | Synced metadata updated on an entity. |
| `globalMetaChange` | `(id: string, key: string, oldValue: any, newValue: any): void` | Server-wide shared metadata updated. |
| `playerMetaChange` | `(id: string, key: string, oldValue: any, newValue: any): void` | Player-specific metadata altered. |
| `doorStateChange` | `(playerId: number, data: DoorStateChangeEventData): void \| boolean` | World doors opened or locked. |
| `liftStateChange` | `(playerId: number, data: LiftStateChangeEventData): void \| boolean` | Elevators/lifts moving between floors. |
| `fire` | `(playerId: number, data: FireEventData): void \| boolean` | Environmental fire ignited. |
| `explosion` | `(playerId: number, data: ExplosionEventData): void \| boolean` | Explosion triggered in world coordinates. |

### Resource Management
| Event | Signature | Description |
|---|---|---|
| `resourceStart` | `(name: string): void` | Triggered when this resource starts. |
| `resourceStop` | `(name: string): void` | Triggered when this resource stops. |
| `anyResourceStart` | `(name: string): void` | Any resource in the server started. |
| `anyResourceStop` | `(name: string): void` | Any resource in the server stopped. |
| `anyServerResourceStart` | `(resourceName: string): void` | Dedicated server resource started (useful for dev watchers / hotreload). |
| `anyServerResourceStop` | `(resourceName: string): void` | Dedicated server resource stopped. |
| `resourcesRefresh` | `(): void` | Resource system refreshed. |

---

## 3. Client Events Catalog (`events.on`)

### Streaming (Entity Proximity)
| Event | Signature | Description |
|---|---|---|
| `remotePlayerStreamIn` | `(player: MpPlayer): void` | Remote player entered local streaming distance (~250m). |
| `remotePlayerStreamOut` | `(player: MpPlayer): void` | Remote player left local streaming distance. |
| `vehicleStreamIn` | `(vehicle: MpVehicle): void` | Vehicle entered client streaming grid. |
| `vehicleStreamOut` | `(vehicle: MpVehicle): void` | Vehicle departed client streaming grid. |
| `pedStreamIn` | `(ped: MpPed): void` | Synced NPC/ped streamed into client. |
| `pedStreamOut` | `(ped: MpPed): void` | Synced NPC/ped streamed out. |
| `objectStreamIn` | `(obj: MpObject): void` | World object streamed in. |
| `objectStreamOut` | `(obj: MpObject): void` | World object streamed out. |

### Web UI (CEF) Lifecycle
| Event | Signature | Description |
|---|---|---|
| `domReady` | `(browserName: string): void` | HTML DOM tree has completely rendered inside the CEF browser. |
| `loadingFailed` | `(error: CefLoadingFailedError): void` | Web view failed to load URL or asset. |

### Resource Lifecycle
| Event | Signature | Description |
|---|---|---|
| `resourceStart` | `(name: string): void` | Client resource started and initialized. |
| `resourceStop` | `(name: string): void` | Client resource stopped and teardown started. |

---

## 4. Browser (CEF) Events Catalog (`cybermp.events.on`)

| Method | Parameters | Description |
|---|---|---|
| `cybermp.events.on(name, cb)` | `(name: string, callback: (...args: any[]) => void)` | Listens for events sent by client via `events.emitCef`. |
| `cybermp.events.emit(name, ...args)` | `(name: string, ...args: any[])` | Sends event to client, received by `events.onCef`. |
| `cybermp.events.off(name, cb)` | `(name: string, func: (...args: any[]) => void)` | Removes an active CEF listener. |
