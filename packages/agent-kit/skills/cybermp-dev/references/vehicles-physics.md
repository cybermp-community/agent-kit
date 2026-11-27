---
environment: client
---

# Vehicles & Physics Reference

CyberMP exposes server vehicles and local REDengine vehicle handles. Use the server to validate shared vehicle actions. Use the client natives with `use_game_natives = true` after the player and target vehicle are available. [Server vehicles](https://docs.cyber.mp/guides/server/vehicles/) · [Network IDs](https://docs.cyber.mp/guides/client/network-ids/)

## 1. Low-Level Vehicle Mounting & Unmounting

A native mounting request uses the local actor's and vehicle's engine IDs. Map the server vehicle's Network ID using `mp.network.getVehicleGameId()`, and resolve the current engine object before issuing the request. If resolution fails, retry only while the request is still authorized. A stream listener should be scoped to the target Network ID and removed on success, cancellation, timeout or resource stop. [Freeroam vehicle service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/vehicles/vehicles.service.ts)

### Seat Slot Identifiers

Common native slot names are `seat_front_left`, `seat_front_right`, `seat_back_left`, and `seat_back_right`. Check the slots on the specific model. Server seat numbers and native slot names each belong to their own API. Check seat availability on the server before requesting entry. [Server seats and occupants](https://docs.cyber.mp/guides/server/vehicles/#managing-seats-and-occupants)

### Mounting & Unmounting Implementation

This client fragment accepts an authorized Network ID and a native slot name. It requires the player to be on foot. The return value reports whether it issued a mounting request. Confirm actual occupancy separately.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

export function requestVehicleMount(networkId: number, slotName = 'seat_front_left'): boolean {
  const actor = mp.game.GetPlayerObject();
  if (!actor || mp.game.GetMountedVehicle(actor)) return false;

  const gameId = mp.network.getVehicleGameId(networkId);
  if (!gameId) return false;

  const entityId = Object.assign(new mp.game.entEntityID(), { hash: gameId });
  const entity = mp.game.ScriptGameInstance.FindEntityByID(entityId);
  if (!entity?.IsA('vehicleBaseObject')) return false;

  const vehicle = entity as unknown as vehicleBaseObject;
  if (!vehicle.HasOccupantSlot(slotName)) return false;

  const parentId = vehicle.GetEntityID();
  const slotId = Object.assign(new mp.game.gamemountingMountingSlotId(), { id: slotName });
  const lowLevelMountingInfo = Object.assign(new mp.game.gamemountingMountingInfo(), {
    childId: actor.GetEntityID(), parentId, slotId,
  });
  const mountData = Object.assign(new mp.game.gameMountEventData(), {
    isInstant: true, slotName, mountParentEntityId: parentId, entryAnimName: 'forcedTransition',
  });
  const request = Object.assign(new mp.game.gamemountingMountingRequest(), {
    lowLevelMountingInfo, mountData,
  });
  mp.game.ScriptGameInstance.GetMountingFacility().Mount(request);
  return true;
}
```

To unmount, resolve the current vehicle and its slot with `GetSlotIdForMountedObject(actor)`. Send a `gamemountingUnmountingRequest` to `GetMountingFacility().Unmount` as shown in Freeroam. Wait for occupancy to change before mounting another vehicle. Compare the local mounted state with the server's seat state. [Freeroam vehicle service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/vehicles/vehicles.service.ts)

## 2. Vehicle Repair & Restoration

Freeroam repairs several layers separately. Its implementation resets deformation through `entAnimationControllerComponent`, clears destruction grid and glass, updates the vehicle component, and resets door and window state. Body animation inputs and wheel support vary with the model. Check engine health, visible deformation, glass, tires and apertures independently. [Freeroam vehicle service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/vehicles/vehicles.service.ts)

### Resetting Vehicle Deformation

This client fragment requests a grid and glass reset on an available vehicle. Use a test vehicle and verify what remains damaged locally, on the server, and on a second client.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

export function requestDeformationReset(vehicle: vehicleBaseObject): void {
  vehicle.DestructionResetGrid();
  vehicle.DestructionResetGlass();
}
```

## 3. Nitro Physics & Directional Impulse

### Applying a Velocity Change (`AddLinelyVelocity`)

Use `AddLinelyVelocity` with a tested forward velocity delta. The fragment checks local driver and ground state. The resource must separately authorize use, verify ownership and choose limits. A pre-use speed check alone gives no final speed bound. [Freeroam boost example](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/chat/basic-chat.commands.ts)

```typescript
export function requestForwardBoost(delta: number): boolean {
  if (!Number.isFinite(delta) || delta <= 0) return false;

  const actor = mp.game.GetPlayerObject();
  const vehicle = actor && mp.game.GetMountedVehicle(actor);
  if (!vehicle?.IsPlayerDriver() || !vehicle.IsOnGround()) return false;

  const { x, y, z } = vehicle.GetWorldForward();
  return vehicle.AddLinelyVelocity(
    { x: x * delta, y: y * delta, z: z * delta },
    { x: 0, y: 0, z: 0 },
  );
}
```

## 4. Vehicle Speed and Speedometer Telemetry

The server provides `MpVehicle.velocity`. The official guide derives approximate km/h from the magnitude of that 3D vector. The local game HUD can use a different display calibration. Freeroam samples `vehicle_ui` and `speed_to_multiplier` with `GetValueFromCurve`, then scales the result by `1.61`. Compare both readings before using the HUD value for gameplay thresholds. [Server physics guide](https://docs.cyber.mp/guides/server/vehicles/#vehicle-properties--physics) · [Freeroam nitro service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/vehicle-nitro/vehicle-nitro.service.ts)

### Speedometer CEF Bridge Pattern

Call this from a bounded client update loop once CEF has signalled readiness. A null reading lets the browser clear stale speed on exit. Stop the loop on resource stop. In `@cybermp/client-types@2.7.1`, `vehicleBaseObject` exposes `GetCurrentSpeed`. RPM and gear require their own verified data source.

```typescript
export function publishSpeedometer(): void {
  const actor = mp.game.GetPlayerObject();
  const vehicle = actor && mp.game.GetMountedVehicle(actor);
  if (!vehicle?.IsPlayerDriver()) {
    mp.events.emitCef('speedometer:update', { kmh: null });
    return;
  }

  const speed = vehicle.GetCurrentSpeed();
  const stats = mp.game.ScriptGameInstance.GetStatsDataSystem();
  const multiplier = stats.GetValueFromCurve('vehicle_ui', speed, 'speed_to_multiplier');
  mp.events.emitCef('speedometer:update', { kmh: Math.round(speed * multiplier * 1.61) });
}
```

## 5. Dynamic Camera FOV on Nitro (`mp.game.LerpF`)

See the [vehicle camera example](cameras-input-cef.md#tpp-vehicle-camera-fov--smooth-interpolation-mpgamelerpf) for interpolation. Store and restore the original FOV for each camera instance, including when the player changes seats, leaves the vehicle or stops the resource.

## Vehicle Physics in a Multiplayer Session

Test mounting, repairs and boosts with the driver, an observer and server readings. Compare before and after a change in network owner, a stream-out and stream-in, and a reconnect. Record the local model and server Network ID. A return from a client native establishes the result of that local call. Verify persistence and replication separately.
