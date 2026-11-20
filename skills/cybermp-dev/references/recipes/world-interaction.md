# World Interaction Recipe: Native [F] Prompt & In-World Markers

This recipe demonstrates how to create native Night City interaction prompts in CyberMP client scripts using REDengine's native UI and HUD subsystems.

By combining `mp.game.SendInputHintData`, `MappinSystem.RegisterMappin`, and hardware key detection via `mp.game.onInputKeyEvent`, you can build immersive contextual interaction points (shops, garages, quest boards, doors, ATMs, apartment elevators) without needing heavy custom CEF web overlays.

---

## 1. Architecture Overview

A production-grade world interaction prompt in CyberMP consists of three coordinated elements:

1. **3D In-World Marker (`MappinSystem`)**: Displays an iconic marker in the 3D world indicating an interactable location or object.
2. **Native HUD Button Hint (`mp.game.SendInputHintData`)**: Displays the official Cyberpunk 2077 interaction widget (e.g. `[F] Interact` or `[F] Open Garage`) at the bottom of the screen when the player is within range.
3. **Hardware Input Handling (`mp.game.onInputKeyEvent`)**: Captures when the player presses the interaction key (`EInputKey.IK_F`, `EInputAction.IACT_Press`) while in proximity to trigger the client-to-server RPC.

```
       [Player enters range]
                 │
                 ├──► Register 3D Mappin (MappinSystem.RegisterMappin)
                 ├──► Show Native Prompt (mp.game.SendInputHintData)
                 │
       [Player presses 'F']
                 │
                 ├──► Catch via mp.game.onInputKeyEvent(action, key) (action === IACT_Press && key === IK_F)
                 └──► Emit RPC to server: mp.events.emitServer('interaction:execute', id)
```

---

## 2. Native HUD Button Hint (`SendInputHintData`)

REDengine exposes `mp.game.SendInputHintData` to display official button hints on the HUD. The action `'ChoiceApply'` corresponds to the player's primary interaction key (default `[F]` on PC, `(X)` / `(Square)` on controllers).

```typescript
import type { gameuiInputHintData } from '@cybermp/client-types/game';
import { inkInputHintHoldIndicationType } from '@cybermp/client-types/enums';

let isHintVisible = false;

/**
 * Shows or hides the native HUD interaction hint.
 *
 * @param show Whether to display or remove the button hint
 * @param label Text displayed next to the [F] prompt (e.g. "Enter Garage", "Talk")
 */
export function setInteractionHint(show: boolean, label: string = 'Interact'): void {
  if (show === isHintVisible) return;
  isHintVisible = show;

  const hintData = Object.assign(new mp.game.gameuiInputHintData(), {
    action: 'ChoiceApply',
    source: 'CyberMP',
    localizedLabel: label,
    queuePriority: 1,
    sortingPriority: 1,
    enableHoldAnimation: false,
    holdIndicationType: inkInputHintHoldIndicationType.Press,
  } satisfies Partial<gameuiInputHintData>);

  mp.game.SendInputHintData(show, hintData);
}
```

---

## 3. In-World 3D Marker (`MappinSystem`)

The `MappinSystem` is REDengine's subsystem for managing map icons, compass markers, and in-world 3D waypoints. By using `gamedataMappinVariant.UseVariant`, you display the standardized interaction icon floating directly over an object or position.

```typescript
import type {
  gamemappinsMappinData,
  gameNewMappinID,
  Vector4,
} from '@cybermp/client-types/game';
import { gamedataMappinVariant } from '@cybermp/client-types/enums';

const mappinSystem = mp.game.ScriptGameInstance.GetMappinSystem();

/**
 * Registers an in-world 3D interaction marker.
 *
 * @param x World X coordinate
 * @param y World Y coordinate
 * @param z World Z coordinate
 * @param label Debug or accessible caption
 * @returns Mappin ID handle used to unregister the marker
 */
export function createInteractionMarker(
  x: number,
  y: number,
  z: number,
  label: string = 'Interact',
): gameNewMappinID {
  const mappinData = Object.assign(new mp.game.gamemappinsMappinData(), {
    active: true,
    variant: gamedataMappinVariant.UseVariant,
    visibleThroughWalls: false,
    debugCaption: label,
    localizedCaption: label,
    mappinType: 'Default',
  } satisfies Partial<gamemappinsMappinData>);

  const position = Object.assign(new mp.game.Vector4(), {
    x,
    y,
    z,
    w: 1.0,
  } satisfies Vector4);

  return mappinSystem.RegisterMappin(mappinData, position);
}

/**
 * Removes an existing in-world marker.
 */
export function removeInteractionMarker(mappinId: gameNewMappinID): void {
  if (mappinSystem && mappinId) {
    mappinSystem.UnregisterMappin(mappinId);
  }
}
```

---

## 4. Hardware Key Handling (`onInputKeyEvent`)

To capture when the player presses `[F]`, subscribe to `mp.game.onInputKeyEvent`. Note that in CyberMP, the callback signature is `(action: EInputAction, key: EInputKey) => void`. Verify that the key corresponds to `EInputKey.IK_F` and the action is `EInputAction.IACT_Press`.

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

let activeInteractionCallback: (() => void) | null = null;

export function setActiveInteraction(callback: (() => void) | null, label?: string): void {
  activeInteractionCallback = callback;
  if (callback && label) {
    setInteractionHint(true, label);
  } else {
    setInteractionHint(false);
  }
}

// Hook hardware input keys: (action, key) callback order
mp.game.onInputKeyEvent((action: EInputAction, key: EInputKey) => {
  // Check if player pressed 'F' (Key Code 70 / IK_F, action IACT_Press)
  if (key === EInputKey.IK_F && action === EInputAction.IACT_Press) {
    if (activeInteractionCallback) {
      activeInteractionCallback();
    }
  }
});
```

---

## 5. Complete Interaction Point Manager

Here is a full production-ready implementation that monitors proximity to multiple interaction points, renders 3D markers, presents HUD hints, and executes actions.

```typescript
import type { gameNewMappinID } from '@cybermp/client-types/game';
import {
  EInputAction,
  EInputKey,
  gamedataMappinVariant,
  inkInputHintHoldIndicationType,
} from '@cybermp/client-types/enums';

export interface InteractionPoint {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  radius: number;
  onInteract: () => void;
  mappinId?: gameNewMappinID;
}

class InteractionManager {
  private points: Map<string, InteractionPoint> = new Map();
  private currentActivePoint: InteractionPoint | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.registerInputListener();
    this.startProximityLoop();
  }

  /**
   * Registers a new world interaction point.
   */
  public addPoint(point: Omit<InteractionPoint, 'mappinId'>): void {
    const mappinId = createInteractionMarker(
      point.position.x,
      point.position.y,
      point.position.z,
      point.label,
    );

    this.points.set(point.id, {
      ...point,
      mappinId,
    });
  }

  /**
   * Removes an interaction point and its marker.
   */
  public removePoint(id: string): void {
    const point = this.points.get(id);
    if (!point) return;

    if (point.mappinId) {
      removeInteractionMarker(point.mappinId);
    }

    if (this.currentActivePoint?.id === id) {
      this.currentActivePoint = null;
      setInteractionHint(false);
    }

    this.points.delete(id);
  }

  private registerInputListener(): void {
    mp.game.onInputKeyEvent((action: EInputAction, key: EInputKey) => {
      if (key === EInputKey.IK_F && action === EInputAction.IACT_Press) {
        if (this.currentActivePoint) {
          console.log(`[Interaction] Triggered: ${this.currentActivePoint.id}`);
          this.currentActivePoint.onInteract();
        }
      }
    });
  }

  private startProximityLoop(): void {
    // Check distance every 100ms
    this.checkInterval = setInterval(() => {
      const player = mp.game.GetPlayer();
      if (!player) return;

      const playerPos = player.GetWorldPosition();
      let nearestPoint: InteractionPoint | null = null;
      let minDistance = Infinity;

      for (const point of this.points.values()) {
        const dx = point.position.x - playerPos.x;
        const dy = point.position.y - playerPos.y;
        const dz = point.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist <= point.radius && dist < minDistance) {
          minDistance = dist;
          nearestPoint = point;
        }
      }

      if (nearestPoint !== this.currentActivePoint) {
        this.currentActivePoint = nearestPoint;
        if (this.currentActivePoint) {
          setInteractionHint(true, this.currentActivePoint.label);
        } else {
          setInteractionHint(false);
        }
      }
    }, 100);
  }

  public destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    for (const id of this.points.keys()) {
      this.removePoint(id);
    }
  }
}

export const interactionManager = new InteractionManager();
```

---

## 6. Singleplayer Device Caveats (Avoiding Cutscene Traps)

> [!WARNING]
> **Singleplayer Scriptable Device Cutscene Hazards**
>
> In singleplayer Cyberpunk 2077, interacting with certain static devices (such as `MirrorDevice`, quest terminals, or story intercoms) invokes deep story scripts and scene controllers.
>
> 1. **Camera Hijacking & Input Lock**: Interacting with native singleplayer mirrors (`MirrorDevice`) or story computers triggers full-body animations and locks the local player's camera and control scheme into a scripted cutscene mode (`MenuScenario_CharacterCustomizationMirror` or conversation dialogues).
> 2. **Multiplayer Desynchronization**: While in a singleplayer scene state, REDengine stops broadcasting player locomotion updates, leading other players to see the player frozen or desynced.
> 3. **The Solution**: Do not rely on native singleplayer interactive device triggers for multiplayer gameplay. Instead, construct custom interaction zones using `MappinSystem`, `SendInputHintData`, and `onInputKeyEvent` on `EInputKey.IK_F`. For custom mirror or character customization, trigger the scenario explicitly via `mp.game.observeAfter('MenuScenario_PauseMenu', ...)` as documented in [player-mechanics.md](../player-mechanics.md).
