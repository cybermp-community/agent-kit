---
environment: client
---

# Vehicles Tuning, Aesthetics & Combat 2.0 Reference

Use these native client examples with `use_game_natives = true` on a streamed vehicle. Model support, local effects and network behavior need separate checks. [Server vehicles](https://docs.cyber.mp/guides/server/vehicles/)

## 1. Door, Hood, Trunk & Window Manipulation (`vehicleControllerPS`)

The installed client declarations expose `GetVehicleControllerPS()` on `VehicleComponentPS`. Obtain that component via `vehicle.GetVehiclePS()`. The controller's setters and getters inspect or update local state. Verify that the target model has the specified aperture and check its visible response. [CyberMP type definitions](https://github.com/Cyber-MP/CyberMP-Types)

### Door & Aperture Slots (`vehicleEVehicleDoor`)

The enumeration includes front and rear seat doors, `hood` and `trunk`. Select a slot supported by the vehicle. Check window state separately using `GetWindowState` and `SetWindowState` on the same controller.

### Controlling Doors, Hood, and Trunk

This example returns whether it issued a local state request. Check `GetDoorState` and the visible panel afterward.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';
import { vehicleEVehicleDoor, vehicleVehicleDoorState } from '@cybermp/client-types/enums';

export function requestVehicleAperture(
  vehicle: vehicleBaseObject,
  slot: vehicleEVehicleDoor,
  open: boolean,
): boolean {
  const controller = vehicle.GetVehiclePS()?.GetVehicleControllerPS();
  if (!controller) return false;

  const state = open ? vehicleVehicleDoorState.Open : vehicleVehicleDoorState.Closed;
  controller.SetDoorState(slot, state, false);
  return true;
}
```

## 2. Engine & Headlight Controls (`TurnEngineOn`)

`TurnEngineOn` and `TurnVehicleOn` are separate client calls. Test the requested ignition action independently of lighting or auxiliary state. For headlights, get the current mode with `GetHeadLightMode()` and use `SetHeadLightMode()` on the controller.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';
import type { vehicleELightMode } from '@cybermp/client-types/enums';

export function requestEngineState(vehicle: vehicleBaseObject, on: boolean): void {
  vehicle.TurnEngineOn(on);
}

export function requestHeadlightMode(vehicle: vehicleBaseObject, mode: vehicleELightMode): boolean {
  const controller = vehicle.GetVehiclePS()?.GetVehicleControllerPS();
  if (!controller) return false;

  controller.SetHeadLightMode(mode);
  return true;
}
```

## 3. CrystalCoat Dynamic Shader & Body Customization

Check that the target model and appearance support CrystalCoat in the current game build. A shader transition and a customization state change are separate operations. The server event catalog includes `vehicleCustomizationChange`. Use the declared event payload and compare it with owner and observer views. A local quest fact is specific to the game context and should only be changed if the resource owns that state. [CyberMP vehicle guide](https://docs.cyber.mp/guides/server/vehicles/#handling-vehicle-events) · [Kit event catalog](events.md)

### CrystalCoat Shader Probe (`PlayVehicleVisualCustomizationShader`)

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

export function requestCrystalCoatTransition(vehicle: vehicleBaseObject): void {
  vehicle.PlayVehicleVisualCustomizationShader(true);
}
```

## 4. Physical Body Part Detachment (`DetachPart`)

Inspect the named parts of the specific vehicle asset. A door slot enum and a part name address different data. For a controlled destruction test, use one confirmed part on a replaceable test vehicle. Verify visible detachment, collision and what other clients observe.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

export function requestVehiclePartDetach(vehicle: vehicleBaseObject, verifiedPartName: string): void {
  vehicle.DetachPart(verifiedPartName);
}
```

## 5. Vehicle Combat 2.0 (Mounted Weapons & Window Drive-Bys)

Check the model's vehicle record, actual weapon and occupied seat. A window request alone does not establish the ability to fire. For a mode that adds an exit restriction, verify the record and clean it up when the mode ends or the puppet changes. Compare local aiming, firing, server events and second-client observations before exposing the feature in a multiplayer resource. [Player status effects](player-mechanics.md#3-status-effects--restrictions)
