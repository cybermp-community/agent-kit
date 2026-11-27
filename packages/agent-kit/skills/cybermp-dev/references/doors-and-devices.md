---
environment: client
---

# Doors & Scriptable Devices Reference

Inspect or operate an existing door through the REDengine client bridge with `use_game_natives = true`. Door state, world streaming and CyberMP replication each need their own check.

## 1. Device Architecture & Persistent State (`DoorControllerPS`)

A streamed `Door` exposes its engine persistent-state controller through `GetDevicePS()`. The controller provides `IsOpen()`, `IsLocked()` and `IsSealed()` for inspection. REDengine persistent state describes the device inside the game. Shared state between CyberMP clients requires separate evidence. [Freeroam door command](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/chat/basic-chat.commands.ts)

## 2. Door Operations: Open, Close, and Unlock

`Door.OpenDoor()` and `Door.CloseDoor()` are declared client natives. Freeroam calls `OpenDoor()` from its diagnostic command. `ActionSetOpened()`, `ActionSetClosed()` and `ActionToggleLock()` construct controller actions. Their concrete return types fail assignment to the generated `ExecutePSAction` parameter in `@cybermp/client-types@2.7.1`. For a controller-action workflow, verify the action's context and dispatch in the target engine build. [CyberMP type definitions](https://github.com/Cyber-MP/CyberMP-Types)

### Door Manipulation Helper

Use this client fragment on a known, streamed door. It skips sealed or locked doors and leaves unlocking to the device's own interaction flow. It returns whether it issued a request. Read the persistent state again and check the animation and collision after the request.

```typescript
import type { Door } from '@cybermp/client-types/game';

export function requestLocalDoorState(door: Door, open: boolean): boolean {
  const state = door.GetDevicePS();
  if (!state || state.IsSealed() || state.IsLocked() || state.IsOpen() === open) return false;

  if (open) door.OpenDoor();
  else door.CloseDoor();

  return true;
}
```

## 3. Detecting and Interacting with Look-At Doors

Use `GetLookAtObject` with `GetPlayerObject()`. Narrow the returned object with `IsA('Door')` before using door-specific methods. The targeting result is a local candidate. A multiplayer interaction also needs its own range and access checks. [Freeroam door command](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/chat/basic-chat.commands.ts)

```typescript
import type { Door } from '@cybermp/client-types/game';

export function getLookAtDoor(): Door | undefined {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  const target = mp.game.ScriptGameInstance.GetTargetingSystem()?.GetLookAtObject(player);
  if (!target?.IsA('Door')) return;

  return target as unknown as Door;
}
```

## 4. Unlocking Night City Interiors

For a resource that opens a vanilla interior, identify one intended door in the target game build. Record its position, class and device state before trying an operation. Check whether the quest, DLC, access state, world streaming or an archive override affects that door. A radius can include unrelated doors. Avoid direct writes to device flags as a substitute for testing an interaction. Recheck the entrance after leaving and returning to streaming range. [Interior streaming](object-spawning-and-streaming.md#5-interior-streaming--occlusion-handling)

## 5. Occluders & Interior Lighting Portals

The generated `Door` type exposes `occluder` and `portalLight1` through `portalLight4`. Treat them as diagnostic leads. If an open entrance shows missing geometry, first check sector loading, collision and camera placement. If a test changes one component, capture its prior state and restore it after the comparison. [Interior streaming](object-spawning-and-streaming.md#5-interior-streaming--occlusion-handling)

## 6. Multiplayer Door State Synchronization

Use a **stable resource key** for an existing world door. A local `EntityID` identifies an engine object on the client. For a server-managed network object, CyberMP provides a separate Network ID and a client-side mapping. Check which kind of object your door actually is and verify how each client resolves the same resource key. [CyberMP Network IDs](https://docs.cyber.mp/guides/client/network-ids/)

For a shared door, let the server validate the sender, allowed door key, dimension, distance and interaction permissions. Publish the desired state, such as `open: true`, and a revision. Apply the state once the door is available locally. Reconcile again on stream-in and supply the current state to late joiners. Verify behavior with two clients, repeated delivery, out-of-range requests and return to the streaming area. Treat this as a resource protocol design until the engine behavior is measured. [CyberMP server events](https://docs.cyber.mp/guides/server/events/)
