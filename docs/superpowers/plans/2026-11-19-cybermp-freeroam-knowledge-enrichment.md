# CyberMP Freeroam Knowledge Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify all concrete REDengine game natives and CyberMP client/server/browser mechanics extracted from `cybermp-freeroam` into modular reference guides, skill recipes, and rules in `cybermp-mcp`.

**Architecture:** Five modular reference Markdown files in `skills/cybermp-dev/references/` written in pure TypeScript without DI or class-based service architecture, integrated into `skills/cybermp-dev/SKILL.md`, rules (`rules/cybermp.md`, `rules/AGENTS.md`), and asserted by automated Vitest tests.

**Tech Stack:** TypeScript, Markdown, Vitest, CyberMP Types (`@cybermp/client-types`, `@cybermp/server-types`, `@cybermp/browser-types`).

**Spec:** `docs/superpowers/specs/2026-11-19-cybermp-freeroam-knowledge-enrichment-design.md`

## Global Constraints

- All reference code MUST be procedural or functional TypeScript with direct calls to `mp` (`mp.game.*`, `mp.local.*`, `mp.network.*`, `mp.cef.*`, `mp.events.*`).
- NO DI containers or decorators (e.g. `@eager`, `@injectable`, `@inject`, Inversify, NestJS-style services or controllers).
- All constructors for REDengine types must follow `Object.assign(new mp.game.<Type>(), { ... })`.
- All 84 existing tests must continue to pass; new tests in `tests/skills.test.ts` must assert that each new reference exists and contains required signatures.
- Zero TypeScript build errors (`pnpm run build`).

## Review Focus

1. `MountingFacility` seat names: ensuring `seat_front_left` and proper request structure `gamemountingMountingRequest` rather than hallucinated FiveM `SetPedIntoVehicle`.
2. Vehicle repair: verifying inclusion of both physical repair (`DestructionResetGrid`, `DestructionResetGlass`) and deformation resets via `entAnimationControllerComponent.SetInputFloat`.
3. Health and Godmode: using `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode` and `StatsSystem.AddModifier` rather than FiveM `SetEntityHealth`.
4. Camera projection: testing that 3D-to-2D projection uses `CameraSystem.ProjectPoint` and `getDisplayResolution` with proper half-resolution math.
5. Invisibility & Restrictions: ensuring that disabling components (`player.GetComponents()`) and `GetStatusEffectSystem().ApplyStatusEffect` with `GameplayRestriction.*` are accurately documented.

---

### Task 1: Core REDengine Systems Reference (`references/game-natives.md`)

**Files:**
- Create: `skills/cybermp-dev/references/game-natives.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `skills/cybermp-dev/references/game-natives.md` covering `onInit`, `onceGameLoaded`, `observe`, `QuestsSystem` facts (`vvc_visual_customization_unlocked`, `unlock_car_hud_dpad`), `SettingsSystem` HUD variables (`hideHud`, `showHud`), `WeatherSystem.SetWeather`, `TimeSystem.SetGameTimeByHMS`, `LoadingScreenSystem`, and `world3dToScreen2d`.

- [ ] **Step 1: Write the failing test for game-natives.md**

In `tests/skills.test.ts`, add a test verifying `game-natives.md`:
```typescript
it('provides comprehensive game-natives reference', () => {
  const gameNativesPath = path.join(rootDir, 'skills/cybermp-dev/references/game-natives.md');
  expect(fs.existsSync(gameNativesPath)).toBe(true);
  const content = fs.readFileSync(gameNativesPath, 'utf-8');
  expect(content.length).toBeGreaterThan(500);
  expect(content).toContain('ScriptGameInstance');
  expect(content).toContain('onceGameLoaded');
  expect(content).toContain('QuestsSystem');
  expect(content).toContain('vvc_visual_customization_unlocked');
  expect(content).toContain('GetWeatherSystem');
  expect(content).toContain('GetTimeSystem');
  expect(content).toContain('GetLoadingScreenSystem');
  expect(content).toContain('world3dToScreen2d');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: FAIL with `expect(fs.existsSync(gameNativesPath)).toBe(true)` returning false.

- [ ] **Step 3: Create `skills/cybermp-dev/references/game-natives.md`**

Write `skills/cybermp-dev/references/game-natives.md` containing:
- Section 1: Engine Lifecycle & Hooks (`mp.game.onInit`, `mp.game.onceGameLoaded`, `mp.game.observe`, `mp.game.observeAfter`, `mp.game.observeRaw`).
- Section 2: Helper Vector & Angle Constructors (`createVector3`, `createVector4`, `createEulerAngles`, `createQuaternion`).
- Section 3: Engine Quests Facts (`GetQuestsSystem().SetFactStr` with `vvc_visual_customization_unlocked`, `unlock_car_hud_dpad`, `disable_tutorials`, `apartment_on`).
- Section 4: HUD Toggle via Game Settings (`GetSettingsSystem().GetGroup('/interface/hud')`, `hideHud()`, `showHud()`, setting `ConfigVarBool` for minimap, wanted level, crosshairs, healthbar, etc.).
- Section 5: Weather & Time Control (`GetWeatherSystem().SetWeather`, `GetTimeSystem().SetGameTimeByHMS`).
- Section 6: Loading Screen Handling (`GetLoadingScreenSystem()`, observing `OnLoadingScreenStateChange`, `waitForLoadingScreenToHide`).
- Section 7: 3D to 2D Screen Projection (`GetCameraSystem().ProjectPoint`, `getDisplayResolution`, calculating screen coordinates for custom overlays and nametags).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/references/game-natives.md tests/skills.test.ts
git commit -m "docs(skills): add REDengine game natives reference guide"
```

---

### Task 2: Vehicles & Physics Reference (`references/vehicles-physics.md`)

**Files:**
- Create: `skills/cybermp-dev/references/vehicles-physics.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `skills/cybermp-dev/references/vehicles-physics.md` covering `MountingFacility` mounting/unmounting, vehicle repair (`DestructionResetGrid`, `DestructionResetGlass`, deformation float reset, tire repair, doors/windows), Nitro impulse physics (`AddLinelyVelocity`, quaternion to forward vector), and true speed curve calculation (`GetValueFromCurve`).

- [ ] **Step 1: Write the failing test for vehicles-physics.md**

In `tests/skills.test.ts`, add:
```typescript
it('provides comprehensive vehicles-physics reference', () => {
  const vehPhysicsPath = path.join(rootDir, 'skills/cybermp-dev/references/vehicles-physics.md');
  expect(fs.existsSync(vehPhysicsPath)).toBe(true);
  const content = fs.readFileSync(vehPhysicsPath, 'utf-8');
  expect(content.length).toBeGreaterThan(500);
  expect(content).toContain('GetMountingFacility');
  expect(content).toContain('gamemountingMountingRequest');
  expect(content).toContain('seat_front_left');
  expect(content).toContain('DestructionResetGrid');
  expect(content).toContain('entAnimationControllerComponent');
  expect(content).toContain('AddLinelyVelocity');
  expect(content).toContain('GetValueFromCurve');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: FAIL with `expect(fs.existsSync(vehPhysicsPath)).toBe(true)` returning false.

- [ ] **Step 3: Create `skills/cybermp-dev/references/vehicles-physics.md`**

Write `skills/cybermp-dev/references/vehicles-physics.md` containing:
- Section 1: Low-Level Vehicle Mounting & Unmounting (`sitInVehicle(vehicleNetId, slotName, instant)` with `mp.network.getStreamedPool('CVehicle')`, `mp.events.on('vehicleStreamIn')`, `gamemountingMountingRequest`, `leaveVehicle(instant)` with `gamemountingUnmountingRequest`).
- Section 2: Complete Vehicle Repair & Restoration (`repairVehicle(vehicle)` with `DestructionResetGrid()`, `DestructionResetGlass()`, animation controller reset for 10 deformation parts, `ToggleBrokenTire`, `comp.RepairVehicle()`, `comp.UpdateDamageEngineEffects()`, `ps.CloseAllVehDoors(true)`, `ps.CloseAllVehWindows()`, `ps.ForcePersistentStateChanged()`).
- Section 3: Nitro Physics & Directional Impulse (`getForwardFromQuaternion`, `applyNitroImpulse(vehicle, force)` using `vehicle.AddLinelyVelocity`, checking `vehicle.IsOnGround()`, `vehicle.IsPlayerDriver()`).
- Section 4: True Speed Calculation (`getVehicleSpeedKmh(vehicle)` evaluating REDengine curve `'vehicle_ui'` `'speed_to_multiplier'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/references/vehicles-physics.md tests/skills.test.ts
git commit -m "docs(skills): add vehicles and physics reference guide"
```

---

### Task 3: Player Mechanics & Inventory Reference (`references/player-mechanics.md`)

**Files:**
- Create: `skills/cybermp-dev/references/player-mechanics.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `skills/cybermp-dev/references/player-mechanics.md` covering `spawnPlayer`, `TeleportationFacility.Teleport`, health modification via `StatPoolsSystem` & `StatsSystem`, status effect restrictions (`GameplayRestriction.*`), item inventory (`AddToInventory`), character customization mirror, and player invisibility.

- [ ] **Step 1: Write the failing test for player-mechanics.md**

In `tests/skills.test.ts`, add:
```typescript
it('provides comprehensive player-mechanics reference', () => {
  const playerMechPath = path.join(rootDir, 'skills/cybermp-dev/references/player-mechanics.md');
  expect(fs.existsSync(playerMechPath)).toBe(true);
  const content = fs.readFileSync(playerMechPath, 'utf-8');
  expect(content.length).toBeGreaterThan(500);
  expect(content).toContain('spawnPlayer');
  expect(content).toContain('GetTeleportationFacility');
  expect(content).toContain('GetStatPoolsSystem');
  expect(content).toContain('GetStatusEffectSystem');
  expect(content).toContain('GameplayRestriction.NoCombat');
  expect(content).toContain('AddToInventory');
  expect(content).toContain('MenuScenario_CharacterCustomizationMirror');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: FAIL with `expect(fs.existsSync(playerMechPath)).toBe(true)` returning false.

- [ ] **Step 3: Create `skills/cybermp-dev/references/player-mechanics.md`**

Write `skills/cybermp-dev/references/player-mechanics.md` containing:
- Section 1: Spawning & Teleportation (`spawnPlayer(x, y, z, yaw)` with `mp.local.spawnPlayer`, `teleportPlayer(pos, yaw)` via `GetTeleportationFacility().Teleport`).
- Section 2: Health, Max Health & God Mode (`setPlayerHealth`, `setPlayerMaxHealth`, `enableGodMode` using `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode`, `StatsSystem.AddModifier`, and `BaseStatusEffect.Invulnerable`).
- Section 3: Status Effects & Restrictions (`applyRestriction`, `removeRestriction` via `GetStatusEffectSystem().ApplyStatusEffect` and `StatusEffectHelper.RemoveStatusEffect`, permanent restriction refresh interval, standard restriction constants).
- Section 4: Inventory & Equipment Spawning (`giveItem(itemKey, count)` using `mp.game.AddToInventory`, full catalog of iconic weapons, cyberware implants, ammunition types, and outfits from `freeroam`).
- Section 5: Character Customization Mirror (`openAppearanceMenu()` hooking `MenuScenario_PauseMenu` and switching to `MenuScenario_CharacterCustomizationMirror`, closing menus via `ForceCloseHubMenuEvent`).
- Section 6: Invisibility & Gender (`setPlayerInvisible(bool)` toggling player mesh components, `setPlayerGender(gender)` via `CharacterCustomizationSystem.SetPlayerGender`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/references/player-mechanics.md tests/skills.test.ts
git commit -m "docs(skills): add player mechanics and inventory reference guide"
```

---

### Task 4: Camera, Input & CEF Reference (`references/cameras-input-cef.md`)

**Files:**
- Create: `skills/cybermp-dev/references/cameras-input-cef.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `skills/cybermp-dev/references/cameras-input-cef.md` covering FPP/TPP FOV manipulation, free camera entity creation, spectator mode with target entity attachment, `onInputKeyEvent` key binding, and CEF browser focus/cursor/URL bridging.

- [ ] **Step 1: Write the failing test for cameras-input-cef.md**

In `tests/skills.test.ts`, add:
```typescript
it('provides comprehensive cameras-input-cef reference', () => {
  const camInputPath = path.join(rootDir, 'skills/cybermp-dev/references/cameras-input-cef.md');
  expect(fs.existsSync(camInputPath)).toBe(true);
  const content = fs.readFileSync(camInputPath, 'utf-8');
  expect(content.length).toBeGreaterThan(500);
  expect(content).toContain('GetFPPCameraComponent');
  expect(content).toContain('simple_free_camera.ent');
  expect(content).toContain('spectateCamera');
  expect(content).toContain('onInputKeyEvent');
  expect(content).toContain('mp.cef.setFocus');
  expect(content).toContain('mp.events.onCef');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: FAIL with `expect(fs.existsSync(camInputPath)).toBe(true)` returning false.

- [ ] **Step 3: Create `skills/cybermp-dev/references/cameras-input-cef.md`**

Write `skills/cybermp-dev/references/cameras-input-cef.md` containing:
- Section 1: Dynamic Camera FOV (`setFppFov`, `setTppFov` using `player.GetFPPCameraComponent().SetFOV`, `vehicleTPPCameraComponent`, and `mp.game.LerpF`).
- Section 2: Free Camera Entity (`createFreeCamera(pos, orientation)` resolving token hash for `base\entities\cameras\simple_free_camera.ent`, spawning via `mp.local.spawnObject`, activating/deactivating `gameCameraComponent`).
- Section 3: Spectator System (`startSpectating(targetNetId)` resolving game entity with `mp.network.getPlayerGameId`, attaching and configuring `spectateCamera`, offsets for on-foot vs in-vehicle, synchronizing metadata `mp.meta.setPlayerMeta(id, 'spectating', true, true)`).
- Section 4: Direct Key Input Handling (`onInputKeyEvent((action, key) => ...)`, tracking active pressed keys, dispatching callbacks for `EInputAction.IACT_Press` and `IACT_Release`).
- Section 5: CEF Browser Integration (`setBrowserFocus(focus, cursor)` via `mp.cef.setFocus`, `mp.cef.isInFocus()`, forwarding non-handled keys to browser, dynamic dev server URL switching `mp.cef.setUrl('http://localhost:5173')`, and `onCef('domReady')`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/references/cameras-input-cef.md tests/skills.test.ts
git commit -m "docs(skills): add cameras, input, and CEF reference guide"
```

---

### Task 5: Server Systems & 3D Math Reference (`references/server-mechanics.md`)

**Files:**
- Create: `skills/cybermp-dev/references/server-mechanics.md`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `skills/cybermp-dev/references/server-mechanics.md` covering server objects, dimensions, metadata, kick/ban, and 3D polygon/safezone collision checking.

- [ ] **Step 1: Write the failing test for server-mechanics.md**

In `tests/skills.test.ts`, add:
```typescript
it('provides comprehensive server-mechanics reference', () => {
  const serverMechPath = path.join(rootDir, 'skills/cybermp-dev/references/server-mechanics.md');
  expect(fs.existsSync(serverMechPath)).toBe(true);
  const content = fs.readFileSync(serverMechPath, 'utf-8');
  expect(content.length).toBeGreaterThan(500);
  expect(content).toContain('mp.objects.create');
  expect(content).toContain('player.dimension');
  expect(content).toContain('player.setMeta');
  expect(content).toContain('isPointInPolygon2D');
  expect(content).toContain('Safezone');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: FAIL with `expect(fs.existsSync(serverMechPath)).toBe(true)` returning false.

- [ ] **Step 3: Create `skills/cybermp-dev/references/server-mechanics.md`**

Write `skills/cybermp-dev/references/server-mechanics.md` containing:
- Section 1: Server-Side Entity Management (`mp.objects.create`, `mp.objects.destroy`, `mp.vehicles.create`, `mp.vehicles.destroy`).
- Section 2: Virtual Dimension Management (`player.dimension = dim`, isolating instances).
- Section 3: Player Metadata & Administration (`player.setMeta`, `player.getMeta`, `player.kick`).
- Section 4: 3D Zones & Polygon Collision (`isPointInPolygon2D` raycasting algorithm, `isInsideSafezone(pos, vertices, height, dimension)` bounding box and elevation checks, zone enter/leave event dispatching).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/user/cybermp-mcp && pnpm vitest run tests/skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/references/server-mechanics.md tests/skills.test.ts
git commit -m "docs(skills): add server mechanics and 3D geometry reference guide"
```

---

### Task 6: Skill, Rules & Test Integration

**Files:**
- Modify: `skills/cybermp-dev/SKILL.md`
- Modify: `rules/cybermp.md`
- Modify: `rules/AGENTS.md`
- Modify: `tests/skills.test.ts`

**Interfaces:**
- Consumes: All 5 reference guides from Tasks 1–5.
- Produces: Integrated `SKILL.md` with links and procedural recipes, anti-hallucination rules updated with REDengine natives guidance, and verified test suite.

- [ ] **Step 1: Write integration test assertions**

In `tests/skills.test.ts`, add verification that `SKILL.md` links to all five new reference guides:
```typescript
it('indexes all real-world mechanics reference guides in SKILL.md', () => {
  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  expect(skillContent).toContain('references/game-natives.md');
  expect(skillContent).toContain('references/vehicles-physics.md');
  expect(skillContent).toContain('references/player-mechanics.md');
  expect(skillContent).toContain('references/cameras-input-cef.md');
  expect(skillContent).toContain('references/server-mechanics.md');
});
```

- [ ] **Step 2: Update `skills/cybermp-dev/SKILL.md`**

- Add a dedicated section `## Real-World Mechanics & REDengine Natives (from cybermp-freeroam)` linking all 5 guides with brief summaries.
- Add ready-to-use procedural recipe snippets:
  1. Teleport player safely (with `GetTeleportationFacility`).
  2. Vehicle seat mounting and repair.
  3. Spawning weapons and items.
  4. Binding key inputs (`onInputKeyEvent`).
  5. Controlling CEF focus and cursor.

- [ ] **Step 3: Update `rules/cybermp.md` and `rules/AGENTS.md`**

- Add explicit rules regarding game natives:
  - Mention that `use_game_natives = true` enables access to `mp.game.*`.
  - Prohibit FiveM native hallucinations (`SetEntityCoords`, `SetPedIntoVehicle`, `SetEntityHealth`) and mandate the official CyberMP/REDengine equivalents (`GetTeleportationFacility().Teleport`, `MountingFacility().Mount`, `StatPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode`).

- [ ] **Step 4: Run full test suite and TypeScript build**

Run: `cd /Users/user/cybermp-mcp && pnpm test && pnpm run build`
Expected: All tests pass (90+ tests), build completes cleanly.

- [ ] **Step 5: Commit**

```bash
cd /Users/user/cybermp-mcp
git add skills/cybermp-dev/SKILL.md rules/cybermp.md rules/AGENTS.md tests/skills.test.ts
git commit -m "feat(skills): integrate real-world mechanics reference guides into SKILL.md and rules"
```

---

### Task 7: End-to-End Verification & Sanity Check

**Files:**
- Test: Entire project test suite and CLI dry-run.

- [ ] **Step 1: Run complete test suite**

Run: `cd /Users/user/cybermp-mcp && pnpm test`
Expected: All test suites PASS.

- [ ] **Step 2: Build project**

Run: `cd /Users/user/cybermp-mcp && pnpm run build`
Expected: Zero TypeScript compiler errors.

- [ ] **Step 3: Verify CLI output and files**

Run: `node dist/bin/cli.js --help`
Expected: CLI responds with usage information.

- [ ] **Step 4: Final Git Status check**

Run: `cd /Users/user/cybermp-mcp && git status`
Expected: Clean working tree on branch `main`.
