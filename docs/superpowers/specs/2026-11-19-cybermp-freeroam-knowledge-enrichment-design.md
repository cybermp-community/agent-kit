# Design Specification: Enriching CyberMP Skills with Real-World Mechanics & Game Natives

**Date:** 2026-11-19  
**Source Repository:** `/Users/user/cybermp-freeroam`  
**Target Repository:** `/Users/user/cybermp-mcp`

---

## 1. Context & Objective

The existing `cybermp-mcp` repository contains core type declarations, AST indices, basic RPC flow patterns, and generic skeletons. However, developing real-world CyberMP gamemodes (such as freeroam, gangwars, or roleplay) requires deep knowledge of REDengine game natives (`use_game_natives = true`), internal subsystems (`ScriptGameInstance`), physical vehicle control, camera handling, inventory manipulation, and low-level CEF input bridging.

### Core Directive
Extract and codify all concrete implementations and native functions from the official `/Users/user/cybermp-freeroam` resource into the `cybermp-dev` skill suite in `cybermp-mcp`.

### Explicit Constraint
**Do NOT include application architectures or DI patterns.**  
All code examples and references MUST be procedural or functional TypeScript with direct calls to `mp` (e.g., `mp.game.*`, `mp.local.*`, `mp.network.*`, `mp.cef.*`, `mp.events.*`), eliminating Inversify decorators (`@eager`, `@injectable`, `@inject`), services, controllers, and module containers.

---

## 2. Architecture & File Structure

The new knowledge base will be structured as modular reference guides inside `skills/cybermp-dev/references/`, linked directly from `skills/cybermp-dev/SKILL.md` and indexed for AI agents:

```text
skills/cybermp-dev/
├── SKILL.md                                 # Updated with "Real-World Mechanics & Natives" section & quick recipes
└── references/
    ├── resource-structure.md                # Existing server.toml & resource.toml reference
    ├── events.md                            # Existing platform events reference
    ├── rpc-flows.md                         # Existing RPC flows reference
    ├── game-natives.md                      # [NEW] Core REDengine systems, lifecycle, HUD, Quests, Weather, Time, 3D->2D
    ├── vehicles-physics.md                  # [NEW] MountingFacility, full repair, Nitro impulse physics, speed curves
    ├── player-mechanics.md                  # [NEW] Spawn, health/stats, status effects, inventory, mirror, invisibility
    ├── cameras-input-cef.md                 # [NEW] FPP/TPP FOV, freecam, spectator, key input binding, CEF focus & bridge
    └── server-mechanics.md                  # [NEW] Dimensions, server objects, player metadata, 3D polygon/safezone collision
```

In addition:
- `rules/cybermp.md` and `rules/AGENTS.md` will be updated with negative constraints against hallucinated FiveM natives (e.g., prohibiting `SetEntityCoords` in favor of `GetTeleportationFacility().Teleport` or `mp.local.spawnPlayer`).
- `tests/skills.test.ts` will verify the existence and contents of all new reference guides.

---

## 3. Detailed Specification by Reference Guide

### 3.1. `references/game-natives.md` — Core REDengine Systems
1. **Engine Lifecycle & Hooking**:
   - `mp.game.onInit(cb)`: Resource and string token hash pre-computation.
   - `mp.game.onceGameLoaded(cb)` / `mp.game.onGameLoaded(cb)`: World loaded entrypoint.
   - `mp.game.observe(system, event, cb)` / `mp.game.observeAfter(system, event, cb)` / `mp.game.observeRaw(system, event, cb)`.
2. **Type Constructors (Object.assign pattern)**:
   - `createVector3(x, y, z)`, `createVector4(x, y, z, w?)`, `createEulerAngles(roll, pitch, yaw)`, `createQuaternion(i, j, k, r)`.
3. **QuestsSystem Facts**:
   - `mp.game.ScriptGameInstance.GetQuestsSystem().SetFactStr(name, value)`:
     - `'vvc_visual_customization_unlocked', 1` (CrystalCoat vehicle customization)
     - `'unlock_car_hud_dpad', 1`
     - `'disable_tutorials', 1`
     - `'apartment_on', 1`
4. **SettingsSystem HUD Configuration**:
   - Accessing group `/interface/hud`.
   - Iterating settings variables and setting values via `ConfigVarBool.SetValue(boolean)`:
     - `minimap`, `healthbar`, `ammo_counter`, `wanted_level`, `vehicle_hud`, `crosshairs`, `stamina_oxygen`, `quest_tracker`, `npc_names`.
   - Standalone `hideHud()` and `showHud()` functions.
5. **Weather & Time Systems**:
   - `mp.game.ScriptGameInstance.GetWeatherSystem().SetWeather(weatherState, blendTime, priority)` with `EWeatherState`.
   - `mp.game.ScriptGameInstance.GetTimeSystem().SetGameTimeByHMS(hours, minutes, seconds)`.
6. **LoadingScreenSystem**:
   - `GetLoadingScreenSystem().GetLoadingScreenState()`.
   - Observing `'LoadingScreenSystem'` `'OnLoadingScreenStateChange'`.
   - `waitForLoadingScreenToHide(settleTime, timeout)` helper.
7. **3D World to 2D Screen Projection**:
   - `mp.game.ScriptGameInstance.GetCameraSystem().ProjectPoint(Vector4)`.
   - `mp.game.getDisplayResolution()`.
   - Screen coordinate calculation for custom 2D UI markers/nametags.

---

### 3.2. `references/vehicles-physics.md` — Vehicles & Physics
1. **MountingFacility (Seat Entry & Exit)**:
   - Full mounting request assembly:
     - `gameMountEventData` (`isInstant`, `slotName = 'seat_front_left'`, `entryAnimName = 'forcedTransition'`).
     - `gamemountingMountingInfo` (`childId = player.GetEntityID()`, `parentId = vehicle.GetEntityID()`, `slotId`).
     - `gamemountingMountingRequest` $\rightarrow$ `mp.game.ScriptGameInstance.GetMountingFacility().Mount(request)`.
   - Unmounting: `gamemountingUnmountingRequest` $\rightarrow$ `MountingFacility().Unmount(request)`.
   - Handling streamed entities: checking `mp.network.getStreamedPool('CVehicle')` and listening to `mp.events.on('vehicleStreamIn', cb)`.
2. **Complete Vehicle Repair**:
   - Mesh & glass restoration: `vehicle.DestructionResetGrid()`, `vehicle.DestructionResetGlass()`.
   - Resetting body deformations via `entAnimationControllerComponent.SetInputFloat(vehicle, part, 0.0)` for all parts (`hood_destruction`, `wheel_f_l_destruction`, `wheel_f_r_destruction`, `bumper_b_destruction`, `bumper_f_destruction`, `door_f_l_destruction`, `door_f_r_destruction`, `trunk_destruction`).
   - Tire repair: `vehicle.ToggleBrokenTire(i, false)`.
   - Component repairs: `comp.RepairVehicle()`, `comp.UpdateDamageEngineEffects()`, `comp.VehicleVisualDestructionSetup()`.
   - Doors & windows: `vehicle.GetVehiclePS().CloseAllVehDoors(true)`, `CloseAllVehWindows()`, `ForcePersistentStateChanged()`.
3. **Nitro Physics & Linear Velocity**:
   - Converting quaternion orientation into forward direction vector:
     $$\vec{f} = \left(2(xy - wz),\; 1 - 2(x^2 + z^2),\; 2(yz + wx)\right)$$
   - Applying linear impulse: `vehicle.AddLinelyVelocity({ x: f.x * force, y: f.y * force, z: f.z * force }, { x: 0, y: 0, z: 0 })`.
   - Pre-condition checks: `vehicle.IsOnGround()`, `vehicle.IsPlayerDriver()`.
4. **Speed Curve Evaluation**:
   - Evaluating true speed using REDengine curve multiplier:
     `mp.game.ScriptGameInstance.GetStatsDataSystem().GetValueFromCurve('vehicle_ui', vehicle.GetCurrentSpeed(), 'speed_to_multiplier') * 1.61`.

---

### 3.3. `references/player-mechanics.md` — Player & Character
1. **Spawning & Teleportation**:
   - `mp.local.spawnPlayer(x, y, z, yaw)`.
   - `mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(player, position, eulerAngles)`.
2. **Health & God Mode**:
   - Current health modification: `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(playerGameId, gamedataStatPoolType.Health, value, new mp.game.gameObject(), false)`.
   - Maximum health modification: `StatsSystem.AddModifier` with `gameConstantStatModifierData_Deprecated` (`gameStatModifierType.Additive`).
   - Querying health: `StatPoolsSystem.GetStatPoolValue` & `StatsSystem.GetStatValue`.
3. **Status Effects & Restrictions**:
   - Applying: `mp.game.ScriptGameInstance.GetStatusEffectSystem().ApplyStatusEffect(player.GetEntityID(), effect, player.GetRecordID(), player.GetEntityID())`.
   - Removing: `mp.game.StatusEffectHelper.RemoveStatusEffect(player, effect, undefined)`.
   - Checking: `effectsSystem.HasStatusEffect(player.GetEntityID(), effect)`.
   - Standard restriction strings:
     - `BaseStatusEffect.Invulnerable`
     - `GameplayRestriction.NoMovement`
     - `GameplayRestriction.NoCombat`
     - `GameplayRestriction.NoWeapons`
     - `GameplayRestriction.NoPhotoMode`
     - `GameplayRestriction.NoScanning`
     - `GameplayRestriction.InfiniteAmmo`
4. **Inventory & Items**:
   - `mp.game.AddToInventory('Items.<ItemKey>', count)`.
   - Categorized item keys:
     - Weapons: `Preset_Silverhand_3516`, `Preset_Katana_Saburo`, `Preset_Lexington_Toygun`, `Legendary_Zhuo_Eight_Star`, `Preset_Dildo_Stout`, etc.
     - Cyberware Implants: `AdvancedMantisBladesLegendaryPlus`, `AdvancedSecondHeartLegendaryPlus`, `AdvancedBioConductorsLegendaryPlus`, `AdvancedBerserkC4MK5Plus`, etc.
     - Ammo: `Ammo.HandgunAmmo`, `Ammo.ShotgunAmmo`, `Ammo.RifleAmmo`, `Ammo.SniperRifleAmmo`, `Ammo.Special`.
     - Clothing & armor: `SQ031_Samurai_Jacket`, `Q005_Johnny_Glasses`, `Trauma_Team_Outfit`.
5. **Character Customization Mirror**:
   - Intercepting pause menu enter scenario via `mp.game.observeAfter('MenuScenario_PauseMenu', 'OnEnterScenario', (self) => self.SwitchToScenario('MenuScenario_CharacterCustomizationMirror'))`.
   - Spawning pause menu instance: `inGameMenu.SpawnMenuInstanceEvent('OnOpenPauseMenu')`.
   - Closing all menus: `player.QueueEvent(new mp.game.ForceCloseHubMenuEvent())`.
6. **Invisibility**:
   - Iterating `mp.game.GetPlayer().GetComponents()`, checking `component.IsEnabled()`, and toggling `component.Toggle(false)`.
7. **Gender & Attributes**:
   - `mp.game.ScriptGameInstance.GetCharacterCustomizationSystem().SetPlayerGender(gender, true)`.
   - Level up requests via `PlayerDevelopmentSystem.QueueRequest(buyPerkRequest)`.

---

### 3.4. `references/cameras-input-cef.md` — Camera, Input & CEF
1. **Camera FOV Control**:
   - FPP: `mp.game.GetPlayer().GetFPPCameraComponent().GetFOV()` and `SetFOV(value)`.
   - TPP: Searching components for `vehicleTPPCameraComponent`, reading/setting FOV, smoothing with `mp.game.LerpF(rate, current, target)`.
2. **Custom Free Camera Entity**:
   - Obtaining resource token hash: `mp.game.redResourceReferenceScriptToken.GetHash('base\\entities\\cameras\\simple_free_camera.ent')`.
   - Spawning entity via `mp.local.spawnObject(...)`.
   - Accessing `entity.FindComponentByName('camera') as gameCameraComponent` and calling `Activate(0, false)` / `Deactivate(0, false)`.
3. **Spectator Mode**:
   - Resolving target player game entity: `mp.network.getPlayerGameId(targetNetworkId)`.
   - Finding and activating component: `entity.FindComponentByName('spectateCamera') as gameCameraComponent`.
   - Dynamic local offset adjustment: on-foot `{ z: 2, x: 0, y: -2, w: 0 }` vs in-vehicle `{ z: 2, x: 0, y: -5, w: 0 }`.
   - Synchronizing spectator state via `mp.meta.setPlayerMeta(localPlayerId, 'spectating', true, true)`.
4. **Input Handling**:
   - `mp.game.onInputKeyEvent((action: EInputAction, key: EInputKey) => ...)`.
   - Handling press vs release actions (`EInputAction.IACT_Press`, `EInputAction.IACT_Release`).
   - Maintaining active pressed key set and dispatching key callbacks.
5. **CEF Browser Bridge & Focus**:
   - Focus and cursor control: `mp.cef.setFocus(focus, cursor)`, `mp.cef.isInFocus()`.
   - Live dev server switching: `if (import.meta.env.DEV) mp.cef.setUrl('http://localhost:5173')`.
   - Forwarding non-handled keyboard events to CEF browser when CEF is unfocused.
   - Client-CEF communication via `mp.events.onCef` and `mp.events.emitCef`.

---

### 3.5. `references/server-mechanics.md` — Server Systems & 3D Math
1. **Server Entity Management**:
   - `mp.objects.create({ model, position, dimension })` and `mp.objects.destroy(objId)`.
   - `mp.vehicles.create(...)`, `mp.vehicles.destroy(vehicleId)`.
2. **Dimension Management**:
   - Setting player dimension: `player.dimension = dim`.
   - Virtual dimension isolation between gamemodes or instances.
3. **Player Metadata & Moderation**:
   - Setting and retrieving metadata: `player.setMeta(key, value)`, `player.getMeta(key)`.
   - `player.kick(reason)`.
4. **3D Zone & Polygon Collision (Safezones / Greenzones)**:
   - Defining 3D volume with 2D vertices, elevation, and height.
   - Point-in-polygon 2D raycasting algorithm.
   - Checking dimensional and vertical boundaries ($Z_{min} \le Z \le Z_{max}$).
   - Detecting entity enter and leave events.

---

## 4. Verification & Testing

1. **Automated Unit Tests**:
   - Update `tests/skills.test.ts` to test all 5 new reference files.
   - Verify that all files exist, exceed 100 characters, and contain key native signatures (`ScriptGameInstance`, `MountingFacility`, `DestructionResetGrid`, `spawnPlayer`, `SetFactStr`, `onInputKeyEvent`).
2. **Build & Package Verification**:
   - Execute `pnpm test` (all tests passing).
   - Execute `pnpm run build` (zero TypeScript errors).
   - Verify that CLI `init` continues to function and copies the updated skills.

---

## 5. Rollout Steps
1. Write the 5 new reference files in `skills/cybermp-dev/references/`.
2. Update `skills/cybermp-dev/SKILL.md` to link and summarize them.
3. Update `rules/cybermp.md` and `rules/AGENTS.md` with native function guidelines.
4. Update `tests/skills.test.ts` to assert coverage of the new guides.
5. Run tests and TypeScript build.
6. Commit changes to git.
