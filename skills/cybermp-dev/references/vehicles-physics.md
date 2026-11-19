# Vehicles & Physics Reference

This reference covers low-level REDengine vehicle management, seat mounting/unmounting, complete mesh/part deformation repair, impulse physics (nitro/boost), and true speedometer curve calculations in CyberMP client scripts (`use_game_natives = true`).

> [!IMPORTANT]
> All code in this reference is procedural TypeScript utilizing direct `mp.game.*`, `mp.network.*`, and `mp.events.*` runtime bindings. REDengine native classes require property instantiation via `Object.assign(new mp.game.<Type>(), { ... })`.

---

## 1. Low-Level Vehicle Mounting & Unmounting

In Cyberpunk 2077, player mounting and unmounting is handled by the engine's `gamemountingMountingFacility` (`mp.game.ScriptGameInstance.GetMountingFacility()`).

Because CyberMP streams vehicles dynamically based on proximity, attempting to mount a vehicle before it has streamed into the client's local entity pool will fail. A robust mounting implementation checks `mp.network.getStreamedPool('CVehicle')` first and falls back to listening to the `vehicleStreamIn` event.

### Seat Slot Identifiers

| Slot Identifier | Position | Description |
|---|---|---|
| `seat_front_left` | Front Left | Primary driver seat for four-wheeled vehicles and bikes |
| `seat_front_right` | Front Right | Front passenger seat |
| `seat_back_left` | Rear Left | Rear driver-side passenger seat |
| `seat_back_right` | Rear Right | Rear passenger-side seat |

### Mounting & Unmounting Implementation

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

interface SitInVehicleOptions {
  slotName?: string;
  instant?: boolean;
}

/**
 * Mounts the local player into a networked vehicle by its network ID.
 * If the vehicle entity is not yet streamed in, listens to `vehicleStreamIn`
 * until the entity becomes available.
 */
export function sitInVehicle(
  vehicleNetId: number,
  options: SitInVehicleOptions = {},
): void {
  const { slotName = 'seat_front_left', instant = true } = options;

  const onVehicleStreamIn = (netId: number, hash: number): void => {
    if (netId !== vehicleNetId) {
      return;
    }

    // Leave current vehicle if already seated
    leaveVehicle(true);

    const entityID = Object.assign(new mp.game.entEntityID(), {
      hash,
    });

    const targetVehicle = mp.game.ScriptGameInstance.FindEntityByID(entityID);
    if (!targetVehicle) {
      return;
    }

    const player = mp.game.GetPlayer();
    if (!player) {
      return;
    }

    // 1. Mount Event Data
    const data = Object.assign(new mp.game.gameMountEventData(), {
      isInstant: instant,
      slotName,
      mountParentEntityId: targetVehicle.GetEntityID(),
      entryAnimName: 'forcedTransition',
    });

    // 2. Mounting Slot ID
    const slotID = Object.assign(new mp.game.gamemountingMountingSlotId(), {
      id: slotName,
    });

    // 3. Low-Level Mounting Info
    const mountingInfo = Object.assign(new mp.game.gamemountingMountingInfo(), {
      childId: player.GetEntityID(),
      parentId: targetVehicle.GetEntityID(),
      slotId: slotID,
    });

    // 4. Mounting Request
    const mountEvent = Object.assign(new mp.game.gamemountingMountingRequest(), {
      lowLevelMountingInfo: mountingInfo,
      mountData: data,
    });

    // Dispatch mounting to REDengine facility
    mp.game.ScriptGameInstance.GetMountingFacility().Mount(mountEvent);

    // Clean up stream listener once mounted
    mp.events.off('vehicleStreamIn', onVehicleStreamIn);
  };

  // Check if vehicle is already streamed in
  const streamedPool = mp.network.getStreamedPool('CVehicle');
  const alreadyStreamedHash = streamedPool.find(
    (hash) => mp.network.getVehicleId(hash) === vehicleNetId,
  );

  if (alreadyStreamedHash !== undefined) {
    onVehicleStreamIn(vehicleNetId, alreadyStreamedHash);
    return;
  }

  // Otherwise, wait for stream in
  mp.events.on('vehicleStreamIn', onVehicleStreamIn);
}

/**
 * Unmounts the local player from their current vehicle.
 */
export function leaveVehicle(instant: boolean = true): void {
  const playerObj = mp.game.GetPlayerObject();
  if (!playerObj) {
    return;
  }

  const vehicle = mp.game.GetMountedVehicle(playerObj);
  if (!vehicle) {
    return;
  }

  const slot = vehicle.GetSlotIdForMountedObject(playerObj);

  const data = Object.assign(new mp.game.gameMountEventData(), {
    isInstant: instant,
    slotName: slot,
    mountParentEntityId: vehicle.GetEntityID(),
    entryAnimName: 'forcedTransition',
  });

  const slotID = Object.assign(new mp.game.gamemountingMountingSlotId(), {
    id: slot,
  });

  const mountingInfo = Object.assign(new mp.game.gamemountingMountingInfo(), {
    childId: mp.game.GetPlayer().GetEntityID(),
    parentId: vehicle.GetEntityID(),
    slotId: slotID,
  });

  const unmountEvent = Object.assign(new mp.game.gamemountingUnmountingRequest(), {
    lowLevelMountingInfo: mountingInfo,
    mountData: data,
  });

  mp.game.ScriptGameInstance.GetMountingFacility().Unmount(unmountEvent);
}
```

---

## 2. Complete Vehicle Repair & Restoration

In Cyberpunk 2077, vehicle destruction consists of multiple independent layers:
1. **Deformation grid & glass shatter state**: Reset with `DestructionResetGrid()` and `DestructionResetGlass()`.
2. **Animation controller deformation floats**: 10 body panels have blend shape floats that remain deformed unless manually zeroed out via `entAnimationControllerComponent.SetInputFloat`.
3. **Flat tire states**: Repaired via `ToggleBrokenTire(index, false)`.
4. **Engine smoke and damage visual effects**: Updated via `UpdateDamageEngineEffects()`.
5. **Persistent state doors and windows**: Reset via `vehiclePS.CloseAllVehDoors()` and `CloseAllVehWindows()`.

> [!NOTE]
> Calling only `vehicleComponent.RepairVehicle()` leaves shattered glass, crumpled meshes, punctured tires, and open broken doors intact. All of the following steps must be run for a complete cosmetic and physical repair.

```typescript
import * as CyberEnums from '@cybermp/client-types/enums';
import type { vehicleBaseObject } from '@cybermp/client-types/game';

/**
 * The 10 deformation blend shape parts on standard Cyberpunk vehicles.
 */
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
 * Performs a 100% complete physical, visual, and persistent restoration
 * of the given vehicle entity.
 */
export function repairVehicle(vehicle: vehicleBaseObject): void {
  if (!vehicle) {
    return;
  }

  const ps = vehicle.GetVehiclePS();
  const comp = vehicle.GetVehicleComponent();
  const vehType = vehicle.GetVehicleType();

  // Reset bumper states & deformation floats for cars/trucks
  if (vehType !== CyberEnums.gamedataVehicleType.Bike) {
    comp.bumperFrontState = 0;
    comp.bumperBackState = 0;

    for (const part of DEFORMATION_PARTS) {
      mp.game.entAnimationControllerComponent.SetInputFloat(vehicle, part, 0.0);
    }
  }

  // Reset damage level
  comp.damageLevel = 0;

  // Restore flat/broken tires
  const flatTireIndex = (vehicle as any).GetFlatTireIndex?.() ?? -1;
  if (flatTireIndex >= 0) {
    for (let i = 0; i < 4; i++) {
      (vehicle as any).ToggleBrokenTire?.(i, false);
    }
  }

  // Reset physical deformation grid and window glass
  vehicle.DestructionResetGrid();
  vehicle.DestructionResetGlass();

  // Update visual and engine damage effects
  comp.UpdateDamageEngineEffects();
  comp.RepairVehicle();
  comp.VehicleVisualDestructionSetup();

  // Close persistent doors and windows
  if (ps) {
    ps.CloseAllVehDoors(true);
    ps.CloseAllVehWindows();
    ps.ForcePersistentStateChanged();
  }
}

/**
 * Repairs the vehicle currently occupied by the local player.
 */
export function repairCurrentVehicle(): boolean {
  const playerObj = mp.game.GetPlayerObject();
  if (!playerObj) {
    return false;
  }

  const vehicle = mp.game.GetMountedVehicle(playerObj);
  if (!vehicle) {
    return false;
  }

  repairVehicle(vehicle);
  return true;
}
```

---

## 3. Nitro Physics & Directional Impulse

REDengine vehicles have native physics simulation. Impulse forces are applied using `vehicle.AddLinelyVelocity(linearVelocity, angularVelocity)`.

> [!WARNING]
> The native method name in REDengine is spelled `AddLinelyVelocity`, not `AddLinearVelocity`.

### Quaternion to Forward Vector

Cyberpunk vehicle orientations are represented by quaternions (`Quaternion` with `{ i, j, k, r }` corresponding to `{ x, y, z, w }`). To apply an impulse directly forward along the vehicle's heading:

```typescript
import type { Quaternion, Vector3 } from '@cybermp/client-types/game';

/**
 * Extracts a normalized 3D forward vector from a REDengine orientation Quaternion.
 */
export function getForwardFromQuaternion(q: Quaternion): { x: number; y: number; z: number } {
  const x = q.i;
  const y = q.j;
  const z = q.k;
  const w = q.r;

  return {
    x: 2 * (x * y - w * z),
    y: 1 - 2 * (x * x + z * z),
    z: 2 * (y * z + w * x),
  };
}
```

### Applying Nitro Impulse

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

interface NitroImpulseOptions {
  force?: number;
  checkIsOnGround?: boolean;
  maxSpeedKmh?: number;
}

/**
 * Applies a directional nitro forward impulse to a vehicle.
 * Verifies that the local player is the driver and checks ground/speed constraints.
 */
export function applyNitroImpulse(
  vehicle: vehicleBaseObject,
  options: NitroImpulseOptions = {},
): boolean {
  if (!vehicle) {
    return false;
  }

  const { force = 10.0, checkIsOnGround = true, maxSpeedKmh = 250.0 } = options;

  // Verify that the local player is the driver (do not boost if passenger)
  if (!vehicle.IsPlayerDriver()) {
    return false;
  }

  // Prevent boosting mid-air if ground check is requested
  if (checkIsOnGround && !vehicle.IsOnGround()) {
    return false;
  }

  // Prevent exceeding max speed cap
  const currentSpeed = getVehicleSpeedKmh(vehicle);
  if (currentSpeed > maxSpeedKmh) {
    return false;
  }

  // Extract forward direction from vehicle orientation
  const orientation = vehicle.GetWorldTransform().Orientation;
  const forward = getForwardFromQuaternion(orientation);

  const linearVelocity = Object.assign(new mp.game.Vector3(), {
    x: forward.x * force,
    y: forward.y * force,
    z: forward.z * force,
  });

  const angularVelocity = Object.assign(new mp.game.Vector3(), {
    x: 0,
    y: 0,
    z: 0,
  });

  // Apply physical velocity impulse
  return vehicle.AddLinelyVelocity(linearVelocity, angularVelocity);
}

/**
 * Instantly stops a vehicle by resetting linear and angular velocity.
 */
export function stopVehicle(vehicle: vehicleBaseObject): void {
  if (!vehicle) {
    return;
  }

  const zero = Object.assign(new mp.game.Vector3(), { x: 0, y: 0, z: 0 });
  vehicle.ChangeLinelyVelocity(zero, zero, 0);
}
```

---

## 4. True Speed Calculation

Calling `vehicle.GetCurrentSpeed()` returns an internal engine velocity unit. Cyberpunk 2077's native speedometer HUD (`car_hud.swift`) passes this raw velocity through a non-linear curve to compute the actual vehicle speed displayed to the player.

### Speed Curve Lookup

The curve is stored in the game's `StatsDataSystem`:
- **Curve set name**: `'vehicle_ui'`
- **Curve name**: `'speed_to_multiplier'`
- **Conversion factor**: Multiplied by `1.61` to yield accurate km/h (or divided by `1.60934` for mph).

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

/**
 * Calculates the true speed of a vehicle in kilometers per hour (km/h)
 * using the official REDengine 'vehicle_ui' 'speed_to_multiplier' curve.
 */
export function getVehicleSpeedKmh(vehicle: vehicleBaseObject): number {
  if (!vehicle) {
    return 0;
  }

  const rawSpeed = vehicle.GetCurrentSpeed();
  const statsDataSystem = mp.game.ScriptGameInstance.GetStatsDataSystem();

  const multiplier = statsDataSystem.GetValueFromCurve(
    'vehicle_ui',
    rawSpeed,
    'speed_to_multiplier',
  );

  return rawSpeed * multiplier * 1.61;
}

/**
 * Calculates the true speed of a vehicle in miles per hour (mph).
 */
export function getVehicleSpeedMph(vehicle: vehicleBaseObject): number {
  return getVehicleSpeedKmh(vehicle) / 1.60934;
}
```

### Speedometer CEF Bridge Pattern

Push real-time speedometer updates to your CEF overlay:

```typescript
// In client tick or update interval:
let speedUpdateTimer: ReturnType<typeof setInterval> | null = null;

export function startSpeedometerSync(): void {
  if (speedUpdateTimer) return;

  speedUpdateTimer = setInterval(() => {
    const playerObj = mp.game.GetPlayerObject();
    if (!playerObj) return;

    const vehicle = mp.game.GetMountedVehicle(playerObj);
    if (!vehicle || !vehicle.IsPlayerDriver()) {
      return;
    }

    const kmh = Math.round(getVehicleSpeedKmh(vehicle));
    mp.events.emitCef('speedometer:update', {
      kmh,
      rpm: vehicle.GetRpmValue?.() ?? 0,
      gear: vehicle.GetCurrentGear?.() ?? 1,
    });
  }, 50); // 20 updates per second
}

export function stopSpeedometerSync(): void {
  if (speedUpdateTimer) {
    clearInterval(speedUpdateTimer);
    speedUpdateTimer = null;
  }
}
```

---

## 5. Dynamic Camera FOV on Nitro (`mp.game.LerpF`)

When activating a nitro boost, smooth camera FOV enlargement enhances speed sensation. REDengine provides native linear float interpolation via `mp.game.LerpF`:

```typescript
import type { vehicleTPPCameraComponent } from '@cybermp/client-types/game';

let activeTppCam: vehicleTPPCameraComponent | null = null;
let baseFov = 75;
let currentFov = 75;
const BOOST_FOV_INCREASE = 15;
const LERP_RATE = 0.1;

/**
 * Finds the active third-person vehicle camera component on the player.
 */
export function getVehicleTppCamera(): vehicleTPPCameraComponent | null {
  const components = mp.game.GetPlayer().GetComponents();
  for (const comp of components) {
    if (comp.IsA('vehicleTPPCameraComponent')) {
      return comp as vehicleTPPCameraComponent;
    }
  }
  return null;
}

/**
 * Smoothly interpolates vehicle camera FOV using REDengine native LerpF.
 *
 * @param boosting True while nitro key is pressed; false when released.
 */
export function updateNitroCameraFov(boosting: boolean): void {
  if (!activeTppCam) {
    activeTppCam = getVehicleTppCamera();
    if (activeTppCam) {
      baseFov = activeTppCam.GetFOV();
      currentFov = baseFov;
    }
  }
  if (!activeTppCam) return;

  const targetFov = boosting ? baseFov + BOOST_FOV_INCREASE : baseFov;
  currentFov = Number(mp.game.LerpF(LERP_RATE, currentFov, targetFov).toFixed(4));
  activeTppCam.SetFOV(currentFov);
}
```

---

## 6. Nitro Tuning Presets Table

Verified physics impulse presets from `cybermp-freeroam`:

| Preset Name | Force | Capacity per Use | Max Speed (km/h) | Regen Rate | Ground Check | Description |
|---|---|---|---|---|---|---|
| `default` | 3.25 | 2.25 | 350 | 1.75 | `true` | Balanced freeroam street racing |
| `free` | 3.25 | 0 | 350 | 1.75 | `true` | Unlimited nitro with ground lock |
| `glide` | 5.0 | 0 | 350 | 1.75 | `false` | Airborne air-glide impulse |
| `explosion`| 50.0 | 25.0 | 450 | 1.75 | `true` | Drag strip rocket boost |
| `boom` | 200.0 | 100.0 | 900 | 1.0 | `true` | Extreme supersonic launch |

