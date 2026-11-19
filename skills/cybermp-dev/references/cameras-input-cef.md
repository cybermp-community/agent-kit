# Camera, Input & CEF Reference

This reference covers low-level REDengine camera manipulation, detached free camera spawning, multi-target spectator systems, direct keyboard hardware input capturing, and Chromium Embedded Framework (CEF) focus/cursor management in CyberMP client scripts (`use_game_natives = true`).

> [!IMPORTANT]
> All code in this reference is procedural TypeScript utilizing direct `mp.game.*`, `mp.network.*`, `mp.local.*`, `mp.cef.*`, and `mp.events.*` runtime bindings. REDengine native classes require property instantiation via `Object.assign(new mp.game.<Type>(), { ... })`. No dependency injection containers or decorators are used.

---

## 1. Dynamic Camera Field of View (FOV)

Cyberpunk 2077 manages camera perspective across two distinct pipelines:
- **First-Person Perspective (FPP)**: Handled directly through the local player's `gameFPPCameraComponent` via `player.GetFPPCameraComponent()`.
- **Third-Person Perspective (TPP)**: Used while driving vehicles, managed by `vehicleTPPCameraComponent` attached to the player or vehicle entity.

### FPP vs TPP Camera Components

| Perspective | REDengine Component | Access Method | Typical Default FOV |
|---|---|---|---|
| First-Person (On-Foot) | `gameFPPCameraComponent` | `mp.game.GetPlayer().GetFPPCameraComponent()` | 60° – 80° |
| Third-Person (Vehicle) | `vehicleTPPCameraComponent` | Search `player.GetComponents()` for `IsA('vehicleTPPCameraComponent')` | 70° – 85° |

### FPP FOV Manipulation

Setting the on-foot FOV is direct and takes effect immediately:

```typescript
import type { gameFPPCameraComponent } from '@cybermp/client-types/game';

/**
 * Retrieves the local player's first-person camera component.
 */
export function getFppCamera(): gameFPPCameraComponent | null {
  const player = mp.game.GetPlayer();
  if (!player) {
    return null;
  }
  return player.GetFPPCameraComponent();
}

/**
 * Sets the first-person perspective Field of View (FOV).
 * @param fov Target field of view in degrees (e.g. 80).
 */
export function setFppFov(fov: number): void {
  const fppCam = getFppCamera();
  if (fppCam) {
    fppCam.SetFOV(fov);
  }
}

/**
 * Gets the current first-person perspective FOV.
 */
export function getFppFov(): number {
  const fppCam = getFppCamera();
  return fppCam ? fppCam.GetFOV() : 80;
}
```

### TPP Vehicle Camera FOV & Smooth Interpolation (`mp.game.LerpF`)

When operating vehicles, the camera switches to third-person. You can locate `vehicleTPPCameraComponent` by enumerating player components, and use `mp.game.LerpF` to smoothly interpolate FOV changes (e.g., speed zoom or nitro effects):

```typescript
import type { vehicleTPPCameraComponent } from '@cybermp/client-types/game';

let activeTppCamera: vehicleTPPCameraComponent | null = null;
let currentTppFov = 75;
let baseTppFov = 75;
let fovLerpInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Locates the vehicle third-person camera component among the player's active components.
 */
export function getTppCamera(): vehicleTPPCameraComponent | null {
  const player = mp.game.GetPlayer();
  if (!player) {
    return null;
  }

  const components = player.GetComponents();
  for (const comp of components) {
    if (comp.IsA('vehicleTPPCameraComponent')) {
      activeTppCamera = comp as vehicleTPPCameraComponent;
      return activeTppCamera;
    }
  }

  return null;
}

/**
 * Sets the vehicle TPP camera FOV immediately.
 * @param fov Target field of view in degrees.
 */
export function setTppFov(fov: number): void {
  const tppCam = getTppCamera();
  if (tppCam) {
    tppCam.SetFOV(fov);
    currentTppFov = fov;
  }
}

/**
 * Smoothly transitions the vehicle TPP FOV using REDengine linear interpolation (mp.game.LerpF).
 * @param targetFov Target FOV to interpolate toward.
 * @param lerpRate Interpolation rate factor (0.01 to 0.3, default 0.1).
 */
export function interpolateTppFov(targetFov: number, lerpRate = 0.1): void {
  if (fovLerpInterval) {
    clearInterval(fovLerpInterval);
    fovLerpInterval = null;
  }

  fovLerpInterval = setInterval(() => {
    const tppCam = getTppCamera();
    if (!tppCam) {
      if (fovLerpInterval) {
        clearInterval(fovLerpInterval);
        fovLerpInterval = null;
      }
      return;
    }

    // REDengine native LerpF signature: (rate, currentVal, targetVal)
    currentTppFov = Number(mp.game.LerpF(lerpRate, currentTppFov, targetFov).toFixed(4));
    tppCam.SetFOV(currentTppFov);

    // Stop once within 0.05 threshold
    if (Math.abs(currentTppFov - targetFov) < 0.05) {
      tppCam.SetFOV(targetFov);
      currentTppFov = targetFov;
      if (fovLerpInterval) {
        clearInterval(fovLerpInterval);
        fovLerpInterval = null;
      }
    }
  }, 16);
}
```

---

## 2. Free Camera Entity Spawning (`simple_free_camera.ent`)

CyberMP provides detached camera functionality by spawning an instance of REDengine's `base\entities\cameras\simple_free_camera.ent`. Spawning is performed client-side using `mp.local.spawnObject`, and the camera view is taken over by activating the entity's `gameCameraComponent`.

### Lifecycle Diagram

```
1. Resolve Hash:
   redResourceReferenceScriptToken.GetHash('base\\entities\\cameras\\simple_free_camera.ent')
      ↓
2. Spawn Local Object:
   mp.local.spawnObject(cameraHash, 0, x, y, z, roll, pitch, yaw, false)
      ↓
3. Find Spawned Entity:
   ScriptGameInstance.FindEntityByID(entityId)
      ↓
4. Activate Camera:
   cameraComponent.Activate(0, false)
      ↓
5. Deactivate & Despawn:
   cameraComponent.Deactivate(0, false) -> mp.local.despawnObject(hash)
```

### Free Camera Implementation

```typescript
import type {
  EulerAngles,
  entEntity,
  gameCameraComponent,
  Vector3,
} from '@cybermp/client-types/game';

let cachedFreeCameraHash: number | null = null;
let activeFreeCameraObjId: number | null = null;
let activeFreeCameraComp: gameCameraComponent | null = null;

/**
 * Initializes and caches the resource hash for the engine's free camera entity.
 */
export function getFreeCameraHash(): number {
  if (cachedFreeCameraHash === null) {
    cachedFreeCameraHash = mp.game.redResourceReferenceScriptToken.GetHash(
      'base\\entities\\cameras\\simple_free_camera.ent',
    );
  }
  return cachedFreeCameraHash;
}

export interface FreeCameraTransform {
  position: { x: number; y: number; z: number };
  rotation?: { roll: number; pitch: number; yaw: number };
}

/**
 * Creates and activates a free camera entity at the specified world position and rotation.
 * @param transform Coordinates and rotation for initial placement.
 * @returns The local object ID of the spawned camera entity.
 */
export function createFreeCamera(transform: FreeCameraTransform): number {
  // Despawn existing free camera if one is currently active
  if (activeFreeCameraObjId !== null) {
    destroyFreeCamera();
  }

  const cameraHash = getFreeCameraHash();
  const { position, rotation = { roll: 0, pitch: 0, yaw: 0 } } = transform;

  // Spawn the entity locally via mp.local
  activeFreeCameraObjId = mp.local.spawnObject(
    cameraHash,
    0, // appHash
    position.x,
    position.y,
    position.z,
    rotation.roll,
    rotation.pitch,
    rotation.yaw,
    false, // streaming
  );

  // Look up the spawned entity in REDengine
  const entityID = Object.assign(new mp.game.entEntityID(), {
    hash: activeFreeCameraObjId,
  });

  const cameraEntity = mp.game.ScriptGameInstance.FindEntityByID(entityID) as entEntity | null;
  if (cameraEntity) {
    const comp = cameraEntity.FindComponentByName('camera') as gameCameraComponent | null;
    if (comp) {
      activeFreeCameraComp = comp;
      activeFreeCameraComp.Activate(0, false);
    }
  }

  return activeFreeCameraObjId;
}

/**
 * Deactivates and despawns the active free camera, restoring player view.
 */
export function destroyFreeCamera(): void {
  if (activeFreeCameraComp) {
    activeFreeCameraComp.Deactivate(0, false);
    activeFreeCameraComp = null;
  }

  if (activeFreeCameraObjId !== null) {
    mp.local.despawnObject(activeFreeCameraObjId);
    activeFreeCameraObjId = null;
  }

  // Restore the local player's primary camera
  const playerCam = mp.game.GetPlayer()?.FindComponentByName('camera') as gameCameraComponent | null;
  playerCam?.Activate(0, false);
}
```

---

## 3. Spectator System (`spectateCamera`)

CyberMP spectator mode enables spectating other players by binding to their pre-attached `spectateCamera` component.

### Architecture Overview

1. **Network to Game Entity**: Retrieve the game entity ID with `mp.network.getPlayerGameId(targetNetworkId)`.
2. **Entity Attachment**: Locate `targetEntity.FindComponentByName('spectateCamera')`.
3. **Adaptive Offsets**: Apply different local offsets depending on whether the target is on foot or inside a vehicle (`mp.game.GetMountedVehicle`).
4. **Spectator Metadata & Restrictions**: Broadcast spectator status via `mp.meta.setPlayerMeta` and apply gameplay restrictions so the spectator doesn't interfere with the world.

### Camera Offset Matrix

| Target State | Local Camera Offset (`x, y, z, w`) | FOV | Description |
|---|---|---|---|
| **On-Foot** | `{ x: 0, y: -2, z: 2, w: 0 }` | `80°` | Slightly above and behind the player's shoulders |
| **In-Vehicle** | `{ x: 0, y: -5, z: 2, w: 0 }` | `80°` | Pulled further back to keep entire vehicle visible |

### Spectator Controller Implementation

```typescript
import type {
  gameCameraComponent,
  gameObject,
  Vector4,
} from '@cybermp/client-types/game';

interface SpectatorState {
  spectatingPlayerId: number | null;
  cameraComponent: gameCameraComponent | null;
  tickIntervalId: ReturnType<typeof setInterval> | null;
  initialPlayerPosition: Vector4 | null;
}

const ON_FOOT_OFFSET = { x: 0, y: -2, z: 2, w: 0 };
const IN_VEHICLE_OFFSET = { x: 0, y: -5, z: 2, w: 0 };
const SPECTATOR_FOV = 80;

const state: SpectatorState = {
  spectatingPlayerId: null,
  cameraComponent: null,
  tickIntervalId: null,
  initialPlayerPosition: null,
};

const RESTRICTIONS = [
  'GameplayRestriction.NoMovement',
  'GameplayRestriction.NoCombat',
  'GameplayRestriction.NoWeapons',
];

/**
 * Applies or removes gameplay restrictions for spectator mode.
 */
function setSpectatorRestrictions(apply: boolean): void {
  const statusEffectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  const player = mp.game.GetPlayer();
  if (!statusEffectSystem || !player) {
    return;
  }

  const playerId = player.GetEntityID();
  for (const restriction of RESTRICTIONS) {
    const recordId = Object.assign(new mp.game.TweakDBID(), { hash: restriction });
    if (apply) {
      statusEffectSystem.ApplyStatusEffect(playerId, recordId);
    } else {
      statusEffectSystem.RemoveStatusEffect(playerId, recordId);
    }
  }
}

/**
 * Configures the spectate camera on the target entity.
 */
function setupSpectateCamera(targetNetworkId: number): boolean {
  const gameId = mp.network.getPlayerGameId(targetNetworkId);
  if (!gameId) {
    return false;
  }

  const entityID = Object.assign(new mp.game.entEntityID(), { hash: gameId });
  const targetEntity = mp.game.ScriptGameInstance.FindEntityByID(entityID);
  if (!targetEntity) {
    return false;
  }

  const cameraComp = targetEntity.FindComponentByName('spectateCamera') as gameCameraComponent | null;
  if (!cameraComp) {
    return false;
  }

  state.cameraComponent = cameraComp;
  state.cameraComponent.SetLocalPosition(ON_FOOT_OFFSET);
  state.cameraComponent.SetFOV(SPECTATOR_FOV);
  state.cameraComponent.Activate(0, false);
  return true;
}

/**
 * Periodic tick checking target state and updating vehicle vs on-foot camera distance.
 */
function onSpectatorTick(): void {
  if (state.spectatingPlayerId === null) {
    stopSpectating();
    return;
  }

  // Ensure target is still connected and not spectating someone else
  if (mp.meta.getPlayerMeta(state.spectatingPlayerId, 'spectating')) {
    stopSpectating();
    return;
  }

  const gameId = mp.network.getPlayerGameId(state.spectatingPlayerId);
  if (!gameId) {
    return;
  }

  const entityID = Object.assign(new mp.game.entEntityID(), { hash: gameId });
  const targetEntity = mp.game.ScriptGameInstance.FindEntityByID(entityID);
  if (!targetEntity) {
    return;
  }

  if (!state.cameraComponent) {
    setupSpectateCamera(state.spectatingPlayerId);
    return;
  }

  // Check if target is inside a vehicle
  const mountedVehicle = mp.game.GetMountedVehicle(targetEntity as gameObject);
  const targetOffset = mountedVehicle ? IN_VEHICLE_OFFSET : ON_FOOT_OFFSET;
  const currentPos = state.cameraComponent.GetLocalPosition();

  if (
    currentPos.x !== targetOffset.x ||
    currentPos.y !== targetOffset.y ||
    currentPos.z !== targetOffset.z
  ) {
    state.cameraComponent.SetLocalPosition(targetOffset);
  }
}

/**
 * Begins spectating a networked player by network ID.
 * @param targetNetId Network ID of the target player.
 */
export function startSpectating(targetNetId: number): boolean {
  const localPlayerNetId = mp.network.getPlayerId(1);
  if (targetNetId === localPlayerNetId) {
    return false;
  }

  // If already spectating, clean up previous session
  if (state.spectatingPlayerId !== null) {
    stopSpectating();
  }

  const localPlayer = mp.game.GetPlayer();
  if (localPlayer) {
    state.initialPlayerPosition = localPlayer.GetWorldPosition();
  }

  state.spectatingPlayerId = targetNetId;

  // Apply spectator state
  setSpectatorRestrictions(true);
  setupSpectateCamera(targetNetId);

  // Synchronize spectator metadata to server and other clients
  mp.meta.setPlayerMeta(localPlayerNetId, 'spectating', true, true);

  // Start update tick (100ms)
  state.tickIntervalId = setInterval(onSpectatorTick, 100);
  return true;
}

/**
 * Stops spectating and restores local player camera and control.
 */
export function stopSpectating(): void {
  if (state.tickIntervalId !== null) {
    clearInterval(state.tickIntervalId);
    state.tickIntervalId = null;
  }

  state.spectatingPlayerId = null;

  // Restore local camera
  const localPlayer = mp.game.GetPlayer();
  if (localPlayer) {
    const cam = localPlayer.FindComponentByName('camera') as gameCameraComponent | null;
    cam?.Activate(0, false);
  }
  state.cameraComponent = null;

  // Remove restrictions
  setSpectatorRestrictions(false);

  // Clear spectator metadata
  const localPlayerNetId = mp.network.getPlayerId(1);
  mp.meta.setPlayerMeta(localPlayerNetId, 'spectating', false, true);
}
```

---

## 4. Direct Key Input Handling (`onInputKeyEvent`)

CyberMP exposes raw engine keyboard and gamepad input through `mp.game.onInputKeyEvent`. This listener triggers whenever a key is pressed, repeated, or released.

### Input Enums

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';
```

- `EInputAction.IACT_Press` (0): Key was just pressed down.
- `EInputAction.IACT_Release` (1): Key was released.
- `EInputKey`: Key identifiers (e.g. `IK_F1` .. `IK_F12`, `IK_Escape`, `IK_Tab`, `IK_Space`, `IK_W`, `IK_A`, `IK_S`, `IK_D`).

### Key Listener & Binding Manager

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

type KeyActionCallback = (action: EInputAction) => void;

const pressedKeys = new Set<EInputKey>();
const keyBindings = new Map<EInputKey, Set<KeyActionCallback>>();

let isInputInitialized = false;

/**
 * Initializes the global hardware input listener.
 */
export function initInputManager(): void {
  if (isInputInitialized) {
    return;
  }
  isInputInitialized = true;

  mp.game.onInputKeyEvent((action: EInputAction, key: EInputKey) => {
    // 1. Maintain active pressed keys set
    if (action === EInputAction.IACT_Press) {
      pressedKeys.add(key);
    } else if (action === EInputAction.IACT_Release) {
      pressedKeys.delete(key);
    }

    // 2. Dispatch registered callbacks for this key
    const callbacks = keyBindings.get(key);
    if (callbacks && callbacks.size > 0) {
      for (const cb of callbacks) {
        cb(action);
      }
    }
  });
}

/**
 * Checks whether a key is currently held down.
 */
export function isKeyPressed(key: EInputKey): boolean {
  return pressedKeys.has(key);
}

/**
 * Binds a callback function to a specific hardware input key.
 * @returns Cleanup unbind function.
 */
export function bindKey(key: EInputKey, callback: KeyActionCallback): () => void {
  initInputManager();

  if (!keyBindings.has(key)) {
    keyBindings.set(key, new Set());
  }
  keyBindings.get(key)!.add(callback);

  return () => {
    unbindKey(key, callback);
  };
}

/**
 * Unbinds a registered callback function from a key.
 */
export function unbindKey(key: EInputKey, callback: KeyActionCallback): void {
  const callbacks = keyBindings.get(key);
  if (callbacks) {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      keyBindings.delete(key);
    }
  }
}
```

### Usage Example: Toggle UI on Key Release

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

bindKey(EInputKey.IK_F6, (action) => {
  if (action === EInputAction.IACT_Release) {
    // Toggle menu or scoreboard
    toggleCustomMenu();
  }
});
```

---

## 5. CEF Browser Integration (`mp.cef`)

CyberMP embeds Chromium Embedded Framework (CEF) for rendering HTML5, CSS, and modern JavaScript user interfaces (menus, HUDs, chat windows, and scoreboards).

### Browser Focus & Cursor Management

| Function | Signature | Purpose |
|---|---|---|
| `mp.cef.setFocus` | `(focus: boolean, cursor?: boolean) => void` | Sets whether keyboard inputs are routed into the web page (`focus = true`) and displays the mouse cursor (`cursor = true`). |
| `mp.cef.isInFocus` | `() => boolean` | Returns `true` if the web view currently owns active keyboard input focus. |
| `mp.cef.setUrl` | `(url: string) => void` | Navigates the web frame to a local asset or remote URL (e.g. Vite dev server). |

### Focus Control Pattern

```typescript
let isMenuOpen = false;

/**
 * Controls browser focus and mouse cursor visibility.
 * @param focus Pass keyboard focus into the browser interface.
 * @param cursor Show and unlock the OS mouse pointer.
 */
export function setBrowserFocus(focus: boolean, cursor = false): void {
  mp.cef.setFocus(focus, cursor);
}

/**
 * Toggles a modal UI window with full focus and mouse pointer.
 */
export function toggleMenu(): void {
  isMenuOpen = !isMenuOpen;
  
  if (isMenuOpen) {
    // Acquire full keyboard input and display mouse cursor
    mp.cef.setFocus(true, true);
    mp.events.emitCef('ui:menu:open');
  } else {
    // Release keyboard input back to the game engine and hide cursor
    mp.cef.setFocus(false, false);
    mp.events.emitCef('ui:menu:close');
  }
}
```

### Forwarding Key Input to Browser

When the CEF browser is NOT in focus, it does not receive key events. If you want background HUD widgets to respond to hotkeys (or pass non-handled keys to the UI), forward them via `mp.events.emitCef`:

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

mp.game.onInputKeyEvent((action: EInputAction, key: EInputKey) => {
  // If browser already has full focus, engine handles routing
  if (mp.cef.isInFocus()) {
    return;
  }

  // Forward background keystrokes to CEF overlay
  mp.events.emitCef('cef:keyEvent', { key, action });
});
```

### Dynamic Dev Server URL Switching

During local development, you can point CEF to a Vite or Webpack dev server (`http://localhost:5173`) to take advantage of Hot Module Replacement (HMR) without reloading the resource:

```typescript
const isDevelopment = process.env.NODE_ENV === 'development';

mp.game.onInit(() => {
  if (isDevelopment) {
    // Live reload server URL
    mp.cef.setUrl('http://localhost:5173');
    console.log('[CEF] Connected to local development server');
  } else {
    // Production build URL (matches cef_url in resource.toml)
    mp.cef.setUrl('browser/index.html');
  }
});
```

### Waiting for Browser Ready (`domReady`)

Always wait for the CEF web runtime to signal that the DOM and script context are completely initialized before emitting startup data:

```typescript
mp.events.onCef('domReady', () => {
  console.log('[CEF] Web UI DOM is ready');

  // Push initial player data and server configurations to browser
  const localId = mp.network.getPlayerId(1);
  mp.events.emitCef('ui:init', {
    localId,
    timestamp: Date.now(),
  });
});
```

---

## 6. Native INK Text Widgets on HUD Layer (`inkTextWidget`)

In addition to HTML-based CEF overlays, REDengine provides an ultra-low-latency 2D/3D text rendering engine via `inkTextWidget`. This attaches directly to the native `inkHUDLayer` virtual window, rendering in sync with the game's internal rasterizer.

### Creating and Reparenting Ink Widgets

```typescript
import type { entEntity, inkTextWidget, Vector3 } from '@cybermp/client-types/game';

const REFERENCE_DISPLAY_WIDTH = 1920;

export interface InGameLabel {
  widget: inkTextWidget;
  entity: entEntity;
  text: string;
  fontSize: number;
}

/**
 * Creates an in-engine text widget reparented to the HUD layer.
 *
 * @param entity Target game entity
 * @param initialText Text content to render
 * @param baseFontSize Font size at 1080p reference resolution
 */
export function createEntityLabel(
  entity: entEntity,
  initialText: string,
  baseFontSize = 17,
): InGameLabel {
  const [displayWidth] = mp.game.getDisplayResolution();
  const scaledFontSize = baseFontSize * (displayWidth / REFERENCE_DISPLAY_WIDTH);

  const inkSystem = mp.game.ScriptGameInstance.GetInkSystem();
  const hudRoot = inkSystem.GetLayer('inkHUDLayer').GetVirtualWindow();

  const widget = Object.assign(new mp.game.inkTextWidget(), {});
  widget.SetName(`label_${entity.GetEntityID().hash}`);
  widget.SetFontFamily('base\\gameplay\\gui\\fonts\\arial\\arial.inkfontfamily');
  widget.SetFontSize(scaledFontSize);
  widget.SetStyle(
    mp.game.redResourceReferenceScriptToken.FromName(
      'base\\gameplay\\gui\\common\\main_colors.inkstyle',
    ),
  );
  widget.BindProperty('tintColor', 'MainColors.ActiveWhite');
  widget.SetVisible(true);
  widget.Reparent(hudRoot);

  return {
    widget,
    entity,
    text: initialText,
    fontSize: baseFontSize,
  };
}

/**
 * Updates the screen position, scale, and opacity of an inkTextWidget.
 */
export function updateLabelPosition(
  label: InGameLabel,
  screenPos: Vector3,
  scale = 1.0,
  alpha = 1.0,
): void {
  const centeringX = (label.text.length * (label.fontSize / 2) * scale) / 2;

  label.widget.SetText(label.text);
  label.widget.SetTranslation({ x: screenPos.x - centeringX, y: screenPos.y });
  label.widget.SetScale({ x: scale, y: scale });
  label.widget.SetOpacity(alpha);
  label.widget.SetVisible(true);
}

/**
 * Hides and cleans up an ink text widget.
 */
export function destroyEntityLabel(label: InGameLabel): void {
  label.widget.SetVisible(false);
}
```

---

## 7. CEF Synthetic Keyboard Bridge

When CEF does not own direct keyboard focus (`mp.cef.isInFocus() === false`), web applications (e.g. React apps with TanStack Router, modal dialogues, or shortcut keys) can still receive key presses by dispatching synthetic DOM `KeyboardEvent`s in browser scripts:

### Browser-Side Event Simulator (`keys.ts`)

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

const keyCodeToName: Record<number, string> = {
  27: 'esc',
  13: 'return',
  32: 'space',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  160: 'ShiftLeft',
  162: 'ControlLeft',
  113: 'F2',
  114: 'F3',
  115: 'F4',
  116: 'F5',
  117: 'F6',
  118: 'F7',
};

function dispatchSyntheticKey(key: EInputKey, type: 'down' | 'up'): void {
  const mappedCode = keyCodeToName[key] ?? `Key${String.fromCharCode(key)}`;

  const event = new KeyboardEvent(`key${type}`, {
    keyCode: key,
    which: key,
    code: mappedCode,
    altKey: mappedCode.toLowerCase().includes('alt'),
    shiftKey: mappedCode.toLowerCase().includes('shift'),
    ctrlKey: mappedCode.toLowerCase().includes('control'),
  });

  document.dispatchEvent(event);
}

// In browser script: listen for bridged events from client V8
cybermp.events.on('incomingKeyPressed', (data: { action: EInputAction; key: EInputKey }) => {
  if (data.action === EInputAction.IACT_Press) {
    dispatchSyntheticKey(data.key, 'down');
  } else if (data.action === EInputAction.IACT_Release) {
    dispatchSyntheticKey(data.key, 'up');
  }
});
```

---

## 8. Noclip Controller Implementation

Noclip combines camera directional vectors, tick-based teleportation, and `PlayerPuppet.OnAction` hook for mouse yaw delta:

```typescript
import { EInputAction, EInputKey } from '@cybermp/client-types/enums';

export class NoclipController {
  private active = false;
  private tickId: number | null = null;
  private speed = 3.0;
  private activeKeys = new Set<EInputKey>();

  start(): void {
    if (this.active) return;
    this.active = true;

    // Apply movement freeze status effects
    const effectSystem = mp.game.ScriptGameInstance.GetStatusEffectSystem();
    const player = mp.game.GetPlayer();
    if (player) {
      effectSystem.ApplyStatusEffect(player.GetEntityID(), 'GameplayRestriction.NoMovement', player.GetRecordID(), player.GetEntityID());
    }

    this.tickId = mp.setTick(() => this.onTick());
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.tickId) {
      mp.clearTick(this.tickId);
      this.tickId = null;
    }
    const player = mp.game.GetPlayer();
    if (player) {
      mp.game.StatusEffectHelper.RemoveStatusEffect(player, 'GameplayRestriction.NoMovement', undefined);
    }
  }

  private onTick(): void {
    const player = mp.game.GetPlayer();
    if (!player || player.GetMountedVehicle()) return;

    const cam = mp.game.ScriptGameInstance.GetCameraSystem();
    const forwardVec = cam.GetActiveCameraForward();
    const rightVec = cam.GetActiveCameraRight();
    const pos = player.GetWorldPosition();

    const forward = (this.activeKeys.has(EInputKey.IK_W) ? 1 : 0) - (this.activeKeys.has(EInputKey.IK_S) ? 1 : 0);
    const right = (this.activeKeys.has(EInputKey.IK_D) ? 1 : 0) - (this.activeKeys.has(EInputKey.IK_A) ? 1 : 0);
    const up = (this.activeKeys.has(EInputKey.IK_Space) ? 1 : 0) - (this.activeKeys.has(EInputKey.IK_Shift) ? 1 : 0);

    pos.x += (forwardVec.x * forward + rightVec.x * right) * this.speed;
    pos.y += (forwardVec.y * forward + rightVec.y * right) * this.speed;
    pos.z += (forwardVec.z * forward + rightVec.z * right + up * 0.7) * this.speed;

    mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(
      mp.game.GetPlayerObject(),
      pos,
      mp.game.EulerAngles.create(0, 0, player.GetWorldYaw()),
    );
  }
}
```
