---
environment: client
---

# World Interaction Recipe: Native [F] Prompt & In-World Markers

This game-client recipe uses `use_game_natives = true` to test one interaction point. Check the HUD prompt, coordinate marker and input separately. Each can succeed or fail independently in the target build.

## 1. Interaction Flow

- Show a coordinate marker through `MappinSystem.RegisterMappin`. `Mappins.DefaultStaticMappin` is used in Freeroam. The sample uses the `UseVariant` candidate for an interaction icon. Verify which map surfaces show the point. [Freeroam checkpoint code](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game-modes/modes/race/checkpoint.ts) · [INK HUD and minimap](../ui-ink-and-minimap.md)
- Request a HUD hint with `SendInputHintData` and the `ChoiceApply` action. Check the shown binding and label. The separate `onInputKeyEvent` demonstration listens for the physical keyboard key `IK_F`. Check remapping, controller input and menu behavior before using the pattern outside a keyboard probe.
- A real server interaction should send a stable resource point key with `mp.events.emitServer`. Validate the player, point, distance, dimension and eligibility on the server. [RPC flow reference](../rpc-flows.md)

## 2. Interaction Point Probe (`SendInputHintData`)

In the client resource, call `startInteractionProbe(x, y, z, radius)` after world load using a measured location and a positive radius. Add one point only for this check. The input handler logs an observation. It reads proximity again at press time and skips presses while CEF has focus. Use `stopInteractionProbe()` to remove the point, hint and timer, or stop the resource.

```typescript env=client checked=@cybermp/client-types@2.7.1
import type { gameNewMappinID, Vector4 } from '@cybermp/client-types/game';
import { EInputAction, EInputKey, gamedataMappinVariant } from '@cybermp/client-types/enums';

const hintSource = 'CyberMPKitInteractionProbe';
let point: { position: Vector4; radius: number; marker: gameNewMappinID } | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let hintVisible = false;

function isNearPoint(): boolean {
  const player = mp.game.GetPlayer();
  if (!point || !player) return false;

  const from = player.GetWorldPosition();
  const to = point.position;
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) <= point.radius;
}

function updateHint(show: boolean): void {
  if (show === hintVisible) return;

  const hint = Object.assign(new mp.game.gameuiInputHintData(), {
    action: 'ChoiceApply',
    source: hintSource,
    localizedLabel: 'Test interaction',
  });
  mp.game.SendInputHintData(show, hint);
  hintVisible = show;
}

export function stopInteractionProbe(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;

  const marker = point?.marker;
  point = undefined;
  try {
    updateHint(false);
  } finally {
    if (marker != null) {
      mp.game.ScriptGameInstance.GetMappinSystem()?.UnregisterMappin(marker);
    }
  }
}

export function startInteractionProbe(x: number, y: number, z: number, radius = 2): boolean {
  if (![x, y, z, radius].every(Number.isFinite) || radius <= 0) return false;
  const mappins = mp.game.ScriptGameInstance.GetMappinSystem();
  if (!mappins) return false;

  stopInteractionProbe();
  const position = Object.assign(new mp.game.Vector4(), { x, y, z, w: 1 });
  const data = Object.assign(new mp.game.gamemappinsMappinData(), {
    active: true,
    mappinType: 'Mappins.DefaultStaticMappin',
    variant: gamedataMappinVariant.UseVariant,
    visibleThroughWalls: false,
  });
  const marker = mappins.RegisterMappin(data, position);
  point = { position, radius, marker };
  timer = setInterval(() => updateHint(isNearPoint() && !mp.cef.isInFocus()), 100);
  return true;
}

mp.game.onInputKeyEvent((action, key) => {
  if (action !== EInputAction.IACT_Press || key !== EInputKey.IK_F) return;
  if (!mp.cef.isInFocus() && isNearPoint()) console.log('[interaction-probe] Press received');
});
mp.events.on('resourceStop', stopInteractionProbe);
```

## 3. Testing Vanilla Devices

Identify the target device and its vanilla action first. A mirror, terminal or intercom can enter a scripted scene. Check UI and camera restoration, movement and stream-out in the target build. Compare the second client's view when that behavior matters. For a resource-owned interaction, decide explicitly which device behavior should trigger and what the server authorizes. [Devices](../doors-and-devices.md) · [Character customization](../player-mechanics.md)
