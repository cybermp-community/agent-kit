# REDengine Game Natives Reference

This reference covers the low-level REDengine native subsystems and patterns available in the CyberMP client environment when `use_game_natives = true` is enabled in `resource.toml`.

> **Important**: CyberMP client scripts run in Cyberpunk 2077's internal V8 runtime. All REDengine classes, systems, and singletons are accessed through `mp.game.*`. Direct constructor arguments are not supported by REDengine native class bindings; always use `Object.assign(new mp.game.<Type>(), { ... })`.

---

## 1. Engine Lifecycle & Script Hooking

REDengine initializes scripts in stages. Registering callbacks at the proper lifecycle point is critical to avoid null pointers or crash conditions when accessing game systems.

### Lifecycle Hooks

```typescript
// 1. mp.game.onInit: Early initialization
// Use for string hash precomputations, resource loading, and hooking script methods.
// ScriptGameInstance systems are NOT fully loaded here.
mp.game.onInit(() => {
  console.log('[Client] Game engine initialized. Registering method observers...');
});

// 2. mp.game.onceGameLoaded: World ready entrypoint
// Called once when the game world and local player entity are fully loaded.
// All ScriptGameInstance systems (QuestsSystem, WeatherSystem, etc.) are available.
mp.game.onceGameLoaded(() => {
  console.log('[Client] World loaded. ScriptGameInstance systems ready.');
});

// 3. mp.game.onGameLoaded: Multiple load triggers
// Fires every time a world load occurs (e.g. reload or transition).
mp.game.onGameLoaded(() => {
  console.log('[Client] World load triggered.');
});
```

### Script Observers & Method Interception

CyberMP provides three ways to intercept or observe REDscript methods:

```typescript
// mp.game.observe: Intercepts before or during REDscript method execution
mp.game.observe('LoadingScreenSystem', 'OnLoadingScreenStateChange', (self, newState) => {
  console.log(`Loading screen state changed to: ${newState}`);
});

// mp.game.observeAfter: Triggers immediately AFTER the target method finishes
mp.game.observeAfter('MenuScenario_PauseMenu', 'OnEnterScenario', (self) => {
  // Useful for redirecting pause menus (e.g. into character customization mirror)
  self.SwitchToScenario('MenuScenario_CharacterCustomizationMirror');
});

// mp.game.observeRaw: Hook with raw arguments (useful for internal engine structures)
mp.game.observeRaw('gameuiInGameMenuGameController', 'RegisterGlobalBlackboards', (self) => {
  console.log('InGameMenu controller blackboards registered');
});
```

---

## 2. REDengine Native Type Constructors

Native REDengine classes cannot accept parameters in their constructors. Always instantiate with `new mp.game.<Type>()` and populate properties via `Object.assign`:

```typescript
import type {
  EulerAngles,
  Quaternion,
  Vector3,
  Vector4,
} from '@cybermp/client-types/game';

/**
 * Creates a REDengine Vector3 (x, y, z)
 */
export function createVector3(x: number, y: number, z: number): Vector3 {
  return Object.assign(new mp.game.Vector3(), {
    x,
    y,
    z,
  } satisfies Vector3);
}

/**
 * Creates a REDengine Vector4 (x, y, z, w)
 */
export function createVector4(x: number, y: number, z: number, w: number = 1.0): Vector4 {
  return Object.assign(new mp.game.Vector4(), {
    x,
    y,
    z,
    w,
  } satisfies Vector4);
}

/**
 * Creates a REDengine EulerAngles (roll, pitch, yaw) in degrees
 */
export function createEulerAngles(roll: number, pitch: number, yaw: number): EulerAngles {
  return Object.assign(new mp.game.EulerAngles(), {
    roll,
    pitch,
    yaw,
  } satisfies EulerAngles);
}

/**
 * Creates a REDengine Quaternion (i, j, k, r)
 */
export function createQuaternion(i: number, j: number, k: number, r: number): Quaternion {
  return Object.assign(new mp.game.Quaternion(), {
    i,
    j,
    k,
    r,
  } satisfies Quaternion);
}
```

---

## 3. Engine Quests Facts

Cyberpunk 2077 controls many singleplayer gameplay features via quest facts stored in `QuestsSystem`. In multiplayer, setting these facts unlocks mechanics like CrystalCoat (vehicle visual customization), vehicle HUD controls, and suppresses singleplayer tutorial popups.

```typescript
/**
 * Applies standard multiplayer quest facts to unlock vehicle features and disable singleplayer locks.
 * Must be executed after onceGameLoaded.
 */
export function applyEngineQuestFacts(): void {
  const questsSystem = mp.game.ScriptGameInstance.GetQuestsSystem();

  // 1. CrystalCoat vehicle color/skin customization
  questsSystem.SetFactStr('vvc_visual_customization_unlocked', 1);

  // 2. Enable car radio / weapon cycle D-pad controls on vehicle HUD
  questsSystem.SetFactStr('unlock_car_hud_dpad', 1);

  // 3. Suppress singleplayer tutorial popups
  questsSystem.SetFactStr('disable_tutorials', 1);

  // 4. Unlock apartment access
  questsSystem.SetFactStr('apartment_on', 1);
}
```

---

## 4. Game HUD Control via SettingsSystem

HUD elements in Cyberpunk 2077 are managed through user settings under `/interface/hud`. Modifying these variables toggles the in-game HUD cleanly without breaking native rendering.

```typescript
import { InGameConfigVarType } from '@cybermp/client-types/enums';
import type { ConfigVarBool } from '@cybermp/client-types/game';

const DEFAULT_HUD_CONFIG: Record<string, boolean> = {
  minimap: true,
  healthbar: true,
  ammo_counter: true,
  wanted_level: true,
  vehicle_hud: true,
  crosshairs: true,
  stamina_oxygen: true,
  quest_tracker: false,
  npc_names: true,
  npc_healthbar: false,
  hud_markers: true,
  action_buttons: false,
  activity_log: true,
  object_markers: true,
  npc_nameplates: true,
  crouch_indicator: false,
  input_hints: false,
};

/**
 * Hides all native HUD elements (useful for CEF UI focus, menus, or cutscenes).
 */
export function hideHud(): void {
  const settings = mp.game.ScriptGameInstance.GetSettingsSystem();
  const group = settings.GetGroup('/interface/hud');
  const vars = group.GetVars(false);

  for (const settingVar of vars) {
    if (+String(settingVar.GetType()) === InGameConfigVarType.Bool) {
      const boolVar = settingVar as ConfigVarBool;
      boolVar.SetValue(false);
    }
  }
}

/**
 * Restores native HUD elements using default or customized preferences.
 */
export function showHud(overrides?: Partial<Record<string, boolean>>): void {
  const settings = mp.game.ScriptGameInstance.GetSettingsSystem();
  const group = settings.GetGroup('/interface/hud');
  const config = { ...DEFAULT_HUD_CONFIG, ...overrides };

  for (const settingVar of group.GetVars(false)) {
    if (+String(settingVar.GetType()) === InGameConfigVarType.Bool) {
      const boolVar = settingVar as ConfigVarBool;
      const varName = boolVar.GetName();
      const shouldEnable = config[varName] ?? false;
      boolVar.SetValue(shouldEnable);
    }
  }
}
```

---

## 5. Weather & Game Time Control

CyberMP servers coordinate world time and weather. The client applies these values via `GetWeatherSystem()` and `GetTimeSystem()`.

```typescript
import type { EWeatherState } from '@cybermp/client-types/enums';

/**
 * Sets the game weather state with smooth transition blending.
 * @param state EWeatherState enum (e.g. 'Sunny', 'Rain', 'Fog', 'Pollution', 'ToxicRain')
 * @param blendTime Transition duration in seconds (default 10.0)
 * @param priority Override priority level (default 5)
 */
export function setWeather(
  state: EWeatherState,
  blendTime: number = 10.0,
  priority: number = 5
): void {
  const weatherSystem = mp.game.ScriptGameInstance.GetWeatherSystem();
  weatherSystem.SetWeather(state, blendTime, priority);
}

/**
 * Sets in-game clock time.
 * @param hours 0 - 23
 * @param minutes 0 - 59
 * @param seconds 0 - 59
 */
export function setGameTime(hours: number, minutes: number, seconds: number = 0): void {
  const timeSystem = mp.game.ScriptGameInstance.GetTimeSystem();
  timeSystem.SetGameTimeByHMS(hours, minutes, seconds);
}
```

---

## 6. Loading Screen Handling

When the game loads or transitions, the `LoadingScreenSystem` displays Cyberpunk 2077's native loading animation. Intercepting loading screen states ensures player spawning and camera initialization don't occur prematurely.

```typescript
import * as CyberEnums from '@cybermp/client-types/enums';

/**
 * Returns a Promise that resolves when the native loading screen has completely finished and hidden.
 * @param settleTime Milliseconds of stability required after the screen reports hidden.
 * @param timeout Maximum milliseconds before resolving automatically.
 */
export function waitForLoadingScreenToHide(
  settleTime: number = 200,
  timeout: number = 1000
): Promise<void> {
  return new Promise((resolve) => {
    const loadingScreenSystem = mp.game.ScriptGameInstance.GetLoadingScreenSystem();

    // Check if already hidden
    if (loadingScreenSystem.GetLoadingScreenState() === CyberEnums.ELoadingScreenState.Hidden) {
      setTimeout(resolve, settleTime);
      return;
    }

    let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      resolve();
    }, timeout);

    const onStateChange = (_self: any, newState: any) => {
      const state = +String(newState) as CyberEnums.ELoadingScreenState;
      if (state === CyberEnums.ELoadingScreenState.Hidden) {
        if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
        if (settleTimeoutId) clearTimeout(settleTimeoutId);

        settleTimeoutId = setTimeout(() => {
          resolve();
        }, settleTime);
      }
    };

    mp.game.observe('LoadingScreenSystem', 'OnLoadingScreenStateChange', onStateChange);
  });
}
```

---

## 7. 3D World to 2D Screen Projection

To draw custom nametags, health bars, radar blips, or CEF overlays at 3D world positions, use `CameraSystem.ProjectPoint()` combined with the client's display resolution.

### Coordinate Transformation Formula

1. Pass a 3D coordinate as `Vector4` with `w = 1.0` into `CameraSystem.ProjectPoint()`.
2. `ProjectPoint` outputs normalized screen coordinates where:
   - $x \in [-1, 1]$ (left to right)
   - $y \in [-1, 1]$ (bottom to top)
   - $z < 0$ or $w < 0$ indicates the point is **behind** the camera.
3. Multiply by half the display resolution and invert the Y-axis to map to screen pixel space:

$$\text{screenX} = \frac{\text{resX}}{2} + \left(\frac{\text{resX}}{2} \cdot \text{target.x}\right)$$
$$\text{screenY} = \frac{\text{resY}}{2} - \left(\frac{\text{resY}}{2} \cdot \text{target.y}\right)$$

### Complete Implementation

```typescript
import type { Vector3, Vector4 } from '@cybermp/client-types/game';

export interface ScreenCoord {
  x: number;
  y: number;
  onScreen: boolean;
}

/**
 * Projects a 3D world position into 2D display screen pixels.
 * @param worldPos 3D world coordinate { x, y, z }
 * @returns 2D pixel coordinates and an onScreen flag indicating if the point is within viewport.
 */
export function world3dToScreen2d(worldPos: Vector3): ScreenCoord {
  const cameraSystem = mp.game.ScriptGameInstance.GetCameraSystem();
  const inputPoint = Object.assign(new mp.game.Vector4(), {
    x: worldPos.x,
    y: worldPos.y,
    z: worldPos.z,
    w: 1.0,
  } satisfies Vector4);

  const projected = cameraSystem.ProjectPoint(inputPoint);
  const [resX, resY] = mp.game.getDisplayResolution();

  const halfX = resX / 2.0;
  const halfY = resY / 2.0;

  const screenX = halfX + halfX * projected.x;
  const screenY = halfY - halfY * projected.y;

  // On screen if target is in front of the camera and within resolution boundaries
  const onScreen =
    projected.w > 0 &&
    screenX >= 0 &&
    screenX <= resX &&
    screenY >= 0 &&
    screenY <= resY;

  return {
    x: screenX,
    y: screenY,
    onScreen,
  };
}
```

---

## 8. Mappins & GPS Tracking System (`GetMappinSystem`)

In REDengine, world markers, quest objectives, player radar blips, and minimap icons are controlled by `gamemappinsMappinSystem` (`mp.game.ScriptGameInstance.GetMappinSystem()`).

### Mappin Architecture

- **`gameNewMappinID`**: Unique identifier returned when registering a mappin.
- **`gamemappinsMappinData`**: Defines mappin type, variant, visibility through walls, and script data.
- **`GameplayRoleMappinData`**: Configures gameplay role, radar range, minimap display, and icon texture ID.

```typescript
import { EGameplayRole, gamedataMappinVariant } from '@cybermp/client-types/enums';
import type {
  gamemappinsMappinSystem,
  gameNewMappinID,
  Vector4,
} from '@cybermp/client-types/game';

let mappinSystem: gamemappinsMappinSystem | null = null;
const registeredMappins = new Map<number, gameNewMappinID>();

mp.game.onceGameLoaded(() => {
  mappinSystem = mp.game.ScriptGameInstance.GetMappinSystem();
});

/**
 * Creates an in-world and minimap quest/objective marker.
 *
 * @param entityId Numeric ID associated with the marker (e.g. player ID or checkpoint index)
 * @param position 3D coordinate Vector4 { x, y, z, w }
 * @param textureID REDengine icon texture ID (e.g. 'MappinIcons.NPCMappin')
 * @returns The created gameNewMappinID
 */
export function createEntityMappin(
  entityId: number,
  position: Vector4,
  textureID = 'MappinIcons.NPCMappin',
): gameNewMappinID | null {
  if (!mappinSystem) return null;

  const roleMappinData = Object.assign(new mp.game.GameplayRoleMappinData(), {
    isQuest: true,
    visibleThroughWalls: false,
    range: 100.0,
    gameplayRole: EGameplayRole.NPC,
    textureID,
    showOnMiniMap: true,
  });

  const mappinData = Object.assign(new mp.game.gamemappinsMappinData(), {
    mappinType: 'Mappins.DelamainTaxiDestinationMappinDefinition',
    variant: gamedataMappinVariant.DefaultQuestVariant,
    visibleThroughWalls: false,
    scriptData: roleMappinData,
    active: true,
  });

  const mappinId = mappinSystem.RegisterMappin(mappinData, position);
  registeredMappins.set(entityId, mappinId);
  return mappinId;
}

/**
 * Updates the 3D position of an existing registered mappin.
 */
export function updateMappinPosition(entityId: number, position: Vector4): void {
  if (!mappinSystem) return;
  const mappinId = registeredMappins.get(entityId);
  if (mappinId) {
    mappinSystem.SetMappinPosition(mappinId, position);
  }
}

/**
 * Activates active GPS pathing / track line to a mappin.
 */
export function trackMappin(mappinId: gameNewMappinID): void {
  mappinSystem?.TrackMappin(mappinId);
}

/**
 * Disables active GPS pathing / track line.
 */
export function untrackMappin(): void {
  mappinSystem?.UntrackMappin();
}

/**
 * Unregisters and removes a mappin from radar and world.
 */
export function destroyMappin(entityId: number): void {
  if (!mappinSystem) return;
  const mappinId = registeredMappins.get(entityId);
  if (mappinId) {
    mappinSystem.UnregisterMappin(mappinId);
    registeredMappins.delete(entityId);
  }
}
```

---

## 9. World FX & Particle System (`GetFxSystem`)

REDengine spawns particle systems, neon light beams, holographic waypoints, and explosions through `gameFxSystem` (`mp.game.ScriptGameInstance.GetFxSystem()`).

### Spawning World FX

FX instances require a `WorldTransform` and a `gameFxResource` specifying the `.effect` depot path:

```typescript
import type {
  gameFxInstance,
  gameFxResource,
  WorldTransform,
} from '@cybermp/client-types/game';
import { createEulerAngles, createVector4 } from './vectors';

/**
 * Spawns an in-world visual effect (particle, laser beam, glowing waypoint).
 *
 * @param effectPath Depot path to the .effect asset
 * @param pos [x, y, z] position
 * @param rot [roll, pitch, yaw] orientation in degrees
 * @returns The spawned gameFxInstance
 */
export function spawnWorldEffect(
  effectPath: string,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
): gameFxInstance {
  const [x, y, z] = pos;
  const [roll, pitch, yaw] = rot;

  const transform = Object.assign(new mp.game.WorldTransform(), {});
  mp.game.WorldTransform.SetPosition(transform, createVector4(x, y, z, 1.0));
  mp.game.WorldTransform.SetOrientationEuler(transform, createEulerAngles(roll, pitch, yaw));

  const fxResource = Object.assign(new mp.game.gameFxResource(), {
    effect: effectPath as any,
  } satisfies gameFxResource);

  const fxSystem = mp.game.ScriptGameInstance.GetFxSystem();
  return fxSystem.SpawnEffect(fxResource, transform);
}

/**
 * Kills/despawns an active world effect instance.
 */
export function destroyWorldEffect(instance: gameFxInstance): void {
  instance.Kill();
}
```

---

## 10. Client Local Objects & Dynamic Mapping

Beyond server-synchronized objects (`mp.objects.create`), the CyberMP client runtime supports spawning purely local REDengine objects (`mp.local.spawnObject`). These are ideal for local racing checkpoints, custom track barriers, or client-rendered custom maps.

### Spawning Client-Side Objects

```typescript
/**
 * Spawns a local REDengine mesh object on the client.
 *
 * @param depotPath Entity template depot path (e.g. 'base\\gameplay\\devices\\street_signs\\race_checkpoint\\race_checkpoint.ent')
 * @param position [x, y, z] world coordinates
 * @param rotation [roll, pitch, yaw] Euler angles in degrees
 * @param streaming Whether the object participates in world streaming
 * @returns Numeric entity ID (hash) of the spawned local object
 */
export function spawnLocalObject(
  depotPath: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  streaming = true,
): number {
  const skinHash = mp.game.redResourceReferenceScriptToken.GetHash(depotPath);
  const appHash = 0; // 0 for default mesh appearance

  const [x, y, z] = position;
  const [roll, pitch, yaw] = rotation;

  return mp.local.spawnObject(
    skinHash,
    appHash,
    x,
    y,
    z,
    roll,
    pitch,
    yaw,
    streaming,
  );
}

/**
 * Despawns and frees a local object by its hash ID.
 */
export function despawnLocalObject(objectHash: number): void {
  mp.local.despawnObject(objectHash);
}

/**
 * Finds an entEntity instance in REDengine by its numeric hash ID.
 */
export function findEntityByHash(entityHash: number): mp.game.entEntity | null {
  const entityId = Object.assign(new mp.game.entEntityID(), {
    hash: entityHash,
  });
  return mp.game.ScriptGameInstance.FindEntityByID(entityId);
}
```

---

## 11. HUD Groups & Settings Enumeration

The complete set of 17 HUD visibility flags in `/interface/hud`:

```typescript
import { InGameConfigVarType } from '@cybermp/client-types/enums';
import type { ConfigVarBool } from '@cybermp/client-types/game';

export const ALL_HUD_ELEMENTS = [
  'npc_healthbar',     // Boss & Enemy Health Bars
  'ammo_counter',      // Weapon Ammo Counter
  'hud_markers',       // On-screen Hints
  'action_buttons',    // Contextual Action Buttons
  'activity_log',      // Quest / Activity Log
  'crosshairs',        // Weapon Crosshair
  'quest_tracker',     // Target Marker
  'object_markers',    // Job Tracker
  'npc_names',         // NPC Names
  'wanted_level',      // NCPD Wanted Stars
  'npc_nameplates',    // Floating Nameplates
  'crouch_indicator',  // Stealth Crouch Indicator
  'minimap',           // Top-right Radar / Minimap
  'healthbar',         // Player Health & Armor Bar
  'stamina_oxygen',    // Stamina and Oxygen Gauges
  'input_hints',       // Keyboard / Controller Prompts
  'vehicle_hud',       // Speedometer & Radio Widget
] as const;

/**
 * Toggles all native HUD elements on or off.
 */
export function setAllHudVisible(visible: boolean): void {
  const settings = mp.game.ScriptGameInstance.GetSettingsSystem();
  const group = settings.GetGroup('/interface/hud');
  const vars = group.GetVars(false);

  for (const settingVar of vars) {
    if (+String(settingVar.GetType()) === InGameConfigVarType.Bool) {
      (settingVar as ConfigVarBool).SetValue(visible);
    }
  }
}
```

---

## 12. Advanced REDengine Event Hooks (`observeBeforeRaw`)

To intercept native engine input before the game processes it (e.g. for custom noclip camera mouse steering):

```typescript
import type { gameinputScriptListenerAction, ConfigVarInt } from '@cybermp/client-types/game';

let yawDeltaAccumulator = 0;

/**
 * Hooks PlayerPuppet OnAction to read mouse movement during noclip.
 */
export function hookPlayerPuppetActions(): void {
  mp.game.observeBeforeRaw(
    'PlayerPuppet',
    'OnAction',
    (_self, action: gameinputScriptListenerAction) => {
      const actionName = mp.game.NameToString(
        mp.game.gameinputScriptListenerAction.GetName(action),
      );

      if (actionName === 'CameraMouseX') {
        const x = Number(mp.game.gameinputScriptListenerAction.GetValue(action));
        const sensVar = mp.game.ScriptGameInstance.GetSettingsSystem().GetVar(
          '/controls/fppcameramouse',
          'FPP_MouseX',
        ) as ConfigVarInt;

        const sensitivity = Number(sensVar.GetValue()) / 2.9;
        yawDeltaAccumulator += -(x / 35) * sensitivity;
      }
    },
  );
}
```

---

## 13. Anti-Patterns & Negative Constraints

| Prohibited Pattern (Hallucinated / FiveM) | Approved CyberMP Pattern |
| :--- | :--- |
| `SetEntityCoords(ped, x, y, z)` | `GetTeleportationFacility().Teleport(player, pos, angles)` or `mp.local.spawnPlayer` |
| `SetPedIntoVehicle(ped, veh, -1)` | `GetMountingFacility().Mount(mountingRequest)` |
| `SetEntityHealth(ped, 100)` | `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(...)` |
| `SetWeatherTypePersist("CLEAR")` | `GetWeatherSystem().SetWeather(state, blendTime, priority)` |
| `SetClockTime(12, 0, 0)` | `GetTimeSystem().SetGameTimeByHMS(hours, minutes, seconds)` |
| `new mp.game.Vector3(x, y, z)` | `Object.assign(new mp.game.Vector3(), { x, y, z })` |
| `AddBlipForCoord(x, y, z)` | `GetMappinSystem().RegisterMappin(data, pos)` |
| `CreateObject(model, x, y, z)` | `mp.local.spawnObject(...)` or server `mp.objects.create(...)` |
