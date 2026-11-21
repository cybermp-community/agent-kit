---
environment: client
---

# Player Mechanics & Inventory Reference

This reference covers low-level player entity lifecycle management, coordinate teleportation, health pools, status effect restrictions, item/equipment inventory manipulation, in-game appearance mirror menus, mesh invisibility, and gender switching in CyberMP client scripts (`use_game_natives = true`).

These snippets run in the CyberMP game client with `use_game_natives = true`. They describe local REDengine operations. Your resource must define when the server authorizes them, how state is persisted, and what other clients should observe.

---

## 1. Spawning & Teleportation

Use `mp.local.spawnPlayer` in the resource's spawn or respawn flow. Use `GetTeleportationFacility().Teleport` to move an existing player. World load, spawn request acceptance and puppet availability are separate conditions. [Client lifecycle](https://docs.cyber.mp/guides/client/lifecycle/) · [Player spawn guide](https://docs.cyber.mp/guides/client/spawning-player/)

### Mathematical Vector & Rotation Helpers

For native teleportation, build a `Vector4` for the destination and pass yaw separately in `EulerAngles`. A resource may serialize a different vector format for transport.

```typescript
import type { EulerAngles, Vector3, Vector4 } from '@cybermp/client-types/game';

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
```

### Player Spawning Implementation

Call this client fragment once the game world is loaded, at the point authorized by the resource's spawn flow. Use the spawn guide for health setup. A return value of `true` means that the spawn request started. Use `mp.game.onLocalPlayerSpawned` and check the puppet before issuing follow-up native calls. [Player spawn guide](https://docs.cyber.mp/guides/client/spawning-player/) · [Client lifecycle](https://docs.cyber.mp/guides/client/lifecycle/)

```typescript
export function requestLocalSpawn(
  x: number,
  y: number,
  z: number,
  yaw = 0,
): boolean {
  return mp.local.spawnPlayer(x, y, z, yaw);
}
```

### Coordinate Teleportation Implementation

This fragment moves an existing on-foot player. Call it after your resource has closed active game menus and validated the destination. Handle vehicle transitions before this call. If the move also changes dimension, coordinate the dimension change with the server. Check the destination's streaming and collision separately. [Player teleportation guide](https://docs.cyber.mp/guides/client/teleporting-player/) · [Interior streaming](object-spawning-and-streaming.md#5-interior-streaming--occlusion-handling)

```typescript
export function requestOnFootTeleport(x: number, y: number, z: number, yaw = 0): boolean {
  if (![x, y, z, yaw].every(Number.isFinite)) return false;

  const puppet = mp.game.GetPlayer();
  const playerObject = mp.game.GetPlayerObject();
  if (!puppet || !playerObject || puppet.GetMountedVehicle()) return false;

  const position = Object.assign(new mp.game.Vector4(), { x, y, z, w: 1 });
  const rotation = Object.assign(new mp.game.EulerAngles(), { roll: 0, pitch: 0, yaw });
  mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(playerObject, position, rotation);
  return true; // The native call was issued.
}
```

---

## 2. Health, Max Health & God Mode

`StatPoolsSystem` reads and updates the current health pool. `StatsSystem` exposes the Health stat and its modifiers. The optional `perc` argument on `RequestSettingStatPoolValueIgnoreChangeMode` selects the units of the current value. The sample uses points. The official spawn guide also changes the Health stat as part of its initialization routine. An in-session mode should only manage modifiers it owns. [Player spawn guide](https://docs.cyber.mp/guides/client/spawning-player/#initializing-health-stat-pools) · [StatPoolsSystem declarations](https://edgemodders.github.io/REDnode/game/t/gameStatPoolsSystem.html)

### Health Modification Implementation

```typescript
import { gamedataStatPoolType } from '@cybermp/client-types/enums';
import type { gameStatsObjectID } from '@cybermp/client-types/game';

export function readHealthPoints(): number | undefined {
  const player = mp.game.GetPlayer();
  if (!player) return;

  // Freeroam passes the entity ID here via a cast to the generated stats ID type.
  const id = player.GetEntityID() as unknown as gameStatsObjectID;
  return mp.game.ScriptGameInstance.GetStatPoolsSystem().GetStatPoolValue(
    id, gamedataStatPoolType.Health, false,
  );
}

export function requestHealthPoints(points: number): boolean {
  const player = mp.game.GetPlayer();
  if (!player || !Number.isFinite(points) || points < 0) return false;

  const id = player.GetEntityID() as unknown as gameStatsObjectID;
  mp.game.ScriptGameInstance.GetStatPoolsSystem().RequestSettingStatPoolValueIgnoreChangeMode(
    id, gamedataStatPoolType.Health, points, new mp.game.gameObject(), false,
  );
  return true;
}
```

For a god mode, verify the exact invulnerability record and its removal on the target build. Keep temporary state tied to the owning resource and validate server-side damage behavior separately. `BaseStatusEffect.Invulnerable` is used by Freeroam, which sets its own mode-specific health defaults. [Freeroam health service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/health/health.service.ts)

---

## 3. Status Effects & Restrictions

REDengine uses status effects (`gameStatusEffectSystem`) to enforce gameplay constraints, disable weapons, freeze movement, prevent menu openings, or grant combat perks.

### Applying & Removing Restrictions

```typescript
/**
 * Applies a status effect or gameplay restriction to the local player.
 * @param effect Unique string TweakDB identifier (e.g. 'GameplayRestriction.NoCombat')
 */
export function applyRestriction(effect: string): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const effectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  effectSystem.ApplyStatusEffect(
    player.GetEntityID(),
    effect,
    player.GetRecordID(),
    player.GetEntityID(),
  );
}

/**
 * Checks whether the local player currently has an active status effect.
 */
export function hasRestriction(effect: string): boolean {
  const player = mp.game.GetPlayer();
  if (!player) return false;

  return mp.game.ScriptGameInstance.GetStatusEffectSystem().HasStatusEffect(
    player.GetEntityID(),
    effect,
  );
}

/**
 * Removes an active status effect from the local player via StatusEffectHelper.
 */
export function removeRestriction(effect: string): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  if (hasRestriction(effect)) {
    mp.game.StatusEffectHelper.RemoveStatusEffect(player, effect, undefined);
  }
}
```

### Restriction Lifetime

Some resources reapply restrictions after respawn or a mode transition. Start with the relevant lifecycle event. If you use a timer, re-resolve the current puppet, check whether the effect is already active, and stop the timer when the mode or resource ends. Only remove an effect if the resource owns its application. If another system can apply the same effect, coordinate cleanup through a shared owner. [Freeroam status-effect service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/status-effects/status-effects.service.ts)

### Standard Gameplay Restriction Catalog

Treat these records and effects as candidates. Resolve each ID in the target game build and test application and removal on the intended entity.

| Restriction Candidate | Effect to Test | Possible Use |
|---|---|---|
| `GameplayRestriction.NoCombat` | Disables weapon firing, aiming, melee attacks | Safezones, greenzones, lobbies |
| `GameplayRestriction.NoWeapons` | Forces weapon holstering and prevents weapon draw | Social hubs, vehicle cockpits |
| `GameplayRestriction.NoMovement` | Disables player directional input (WASD/controller) | Player freeze, countdown timers |
| `GameplayRestriction.NoCameraControl` | Disables mouse/stick camera rotation | Cinematics, spectator locking |
| `GameplayRestriction.BlockAllMenu` | Disables pause menu, inventory, map hotkeys | Death screen, minigames |
| `GameplayRestriction.NoRadialMenus` | Disables weapon selector and phone wheels | Arena matches, strict PvP |
| `GameplayRestriction.NoHealing` | Prevents consuming MaxDoc / BounceBack injectors | Hardcore duel modes |
| `GameplayRestriction.NoZooming` | Disables optical and weapon zoom | Lobbies, minigame states |
| `GameplayRestriction.NoDriving` | Disables throttle, brakes, and vehicle controls | Impounded vehicles, greenzones |
| `GameplayRestriction.NoPhotoMode` | Disables photo mode shortcut (prevents pausing engine) | Mode-specific photo mode restriction |
| `GameplayRestriction.NoScanning` | Disables scanner HUD overlay | Competitive PvP anti-wallhack |
| `GameplayRestriction.InfiniteAmmo` | Unlimited ammo in loaded magazine | Freeroam arenas, deathmatch |
| `GameplayRestriction.VehicleCombatBlockExit` | Prevents player from exiting vehicle | Vehicle combat, derby, races |
| `GameplayRestriction.VehicleFPP` | Locks vehicle camera perspective to first-person | Cockpit-only racing, hardcore mode |
| `BaseStatusEffect.Invulnerable` | Candidate invulnerability effect | God mode, spawn protection |

### Combat Status Effects & Damage-over-Time (DoT)

REDengine includes native status effects for combat damage-over-time (burning, chemical poison, EMP electrocution, and physical bleeding).

| Status Effect Candidate | Effect to Test | Possible Use |
|---|---|---|
| `BaseStatusEffect.Burning` | Thermal DoT | Incendiary ammo, flamethrowers, explosion aftermath |
| `BaseStatusEffect.Electrocuted` | EMP DoT | Tech weapons, EMP grenades, cyberware shock |
| `BaseStatusEffect.Poisoned` | Chemical DoT | Biohazard grenades, venom knives, toxic pools |
| `BaseStatusEffect.Bleeding` | Physical DoT | Blades, slashing melee, shrapnel |
| `BaseStatusEffect.Overheat` | Thermal Netrunner DoT | Quickhack overheat, cyberware burn |
| `BaseStatusEffect.CyberwareMalfunction` | Debuff / System Lock | Netrunner combat, cyberware EMP disable |
| `BaseStatusEffect.Blind` | Sensory Disruption | Flashbang grenades, reboot optics |
| `BaseStatusEffect.Crippled` | Mobility Lock | Leg shots, tendon slicing, slowing movement |
| `BaseStatusEffect.Stun` | Hard Crowd Control | Heavy melee impact, concussion blast |

After confirming the record in the target build, use this client fragment to request one application of `BaseStatusEffect.Burning` to the current local puppet. Verify the resulting effect separately.

```typescript
export function requestLocalBurning(): boolean {
  const player = mp.game.GetPlayer();
  if (!player) return false;

  const id = player.GetEntityID();
  const effect = 'BaseStatusEffect.Burning';
  const effects = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  if (effects.HasStatusEffect(id, effect)) return false;

  effects.ApplyStatusEffect(id, effect, player.GetRecordID(), id);
  return true;
}
```

Use the record's own duration where it matches the mode. If the resource schedules removal, tie it to the target entity and the resource's ownership of that application. Cancel pending removal on entity replacement or resource stop. Check stacking and damage in a multiplayer session.

---

## 4. Inventory & Equipment Spawning

Items are added to the player's inventory using `mp.game.AddToInventory(tdbId, count)`. Inventory verification is handled via REDengine's `TransactionSystem`.

### Inventory Inspection & Item Spawning

Run these client fragments after puppet spawn. Validate item records and supported quantities in the target build. A client add request is separate from a server-authorized entitlement or persistent loadout.

```typescript
export function requestItem(itemKey: string, count = 1): boolean {
  if (!mp.game.GetPlayer() || !Number.isSafeInteger(count) || count <= 0) return false;
  mp.game.AddToInventory(itemKey, count);
  return true;
}

export function hasItem(itemKey: string): boolean {
  const player = mp.game.GetPlayerObject();
  if (!player) return false;

  const transactionSystem = mp.game.ScriptGameInstance.GetTransactionSystem();
  const itemId = mp.game.gameItemID.FromTDBID(itemKey);
  return transactionSystem.HasItem(player, itemId);
}
```

### Cyberware Equip Request (`EquipCyberwareByTDBID`)

`EquipCyberwareByTDBID` takes a `PlayerPuppet` from `mp.game.GetPlayer()`. Check slot availability and the resulting equipment state separately. The wrapper reports whether it issued a request.

```typescript
export function requestCyberwareEquip(itemKey: string): boolean {
  const player = mp.game.GetPlayer();
  if (!player) return false;

  const equipmentSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get('EquipmentSystem');
  if (!equipmentSystem) return false;

  equipmentSystem.EquipCyberwareByTDBID(player, itemKey);
  return true;
}
```

### Comprehensive Item & Equipment Catalog

Use these names as TweakDB search candidates. Verify the record, DLC dependency, and compatibility with the current game version. [WolvenKit Tweak Browser](https://wiki.redmodding.org/wolvenkit/wolvenkit-app/editor/tweak-browser)

#### Iconic & Powerful Weapons (`Items.<Key>`)

| Item Identifier | Weapon Name & Archetype | Description |
|---|---|---|
| `Preset_Silverhand_3516` | Malorian Arms 3516 (Power Pistol) | Johnny Silverhand's iconic high-caliber handgun |
| `Preset_Lexington_Toygun` | Skippy (Smart Pistol) | Talking AI-powered smart pistol |
| `Preset_Katana_Saburo` | Satori (Katana) | High critical multiplier blade |
| `Preset_Katana_Cocktail` | Cocktail Stick (Katana) | Evelyn Parker's katana with high bleed |
| `Preset_Katana_GoG` | Black Unicorn (Katana) | Witcher-themed iconic katana |
| `Preset_Carnage_Edgerunners` | Guts (Power Shotgun) | Rebecca's heavy-recoil shotgun |
| `Legendary_Zhuo_Eight_Star` | Ba Xing Chong (Smart Shotgun) | Adam Smasher's smart missile shotgun |
| `Preset_Overture_Cassidy` | Amnesty (Power Revolver) | Cassidy's quickdraw revolver |
| `Preset_Nue_Maiko` | Death and Taxes (Power Pistol) | Twin-round burst pistol |
| `Preset_Dian_Yinglong` | Yinglong (Smart SMG) | High-rate EMP burst smart SMG |
| `Preset_Saratoga_Raffen` | Problem Solver (Power SMG) | Ultra-high fire rate submachine gun |
| `Legendary_Ajax_Moron` | Moron Labe (Power Assault Rifle) | Dismemberment assault rifle |
| `Preset_Masamune_Rogue` | Prejudice (Power Assault Rifle) | Rogue's high-damage burst rifle |
| `Preset_Grad_Buck` | O'Five (Power Sniper Rifle) | Explosive round anti-materiel sniper |
| `Preset_Kolac_Tiny_Mike` | Hypercritical (Precision Rifle) | Knockdown chemical precision rifle |
| `Preset_Dildo_Stout` | Sir John Phallustiff (Blunt Weapon) | Iconic vibrating club |
| `Preset_Fanged_Axe_Default` | Agaou (One-Handed Axe) | Electric shockwave throwing axe |
| `Preset_Neurotoxin_Knife_Iconic` | Blue Fang (Knife) | Neurotoxin stun throwing knife |
| `Preset_MA70_Default` | MA70 HB (Light Machine Gun) | High-capacity suppressive LMG |
| `Preset_Yukimura_Default` | Genjiroh (Smart Pistol) | 4-target simultaneous smart tracking |
| `Preset_Senkoh_Default` | Senkoh LX (Tech SMG) | Wall-penetrating burst SMG |
| `Preset_Tactician_Dino` | The Headsman (Power Shotgun) | Tight-spread combat shotgun |

#### Cyberware Implants (Tier 5+ / Legendary Plus)

| Item Identifier | Cyberware Slot | Primary Effect |
|---|---|---|
| `AdvancedCamilloRamManagerLegendaryPlus` | Operating System | Restores 30% RAM when dropped to 20% |
| `AdvancedBioConductorsLegendaryPlus` | Operating System | Cyberware cooldown reduction |
| `AdvancedSubdermalCoProcessorLegendaryPlus` | Hands | Increases Smart weapon lock-on and target tracking |
| `AdvancedSmartLinkLegendaryPlus` | Hands | Enables Smart gun targeting and critical damage |
| `AdvancedPowerGripLegendaryPlus` | Hands | Increases Power weapon ricochet damage |
| `AdvancedStrongArmsLegendaryPlus` | Arms (Gorilla Arms) | Maximum melee damage and body check bypass |
| `AdvancedMantisBladesLegendaryPlus` | Arms (Mantis Blades) | Leap attacks and high bleed slicing |
| `AdvancedNanoWiresLegendaryPlus` | Arms (Monowire) | AOE cyberware wire attacks and quickhack upload |
| `AdvancedProjectileLauncherLegendaryPlus` | Arms (Arm Cannon) | Explosive and incendiary arm rocket launcher |
| `AdvancedKiroshiOpticsBareLegendaryPlus` | Ocular System | Highest scan range and threat analysis |
| `AdvancedSecondHeartLegendaryPlus` | Circulatory System | Revives player to 100% health upon death |
| `AdvancedBloodPumpLegendaryPlus` | Circulatory System | High-volume instant health injector |
| `AdvancedBiomonitorLegendaryPlus` | Circulatory System | Automatically triggers health consumables at 35% HP |
| `AdvancedHealOnKillLegendaryPlus` | Circulatory System | Restores 10% health upon defeating an enemy |
| `AdvancedEndoskeletonLegendaryPlus` | Skeleton | Drastic maximum health boost |
| `AdvancedTitaniumInfusedBonesLegendaryPlus` | Skeleton | Huge carry weight increase |
| `AdvancedBoostedTendonsLegendaryPlus` | Legs | Double jump mobility |
| `AdvancedReinforcedMusclesLegendaryPlus` | Legs | Charged jump mobility |
| `AdvancedJenkinsTendonsLegendaryPlus` | Legs | Sprint speed and sprint stamina reduction |
| `AdvancedBerserkC4MK5Plus` | Operating System | 100% melee invulnerability and strength fury |
| `AdvancedMicroGeneratorLegendaryPlus` | Integumentary System | EMP blast when health falls below 15% |
| `AdvancedPainReductorLegendaryPlus` | Integumentary System | 7% flat incoming damage mitigation |

#### Ammunition Types

```typescript
export const AMMO_TYPES = {
  HANDGUN: 'Ammo.HandgunAmmo',     // Standard pistols, revolvers
  SHOTGUN: 'Ammo.ShotgunAmmo',     // Carnage, Crusher, Tactician
  RIFLE: 'Ammo.RifleAmmo',         // Assault rifles, SMGs, LMGs
  SNIPER: 'Ammo.SniperRifleAmmo',   // Overwatch, Grad, Ashura
  SPECIAL: 'Ammo.Special',         // Projectile launchers, heavy ordnance
} as const;

/**
 * Replenishes complete ammunition stockpile for all weapon categories.
 */
export function replenishAllAmmo(): void {
  mp.game.AddToInventory(AMMO_TYPES.HANDGUN, 1000);
  mp.game.AddToInventory(AMMO_TYPES.SHOTGUN, 2000);
  mp.game.AddToInventory(AMMO_TYPES.RIFLE, 3000);
  mp.game.AddToInventory(AMMO_TYPES.SNIPER, 700);
  mp.game.AddToInventory(AMMO_TYPES.SPECIAL, 700);
}
```

#### Outfits & Iconic Clothing

- **Johnny Silverhand Full Set**: `Items.Q005_Johnny_Glasses`, `Items.SQ031_Samurai_Jacket`, `Items.Q005_Johnny_Shirt`, `Items.Q005_Johnny_Pants`, `Items.Q005_Johnny_Shoes`
- **Faction & Service Armor**: `Items.Trauma_Team_Outfit`, `Items.SQ030_MaxTac_Chest`, `Items.Cop_01_Set_Jacket`, `Items.Cop_01_Set_Boots`, `Items.SQ030_Diving_Suit`, `Items.Q115_Custom_Predator_Armor`
- **Consumables**: `Items.FirstAidWhiffVLegendaryPlus`, `Items.BonesMcCoy70VLegendaryPlus`, `Items.HealthBooster`, `Items.BlackLaceV1`, `Items.GrenadeOzobsNose`, `Items.GrenadeFragLegendaryPlus`, `Items.GrenadeEMPLegendaryPlus`

---

## 5. Character Customization Mirror

Freeroam registers menu observers, captures the in-game menu controller and requests `OnOpenPauseMenu`. When the pause scenario enters for an outstanding appearance request, it switches to `MenuScenario_CharacterCustomizationMirror`. [Freeroam appearance menu service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/appearance-menu.service.ts)

### Appearance Menu Controller

Use this fragment inside the observed pause scenario when the resource has a pending customization request. Track at most one pending request. Clear it on timeout or resource stop. Verify mirror visibility, return to gameplay and input restoration in the target game build.

```typescript
import type { MenuScenario_PauseMenu } from '@cybermp/client-types/game';

export function requestMirrorFromPauseMenu(pauseMenu: MenuScenario_PauseMenu): void {
  pauseMenu.SwitchToScenario('MenuScenario_CharacterCustomizationMirror');
}
```

---

## 6. Invisibility & Gender

### Mesh Component Invisibility

Inspect the puppet's components with `GetComponents()` and record each candidate's name, type and enabled state. Confirm that an explicitly selected component is visual before toggling it. Save its original state and restore it on mode exit while the same puppet exists. Check local rendering, collision and remote visibility separately.

### Gender Switching & Entity Reloading

Use `SetPlayerGender` in a customization flow. Observe `OnPlayerGenderChanged` to diagnose the transition. Freeroam coordinates this event with its own spawn flow. Check appearance, equipment and persistence before coupling the event to respawn in another resource. [Freeroam player service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/player.service.ts)

```typescript
import type { EPlayerGender } from '@cybermp/client-types/enums';

export function requestGenderChange(gender: EPlayerGender): boolean {
  const system = mp.game.ScriptGameInstance.GetCharacterCustomizationSystem();
  if (!system) return false;
  system.SetPlayerGender(gender, true);
  return true;
}
```

---

## 7. Player Development System & Perks (`PlayerDevelopmentSystem`)

Cyberpunk 2077 player stats, attributes (Body/Strength, Reflexes, Technical Ability, Cool, Intelligence), perk points, and experience levels are governed by `PlayerDevelopmentSystem`.

### Setting Attributes & Adding Development Points

All updates to player attributes and perks are sent as scriptable system requests via `QueueRequest` or `QueueScriptableSystemRequest`:

```typescript
import {
  gamedataDevelopmentPointType,
  gamedataNewPerkType,
  gamedataProficiencyType,
  gamedataStatType,
} from '@cybermp/client-types/enums';

/**
 * Sets a specific player attribute to a given level (e.g. 20).
 *
 * @param stat Attribute type (Strength/Body, Reflexes, TechnicalAbility, Cool, Intelligence, Espionage)
 * @param value Target level (1 - 20)
 */
export function setPlayerAttribute(stat: gamedataStatType, value: number): void {
  const player = mp.game.GetPlayerObject();
  const devSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'PlayerDevelopmentSystem',
  );

  const attrReq = Object.assign(new mp.game.SetAttribute(), {});
  attrReq.Set(player, value, stat);
  devSystem.QueueRequest(attrReq);
}

/**
 * Grants development/perk points to the player.
 *
 * @param amount Number of points to add
 * @param pointType Primary (Perk points) or Attribute points
 */
export function addDevelopmentPoints(
  amount: number,
  pointType: gamedataDevelopmentPointType = gamedataDevelopmentPointType.Primary,
): void {
  const player = mp.game.GetPlayerObject();
  const devSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'PlayerDevelopmentSystem',
  );

  const devPointsReq = Object.assign(new mp.game.questAddDevelopmentPointsRequest(), {});
  devPointsReq.Set(player, amount, pointType);
  devSystem.QueueRequest(devPointsReq);
}

/**
 * Unlocks a specific perk on the player.
 */
export function unlockPerk(perkType: gamedataNewPerkType): void {
  const player = mp.game.GetPlayerObject();
  const devSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'PlayerDevelopmentSystem',
  );

  const buyPerkRequest = Object.assign(new mp.game.BuyNewPerk(), {});
  buyPerkRequest.Set(player, perkType);
  devSystem.QueueRequest(buyPerkRequest);
}

/**
 * Adds experience to the player's level or specific proficiency skill.
 */
export function addPlayerExperience(
  amount: number,
  type: gamedataProficiencyType = gamedataProficiencyType.Level,
): void {
  const player = mp.game.GetPlayerObject();
  const addExpReq = Object.assign(new mp.game.AddExperience(), {});
  addExpReq.Set(player, amount, type, false);

  mp.game.ScriptGameInstance.QueueScriptableSystemRequest(
    'PlayerDevelopmentSystem',
    addExpReq,
  );
}
```

---

## 8. Ammo TweakDB Reference

CyberMP uses native REDengine TweakDB strings for managing ammunition through `mp.game.AddToInventory`:

```typescript
export const AmmoTypes = {
  Handgun: 'Ammo.HandgunAmmo',
  Shotgun: 'Ammo.ShotgunAmmo',
  Rifle: 'Ammo.RifleAmmo',
  Sniper: 'Ammo.SniperRifleAmmo',
  Special: 'Ammo.Special',
} as const;

/**
 * Restocks all ammunition categories for the local player.
 */
export function restockAllAmmo(): void {
  mp.game.AddToInventory('Ammo.HandgunAmmo', 1000);
  mp.game.AddToInventory('Ammo.ShotgunAmmo', 2000);
  mp.game.AddToInventory('Ammo.RifleAmmo', 3000);
  mp.game.AddToInventory('Ammo.SniperRifleAmmo', 700);
  mp.game.AddToInventory('Ammo.Special', 700);
}
```

---

## 9. Player Freeze System

Start a countdown or cutscene by suppressing the relevant input or applying a verified movement restriction. Keep the restriction tied to the mode and the current puppet. Remove it when the mode ends, the puppet is replaced, or the resource stops. Test mounted state and menus separately.

Per-frame calls to `Teleport` need their own validation for physics, streaming and multiplayer synchronization. Before using a freeze in a multiplayer mode, check whether the server and a second client observe the intended position and whether control returns after the mode ends.

---

## 10. Weapon Drawing & Equipment Manipulation (`EquipmentSystem` & `TransactionSystem`)

Manipulating what weapon is drawn in the player's hands, checking whether an item is equipped, and removing or assigning items in specific equipment slots is handled via REDengine's `EquipmentSystem` and `TransactionSystem`.

### Equipping Weapons into Player Hands (`gameDrawItemRequest`)

To immediately equip a weapon from inventory into the player's active hands:

```typescript
import { EquipmentManipulationAction } from '@cybermp/client-types/enums';

/**
 * Draws and equips a specific weapon into the player's hands.
 *
 * @param weaponTdbId TweakDB record string (e.g. 'Items.Preset_Katana_Saburo')
 */
export function drawWeaponIntoHands(weaponTdbId: string): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  const equipmentSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'EquipmentSystem',
  );

  const drawItemRequest = Object.assign(new mp.game.gameDrawItemRequest(), {
    owner: player,
    itemID: mp.game.gameItemID.CreateQuery(weaponTdbId),
  });

  equipmentSystem.QueueRequest(drawItemRequest);
}

/**
 * Commands the player to switch to their last used or first available weapon.
 */
export function switchWeaponToAvailable(): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  const equipmentSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'EquipmentSystem',
  );

  const request = Object.assign(new mp.game.EquipmentSystemWeaponManipulationRequest(), {
    owner: player,
    requestType: EquipmentManipulationAction.RequestLastUsedOrFirstAvailableWeapon,
  });

  equipmentSystem.QueueRequest(request);
}
```

### Unequipping Items from Equipment Slots (`RequestUnequipItem`)

`mp.game.EquipmentSystem.RequestUnequipItem` is a static method that removes equipped gear from weapon slots (0, 1, 2) or cyberware slots:

```typescript
import { gamedataEquipmentArea } from '@cybermp/client-types/enums';

/**
 * Unequips all weapons from the 3 active weapon slots.
 */
export function unequipAllWeapons(): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  for (let slotIndex = 0; slotIndex < 3; slotIndex++) {
    mp.game.EquipmentSystem.RequestUnequipItem(
      player,
      gamedataEquipmentArea.Weapon,
      slotIndex,
    );
  }
}

/**
 * Equips cyberware directly by TweakDB ID.
 */
export function equipCyberware(cyberwareTdbId: string): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const eqSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get(
    'EquipmentSystem',
  );
  eqSystem.EquipCyberwareByTDBID(player, cyberwareTdbId);
}

/**
 * Arms Cyberware Death Mesh Fix:
 * When dying with Arms Cyberware equipped (Gorilla Arms, Mantis Blades, Monowire, Launcher),
 * REDengine can corrupt or hide arm meshes upon respawn.
 * Unequip ArmsCW on death and re-equip 500ms after revival to preserve mesh integrity.
 */
export class ArmsCyberwareMeshGuard {
  private savedArmsCyberwareId: string | null = null;

  handleDeath(): void {
    const playerObj = mp.game.GetPlayerObject();
    if (!playerObj) return;

    const eqSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get('EquipmentSystem');
    const activeArms = eqSystem.GetActiveItem(playerObj, gamedataEquipmentArea.ArmsCW);
    if (activeArms?.id) {
      this.savedArmsCyberwareId = activeArms.id;
      mp.game.EquipmentSystem.RequestUnequipItem(playerObj, gamedataEquipmentArea.ArmsCW, 0);
    }
  }

  handleRevive(): void {
    if (!this.savedArmsCyberwareId) return;
    const armsId = this.savedArmsCyberwareId;
    this.savedArmsCyberwareId = null;

    setTimeout(() => {
      const player = mp.game.GetPlayer();
      if (!player) return;
      const eqSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get('EquipmentSystem');
      eqSystem.EquipCyberwareByTDBID(player, armsId);
    }, 500);
  }
}
```

---

## 11. Ragdoll Knockdown Reset & Revive (`AnimFeature_SwimmingData`)

Freeroam uses the `SwimmingData` animation feature as a ragdoll recovery workaround. Treat `AnimFeature_SwimmingData` as a diagnostic lead. Verify the player is already alive, the animation controller belongs to the current puppet, and the player regains movement both locally and for another client. Keep the health and respawn flow separate from the animation test. [Freeroam death service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/death/death.service.ts)
