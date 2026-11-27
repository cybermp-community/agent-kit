---
environment: client
---

# Animations & Workspots Reference

A REDengine workspot uses a device or anchor and an actor. Its data can define alignment, entry and exit animations, camera behavior and props. The outcome depends on the selected workspot, the device setup and the actor.

## 1. Workspot Assets in Cyberpunk 2077

When inspecting a vanilla spot or building one in WolvenKit, start with the device entity. One documented pattern is an `.ent` with a `workWorkspotResourceComponent` referencing a `.workspot` by component name and depot path. Inspect the animation clips and their dependencies in the target build. Treat labels such as sitting, leaning, smoking or dancing as search terms. A label alone does not identify the device, position, animation or camera behavior. [Workspot asset example](https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/abusing-workspots)

### Delivering an Archive with a Workspot

Verify one device and one animation in the target game first. For custom assets, package the device, workspot and required dependencies into an archive and declare it in the resource's `file` list. Test the depot path, spawn or placement, component name and playback separately on a clean CyberMP client. If the original mod uses another runtime, verify how its logic is invoked in CyberMP. Archive delivery alone proves neither that its external script runtime is available nor that the animation is replicated. [CyberMP resource files](https://docs.cyber.mp/guides/resources/adding-resource-files/) · [Archive prop recipe](recipes/archive-prop.md)

## 2. Core Workspot API (`gameWorkspotGameSystem`)

These methods are declared in `@cybermp/client-types@2.7.1`. Get the system through `mp.game.ScriptGameInstance.GetWorkspotSystem()` after the world is available. Actor and device arguments are native `gameObject` handles. [CyberMP type definitions](https://github.com/Cyber-MP/CyberMP-Types)

| Method | Purpose |
|---|---|
| `PlayInDeviceSimple(device, actor, allowCameraMov, ...)` | Requests playback at the device. Optional arguments include actor and device component names, a sync slot and slide settings. |
| `IsActorInWorkspot(actor)` | Reports whether the actor is in a workspot. Check device identity separately if the mode needs it. |
| `SendSlowExitSignal(actor, animationName?, dontWaitForCurrentAnimationToFinish?)` | Requests a normal exit. |
| `SendFastExitSignal(actor, ...)` | Requests a fast exit with optional failure and transition behavior. |
| `StopInDevice(actor, posDelta?, orientDelta?)` | Stops playback with optional position and rotation deltas. |

## 3. Playing and Exiting Workspots

### Local Playback Request (`PlayInDeviceSimple`)

Pass a resolved device that you have checked in the target build. Run after the local player spawns. The wrapper returns whether it issued the request. Verify alignment, entry and exit separately from `IsActorInWorkspot`.

```typescript
import type { gameObject } from '@cybermp/client-types/game';

export function requestLocalWorkspot(device: gameObject, deviceComponent?: string): boolean {
  const actor = mp.game.GetPlayerObject();
  if (!actor) return false;

  const system = mp.game.ScriptGameInstance.GetWorkspotSystem();
  if (!system || system.IsActorInWorkspot(actor)) return false;

  system.PlayInDeviceSimple(device, actor, true, undefined, deviceComponent);
  return true;
}
```

### Local Exit Request (`SendSlowExitSignal`)

Call this only when your resource owns the actor's current workspot session. Actor presence in a workspot alone does not prove ownership. Watch for puppet replacement and clean up the resource's occupancy state on mode exit and resource stop.

```typescript
export function requestLocalWorkspotExit(): boolean {
  const actor = mp.game.GetPlayerObject();
  if (!actor) return false;

  const system = mp.game.ScriptGameInstance.GetWorkspotSystem();
  if (!system?.IsActorInWorkspot(actor)) return false;

  system.SendSlowExitSignal(actor);
  return true;
}
```

## 4. Multiplayer Workspot Synchronization

First test the local animation with two clients to see what CyberMP already replicates. If the mode needs shared occupancy, keep the canonical occupancy on the server using a stable resource key for the spot and the player's CyberMP Network ID. Validate requests against the spot catalog, player position, dimension and current occupancy. Send the current state to late joiners and release occupancy on exit, disconnect or mode reset.

Remote playback is a separate engine test. For an available player, resolve the Network ID with `mp.network.getPlayerGameId` on that client. Resolve the device by the resource key on the same client. Defer presentation if the actor or device is missing. Before applying `PlayInDeviceSimple` to a remote actor, test whether it works with that actor's ownership and CyberMP's movement updates. Verify stream-out and stream-in, another client joining while the spot is occupied, and exit or respawn. [CyberMP Network IDs](https://docs.cyber.mp/guides/client/network-ids/)
