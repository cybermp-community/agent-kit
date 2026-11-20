# Player Mechanics & Inventory Reference

This reference covers low-level player entity lifecycle management, coordinate teleportation, health pools, status effect restrictions, item/equipment inventory manipulation, in-game appearance mirror menus, mesh invisibility, and gender switching in CyberMP client scripts (`use_game_natives = true`).

> [!IMPORTANT]
> All code in this reference is procedural TypeScript utilizing direct `mp.local.*`, `mp.game.*`, and `mp.events.*` runtime bindings. REDengine native classes require property instantiation via `Object.assign(new mp.game.<Type>(), { ... })`.

---

## 1. Spawning & Teleportation

In CyberMP, player spatial positioning is divided into two distinct operations:
1. **Physical Spawning (`mp.local.spawnPlayer`)**: Re-creates or resets the local player's avatar in the game engine, initializing physical rigs, camera attachments, and default health pools.
2. **Coordinate Teleportation (`GetTeleportationFacility().Teleport`)**: Moves an already-spawned player entity smoothly to target coordinates without re-initializing game state or triggering reload sequences.

### Mathematical Vector & Rotation Helpers

REDengine uses `Vector4` for world positions (where `w = 1.0` or heading) and `EulerAngles` (roll, pitch, yaw in degrees) for entity orientation.

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

Call `mp.local.spawnPlayer` when the player enters the server or after death:

```typescript
/**
 * Spawns the local player entity at world coordinates with heading yaw.
 * @param x World X coordinate
 * @param y World Y coordinate
 * @param z World Z coordinate
 * @param yaw Orientation angle around the Z axis in degrees (0 - 360)
 */
export function spawnPlayer(x: number, y: number, z: number, yaw: number = 0): void {
  // mp.local.spawnPlayer instantiates the player avatar in REDengine
  mp.local.spawnPlayer(x, y, z, yaw);
  console.log(`[Player] Spawned local player at (${x}, ${y}, ${z}) facing ${yaw}°`);
}

// Example: Initial spawn once game world has loaded
mp.game.onceGameLoaded(() => {
  spawnPlayer(-1412.5, 1285.2, 23.4, 90.0);
});
```

### Coordinate Teleportation Implementation

Teleporting an active player must be executed through REDengine's `gamemountingTeleportationFacility` (`mp.game.ScriptGameInstance.GetTeleportationFacility()`):

```typescript
/**
 * Teleports the local player to the specified position and yaw without reloading the avatar.
 * Safely forces the player out of vehicles and closes active menus prior to movement.
 */
export function teleportPlayer(
  x: number,
  y: number,
  z: number,
  yaw: number = 0,
): void {
  const player = mp.game.GetPlayerObject();
  if (!player) {
    console.error('[Teleport] Player object not ready');
    return;
  }

  // 1. Close open menus to prevent camera desync
  closeAllMenus();

  // 2. Teleport entity via REDengine TeleportationFacility
  const targetPos = createVector4(x, y, z, 1.0);
  const targetRot = createEulerAngles(0, 0, yaw);

  mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(
    player,
    targetPos,
    targetRot,
  );
}
```

---

## 2. Health, Max Health & God Mode

Player health in REDengine is managed across two interconnected systems:
- `StatPoolsSystem`: Manages dynamic, volatile pools (e.g. current `Health`, `Stamina`, `Memory`).
- `StatsSystem`: Manages underlying base attributes and persistent modifier modifiers (e.g. base max health, resistances).

### Health Modification Implementation

```typescript
import {
  gamedataStatPoolType,
  gamedataStatType,
  gameStatModifierType,
} from '@cybermp/client-types/enums';
import type { gameStatsObjectID } from '@cybermp/client-types/game';

/**
 * Returns the current health value of the local player.
 */
export function getPlayerHealth(): number {
  const player = mp.game.GetPlayer();
  if (!player) return 0;

  const playerGameId = player.GetEntityID() as unknown as gameStatsObjectID;
  return mp.game.ScriptGameInstance.GetStatPoolsSystem().GetStatPoolValue(
    playerGameId,
    gamedataStatPoolType.Health,
    false,
  );
}

/**
 * Returns the maximum health attribute of the local player.
 */
export function getPlayerMaxHealth(): number {
  const player = mp.game.GetPlayer();
  if (!player) return 0;

  const playerGameId = player.GetEntityID() as unknown as gameStatsObjectID;
  return mp.game.ScriptGameInstance.GetStatsSystem().GetStatValue(
    playerGameId,
    gamedataStatType.Health,
  );
}

/**
 * Sets current player health directly in the StatPoolsSystem.
 * @param value Target health number
 */
export function setPlayerHealth(value: number): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const playerGameId = player.GetEntityID() as unknown as gameStatsObjectID;
  const statPoolsSystem = mp.game.ScriptGameInstance.GetStatPoolsSystem();

  // RequestSettingStatPoolValueIgnoreChangeMode overrides regeneration or decay limits
  statPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(
    playerGameId,
    gamedataStatPoolType.Health,
    value,
    Object.assign(new mp.game.gameObject(), {}),
    false, // false = modify current health pool, not pool capacity
  );
}

/**
 * Sets maximum player health by removing previous modifiers and applying an additive modifier.
 * @param value New maximum health pool capacity
 */
export function setPlayerMaxHealth(value: number): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const playerGameId = player.GetEntityID() as unknown as gameStatsObjectID;
  const statsSystem = mp.game.ScriptGameInstance.GetStatsSystem();
  const statPoolsSystem = mp.game.ScriptGameInstance.GetStatPoolsSystem();

  // 1. Remove previous health modifiers from StatsSystem
  statsSystem.RemoveAllModifiers(
    playerGameId,
    gamedataStatType.Health,
    true,
  );

  // 2. Add new constant additive modifier
  const statMod = Object.assign(new mp.game.gameConstantStatModifierData_Deprecated(), {
    statType: gamedataStatType.Health,
    modifierType: gameStatModifierType.Additive,
    value,
  });
  statsSystem.AddModifier(playerGameId, statMod);

  // 3. Update StatPoolsSystem maximum pool ceiling (isMax = true)
  statPoolsSystem.RequestSettingStatPoolValueIgnoreChangeMode(
    playerGameId,
    gamedataStatPoolType.Health,
    value,
    Object.assign(new mp.game.gameObject(), {}),
    true, // true = set maximum capacity
  );
}

/**
 * Heals the player to maximum capacity.
 */
export function healPlayer(): void {
  setPlayerHealth(getPlayerMaxHealth());
}

/**
 * Toggles god mode (invulnerability + max health pool ceiling).
 */
export function enableGodMode(enable: boolean): void {
  if (enable) {
    setPlayerMaxHealth(99999999);
    setPlayerHealth(99999999);
    applyRestriction('BaseStatusEffect.Invulnerable');
  } else {
    removeRestriction('BaseStatusEffect.Invulnerable');
    setPlayerMaxHealth(300);
    setPlayerHealth(300);
  }
}
```

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

### Permanent Restriction Refresh System

Certain REDengine events (such as cutscenes, vehicle enters/exits, or scene transitions) can periodically strip gameplay restrictions. To guarantee persistence (e.g. infinite ammo or lobby locks), maintain a refresh timer:

```typescript
const permanentRestrictions = new Set<string>(['GameplayRestriction.InfiniteAmmo']);
let permanentIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Registers a gameplay restriction to re-apply every 10 seconds.
 */
export function addPermanentRestriction(effect: string): void {
  if (permanentRestrictions.has(effect)) return;
  permanentRestrictions.add(effect);
  applyRestriction(effect);
}

/**
 * Removes a permanent restriction and stops periodic re-application.
 */
export function removePermanentRestriction(effect: string): void {
  permanentRestrictions.delete(effect);
  removeRestriction(effect);
}

/**
 * Initializes the permanent restriction daemon.
 */
export function initPermanentRestrictions(): void {
  if (permanentIntervalId) return;

  permanentIntervalId = setInterval(() => {
    for (const effect of permanentRestrictions) {
      applyRestriction(effect);
    }
  }, 10_000);
}
```

### Standard Gameplay Restriction Catalog

| Restriction Constant | Engine Effect | Multiplayer Usage |
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
| `GameplayRestriction.NoPhotoMode` | Disables photo mode shortcut (prevents pausing engine) | Mandatory in all multiplayer servers |
| `GameplayRestriction.NoScanning` | Disables scanner HUD overlay | Competitive PvP anti-wallhack |
| `GameplayRestriction.InfiniteAmmo` | Unlimited ammo in loaded magazine | Freeroam arenas, deathmatch |
| `GameplayRestriction.VehicleCombatBlockExit` | Prevents player from exiting vehicle | Vehicle combat, derby, races |
| `GameplayRestriction.VehicleFPP` | Locks vehicle camera perspective to first-person | Cockpit-only racing, hardcore mode |
| `BaseStatusEffect.Invulnerable` | Complete immunity to all physical/thermal damage | God mode, spawn protection |

### Combat Status Effects & Damage-over-Time (DoT)

REDengine includes native status effects for combat damage-over-time (burning, chemical poison, EMP electrocution, and physical bleeding).

| Status Effect Constant | Effect Type | Multiplayer Usage |
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

```typescript
const activeTemporaryEffects = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Applies a temporary status effect (e.g. Burning or Electrocuted) to the target entity
 * with debounced automatic removal after the specified duration.
 *
 * @param player Target player entity
 * @param effectTdbId TweakDB record ID (e.g. 'BaseStatusEffect.Burning')
 * @param durationSec Duration in seconds
 */
export function applyTemporaryStatusEffect(
  player: mp.game.gameObject,
  effectTdbId: string,
  durationSec: number = 5,
): void {
  const effectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  if (!effectSystem || !player) return;

  const entityId = player.GetEntityID();
  const effectKey = `${entityId.hash}:${effectTdbId}`;

  // Debounce existing removal timer if effect is refreshed
  if (activeTemporaryEffects.has(effectKey)) {
    clearTimeout(activeTemporaryEffects.get(effectKey)!);
  }

  effectSystem.ApplyStatusEffect(entityId, effectTdbId, player.GetRecordID(), entityId);

  const timer = setTimeout(() => {
    activeTemporaryEffects.delete(effectKey);
    if (mp.game.StatusEffectHelper && player) {
      mp.game.StatusEffectHelper.RemoveStatusEffect(player, effectTdbId, undefined);
    }
  }, durationSec * 1000);

  activeTemporaryEffects.set(effectKey, timer);
}
```

---

## 4. Inventory & Equipment Spawning

Items are added to the player's inventory using `mp.game.AddToInventory(tdbId, count)`. Inventory verification is handled via REDengine's `TransactionSystem`.

### Inventory Inspection & Item Spawning

```typescript
import type { gameItemData } from '@cybermp/client-types/game';

/**
 * Gives an item to the local player by TweakDB ID.
 * @param itemKey Full item key (e.g. 'Items.Preset_Silverhand_3516')
 * @param count Quantity to add
 */
export function giveItem(itemKey: string, count: number = 1): void {
  mp.game.AddToInventory(itemKey, count);
  console.log(`[Inventory] Added ${count}x ${itemKey}`);
}

/**
 * Checks whether the player currently possesses an item in their inventory.
 */
export function hasItem(itemKey: string): boolean {
  const player = mp.game.GetPlayerObject();
  if (!player) return false;

  const transactionSystem = mp.game.ScriptGameInstance.GetTransactionSystem();
  const [, itemsList] = transactionSystem.GetItemList(player) as [boolean, gameItemData[]];

  const targetId = mp.game.gameItemID.FromTDBID(itemKey);
  return itemsList.some((item) => item.GetID().id === targetId.id);
}

/**
 * Equips cyberware implant into the player's cyberware slots by TweakDB identifier.
 */
export function equipCyberware(itemKey: string): void {
  const player = mp.game.GetPlayerObject();
  if (!player) return;

  if (!hasItem(itemKey)) {
    giveItem(itemKey, 1);
  }

  const eqSystem = mp.game.ScriptGameInstance.GetScriptableSystemsContainer().Get('EquipmentSystem');
  eqSystem.EquipCyberwareByTDBID(player, itemKey);
}
```

### Comprehensive Item & Equipment Catalog

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

CyberMP allows triggering Cyberpunk 2077's native character customization mirror anywhere in the world by intercepting the pause menu scenario (`MenuScenario_PauseMenu`) and switching it to `MenuScenario_CharacterCustomizationMirror`.

### Appearance Menu Controller

```typescript
import type {
  gameuiInGameMenuGameController,
  MenuScenario_PauseMenu,
} from '@cybermp/client-types/game';

let inGameMenuController: gameuiInGameMenuGameController | null = null;
let activePauseMenuScenario: MenuScenario_PauseMenu | null = null;
const pendingAppearanceRequests: Array<() => void> = [];

/**
 * Initializes pause menu interception.
 * Must be registered inside mp.game.onInit.
 */
export function initAppearanceHooks(): void {
  mp.game.onInit(() => {
    // 1. Grab reference to the global in-game menu controller
    mp.game.observeRaw(
      'gameuiInGameMenuGameController',
      'RegisterGlobalBlackboards',
      (self) => {
        inGameMenuController = self;
      },
    );

    // 2. Intercept pause menu entry and switch to character customization mirror
    mp.game.observeAfter(
      'MenuScenario_PauseMenu',
      'OnEnterScenario',
      (self) => {
        activePauseMenuScenario = self;
        const resolve = pendingAppearanceRequests.shift();
        if (resolve) {
          self.SwitchToScenario('MenuScenario_CharacterCustomizationMirror');
          resolve();
        }
      },
    );
  });
}

/**
 * Opens the character customization mirror UI.
 * Returns a promise that resolves once the scenario transition completes.
 */
export function openAppearanceMenu(): Promise<void> {
  if (!inGameMenuController) {
    return Promise.reject(new Error('InGameMenu controller is not initialized'));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = pendingAppearanceRequests.indexOf(resolve);
      if (idx !== -1) {
        pendingAppearanceRequests.splice(idx, 1);
        reject(new Error('Appearance menu open timed out'));
      }
    }, 2000);

    pendingAppearanceRequests.push(() => {
      clearTimeout(timeout);
      resolve();
    });

    // Spawns pause menu event, triggering our observeAfter hook
    inGameMenuController.SpawnMenuInstanceEvent('OnOpenPauseMenu');
  });
}

/**
 * Closes all active hub menus, pause menus, and mirrors.
 */
export function closeAllMenus(): void {
  const player = mp.game.GetPlayer();
  if (player) {
    // ForceCloseHubMenuEvent clears any stuck full-screen UI scenarios
    player.QueueEvent(Object.assign(new mp.game.ForceCloseHubMenuEvent(), {}));
  }

  if (activePauseMenuScenario) {
    activePauseMenuScenario.OnClosePauseMenu();
    activePauseMenuScenario = null;
  }
}
```

---

## 6. Invisibility & Gender

### Mesh Component Invisibility

In REDengine, the player character's visible body, head, hair, cyberware, and garments are rendered by `entIComponent` instances attached to the player entity. Toggling these components enables true client-side invisibility without breaking physics collisions or weapon firing:

```typescript
const disabledComponentNames = new Set<string>();

/**
 * Toggles mesh visibility for the local player entity.
 * @param invisible When true, turns off all active render components; when false, restores them.
 */
export function setPlayerInvisible(invisible: boolean): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const components = player.GetComponents();

  if (invisible) {
    for (const component of components) {
      if (!component.IsEnabled()) {
        continue;
      }
      disabledComponentNames.add(component.GetName());
      component.Toggle(false);
    }
    console.log(`[Player] Hidden ${disabledComponentNames.size} visual components`);
  } else {
    const componentsToRestore = components.filter((comp) =>
      disabledComponentNames.has(comp.GetName()),
    );

    for (const component of componentsToRestore) {
      component.Toggle(true);
    }
    disabledComponentNames.clear();
    console.log('[Player] Restored visual mesh components');
  }
}
```

### Gender Switching & Entity Reloading

Changing player gender is performed via `CharacterCustomizationSystem.SetPlayerGender`. Because REDengine binds specific skeletal rigs, voice profiles, and clothing geometry to gender, the player entity must be respawned after the gender change event fires:

```typescript
import { EPlayerGender } from '@cybermp/client-types/enums';

/**
 * Switches the player's gender (Male / Female).
 * Observes OnPlayerGenderChanged to safely re-spawn the player at their current location.
 */
export function setPlayerGender(gender: EPlayerGender): void {
  const customSystem = mp.game.ScriptGameInstance.GetCharacterCustomizationSystem();
  if (!customSystem) {
    console.error('[Gender] CharacterCustomizationSystem unavailable');
    return;
  }

  // SetPlayerGender(gender, bForceUpdate)
  customSystem.SetPlayerGender(gender, true);
}

/**
 * Registers lifecycle listener to re-spawn player upon gender change.
 * Should be called inside mp.game.onceGameLoaded.
 */
export function initGenderChangeObserver(): void {
  mp.game.observe(
    'gameuiICharacterCustomizationSystem',
    'OnPlayerGenderChanged',
    () => {
      const player = mp.game.GetPlayer();
      if (!player) return;

      const pos = player.GetWorldPosition();
      const yaw = mp.game.Quaternion.ToEulerAngles(player.GetWorldOrientation()).yaw;

      console.log('[Gender] Gender changed. Respawning player to apply skeleton updates...');
      spawnPlayer(pos.x, pos.y, pos.z, yaw);
    },
  );
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

To immobilize a player entity (e.g. during cinematic cutscenes, arena countdowns, or menu selection), combine movement restrictions with tick-based position lock:

```typescript
const FREEZE_STATUS_EFFECTS = [
  'GameplayRestriction.NoMovement',
  'GameplayRestriction.NoCombat',
  'GameplayRestriction.NoWeapons',
] as const;

let freezeTickId: number | null = null;
let frozenPosition: mp.game.Vector4 | null = null;

/**
 * Freezes or unfreezes the player in place.
 */
export function setPlayerFrozen(frozen: boolean): void {
  const effectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  const player = mp.game.GetPlayer();
  if (!player) return;

  if (frozen) {
    if (freezeTickId !== null) return;
    frozenPosition = player.GetWorldPosition();

    // Apply gameplay restrictions
    for (const effect of FREEZE_STATUS_EFFECTS) {
      effectSystem.ApplyStatusEffect(
        player.GetEntityID(),
        effect,
        player.GetRecordID(),
        player.GetEntityID(),
      );
    }

    freezeTickId = mp.setTick(() => {
      const p = mp.game.GetPlayerObject();
      if (!p || !frozenPosition) return;
      mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(
        p,
        frozenPosition,
        mp.game.Quaternion.ToEulerAngles(p.GetWorldOrientation()),
      );
    });
  } else {
    if (freezeTickId !== null) {
      mp.clearTick(freezeTickId);
      freezeTickId = null;
    }
    frozenPosition = null;

    // Remove gameplay restrictions
    for (const effect of FREEZE_STATUS_EFFECTS) {
      mp.game.StatusEffectHelper.RemoveStatusEffect(player, effect, undefined);
    }
  }
}
```

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

When a player entity enters a ragdoll or knockdown state (e.g. after health drops to 0 and is revived, or after being hit by high-speed vehicles), REDengine's ragdoll animation state may fail to recover automatically. 

The engine-tested method to force the skeletal controller back into an upright standing posture is to pulse the `SwimmingData` animation feature:

```typescript
/**
 * Forces a downed or ragdolled player puppet to immediately stand back up.
 */
export async function forcePlayerStandUp(): Promise<void> {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const animController = player.GetAnimationControllerComponent();
  if (!animController) return;

  // 1. Transition into swimming animation state (forces ragdoll termination)
  const animFeature = Object.assign(new mp.game.AnimFeature_SwimmingData(), {
    state: 1,
  });
  animController.ApplyFeature('SwimmingData', animFeature);

  // 2. Short frame delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 3. Reset swimming state to 0 (restores normal standing idle)
  animFeature.state = 0;
  animController.ApplyFeature('SwimmingData', animFeature);
}
```
