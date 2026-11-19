# Design Specification: cybermp-agent-kit v1.1.0 Comprehensive Enhancements

**Date:** 2026-11-20  
**Target Repository:** `/Users/user/cybermp-mcp` (`cybermp-agent-kit`)  
**Target Version:** `1.1.0`  
**Status:** In Review (Updated with Full Native REDengine Mechanics Suite)

---

## 1. Context & Objectives

Based on the developer plugin analysis reports (`cybermp-plugin-analysis-report.md`, `cybermp_plugin_issues_and_fixes_report.md`) and requirements for comprehensive coverage of native REDengine systems in multiplayer CyberMP resources, this specification outlines the complete architectural overhaul and expansion for **`cybermp-agent-kit` v1.1.0**.

### Core Goals
1. **MCP Tool Ergonomics & Normalization:**
   - Eliminate calling friction in `cybermp_get_rpc_flow` (`flow`, `source`/`target`, legacy `from`/`to`).
   - Eliminate calling friction in `cybermp_get_type` (`type_name`, `typeName`, `type`, legacy `name`).
2. **Granular Section Search in `cybermp_search_docs`:**
   - Chunk markdown documents into section-level records (`## `, `### `).
   - Return exact heading URLs (`file#heading-slug`) and contextual code snippets belonging to the matched section, eliminating irrelevant snippets (e.g. `createVector3` for `"burning"`).
3. **New Tool: `cybermp_lookup_tweakdb`:**
   - Offline, fast search for verified Cyberpunk 2077 TweakDB IDs across Combat DoTs, Weapons, Vehicles, Clothing, and Quickhacks.
4. **Comprehensive Suite of Native REDengine Mechanics & Recipes:**
   - **World Interaction:** Authentic native Cyberpunk HUD `[F]` prompts (`SendInputHintData`) + 3D markers (`MappinSystem`).
   - **Doors & Devices:** Unlocking and manipulating doors, gates, terminals, and interior access (`DoorControllerPS`).
   - **Object Spawning & Streaming:** Local props (`mp.local.spawnObject`), server props (`mp.objects.create`), curated `.ent` depot paths, and interior streaming.
   - **Animations & Workspots:** Native sitting, smoking, leaning, drinking, and emotes (`gameWorkspotGameSystem`).
   - **Vehicles, Tuning & Combat:** Controlling hood, trunk, doors, headlights, engine, CrystalCoat shaders, body stripping, and Vehicle Combat 2.0 (drive-by & mounted weapons).
   - **Player Status Effects:** Combat DoTs (thermal, EMP, chemical, physical) and debounced `applyTemporaryStatusEffect`.

---

## 2. Architecture & File Structure

```text
cybermp-mcp/
├── src/
│   ├── data/
│   │   ├── events.json                      # Platform events AST
│   │   ├── types.json                       # Client & server types AST
│   │   ├── guides.json                      # Granular section-indexed guides
│   │   └── tweakdb.json                     # [NEW] Curated TweakDB ID records
│   ├── engine/
│   │   ├── rpc-engine.ts                    # Updated flow normalization
│   │   ├── types-engine.ts                  # Updated type argument normalization
│   │   ├── docs-engine.ts                   # Granular section search & contextual snippets
│   │   └── tweakdb-engine.ts                # [NEW] Fast TweakDB search & category filtering
│   ├── tools/
│   │   ├── get-rpc-flow.ts                  # Updated schema & handler
│   │   ├── get-type.ts                      # Updated schema & handler
│   │   ├── search-docs.ts                   # Updated section-level results
│   │   ├── lookup-tweakdb.ts                # [NEW] MCP tool for TweakDB queries
│   │   └── index.ts                         # Tool registry
│   └── index.ts
├── scripts/
│   └── build-index.ts                       # Section-level markdown parser & indexer
├── skills/
│   └── cybermp-dev/
│       ├── SKILL.md                         # Updated tool listing & recipes link
│       └── references/
│           ├── player-mechanics.md          # DoT status effects & applyTemporaryStatusEffect
│           ├── game-natives.md              # Core engine systems & device caveats
│           ├── doors-and-devices.md         # [NEW] Doors, locks, terminals, interior access
│           ├── object-spawning-and-streaming.md # [NEW] Props, depot paths, interior streaming
│           ├── animations-and-workspots.md  # [NEW] Workspots (sit, smoke, lean), emotes
│           ├── vehicles-tuning-combat.md    # [NEW] Hood, trunk, headlights, engine, combat
│           └── recipes/
│               └── world-interaction.md     # [NEW] Native [F] prompt & Mappin recipe
├── templates/
│   └── rules/
│       └── AGENTS.md                        # Updated MCP tool catalog & constraints
└── tests/
    ├── rpc-engine.test.ts                   # Argument normalization tests
    ├── types-engine.test.ts                 # Type alias tests
    ├── docs-engine.test.ts                  # Section search & snippet tests
    └── tweakdb-engine.test.ts               # [NEW] TweakDB lookup tests
```

---

## 3. Detailed Technical Design

### 3.1. MCP Tools Normalization & `cybermp_lookup_tweakdb`

#### 3.1.1. `cybermp_get_rpc_flow`
- **Schema Updates:**
  - `flow?: string` (e.g. `"server-client"`, `"client->cef"`, `"cef_to_server"`).
  - `source?: string` and `target?: string` as synonyms for `from` and `to`.
  - Backward compatible with `from?: string` and `to?: string`.
- **Parsing Logic:**
  ```typescript
  export function parseRpcFlowArgs(args: Record<string, any>): { from: string; to: string } {
    let from = args.from || args.source;
    let to = args.to || args.target;

    if (typeof args.flow === 'string') {
      const parts = args.flow.toLowerCase().split(/[-_>:]+/).filter(Boolean);
      if (parts.length >= 2) {
        from = from || parts[0];
        to = to || parts[1];
      }
    }

    return { from: normalizeEndpoint(from), to: normalizeEndpoint(to) };
  }
  ```

#### 3.1.2. `cybermp_get_type`
- **Schema Updates:**
  - Accept `name?: string`, `type_name?: string`, `typeName?: string`, `type?: string`.
- **Parsing Logic:**
  ```typescript
  export function resolveTypeName(args: Record<string, any>): string {
    const raw = args.name || args.type_name || args.typeName || args.type;
    if (!raw || typeof raw !== 'string') {
      throw new Error("Missing required argument: 'name' or 'type_name'");
    }
    return raw.trim();
  }
  ```

#### 3.1.3. New Tool: `cybermp_lookup_tweakdb`
- **Purpose:** Instant offline resolution of verified TweakDB IDs for CyberMP resources.
- **Categories:** `"status_effects"`, `"weapons"`, `"vehicles"`, `"clothing"`, `"quickhacks"`, `"all"`.
- **Data Source (`src/data/tweakdb.json`):**
  Curated records containing:
  - DoTs: `BaseStatusEffect.Burning`, `BaseStatusEffect.Electrocuted`, `BaseStatusEffect.Poisoned`, `BaseStatusEffect.Bleeding`.
  - Armed Vehicles: `Vehicle.v_sport1_quadra_turbo_r_player`, `Vehicle.v_sport2_mizutani_shion_nomad_player`, `Vehicle.v_utility4_militech_hellhound_player`.
  - Weapons: Iconic pistols, rifles, shotguns, katanas.
  - Workspot animation records.

---

### 3.2. Granular Documentation Search Engine

#### 3.2.1. Markdown Section Chunking (`scripts/build-index.ts`)
1. Parses markdown at `## ` and `### ` headers.
2. Generates section items:
   ```typescript
   export interface DocSection {
     id: string;              // e.g. "player-mechanics#combat-status-effects"
     guideTitle: string;      // e.g. "Player Mechanics & Health Systems"
     sectionTitle: string;    // e.g. "Combat Status Effects & Elemental Debuffs"
     slug: string;            // e.g. "references/player-mechanics.md#combat-status-effects"
     category: string;        // e.g. "references"
     content: string;         // Section markdown body
     plainText: string;       // Clean text for MiniSearch
     codeSnippets: string[];  // Code blocks belonging strictly to this section
   }
   ```

#### 3.2.2. Contextual Search Results (`src/engine/docs-engine.ts`)
- Searches against `plainText`, `sectionTitle`, and `guideTitle`.
- Returns `title` (`guideTitle -> sectionTitle`), `url` (`slug`), snippet from matching lines, and `codeSnippet` (first code snippet of that specific section).
- Eliminates document-level default snippets (`createVector3`).

---

### 3.3. Complete Suite of Native REDengine Guides & Recipes

#### 3.3.1. `recipes/world-interaction.md` (Native Interaction on [F])
- **Native HUD Input Hint:**
  ```typescript
  import { InputHintData } from '@cybermp/client-types/game';

  let activeHint: InputHintData | null = null;

  export function showNativeInteractionPrompt(label: string, show: boolean): void {
    if (show) {
      if (!activeHint) {
        activeHint = Object.assign(new mp.game.InputHintData(), {
          action: 'ChoiceApply',      // Native REDengine binding for [F]
          source: 'WorldInteraction',
          localizedLabel: label,
          queuePriority: 1,
          sortingPriority: 1,
        });
      }
      mp.game.SendInputHintData(true, activeHint);
    } else if (activeHint) {
      mp.game.SendInputHintData(false, activeHint);
      activeHint = null;
    }
  }
  ```
- **In-World 3D Marker:** `MappinSystem.RegisterMappin` with `gamedataMappinVariant.UseVariant`.
- **Key Event:** `onInputKeyEvent` catching `EInputAction.IACT_Press` & `EInputKey.IK_F`.
- **Caveat:** Never trigger singleplayer device cutscenes (`SwitchToScenario`).

#### 3.3.2. `references/doors-and-devices.md` (Doors, Locks & Terminals)
- **Manipulating Doors via `DoorControllerPS`:**
  ```typescript
  import type { Door } from '@cybermp/client-types/game';

  export function setDoorOpened(door: Door, open: boolean): void {
    const ps = door.GetPS();
    if (!ps) return;
    const action = open ? ps.ActionSetOpened() : ps.ActionSetClosed();
    door.ExecuteDeviceAction(action);
  }

  export function toggleDoorLock(door: Door): void {
    const ps = door.GetPS();
    if (!ps) return;
    door.ExecuteDeviceAction(ps.ActionToggleLock());
  }
  ```
- Unlocking locked buildings (bars, clubs, clinics) in vanilla Night City by toggling their door device state.

#### 3.3.3. `references/object-spawning-and-streaming.md` (Props & Interiors)
- **Server vs Client Spawning:**
  - Network-synchronized: `mp.objects.create(modelHash, pos, rot)`.
  - Client-local REDengine entity: `mp.local.spawnObject(depotPath, pos, rot)`.
- **Curated Depot Paths:**
  - Roadblocks & fences: `base\gameplay\devices\fences\...`
  - Street signs & neon: `base\gameplay\devices\street_signs\...`
  - Furniture & seating: `base\environment\decoration\furniture\...`
- **Interior Streaming:**
  - Teleportation with `GetTeleportationFacility().Teleport(player, pos, rot)`.
  - Handling occluders and door states to prevent void falling.

#### 3.3.4. `references/animations-and-workspots.md` (Workspots & Emotes)
- **Interactive Workspots via `gameWorkspotGameSystem`:**
  ```typescript
  import type { gameObject } from '@cybermp/client-types/game';

  const workspotSystem = mp.game.ScriptGameInstance.GetWorkspotSystem();

  // Sit on chair / bench / bar stool
  export function enterWorkspot(seatObject: gameObject, player: gameObject): void {
    workspotSystem.PlayInDeviceSimple(seatObject, player, true);
  }

  // Graceful or fast exit
  export function exitWorkspot(player: gameObject, instant = false): void {
    if (instant) {
      workspotSystem.SendFastExitSignal(player);
    } else {
      workspotSystem.SendSlowExitSignal(player);
    }
  }
  ```
- Catalog of workspot animations: sitting, smoking, leaning, drinking, dancing.

#### 3.3.5. `references/vehicles-tuning-combat.md` (Vehicles Suite)
- **Doors, Hood & Trunk Control:**
  ```typescript
  import { vehicleEVehicleDoor, vehicleVehicleDoorState } from '@cybermp/client-types/enums';
  import type { vehicleBaseObject } from '@cybermp/client-types/game';

  export function setVehicleDoorState(vehicle: vehicleBaseObject, door: vehicleEVehicleDoor, open: boolean): void {
    const ps = vehicle.GetVehiclePS()?.vehicleControllerPS;
    if (!ps) return;
    ps.SetDoorState(door, open ? vehicleVehicleDoorState.Open : vehicleVehicleDoorState.Closed, false);
  }
  // door: hood (5), trunk (4), seat_front_left (0), seat_front_right (1)
  ```
- **Windows:** `ps.SetWindowState(door, vehicleEVehicleWindowState.Open / Closed)`.
- **Headlights & Lights:** `controller.ToggleLights(true, vehicleELightType.Head)`, `ps.SetHeadLightMode(vehicleELightMode.HighBeams)`.
- **Engine & Sirens:** `vehicle.TurnEngineOn(bool)`, `vehicle.ToggleSiren(bool)`, `vehicle.ToggleHorn(bool)`.
- **CrystalCoat & Tuning:** `vehicle.PlayVehicleVisualCustomizationShader(true, false, true)` with fact `'vvc_visual_customization_unlocked'`.
- **Body Detaching:** `vehicle.DetachPart('hood')`, `vehicle.DetachAllParts()`.
- **Vehicle Combat 2.0:**
  - Armed vehicles: `IsArmedVehicle()`, `MountedPowerWeapon`, `MountedMissileLauncher`.
  - Drive-by window shooting: `isInWindowCombat`, automatic window lowering.

#### 3.3.6. `references/player-mechanics.md` (Combat DoTs & Helper)
- Table of status effects: `BaseStatusEffect.Burning`, `BaseStatusEffect.Electrocuted`, `BaseStatusEffect.Poisoned`, `BaseStatusEffect.Bleeding`.
- Helper: `applyTemporaryStatusEffect(player, effectTdbId, durationSec)` with debouncing.

---

## 4. Testing & Verification Plan

### 4.1. Unit & Engine Tests (`vitest`)
1. **`tests/rpc-engine.test.ts`:**
   - Test `flow: "server-client"`, `flow: "client->cef"`, `flow: "cef_server"`.
   - Test `source: "server", target: "client"`.
   - Test legacy `from: "server", to: "client"`.
2. **`tests/types-engine.test.ts`:**
   - Test `type_name: "MpPlayer"`, `typeName: "MpPlayer"`, `type: "MpPlayer"`, `name: "MpPlayer"`.
3. **`tests/docs-engine.test.ts`:**
   - Test searching `"burning"` returns `references/player-mechanics.md#combat-status-effects` and `applyTemporaryStatusEffect`.
   - Test searching `"interaction prompt"` returns `recipes/world-interaction.md` with `SendInputHintData`.
   - Test searching `"hood"` or `"vehicle door"` returns `references/vehicles-tuning-combat.md`.
   - Test searching `"workspot"` returns `references/animations-and-workspots.md`.
4. **`tests/tweakdb-engine.test.ts`:**
   - Test category filtering (`status_effects`, `weapons`, `vehicles`).
   - Test text queries and empty/invalid input handling.

### 4.2. Build & Packaging Verification
- `pnpm run build:index`: Generate updated `dist/data/*.json`.
- `pnpm run build`: Zero TypeScript compilation errors.
- `pnpm test`: 100% test pass rate across all suites.

---

## 5. Release & Deployment Strategy

1. **Version Bump:** `1.1.0` in `package.json`.
2. **Git Commit & Tag:** Tag `v1.1.0`.
3. **npm Publishing:** Run `npm publish` via configured trusted publishing / token workflow.
4. **Local IDE Sync:** Verify plugin sync in IDE.
