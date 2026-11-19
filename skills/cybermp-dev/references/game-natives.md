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

## 8. Anti-Patterns & Negative Constraints

| Prohibited Pattern (Hallucinated / FiveM) | Approved CyberMP Pattern |
| :--- | :--- |
| `SetEntityCoords(ped, x, y, z)` | `GetTeleportationFacility().Teleport(player, pos, angles)` or `mp.local.spawnPlayer` |
| `SetPedIntoVehicle(ped, veh, -1)` | `GetMountingFacility().Mount(mountingRequest)` |
| `SetEntityHealth(ped, 100)` | `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(...)` |
| `SetWeatherTypePersist("CLEAR")` | `GetWeatherSystem().SetWeather(state, blendTime, priority)` |
| `SetClockTime(12, 0, 0)` | `GetTimeSystem().SetGameTimeByHMS(hours, minutes, seconds)` |
| `new mp.game.Vector3(x, y, z)` | `Object.assign(new mp.game.Vector3(), { x, y, z })` |
