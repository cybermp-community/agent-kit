---
title: CyberMP Core Events Reference
description: Event signatures generated from the CyberMP type packages used by the MCP event index.
verificationStatus: static-cross-check
---
# CyberMP Core Events Reference

The tables are generated from the same declarations as `cybermp_get_event`. Bind built-in events in the runtime shown below. A signature describes callback arguments and return type. For engine timing and effect, check the target build.

## Server listeners

Use `mp.events.on` for game events, `mp.events.onClient` for requests sent by a client, and `mp.events.emitClient` to target a player by ID or object. The client request handler receives the sender as a server-side `MpPlayer`.

```typescript env=server
mp.events.on('playerConnected', (playerId, tempId) => {
  console.log(playerId, tempId);
});

mp.events.onClient('inventory:request', (player) => {
  console.log(`${player.nickname} requested inventory`);
  mp.events.emitClient(player, 'inventory:requestAcknowledged');
});
```

For a `damage` callback, get the affected entity from `data.victimId` when handling player damage. Freeroam uses the first callback argument for the offender. Check cancellation in the target build. [Freeroam safe zone](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/server/src/modules/greenzones/greenzones.service.ts) · [CyberMP server events](https://docs.cyber.mp/guides/server/events/)

## Client listeners

Stream callbacks carry the network ID and the local game ID. Resolve the ID in the relevant environment when you need the entity. Wait for the right lifecycle callback before making native calls.

```typescript env=client
mp.events.on('remotePlayerStreamIn', (netID, gameID) => {
  console.log(netID, gameID);
});
mp.events.onServer('inventory:requestAcknowledged', () => {
  console.log('Server received the request');
});
mp.events.onCef('domReady', (name) => {
  console.log(`CEF ready: ${name}`);
});
```

[Network IDs](https://docs.cyber.mp/guides/client/network-ids/) · [CyberMP client events](https://docs.cyber.mp/guides/client/events/)

## Browser listeners

The CEF runtime injects `mp.events`. Browser event names come from your client/browser contract. Use the same function when unsubscribing.

```typescript env=browser
const showHealth = (health: number) => {
  const label = document.getElementById('health');
  if (label) label.textContent = String(health);
};

mp.events.on('hud:update', showHealth);

// During teardown:
// mp.events.off('hud:update', showHealth);
```

<!-- event-catalog:start -->

## Server game and resource events

| Signature | API |
| --- | --- |
| `entitySpawn(id: number, type: EntityType): void` | `mp.events.on` |
| `entityDespawn(id: number, type: EntityType): void` | `mp.events.on` |
| `objectSpawn(id: number): void` | `mp.events.on` |
| `objectDespawn(id: number): void` | `mp.events.on` |
| `gameObjectSpawn(id: number): void` | `mp.events.on` |
| `gameObjectDespawn(id: number): void` | `mp.events.on` |
| `entityMetaChange(id: string, key: string, oldValue: any, newValue: any): void` | `mp.events.on` |
| `pedSpawn(id: number): void` | `mp.events.on` |
| `pedDespawn(id: number): void` | `mp.events.on` |
| `pickupChange(playerId: number, data: PickupChangeEventData): void \| boolean` | `mp.events.on` |
| `pickupRaise(playerId: number, data: PickupDespawnEventData): void \| boolean` | `mp.events.on` |
| `pickupDrop(playerId: number, data: PickupCreateEventData): void \| boolean` | `mp.events.on` |
| `pickupSpawn(id: number): void` | `mp.events.on` |
| `pickupDespawn(id: number): void` | `mp.events.on` |
| `vehicleCustomizationChange(playerId: number, data: VehicleCustomizationChangeEventData): void` | `mp.events.on` |
| `vehicleDestructionChange(playerId: number, data: VehicleDestructionChangeEventData): void` | `mp.events.on` |
| `vehicleSpawn(id: number): void` | `mp.events.on` |
| `vehicleDespawn(id: number): void` | `mp.events.on` |
| `vehicleWeaponShoot(id: number, data: VehicleWeaponShootEventData): void \| boolean` | `mp.events.on` |
| `vehicleHittedByPlayer(id: number, data: VehicleHittedByPlayerEventData): void \| boolean` | `mp.events.on` |
| `doorStateChange(playerId: number, data: DoorStateChangeEventData): void \| boolean` | `mp.events.on` |
| `liftStateChange(playerId: number, data: LiftStateChangeEventData): void \| boolean` | `mp.events.on` |
| `fire(playerId: number, data: FireEventData): void \| boolean` | `mp.events.on` |
| `explosion(playerId: number, data: ExplosionEventData): void \| boolean` | `mp.events.on` |
| `globalMetaChange(id: string, key: string, oldValue: any, newValue: any): void` | `mp.events.on` |
| `playerConnecting(tempId: number, name: string): void` | `mp.events.on` |
| `playerConnected(playerId: number, tempId: string): void` | `mp.events.on` |
| `playerSpawn(playerId: number): void` | `mp.events.on` |
| `playerRespawn(playerId: number, data: Vector3Object): void` | `mp.events.on` |
| `playerDespawn(playerId: number): void` | `mp.events.on` |
| `playerDeath(playerId: number, data: PlayerDeathEventData): void` | `mp.events.on` |
| `playerDisconnected(playerId: number, reason: string): void` | `mp.events.on` |
| `playerAppearanceChange(playerId: number, data: PlayerAppearanceChangeEventData): void \| boolean` | `mp.events.on` |
| `playerHealing(playerId: number): void \| boolean` | `mp.events.on` |
| `playerKnockdown(playerId: number): void \| boolean` | `mp.events.on` |
| `playerExitVehicle(playerId: number, vehicleId: number): void` | `mp.events.on` |
| `playerEnterVehicle(playerId: number, vehicleId: number, seat: VehicleSeat): void` | `mp.events.on` |
| `damage(playerId: number, data: DamageEventData): void \| boolean` | `mp.events.on` |
| `meleeAction(playerId: number, data: MeleeActionEventData): void \| boolean` | `mp.events.on` |
| `shootAction(playerId: number, data: ShootActionEventData): void \| boolean` | `mp.events.on` |
| `weaponReload(playerId: number, weaponHash: GameHash): void \| boolean` | `mp.events.on` |
| `throwGrenade(playerId: number, data: ThrowGrenadeEventData): void \| boolean` | `mp.events.on` |
| `playerMetaChange(id: string, key: string, oldValue: any, newValue: any): void` | `mp.events.on` |
| `anyResourceStart(resourceName: string): void` | `mp.events.on` |
| `anyResourceStop(resourceName: string): void` | `mp.events.on` |
| `anyServerResourceStart(resourceName: string): void` | `mp.events.on` |
| `anyServerResourceStop(resourceName: string): void` | `mp.events.on` |
| `resourceStart(): void` | `mp.events.on` |
| `resourceStop(): void` | `mp.events.on` |
| `resourcesRefresh(): void` | `mp.events.on` |

## Client game and resource events

| Signature | API |
| --- | --- |
| `anyResourceStart(resourceName: string): void` | `mp.events.on` |
| `anyResourceStop(resourceName: string): void` | `mp.events.on` |
| `anyServerResourceStart(resourceName: string): void` | `mp.events.on` |
| `anyServerResourceStop(resourceName: string): void` | `mp.events.on` |
| `resourceStart(): void` | `mp.events.on` |
| `resourceStop(): void` | `mp.events.on` |
| `resourcesRefresh(): void` | `mp.events.on` |
| `objectStreamOut(netID: number, gameID: number): void` | `mp.events.on` |
| `objectStreamIn(netID: number, gameID: number): void` | `mp.events.on` |
| `pedStreamOut(netID: number, gameID: number): void` | `mp.events.on` |
| `pedStreamIn(netID: number, gameID: number): void` | `mp.events.on` |
| `remotePlayerStreamOut(netID: number, gameID: number): void` | `mp.events.on` |
| `remotePlayerStreamIn(netID: number, gameID: number): void` | `mp.events.on` |
| `vehicleStreamOut(netID: number, gameID: number): void` | `mp.events.on` |
| `vehicleStreamIn(netID: number, gameID: number): void` | `mp.events.on` |

## Client CEF lifecycle events

| Signature | API |
| --- | --- |
| `domReady(name: string): void` | `mp.events.onCef` |
| `loadingFailed(error: CefLoadingFailedError): void` | `mp.events.onCef` |

## Browser transport methods

| Signature | API |
| --- | --- |
| `on(eventName: string, callback: (...args: any[]) => void): void` | `mp.events.on` |
| `off(eventName: string, func: (...args: any[]) => void): void` | `mp.events.off` |
| `emit(eventName: string, ...args: any[]): void` | `mp.events.emit` |

<!-- event-catalog:end -->
