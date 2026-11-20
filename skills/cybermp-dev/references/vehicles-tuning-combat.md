# Vehicles Tuning, Aesthetics & Combat 2.0 Reference

This reference covers advanced REDengine native vehicle manipulation in CyberMP client scripts, including door, hood, trunk, and window control via `vehicleControllerPS`, engine ignition toggling (`TurnEngineOn`), CrystalCoat color shaders, body part detachment, and Vehicle Combat 2.0 mechanics.

---

## 1. Door, Hood, Trunk & Window Manipulation (`vehicleControllerPS`)

While physical vehicle mounting and suspension are managed by `MountingFacility`, cosmetic and mechanical vehicle apertures (doors, hood, trunk, windows) are controlled through `vehicleControllerPS`.

The `vehicleControllerPS` is retrieved from any `vehicleBaseObject` (or mounted player vehicle):

```typescript
const controller = vehicle.GetVehicleControllerPS();
```

### Door & Aperture Slots (`vehicleEVehicleDoor`)
REDengine defines standard door enumerations:
- `vehicleEVehicleDoor.seat_front_left` (Driver door)
- `vehicleEVehicleDoor.seat_front_right` (Passenger door)
- `vehicleEVehicleDoor.seat_back_left` (Rear left door)
- `vehicleEVehicleDoor.seat_back_right` (Rear right door)
- `vehicleEVehicleDoor.trunk` (Vehicle trunk / boot)
- `vehicleEVehicleDoor.hood` (Vehicle hood / bonnet)

### Controlling Doors, Hood, and Trunk

```typescript
import type { vehicleBaseObject, vehicleControllerPS } from '@cybermp/client-types/game';
import {
  vehicleEVehicleDoor,
  vehicleVehicleDoorState,
  vehicleEVehicleWindowState,
} from '@cybermp/client-types/enums';

/**
 * Sets the physical state of a vehicle door, hood, or trunk.
 *
 * @param vehicle Target vehicle instance
 * @param door Target aperture (e.g. hood, trunk, seat_front_left)
 * @param open Whether to open (true) or close (false)
 * @param immediate If true, skips opening animation
 */
export function setVehicleApertureState(
  vehicle: vehicleBaseObject,
  door: vehicleEVehicleDoor,
  open: boolean,
  immediate: boolean = false,
): void {
  const controller: vehicleControllerPS = vehicle.GetVehicleControllerPS();
  if (!controller) return;

  const targetState = open
    ? vehicleVehicleDoorState.Open
    : vehicleVehicleDoorState.Closed;

  controller.SetDoorState(door, targetState, immediate);
}

/**
 * Toggles the vehicle hood open or closed (useful for car meetups and engine repairs).
 */
export function toggleVehicleHood(vehicle: vehicleBaseObject, open: boolean): void {
  setVehicleApertureState(vehicle, vehicleEVehicleDoor.hood, open);
}

/**
 * Toggles the vehicle trunk open or closed (useful for storing items or contraband).
 */
export function toggleVehicleTrunk(vehicle: vehicleBaseObject, open: boolean): void {
  setVehicleApertureState(vehicle, vehicleEVehicleDoor.trunk, open);
}

/**
 * Sets the power window state (up/closed or down/opened).
 */
export function setVehicleWindowState(
  vehicle: vehicleBaseObject,
  door: vehicleEVehicleDoor,
  lowered: boolean,
): void {
  const controller: vehicleControllerPS = vehicle.GetVehicleControllerPS();
  if (!controller) return;

  const windowState = lowered
    ? vehicleEVehicleWindowState.Open
    : vehicleEVehicleWindowState.Closed;

  controller.SetWindowState(door, windowState);
}
```

---

## 2. Engine & Headlight Controls (`TurnEngineOn`)

`vehicleBaseObject` allows toggling the engine ignition state independently of player occupancy:

```typescript
import type { vehicleBaseObject, vehicleControllerPS } from '@cybermp/client-types/game';
import { vehicleELightMode } from '@cybermp/client-types/enums';

/**
 * Toggles the vehicle engine state on or off.
 *
 * @param vehicle Target vehicle
 * @param engineOn Target ignition state
 */
export function setVehicleEngine(vehicle: vehicleBaseObject, engineOn: boolean): void {
  if (!vehicle) return;

  // TurnEngineOn controls physical engine ignition and idle audio
  vehicle.TurnEngineOn(engineOn);

  // TurnVehicleOn controls auxiliary electronics and dashboard HUDs
  vehicle.TurnVehicleOn(engineOn);

  console.log(`[Vehicle] Engine state set to: ${engineOn}`);
}

/**
 * Configures vehicle headlight intensity and mode.
 */
export function setVehicleHeadlights(
  vehicle: vehicleBaseObject,
  mode: vehicleELightMode,
): void {
  const controller: vehicleControllerPS = vehicle.GetVehicleControllerPS();
  if (!controller) return;

  controller.SetHeadLightMode(mode);
}

/**
 * Cycles headlights through Off -> LowBeams -> HighBeams.
 */
export function cycleHeadlights(vehicle: vehicleBaseObject): void {
  const controller: vehicleControllerPS = vehicle.GetVehicleControllerPS();
  if (!controller) return;

  controller.CycleHeadLightMode(true);
}
```

---

## 3. CrystalCoat Dynamic Shader & Body Customization

Cyberpunk 2077 Patch 2.1+ introduced the Rayfield **CrystalCoat** nanotechnology shader, allowing real-time, animated exterior livery and color shifts.

### Enabling CrystalCoat Shaders

Before playing visual customization shaders, unlock the native quest fact `vvc_visual_customization_unlocked`:

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

/**
 * Unlocks the native vehicle visual customization system on client start.
 */
export function unlockVisualCustomization(): void {
  const questsSystem = mp.game.ScriptGameInstance.GetQuestsSystem();
  if (questsSystem) {
    questsSystem.SetFactStr('vvc_visual_customization_unlocked', 1);
  }
}

/**
 * Triggers the CrystalCoat holographic shader pulse across the vehicle body panels.
 *
 * @param vehicle Target vehicle
 * @param play Whether to trigger the color wave animation
 * @param instant If true, changes color without wave transition
 * @param affectRims Whether wheel rims also change coloration
 */
export function playCrystalCoatShader(
  vehicle: vehicleBaseObject,
  play: boolean = true,
  instant: boolean = false,
  affectRims: boolean = true,
): void {
  if (!vehicle) return;

  vehicle.PlayVehicleVisualCustomizationShader(play, instant, affectRims);
  console.log('[Vehicle] CrystalCoat customization shader invoked');
}
```

---

## 4. Physical Body Part Detachment (`DetachPart`)

For demolition derbies, high-speed collisions, or chop-shop mechanics, you can programmatically detach external body components:

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

/**
 * Detaches a named body component from the vehicle chassis.
 *
 * @param vehicle Target vehicle
 * @param partName Name of the part mesh (e.g. 'hood', 'trunk', 'bumper_front', 'door_front_left')
 */
export function detachVehiclePart(vehicle: vehicleBaseObject, partName: string): void {
  if (!vehicle) return;

  vehicle.DetachPart(partName);
  console.log(`[Vehicle] Detached part: ${partName}`);
}

/**
 * Strips all external body panels from a vehicle (demolition derby mode).
 */
export function stripVehiclePanels(vehicle: vehicleBaseObject): void {
  const parts = [
    'hood',
    'trunk',
    'bumper_front',
    'bumper_back',
    'door_front_left',
    'door_front_right',
    'door_back_left',
    'door_back_right',
  ];

  for (const part of parts) {
    detachVehiclePart(vehicle, part);
  }
}
```

---

## 5. Vehicle Combat 2.0 (Mounted Weapons & Window Drive-Bys)

Cyberpunk 2077 Update 2.0 overhauled vehicle combat with mounted machine guns, rocket pods, and sidearm drive-by shooting.

### Mounted Weapon Systems

Weaponized vehicles (e.g. Type-66 "Hoon", Mizutani Shion "Coyote", Militech Hellhound) feature integrated weapons mounted directly to the chassis:

- **Machine Guns**: High-rate-of-fire kinetic weapons firing along the forward vehicle axis or auto-targeting tracked enemies.
- **Missile Launchers**: Lock-on or unguided heavy ordnance for anti-vehicle destruction.

### Drive-By Shooting Through Windows

When operating non-weaponized standard passenger cars, players can shoot through windows using one-handed weapons (pistols, revolvers, submachine guns, or cyberware).

```typescript
import { vehicleEVehicleDoor } from '@cybermp/client-types/enums';

/**
 * Prepares a vehicle for drive-by combat by rolling down front windows
 * and enforcing the combat lock restriction to prevent accidental ejection.
 */
export function prepareVehicleForCombat(vehicle: vehicleBaseObject): void {
  // 1. Lower driver and passenger side windows for unobstructed aiming
  setVehicleWindowState(vehicle, vehicleEVehicleDoor.seat_front_left, true);
  setVehicleWindowState(vehicle, vehicleEVehicleDoor.seat_front_right, true);

  // 2. Apply gameplay restriction to prevent accidental vehicle ejection during combat maneuvers
  const player = mp.game.GetPlayer();
  if (player) {
    const effectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
    effectSystem.ApplyStatusEffect(
      player.GetEntityID(),
      'GameplayRestriction.VehicleCombatBlockExit',
      player.GetRecordID(),
      player.GetEntityID(),
    );
  }

  console.log('[Combat] Vehicle prepared for drive-by combat');
}

/**
 * Restores normal driving conditions after combat ends.
 */
export function endVehicleCombat(vehicle: vehicleBaseObject): void {
  // Raise windows
  setVehicleWindowState(vehicle, vehicleEVehicleDoor.seat_front_left, false);
  setVehicleWindowState(vehicle, vehicleEVehicleDoor.seat_front_right, false);

  // Remove exit lock
  const player = mp.game.GetPlayerObject();
  if (player && mp.game.StatusEffectHelper) {
    mp.game.StatusEffectHelper.RemoveStatusEffect(
      player,
      'GameplayRestriction.VehicleCombatBlockExit',
      undefined,
    );
  }
}
```
