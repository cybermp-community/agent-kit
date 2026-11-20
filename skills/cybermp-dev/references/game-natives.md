---
environment: client
---

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
// Called once when the world is ready. Check the particular system you need.
// The player puppet may still be absent.
mp.game.onceGameLoaded(() => {
  console.log('[Client] World loaded. ScriptGameInstance systems ready.');
});

// 3. mp.game.onGameLoaded: Multiple load triggers
// Fires every time a world load occurs (e.g. reload or transition).
mp.game.onGameLoaded(() => {
  console.log('[Client] World load triggered.');
});
// Use the spawn callback for work that needs the local player puppet.
mp.game.onLocalPlayerSpawned(() => {
  const player = mp.game.GetPlayer();
  if (player) console.log('[Client] Local player is available.');
});
```

### Script Observers & Method Interception

The regular observers queue callbacks on the script thread. The raw variants may execute synchronously on an engine thread. Use queued observers for work that needs normal script runtime access. [CyberMP observers](https://docs.cyber.mp/guides/client/observes/) · [Client lifecycle](https://docs.cyber.mp/guides/client/lifecycle/)

```typescript
// mp.game.observe: Queues a callback from the before-method observation point
mp.game.observe('LoadingScreenSystem', 'OnLoadingScreenStateChange', (self, newState) => {
  console.log(`Loading screen state changed to: ${newState}`);
});

// mp.game.observeAfter: Queues a callback after the target method finishes
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

`RegisterMappin(data, position)` is the coordinate-marker path. A `QuestArea` variant produced a point icon in the Gangwar experiment. For a filled area, choose the target surface first. See [INK HUD and minimap](ui-ink-and-minimap.md).

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

  destroyMappin(entityId);
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

mp.events.on('resourceStop', () => {
  for (const key of registeredMappins.keys()) destroyMappin(key);
  mappinSystem = null;
});
```

### Requesting GPS Tracking (`TrackMappin`)

The generated getter returns `gamemappinsMappinSystem`. The CyberMP extension is documented separately. Freeroam augments the generated interface locally before requesting tracking. Check that the target bridge exposes the method and verify the resulting GPS line in the game. [CyberMP extension](https://docs.cyber.mp/reference/client/api/natives/extended__gamemappinsystem/) · [Freeroam checkpoint code](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game-modes/modes/race/checkpoint.ts)

```typescript env=client checked=@cybermp/client-types@2.7.1
import type { gamemappinsMappinSystem, gameNewMappinID } from '@cybermp/client-types/game';

export function requestMappinTracking(id: gameNewMappinID): boolean {
  const system = mp.game.ScriptGameInstance.GetMappinSystem() as
    | (gamemappinsMappinSystem & { TrackMappin?: (id: gameNewMappinID) => void })
    | undefined;
  if (typeof system?.TrackMappin !== 'function') return false;

  system.TrackMappin(id);
  return true;
}
```

---

## 9. World FX & Particle System (`GetFxSystem`)

REDengine spawns particle systems, neon light beams, holographic waypoints, and explosions through `gameFxSystem` (`mp.game.ScriptGameInstance.GetFxSystem()`).

### Spawning World FX

Pass a `gameFxResource` whose effect reference is already configured and resolved for the target asset. The generated `effect` field is a resource reference. The fragment accepts that typed input so the resource can use a verified asset setup. Call after world load and retain the returned instance for cleanup. [Freeroam FX example](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game-modes/modes/race/map-builder.ts)

```typescript
import type { gameFxResource, Vector4 } from '@cybermp/client-types/game';

export function requestWorldEffect(resource: gameFxResource, position: Vector4) {
  const system = mp.game.ScriptGameInstance.GetFxSystem();
  if (!system) return;

  const transform = new mp.game.WorldTransform();
  mp.game.WorldTransform.SetPosition(transform, position);
  return system.SpawnEffect(resource, transform);
}
```

Use the instance's `Kill()` when the resource no longer needs the effect. Verify the effect's rendered appearance, lifetime and cleanup in the game.

---

## 10. Client Local Objects & Dynamic Mapping

Beyond server-synchronized objects (`mp.objects.create`), the CyberMP client runtime supports spawning purely local REDengine objects (`mp.local.spawnObject`). These are ideal for local racing checkpoints, custom track barriers, or client-rendered custom maps.

### Spawning Client-Side Objects

Use the returned handle for `mp.local.despawnObject`. Keep it for resource cleanup. If the resource needs the engine entity, look it up separately and handle a missing result while the object is loading. See [object spawning and cleanup](object-spawning-and-streaming.md) and the [archive prop recipe](recipes/archive-prop.md).

```typescript
/**
 * Spawns a local REDengine mesh object on the client.
 *
 * @param depotPath Entity template depot path (e.g. 'base\\gameplay\\devices\\street_signs\\race_checkpoint\\race_checkpoint.ent')
 * @param position [x, y, z] world coordinates
 * @param rotation [roll, pitch, yaw] Euler angles in degrees
 * @param streaming Whether the object participates in world streaming
 * @returns Numeric local object handle
 */
export function spawnLocalObject(
  depotPath: string,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  streaming = true,
): number {
  const skinHash = mp.game.redResourceReferenceScriptToken.GetHash(depotPath);
  const appHash = 0; // Verify the default appearance for this template.

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
 * Despawns a local object using the handle returned by spawnLocalObject.
 */
export function despawnLocalObject(handle: number): void {
  mp.local.despawnObject(handle);
}

/**
 * Finds an entEntity instance in REDengine by its numeric hash ID.
 */
export function findEntityByHash(entityHash: number) {
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

## 13. Targeting & Crosshair Raycasting (`GetTargetingSystem`)

REDengine provides instant crosshair targeting and entity inspection via `gametargetingTargetingSystem` (`mp.game.ScriptGameInstance.GetTargetingSystem()`).

### Raycasting Look-At Objects

```typescript
import type { gameObject } from '@cybermp/client-types/game';

/**
 * Returns the entity or device the player is directly looking at with their crosshair.
 */
export function getCrosshairTarget(): gameObject | null {
  const targetingSystem = mp.game.ScriptGameInstance.GetTargetingSystem();
  const player = mp.game.GetPlayerObject();
  if (!player) return null;

  return targetingSystem.GetLookAtObject(player);
}

/**
 * Interacts with or unlocks a door in front of the player.
 */
export function interactWithLookAtDoor(): boolean {
  const target = getCrosshairTarget();
  if (!target || !target.IsA('Door')) {
    return false;
  }

  // Cast to device to access its persistent state (PS)
  const door = target as any;
  const ps = door.GetDevicePS();

  // Unlock and unseal door
  if (ps.IsSealed()) {
    ps.ToggleSealOnDoor();
  }
  if (!ps.IsLocked()) {
    ps.ToggleLockOnDoor();
  }

  door.OpenDoor();
  return true;
}
```

---

## 14. Native Engine Multiplayer System (`GetMultiplayerSystem`)

The native `GetMultiplayerSystem()` exposes an engine subsystem, including `SetDefaultSpawnPosition`. CyberMP's resource spawn flow uses its own lifecycle and API. Use the [player spawning reference](player-mechanics.md#player-spawning-implementation) for a resource-controlled spawn and verify any direct engine configuration against your target build.

---

## 15. Client Streamed Entity Pools (`mp.network.getStreamedPool`)

In client-side scripts, `mp.network.getStreamedPool` returns engine IDs for the specified pool. Entity resolution can fail while streaming changes. Treat the result as a local snapshot.

```typescript
import type { vehicleBaseObject } from '@cybermp/client-types/game';

export type StreamedPoolType = 'CVehicle' | 'CPed' | 'CObject' | 'CPickup';

/**
 * Retrieves all currently streamed vehicle hashes and converts them to entity objects.
 */
export function getStreamedVehicles(): vehicleBaseObject[] {
  const vehicleHashes = mp.network.getStreamedPool('CVehicle');
  const vehicles: vehicleBaseObject[] = [];

  for (const hash of vehicleHashes) {
    const entityId = Object.assign(new mp.game.entEntityID(), { hash });
    const entity = mp.game.ScriptGameInstance.FindEntityByID(entityId);
    if (entity?.IsA('vehicleBaseObject')) {
      vehicles.push(entity as unknown as vehicleBaseObject);
    }
  }

  return vehicles;
}

/**
 * Retrieves all currently streamed network players.
 */
export function getStreamedPlayerGameIds(): number[] {
  return mp.network.getStreamedPlayers();
}
```

---

## 16. Blackboard System, Bone Slots & Targeting Visibility

### Native Blackboards (`GetBlackboardSystem` & `GetAllBlackboardDefs`)

CyberMP resources interact with REDengine's blackboard system to disable singleplayer mechanics that conflict with multiplayer state, such as calling vehicles from the garage or switching seats:

```typescript
/**
 * Configures engine blackboards for multiplayer session rules.
 */
export function configureEngineBlackboards(): void {
  const blackboardDefs = mp.game.GetAllBlackboardDefs();
  const blackboardSystem = mp.game.ScriptGameInstance.GetBlackboardSystem();

  // 1. Disable garage summoning (prevents spawning vehicles through phone/menu)
  blackboardSystem
    .Get(blackboardDefs.VehicleSummonData)
    .SetBool(blackboardDefs.VehicleSummonData.GarageState, false);

  // 2. Block switching seats inside vehicles
  blackboardSystem
    .Get(blackboardDefs.DebugData)
    .SetBool(blackboardDefs.DebugData.Vehicle_BlockSwitchSeats, true);
}
```

### Line-of-Sight Visibility Checks (`IsVisibleTarget`)

To check whether a target entity is unobstructed by geometry or walls from the local player's perspective:

```typescript
import type { gameObject } from '@cybermp/client-types/game';

/**
 * Checks if a target entity is directly visible to the local player.
 */
export function isEntityVisibleToPlayer(targetEntity: gameObject): boolean {
  const targetingSystem = mp.game.ScriptGameInstance.GetTargetingSystem();
  const localPlayer = mp.game.GetPlayerObject();

  return targetingSystem.IsVisibleTarget(localPlayer, targetEntity);
}
```

### Exact Bone & Head Transforms (`GetSlotTransform` & `WorldPosition.ToVector4`)

Use this client fragment with a verified component name and slot name for the entity's asset. The generated `GetSlotTransform` return value includes a success flag. An unavailable component or slot produces no position.

```typescript env=client checked=@cybermp/client-types@2.7.1
import type { entEntity, entSlotComponent, Vector4 } from '@cybermp/client-types/game';

export function readSlotPosition(
  entity: entEntity, componentName: string, slotName: string,
): Vector4 | undefined {
  const component = entity.FindComponentByName(componentName);
  if (!component?.IsA('entSlotComponent')) return;

  const [found, transform] = (component as entSlotComponent).GetSlotTransform(slotName);
  if (found) return mp.game.WorldPosition.ToVector4(transform.Position);
}
```

### In-Game Warning Alerts & Drop Point Control

```typescript
export function showEngineWarning(message: string): void {
  mp.game.GetPlayer()?.SetWarningMessage(message);
}
```

The generated declarations expose `ToggleDropPointSystemRequest` for the drop point subsystem. Verify its dispatch, effect and restoration on the target build before changing game-wide device behavior.

### Journal Manager & Quest Marker Inspection (`GetJournalManager`)

Inspect a tracked journal entry and its hash when investigating a vanilla marker. Changing the quest state to succeeded affects the journal itself. For resource-owned markers, register and remove your own mappins.

```typescript
export function readTrackedJournalEntryHash(): number | undefined {
  const journal = mp.game.ScriptGameInstance.GetJournalManager();
  const entry = journal?.GetTrackedEntry();
  if (entry) return journal.GetEntryHash(entry);
}
```

### In-Engine UI System & Menus (`GetUISystem` & `StartHubMenuEvent`)

To programmatically open native game menus (such as the character perks/skills development screen):

```typescript
import { gamedataStatType } from '@cybermp/client-types/enums';

/**
 * Opens the native perks/character development tree.
 */
export function openPerksMenu(stat: gamedataStatType = gamedataStatType.Reflexes): void {
  const uiSystem = mp.game.ScriptGameInstance.GetUISystem();
  const startHub = Object.assign(new mp.game.StartHubMenuEvent(), {});
  const userData = Object.assign(new mp.game.PerkUserData(), {
    statType: stat,
  });

  startHub.SetStartMenu('new_perks', 'ico_character', userData);
  uiSystem.QueueEvent(startHub);
}
```

### Right-Hand Weapon Inspection (`ScriptedPuppet.GetWeaponRight`)

Query and manipulate weapons currently held in the player's right hand:

```typescript
/**
 * Retrieves the weapon entity currently held in the player's right hand.
 */
export function getHeldRightHandWeapon() {
  const playerObj = mp.game.GetPlayerObject();
  if (!playerObj) return null;

  return mp.game.ScriptedPuppet.GetWeaponRight(playerObj);
}
```

### Client Hashing, Network & Vector Utilities (`toTweakdbid`, `getLocalPlayerId`, `Vector4.Distance`)

```typescript
import type { Vector2, Vector4 } from '@cybermp/client-types/game';

/**
 * Converts a TweakDB string to its integer hash on the client.
 */
export function getClientTweakDbHash(itemKey: string): bigint {
  return BigInt(mp.game.hashes.toTweakdbid(itemKey));
}

/**
 * Returns the local player's network ID on the client.
 */
export function getClientNetworkPlayerId(): number {
  return mp.network.getLocalPlayerId();
}

/**
 * Calculates 3D distance between two Vector4 coordinates.
 */
export function getEntityDistance(posA: Vector4, posB: Vector4): number {
  return mp.game.Vector4.Distance(posA, posB);
}

/**
 * Creates a native 2D vector for screen projections.
 */
export function createVector2(x: number, y: number): Vector2 {
  return Object.assign(new mp.game.Vector2(), { x, y });
}
```

---

## 17. Anti-Patterns & Negative Constraints

| Prohibited Pattern (Hallucinated / FiveM) | Approved CyberMP Pattern |
| :--- | :--- |
| `SetEntityCoords(ped, x, y, z)` | `GetTeleportationFacility().Teleport(playerObject, pos, angles)` for an existing local player. See [teleport preparation](player-mechanics.md#coordinate-teleportation-implementation). |
| `SetPedIntoVehicle(ped, veh, -1)` | `GetMountingFacility().Mount(mountingRequest)` |
| `SetEntityHealth(ped, 100)` | `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(...)` |
| `SetWeatherTypePersist("CLEAR")` | `GetWeatherSystem().SetWeather(state, blendTime, priority)` |
| `SetClockTime(12, 0, 0)` | `GetTimeSystem().SetGameTimeByHMS(hours, minutes, seconds)` |
| `new mp.game.Vector3(x, y, z)` | `Object.assign(new mp.game.Vector3(), { x, y, z })` |
| `AddBlipForCoord(x, y, z)` | Point marker via `GetMappinSystem().RegisterMappin(data, pos)`. |
| `AddBlipForArea(...)` | No direct equivalent verified. See [INK HUD and minimap](ui-ink-and-minimap.md) for the native HUD experiment and map options. |
| `CreateObject(model, x, y, z)` | `mp.local.spawnObject(...)` or server `mp.objects.create(...)` |
| `GetEntityForwardVector(ped)` | `ScriptGameInstance.GetCameraSystem().GetActiveCameraForward()` |

---

## 18. Client-Side Entity Spawning (`mp.local`)

In CyberMP, client scripts can instantiate client-only, un-synchronized entities via `mp.local` (`MpLocal`). These entities exist exclusively inside the local player's REDengine instance, generate zero network traffic, and are completely invisible to other connected players.

### When to Use Client Entities vs. Server Entities

| Feature | Client-Side Entities (`mp.local`) | Server-Side Entities (`mp.*` / Dedicated Server) |
|---|---|---|
| **Synchronization** | Local only (un-synchronized, invisible to others) | Synchronized across all streaming clients in dimension |
| **Network Overhead** | Zero bytes transmitted | Replicated through periodic sync packets |
| **Common Use Cases** | Dealership preview showrooms, cinematic cutscenes, local NPC vendors, tutorial guides, visual deco | Shared multiplayer vehicles, global world loot props, multiplayer sync peds |
| **Lifecycle** | Destroyed on game restart, resource reload, or explicit despawn | Managed authoritatively by server across player sessions |

### API Reference (`MpLocal`)

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `mp.local.spawnPed` | `skinHash`, `appHash`, `x`, `y`, `z`, `yaw`, `streaming` | `number` | Instantiates a local ped entity. Returns entity handle ID. |
| `mp.local.despawnPed` | `hash: number` | `void` | De-allocates and deletes an isolated local ped entity. |
| `mp.local.spawnVehicle` | `skinHash`, `appHash`, `x`, `y`, `z`, `roll`, `pitch`, `yaw`, `streaming` | `number` | Instantiates a local vehicle entity. Returns entity handle ID. |
| `mp.local.despawnVehicle` | `hash: number` | `void` | De-allocates and deletes an isolated local vehicle entity. |
| `mp.local.spawnObject` | `skinHash`, `appHash`, `x`, `y`, `z`, `roll`, `pitch`, `yaw`, `streaming` | `number` | Instantiates a local static prop or object. Returns entity handle ID. |
| `mp.local.despawnObject` | `hash: number` | `void` | De-allocates and deletes an isolated local object. |
| `mp.local.spawnPlayer` | `x`, `y`, `z`, `yaw` | `boolean` | Initializes local player spawn sequence. |

### Practical Implementation: Local Dealership Preview Showroom

This recipe spawns a local preview vehicle with rotation and a companion showroom NPC. When the player exits the showroom UI, both entities are cleanly despawned:

```typescript
export interface ShowroomConfig {
  vehicleModelHash: bigint | number;
  vehicleAppearanceHash: bigint | number;
  pedModelHash: bigint | number;
  pedAppearanceHash: bigint | number;
  previewCoords: { x: number; y: number; z: number };
}

export class ShowroomPreviewController {
  private localVehicleHandle: number | null = null;
  private localPedHandle: number | null = null;

  /**
   * Spawns client-only preview entities inside the dealership showroom.
   */
  public openShowroom(config: ShowroomConfig): void {
    // Clean up any previously active showroom entities
    this.closeShowroom();

    const { x, y, z } = config.previewCoords;

    // 1. Spawn local vehicle (roll=0, pitch=0, yaw=45, streaming=false to keep loaded)
    this.localVehicleHandle = mp.local.spawnVehicle(
      config.vehicleModelHash,
      config.vehicleAppearanceHash,
      x,
      y,
      z,
      0, // roll
      0, // pitch
      45.0, // yaw
      false, // streaming virtualization disabled for persistent preview
    );

    // 2. Spawn companion sales NPC next to vehicle
    this.localPedHandle = mp.local.spawnPed(
      config.pedModelHash,
      config.pedAppearanceHash,
      x + 2.5,
      y + 1.0,
      z,
      225.0, // Face toward the preview vehicle
      false, // streaming virtualization disabled
    );

    console.log(
      `[Showroom] Spawned local preview vehicle (${this.localVehicleHandle}) and vendor ped (${this.localPedHandle})`,
    );
  }

  /**
   * Cleans up all client-side showroom entities when exiting the UI.
   */
  public closeShowroom(): void {
    if (this.localVehicleHandle !== null) {
      mp.local.despawnVehicle(this.localVehicleHandle);
      console.log(`[Showroom] Despawned local vehicle handle ${this.localVehicleHandle}`);
      this.localVehicleHandle = null;
    }

    if (this.localPedHandle !== null) {
      mp.local.despawnPed(this.localPedHandle);
      console.log(`[Showroom] Despawned local ped handle ${this.localPedHandle}`);
      this.localPedHandle = null;
    }
  }
}
```

---

## Related Guides & Deep-Dives

For focused recipes and specialized native subsystems, see:
- [World Interaction Recipe](recipes/world-interaction.md): Native `[F]` prompt via `SendInputHintData`, `MappinSystem`, and `onInputKeyEvent`.
- [Doors & Scriptable Devices](doors-and-devices.md): Door manipulation and interior unlocks via `DoorControllerPS` (`ActionSetOpened`, `ActionToggleLock`).
- [Object Spawning & World Streaming](object-spawning-and-streaming.md): Client-local props (`mp.local.spawnObject`) vs server props (`mp.objects.create`), curated `.ent` catalog, and interior occlusion.
- [Animations & Workspots](animations-and-workspots.md): Contextual full-body animations via `gameWorkspotGameSystem` (`PlayInDeviceSimple`, `SendFastExitSignal`, `SendSlowExitSignal`).
- [Vehicles Tuning, Aesthetics & Combat 2.0](vehicles-tuning-combat.md): Apertures via `vehicleControllerPS` (hood, trunk, windows), ignition (`TurnEngineOn`), CrystalCoat shaders, and drive-by shooting.
- [Vehicles & Physics Reference](vehicles-physics.md): Mounting, physical deformation repair, and nitro impulse physics.
- [Player Mechanics & Inventory](player-mechanics.md): Teleportation, stat pools, status effects, and inventory spawning.
- [Cameras, Input & CEF Integration](cameras-input-cef.md): Free cameras, spectator systems, and CEF focus.
- [Server Mechanics & World Entities](server-mechanics.md): Virtual dimensions, 2D safezones, and server persistence.
