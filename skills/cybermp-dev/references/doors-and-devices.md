# Doors & Scriptable Devices Reference

This reference covers programmatic door manipulation, security locks, and unlocking Night City interiors using REDengine native device components in CyberMP client scripts.

---

## 1. Device Architecture & Persistent State (`DoorControllerPS`)

In REDengine 4, interactive world objects like doors, shutters, elevator gates, and security blast barriers are represented by the `Door` entity class (inheriting from `InteractiveDevice`).

Physical entities in the world do not execute state logic directly. Instead, they delegate logic and networking state to a **Persistent State (PS)** controller: `DoorControllerPS` (derived from `ScriptableDeviceComponentPS`).

```
┌────────────────────────────────┐
│          Door Entity           │ (world mesh, colliders, animations, audio)
│     (mp.game.Door / gameObject)│
└──────────────┬─────────────────┘
               │ .GetDevicePS() / .GetPS()
               ▼
┌────────────────────────────────┐
│        DoorControllerPS        │ (state machine, lock flags, security access)
├────────────────────────────────┤
│ - isLocked: boolean            │
│ - isOpened: boolean            │
│ - isSealed: boolean            │
│ - ActionSetOpened()            │
│ - ActionSetClosed()            │
│ - ActionToggleLock()           │
│ - ExecutePSAction(action)      │
└────────────────────────────────┘
```

To manipulate a door, retrieve its `DoorControllerPS` and invoke actions through `ExecutePSAction`.

---

## 2. Door Operations: Open, Close, and Unlock

The `DoorControllerPS` class exposes explicit action generator methods that return `Handle<ScriptableDeviceAction>`:

- `ActionSetOpened()`: Forces the door or shutter into an opened state.
- `ActionSetClosed()`: Forces the door into a closed state.
- `ActionToggleLock()`: Unlocks or locks the door, changing `isLocked`.
- `ActionToggleOpen()`: Toggles the door between opened and closed.

### Door Manipulation Helper

```typescript
import type { Door, DoorControllerPS } from '@cybermp/client-types/game';

/**
 * Retrieves the DoorControllerPS from an interactive door entity.
 */
export function getDoorController(doorEntity: Door): DoorControllerPS | null {
  if (!doorEntity) return null;
  return doorEntity.GetDevicePS();
}

/**
 * Programmatically opens an interactive door or gate.
 */
export function openDoor(doorEntity: Door): boolean {
  const ps = getDoorController(doorEntity);
  if (!ps) return false;

  // If door is locked, unlock it first
  if (ps.IsLocked()) {
    const unlockAction = ps.ActionToggleLock();
    ps.ExecutePSAction(unlockAction);
  }

  const openAction = ps.ActionSetOpened();
  ps.ExecutePSAction(openAction);
  return true;
}

/**
 * Programmatically closes an interactive door.
 */
export function closeDoor(doorEntity: Door): boolean {
  const ps = getDoorController(doorEntity);
  if (!ps) return false;

  const closeAction = ps.ActionSetClosed();
  ps.ExecutePSAction(closeAction);
  return true;
}

/**
 * Locks or unlocks an interactive door.
 *
 * @param doorEntity Target door entity
 * @param locked Target lock state
 */
export function setDoorLock(doorEntity: Door, locked: boolean): boolean {
  const ps = getDoorController(doorEntity);
  if (!ps) return false;

  if (ps.IsLocked() !== locked) {
    const lockAction = ps.ActionToggleLock();
    ps.ExecutePSAction(lockAction);
  }
  return true;
}
```

---

## 3. Detecting and Interacting with Look-At Doors

To allow players to interact with doors in front of them without hardcoded coordinates, use REDengine's `TargetingSystem` to detect what object the local player is currently looking at.

```typescript
import type { Door, gameObject } from '@cybermp/client-types/game';

/**
 * Detects whether the local player is looking directly at an interactive door.
 *
 * @returns The target Door entity if found within reach, or null
 */
export function getLookAtDoor(): Door | null {
  const player = mp.game.GetPlayer();
  if (!player) return null;

  const targetingSystem = mp.game.ScriptGameInstance.GetTargetingSystem();
  if (!targetingSystem) return null;

  // Query entity under player crosshair
  const lookAtObject: gameObject = targetingSystem.GetLookAtObject(player, false, false);
  if (!lookAtObject) return null;

  // Verify entity is an interactive Door
  if (lookAtObject.IsA('Door')) {
    return lookAtObject as unknown as Door;
  }

  return null;
}
```

---

## 4. Unlocking Night City Interiors

Night City contains dozens of fully-furnished quest interiors, apartment complexes, clubs, and high-rise suites that are locked or sealed in singleplayer free-roam (e.g., Konpeki Plaza suites, V's mansion, Clouds club, Lizzy's Bar VIP, Kerry Eurodyne's estate, Dogtown black sapphire facilities).

### Automatic Interior Unlock Hook

By observing `Door` lifecycle attachment with `mp.game.observe`, your client resource can automatically unlock doors when the player approaches specific buildings or interiors.

```typescript
import type { Door, DoorControllerPS } from '@cybermp/client-types/game';

// Known interior coordinates for automatic door unlocking
const UNLOCKED_INTERIOR_HUBS = [
  { name: "V's Luxury Mansion", x: -1452.4, y: 1256.3, z: 112.5, radius: 45.0 },
  { name: 'Konpeki Penthouse', x: -2195.8, y: 1782.1, z: 228.4, radius: 60.0 },
  { name: 'Afterlife VIP Suite', x: -1380.2, y: 1290.4, z: 18.2, radius: 30.0 },
];

/**
 * Unlocks any door whose persistent state is currently locked or sealed.
 */
export function forceUnlockDoor(ps: DoorControllerPS): void {
  // Clear sealed flag
  if (ps.isSealed) {
    ps.isSealed = false;
  }

  // Toggle lock state if locked
  if (ps.IsLocked()) {
    const unlockAction = ps.ActionToggleLock();
    ps.ExecutePSAction(unlockAction);
  }

  // Open the door
  if (!ps.IsOpen()) {
    const openAction = ps.ActionSetOpened();
    ps.ExecutePSAction(openAction);
  }
}

/**
 * Initializes automatic interior door unlocking for the local client.
 */
export function initInteriorUnlocks(): void {
  // Observe when any Door is attached to the game world
  mp.game.observe('Door', 'OnGameAttached', (door: Door) => {
    const ps = door.GetDevicePS();
    if (!ps) return;

    const doorPos = door.GetWorldPosition();

    // Check if door is within any designated interior unlock hub
    for (const hub of UNLOCKED_INTERIOR_HUBS) {
      const dx = doorPos.x - hub.x;
      const dy = doorPos.y - hub.y;
      const dz = doorPos.z - hub.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist <= hub.radius) {
        console.log(`[Doors] Unlocking ${hub.name} door: ${door.GetEntityID().hash}`);
        forceUnlockDoor(ps);
        break;
      }
    }
  });
}
```

---

## 5. Occluders & Interior Lighting Portals

When unlocking doors to enter previously closed interiors, REDengine's occlusion culling system may occasionally culled interior rooms (showing a black void or invisible geometry) if the door is treated as a solid occlusion barrier.

The `Door` entity contains references to its visual occluder component and portal lights:

```typescript
import type { Door } from '@cybermp/client-types/game';

/**
 * Ensures visual occlusion and portal lighting components update properly
 * when an interior door is forced open.
 */
export function fixInteriorDoorOcclusion(door: Door): void {
  // Disable occluder component to prevent black void culling behind open door
  if (door.occluder) {
    door.occluder.Toggle(false);
  }

  // Enable door portal lights to ensure proper interior ambient illumination
  if (door.portalLight1) door.portalLight1.Toggle(true);
  if (door.portalLight2) door.portalLight2.Toggle(true);
  if (door.portalLight3) door.portalLight3.Toggle(true);
  if (door.portalLight4) door.portalLight4.Toggle(true);
}
```

---

## 6. Multiplayer Door State Synchronization

In CyberMP, door state manipulation performed locally via `DoorControllerPS` is client-side. To ensure all players see the same doors open, closed, or locked, synchronize door interactions via server RPCs:

```typescript
// Client-side: Request door toggle from server
export function requestDoorToggle(doorEntity: Door): void {
  const entityId = doorEntity.GetEntityID().hash;
  mp.events.emitServer('doors:toggle', entityId.toString());
}

// Client-side: Receive authoritative door state from server
mp.events.onServer('doors:setState', (doorEntityIdStr: string, shouldOpen: boolean) => {
  // Find local door entity matching ID and apply state
  const targetDoor = findLocalDoorById(doorEntityIdStr);
  if (targetDoor) {
    if (shouldOpen) {
      openDoor(targetDoor);
    } else {
      closeDoor(targetDoor);
    }
  }
});
```
