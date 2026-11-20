# Animations & Workspots Reference

This reference covers REDengine 4's native workspot system (`gameWorkspotGameSystem`) in CyberMP client scripts, enabling contextual full-body animations such as sitting, leaning, smoking, drinking, and dancing.

---

## 1. What are Workspots in REDengine?

In Cyberpunk 2077, complex ambient and interactive animations are handled by **Workspots**. Rather than manually blending skeletal bones or clipping through chairs, a workspot aligns the actor entity with an interactive object or anchor point, handling:

- Seamless camera transitions (allowing free look or fixed cinematic angles).
- Prop attachment (holding glasses, cigarettes, bottles, datashards).
- Entry, idle loops, reactions, and smooth exit transitions.

The subsystem managing all workspot interactions is `gameWorkspotGameSystem`, retrieved via:

```typescript
const workspotSystem = mp.game.ScriptGameInstance.GetWorkspotSystem();
```

---

## 2. Core Workspot API (`gameWorkspotGameSystem`)

### Key Methods

| Method | Description |
|---|---|
| `PlayInDeviceSimple(device, actor, allowCameraMov, ...)` | Begins workspot animation playback on the actor anchored to the device. |
| `SendSlowExitSignal(actor, animName?, dontWait?)` | Gracefully transitions the actor out of the workspot with an exit animation. |
| `SendFastExitSignal(actor, dirLS?, stayIfFailed?, ...)` | Abruptly breaks out of the workspot (e.g. taking damage or drawing weapons). |
| `StopInDevice(actor, posDelta?, orientDelta?)` | Immediately stops workspot playback without exit animations. |
| `IsActorInWorkspot(actor)` | Checks if the given actor entity is currently playing a workspot. |

---

## 3. Playing and Exiting Workspots

Here is a standard wrapper implementing safe workspot playback, camera freedom, and graceful exit handling.

```typescript
import type { gameObject, gameWorkspotGameSystem } from '@cybermp/client-types/game';

const workspotSystem: gameWorkspotGameSystem = mp.game.ScriptGameInstance.GetWorkspotSystem();

/**
 * Starts a workspot on the local player using a target workspot device entity.
 *
 * @param device Target interactive furniture, chair, or workspot anchor entity
 * @param allowCameraMovement Whether the player retains free camera look-around
 */
export function enterWorkspot(device: gameObject, allowCameraMovement: boolean = true): boolean {
  const player = mp.game.GetPlayer();
  if (!player || !device || !workspotSystem) return false;

  if (workspotSystem.IsActorInWorkspot(player)) {
    console.log('[Workspot] Player is already in an active workspot.');
    return false;
  }

  workspotSystem.PlayInDeviceSimple(
    device,
    player,
    allowCameraMovement,
    undefined, // actorDataCompName
    undefined, // deviceDataCompName
    undefined, // syncSlotName
    0.3,       // slideTime (seconds to align into spot)
  );

  console.log('[Workspot] Entered workspot successfully');
  return true;
}

/**
 * Gracefully exits the current workspot with a natural exit animation.
 */
export function exitWorkspotGracefully(): void {
  const player = mp.game.GetPlayer();
  if (!player || !workspotSystem) return;

  if (workspotSystem.IsActorInWorkspot(player)) {
    workspotSystem.SendSlowExitSignal(player);
    console.log('[Workspot] Sent slow exit signal');
  }
}

/**
 * Immediately breaks the player out of a workspot (e.g. in combat or emergency).
 */
export function exitWorkspotFast(): void {
  const player = mp.game.GetPlayer();
  if (!player || !workspotSystem) return;

  if (workspotSystem.IsActorInWorkspot(player)) {
    workspotSystem.SendFastExitSignal(player, undefined, false, true, true);
    console.log('[Workspot] Sent fast exit signal');
  }
}

/**
 * Returns whether the local player is currently seated or in a workspot.
 */
export function isPlayerInWorkspot(): boolean {
  const player = mp.game.GetPlayer();
  if (!player || !workspotSystem) return false;
  return workspotSystem.IsActorInWorkspot(player);
}
```

---

## 4. Catalog of Verified Workspot Actions

Night City includes thousands of predefined workspot devices scattered across the map. Below are verified workspot categories and behaviors:

### 1. Sitting (Chairs, Benches, Bar Stools, Couches)
- **Visuals**: Seamless alignment with seat cushions, natural relaxed posture, hands resting on knees or bar counter.
- **Camera**: Allows first-person or third-person 360-degree look.
- **Exit**: Slow exit plays standing up animation; pressing movement keys (`W/A/S/D`) can trigger `SendSlowExitSignal`.

### 2. Smoking (Balconies, Street Corners, Alleyways)
- **Visuals**: Character leans back or against railings, spawns an animated cigarette prop in fingers, takes periodic drags, and emits smoke particle VFX from mouth.
- **Props**: Automatically attaches `base\items\quest\q000\q000_cigarette.ent` (or equivalent) to the player's hand bone slot (`ItemSlot.Hand_R`).

### 3. Drinking (Bars, Lounges, Nightclubs)
- **Visuals**: Spawns bottle or glass (e.g. Nicola, Centzon, Johnny Silverhand cocktail), sips periodically, and rests elbows on the bar counter.
- **Props**: Attaches beverage container prop to the hand slot and synchronizes audio sips.

### 4. Leaning (Railings, Walls, Balconies)
- **Visuals**: Forearms resting on chest-high railings, overlooking cityscapes, or leaning back against concrete walls.
- **Multiplayer Usage**: Perfect for scenic social hubs, penthouses, and club balconies.

### 5. Dancing (Clubs, Afterlife, Riot, 7th Hell)
- **Visuals**: Continuous rhythmic dancing with multiple synchronized variations (energetic EDM dance, relaxed swaying, industrial groove).
- **Audio**: Automatically syncs rhythm with nearby music emitters.

---

## 5. Multiplayer Workspot Synchronization

Because `gameWorkspotGameSystem` runs in the local game client, when a player sits down or smokes, other players will not see it unless the action is synchronized over CyberMP:

```typescript
// 1. Client notifies server when entering a workspot
export function syncWorkspotStart(workspotEntityId: string): void {
  mp.events.emitServer('player:workspot:enter', workspotEntityId);
}

// 2. Server relays to all nearby clients
// mp.events.onClient('player:workspot:enter', (player, workspotEntityId) => {
//   mp.events.emitClient(otherPlayers, 'player:workspot:replicate', player.id, workspotEntityId);
// });

// 3. Other clients play the workspot on the remote player ped
mp.events.onServer('player:workspot:replicate', (remotePlayerId: number, workspotEntityId: string) => {
  const remotePlayerPed = getRemotePlayerPed(remotePlayerId);
  const workspotDevice = findDeviceEntityById(workspotEntityId);

  if (remotePlayerPed && workspotDevice) {
    const ws = mp.game.ScriptGameInstance.GetWorkspotSystem();
    ws.PlayInDeviceSimple(workspotDevice, remotePlayerPed, true);
  }
});
```
