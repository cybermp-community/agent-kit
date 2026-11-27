---
environment: client
---

# Camera, Input & CEF Reference

This reference covers low-level REDengine camera manipulation, detached free camera spawning, multi-target spectator systems, direct keyboard hardware input capturing, and Chromium Embedded Framework (CEF) focus/cursor management in CyberMP client scripts (`use_game_natives = true`).

The REDengine camera and input fragments run in the CyberMP game client with `use_game_natives = true`. The CEF bridge spans both the game client and browser. The snippets indicate the relevant side where it differs.

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

Freeroam creates a client-local object from the vanilla resource `base\entities\cameras\simple_free_camera.ent`. A successful call to `mp.local.spawnObject` yields a handle. Camera activation also requires a resolved engine entity and its `camera` component. Freeroam polls for the entity with a deadline and uses the object cleanup callback to deactivate the camera. [Freeroam camera service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/camera.service.ts) · [Freeroam entity lookup](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/game/entity.service.ts)

### Free Camera Activation Probe

Run this client-side after the local player has spawned. Call `stopFreeCamera` when leaving the mode. The probe uses a five-second lookup deadline and logs whether it called `Activate`. Check the actual view change and return to the player camera in the target build.

```typescript
import type { gameCameraComponent } from '@cybermp/client-types/game';

let cameraHandle: number | undefined;
let camera: gameCameraComponent | undefined;
let lookupTimer: ReturnType<typeof setInterval> | undefined;

function stopLookup(): void {
  if (lookupTimer === undefined) return;
  clearInterval(lookupTimer);
  lookupTimer = undefined;
}

export function stopFreeCamera(): void {
  stopLookup();
  const activeCamera = camera;
  const handle = cameraHandle;
  camera = undefined;
  cameraHandle = undefined;
  try {
    activeCamera?.Deactivate(0, false);
  } finally {
    if (handle !== undefined) mp.local.despawnObject(handle);
  }
}

export function probeFreeCamera(x: number, y: number, z: number): void {
  stopFreeCamera();

  const modelHash = mp.game.redResourceReferenceScriptToken.GetHash(
    'base\\entities\\cameras\\simple_free_camera.ent',
  );
  const handle = mp.local.spawnObject(modelHash, 0, x, y, z, 0, 0, 0, false);
  cameraHandle = handle;
  const entityId = Object.assign(new mp.game.entEntityID(), { hash: handle });
  const deadline = Date.now() + 5_000;

  lookupTimer = setInterval(() => {
    try {
      if (Date.now() >= deadline) {
        console.warn(`[camera] timed out waiting for camera component on handle ${handle}`);
        stopFreeCamera();
        return;
      }

      const entity = mp.game.ScriptGameInstance.FindEntityByID(entityId);
      const component = entity?.FindComponentByName('camera') as gameCameraComponent | undefined;
      if (!component) return;

      camera = component;
      camera.Activate(0, false);
      stopLookup();
      console.log(`[camera] Activate called for handle ${handle}`);
    } catch (error) {
      console.error('[camera] activation probe failed', error);
      stopFreeCamera();
    }
  }, 100);
}

mp.events.on('resourceStop', stopFreeCamera);
```

## 3. Spectator System (`spectateCamera`)

Freeroam resolves a streamed target and looks for a component named `spectateCamera` on that entity. Component availability depends on the target entity setup. The mode also has its own camera offsets, player positioning and control restrictions. [Freeroam spectator service](https://github.com/Cyber-MP/CyberMP-Freeroam/blob/main/resources/freeroam/client/src/modules/spectating/spectating.service.ts)

### Spectator Target Lookup

This client fragment resolves the current component for a supplied **network player ID**. An unavailable result is expected when the target is outside streaming range, during entity replacement, or when the target has no spectator camera. [Network IDs](https://docs.cyber.mp/guides/client/network-ids/)

```typescript
import type { gameCameraComponent } from '@cybermp/client-types/game';

export function resolveSpectatorCamera(targetNetworkId: number): gameCameraComponent | undefined {
  if (targetNetworkId === mp.network.getLocalPlayerId()) return;

  const gameId = mp.network.getPlayerGameId(targetNetworkId);
  if (!gameId) return;

  const entityId = Object.assign(new mp.game.entEntityID(), { hash: gameId });
  const entity = mp.game.ScriptGameInstance.FindEntityByID(entityId);
  const component = entity?.FindComponentByName('spectateCamera');
  if (component) return component as gameCameraComponent;
}
```

For a full spectator mode, track the target by network ID and re-resolve its engine entity after stream-in or respawn. Release the current camera on stream-out, disconnect, mode exit and resource stop. Treat control restrictions and replicated spectator state as separate parts of the game mode. In a two-client session, verify the normal start/stop path, target replacement, and recovery after the target leaves.

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

export function bindMenuToggle(toggleMenu: () => void): () => void {
  return bindKey(EInputKey.IK_F6, (action) => {
    if (action === EInputAction.IACT_Release) toggleMenu();
  });
}
```

Pass the resource's menu toggle function to `bindMenuToggle` and call the returned function to remove the binding.

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

This example assumes one menu owns CEF focus. If several menus share the frame, coordinate focus in one place.

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

mp.events.on('resourceStop', () => {
  if (!isMenuOpen) return;
  isMenuOpen = false;
  mp.cef.setFocus(false, false);
});
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

Use `cef_url` in `resource.toml` for the packaged page. For a local development build, configure the dev URL explicitly and call `mp.cef.setUrl` from the game client. A bundler can substitute a development flag at build time. The embedded client does not require a Node.js `process` global. [CEF resource configuration](https://docs.cyber.mp/guides/client/first-cef-ui/#resource-manifest-configuration)

### Waiting for Browser Ready (`domReady`)

The client receives `domReady` through `mp.events.onCef` when the document is ready. A UI may install its application listeners later. For startup data, let the browser send an application-level ready event after registering its listener. Register the client handler before navigating to the page. A page reload can repeat the handshake.

Game state has a separate lifecycle. For player-specific data, send an update after the local player spawns and get the current network player ID from `mp.network.getLocalPlayerId()`. [CEF guide](https://docs.cyber.mp/guides/client/first-cef-ui/) · [Client lifecycle](https://docs.cyber.mp/guides/client/lifecycle/) · [Network IDs](https://docs.cyber.mp/guides/client/network-ids/)

### CEF `ui:ready` Handler in the Game Client

Register `ui:ready` using the game client's `mp.events.onCef`. Reply with `ui:init` using `mp.events.emitCef`.

```typescript env=client checked=@cybermp/client-types@2.7.1
mp.events.onCef('ui:ready', () => {
  mp.events.emitCef('ui:init', { timestamp: Date.now() });
});
```

### CEF `ui:ready` Signal from the Browser

In the CEF browser script, register `ui:init` using the injected `mp.events.on`. Emit `ui:ready` once the UI has initialized.

```typescript env=browser checked=@cybermp/browser-types@2.0.1
mp.events.on('ui:init', (data: { timestamp: number }) => {
  console.log('[CEF] Startup data received at', data.timestamp);
});
mp.events.emit('ui:ready');
```

---

## 6. Native INK Text Widgets on HUD Layer (`inkTextWidget`)

In addition to HTML-based CEF overlays, REDengine provides an ultra-low-latency 2D/3D text rendering engine via `inkTextWidget`. This attaches directly to the native `inkHUDLayer` virtual window, rendering in sync with the game's internal rasterizer.

### Creating and Reparenting Ink Widgets

See [INK widgets](ink-widgets.md) for general attach/transform order, canvas composition, pooling, delayed readback and ownership. The label fragment below is a separate HUD use case. Its `destroyEntityLabel` only hides the widget for potential reuse; final disposal must detach the owned widget while the parent remains valid and stop its update work.

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
 * Hides an ink text widget without detaching it (not final disposal).
 */
export function destroyEntityLabel(label: InGameLabel): void {
  label.widget.SetVisible(false);
}
```

---

## 7. CEF Synthetic Keyboard Bridge

When CEF does not own direct keyboard focus (`mp.cef.isInFocus() === false`), web applications (e.g. React apps with TanStack Router, modal dialogues, or shortcut keys) can still receive key presses by dispatching synthetic DOM `KeyboardEvent`s in browser scripts:

### Browser-Side Event Simulator (`keys.ts`)

```typescript env=browser
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
mp.events.on('incomingKeyPressed', (data: { action: EInputAction; key: EInputKey }) => {
  if (data.action === EInputAction.IACT_Press) {
    dispatchSyntheticKey(data.key, 'down');
  } else if (data.action === EInputAction.IACT_Release) {
    dispatchSyntheticKey(data.key, 'up');
  }
});
```

---

## 8. Noclip Diagnostics

A detached camera and a noclip player controller have different effects. Use the free camera probe above to check client-only viewing. To implement player movement in a development resource, first verify the following in the target CyberMP build.

1. Record which `onInputKeyEvent` press and release actions reach the resource with and without CEF focus. Clear held input when the mode exits.
2. Check camera direction vectors separately from movement. Use elapsed time to scale movement driven by a frame tick.
3. Start with a single move using the documented teleport flow. Test on-foot movement, mounted behavior, and what the server and another client observe. Repeated local teleportation needs separate validation for collision, streaming and synchronization.
4. If the mode applies gameplay restrictions, verify the record and how to remove it. Stop the movement tick and restore player control on exit and `resourceStop`.

[Player teleportation guide](https://docs.cyber.mp/guides/client/teleporting-player/) · [Client tick loops](https://docs.cyber.mp/guides/client/local-entities/#per-frame-tick-loops)

---

## 9. Discord Rich Presence & OAuth2 (`mp.discord`)

CyberMP exposes the client-side Discord Game SDK integration via `mp.discord`. This allows resources to dynamically update the player's Discord profile activity and execute seamless OAuth2 client authentication without opening an external browser.

### API Reference (`MpDiscord`)

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `mp.discord.updateRichPresence` | `state?: string`, `details?: string` | `void` | Updates the active Discord Rich Presence text on the player's desktop client. |
| `mp.discord.getOAuth2Token` | `discordAppId: string`, `scopes: string` | `string` | Requests a secure authorization code payload via Discord's local authorization flow. |
| `mp.discord.getCodeAuthorization` | `discordAppId: string`, `scopes: string` | `string` | *(Deprecated)* Legacy alias for `getOAuth2Token`. |

### Dynamic Rich Presence Manager

Update the player's Discord status to reflect in-game activity, current vehicle, and location:

```typescript
export class DiscordActivityManager {
  private lastUpdate = 0;
  private readonly updateIntervalMs = 15_000; // Example application throttle

  /**
   * Updates Discord Rich Presence based on the player's current status.
   */
  public updateStatus(details: string, state: string): void {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateIntervalMs) {
      return;
    }
    this.lastUpdate = now;

    // Direct client SDK call
    mp.discord.updateRichPresence(state, details);
  }

  /**
   * Sets vehicle driving status in Discord.
   * @param vehicleModel Name or model of the current vehicle
   * @param district District name (e.g. "Watson, Little China")
   */
  public setDrivingStatus(vehicleModel: string, district: string): void {
    this.updateStatus(`Cruising in ${vehicleModel}`, `Exploring ${district}`);
  }

  /**
   * Sets on-foot activity in Discord.
   */
  public setOnFootStatus(district: string, inCombat: boolean): void {
    const state = inCombat ? 'Engaged in Combat' : 'Free Roaming';
    this.updateStatus(`Location: ${district}`, state);
  }
}

// Example usage:
const discord = new DiscordActivityManager();
discord.setOnFootStatus('Night City Center', false);
```

### Discord OAuth2 Client Authentication Flow

To authenticate players against a Discord bot or guild whitelist, request an authorization code on the client and pass it to the server for token exchange:

```typescript
// --- Client-side script ---
/**
 * Prompts the local player for Discord authorization and forwards the code to the server.
 * @param appId Registered Discord Application Client ID
 */
export function requestDiscordAuth(appId: string): void {
  try {
    // Request authorization code for user identity and guild membership verification
    const authCode = mp.discord.getOAuth2Token(appId, 'identify guilds');

    if (authCode && authCode.length > 0) {
      console.log('[Discord] Authorization code retrieved successfully');
      // Transmit code to authoritative server for secure token exchange
      mp.events.emitServer('auth:verifyDiscordCode', authCode);
    } else {
      console.warn('[Discord] Empty authorization code received');
      mp.events.emitCef('auth:status', { success: false, reason: 'No Discord authorization code received' });
    }
  } catch (err) {
    console.error('[Discord] Failed to obtain OAuth2 code:', err);
  }
}
```

---

## 10. Client Local Storage (`mp.localStorage`)

The `mp.localStorage` subsystem (`MpLocalStorage`) provides client-side persistent key-value storage. Data saved here persists across game restarts and server reconnections, making it ideal for saving user UI preferences, keybind configurations, audio volumes, and client cache.

### API Reference (`MpLocalStorage`)

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `mp.localStorage.set` | `key: string`, `value: string` | `void` | Associates a plaintext string value with a unique key. Overwrites existing keys. |
| `mp.localStorage.get` | `key: string` | `string` | Retrieves the string value for the given key. Handle both an empty string and `null` for a missing entry, as described by the declaration comments. |
| `mp.localStorage.delete` | `key: string` | `void` | Permanently deletes a specific key-value entry from storage. |
| `mp.localStorage.deleteAll` | *none* | `void` | Clears all stored key-value pairs for the current resource. |
| `mp.localStorage.save` | *none* | `void` | Requests an explicit flush of the in-memory storage to disk. |

### Type-Safe JSON Storage Wrapper

Because `mp.localStorage` operates exclusively on string values, wrapping it in a typed JSON helper with automatic disk flushing ensures safety and crash resilience:

```typescript
export class LocalSettingsStorage {
  /**
   * Stores a typed object into persistent client storage.
   * Flushes immediately to disk via mp.localStorage.save().
   */
  public static set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      mp.localStorage.set(key, serialized);
      mp.localStorage.save(); // Ensure data is flushed to physical storage immediately
    } catch (err) {
      console.error(`[Storage] Failed to serialize key "${key}":`, err);
    }
  }

  /**
   * Retrieves and parses a typed object from persistent client storage.
   * Returns fallback value if key does not exist or JSON parsing fails.
   */
  public static get<T>(key: string, defaultValue: T): T {
    try {
      const raw = mp.localStorage.get(key);
      if (!raw || raw.trim().length === 0) {
        return defaultValue;
      }
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[Storage] Failed to parse key "${key}", using default:`, err);
      return defaultValue;
    }
  }

  /**
   * Deletes a setting and flushes to disk.
   */
  public static remove(key: string): void {
    mp.localStorage.delete(key);
    mp.localStorage.save();
  }

  /**
   * Clears all client settings for this resource.
   */
  public static clearAll(): void {
    mp.localStorage.deleteAll();
    mp.localStorage.save();
  }
}

// Example usage: HUD and Audio settings persistence
interface UserPreferences {
  hudOpacity: number;
  speedometerUnit: 'kmh' | 'mph';
  masterVolume: number;
  customFov: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  hudOpacity: 1.0,
  speedometerUnit: 'kmh',
  masterVolume: 0.8,
  customFov: 80,
};

// Save preferences
LocalSettingsStorage.set('user_prefs', {
  ...DEFAULT_PREFERENCES,
  customFov: 90,
});

// Load preferences on startup
const userPrefs = LocalSettingsStorage.get<UserPreferences>('user_prefs', DEFAULT_PREFERENCES);
console.log(`Loaded custom FOV: ${userPrefs.customFov}`);
```

---

## 11. Client Commands (`mp.commands`)

CyberMP client scripts can register client-side console and chat commands using `mp.commands` (`MpCommands`). These commands execute locally within the client's internal V8 runtime without sending an RPC to the server unless explicitly forwarded.

### API Reference (`MpCommands`)

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `mp.commands.add` | `commandName: string`, `callback: (id: number, args: string[]) => void` | `void` | Registers a client command handler (without leading `/`). |
| `mp.commands.remove` | `commandName: string` | `void` | Unregisters an existing client command handler. |

### Client vs. Server Commands Comparison

| Feature | Client Commands (`mp.commands.add`) | Server Commands (`commands.add`) |
|---|---|---|
| **Execution Environment** | Client V8 Engine (in-game process) | Server Node.js Dedicated Runtime |
| **Primary Use Cases** | Client FOV/camera tweaks, HUD toggles, debug overlays, client audio | Moderation, inventory, economy, vehicle spawning, teleportation |
| **Callback Arguments** | `(id: number, args: string[])` | `(player: MpPlayer \| null, args: string[])` |
| **Network Overhead** | Zero (processed entirely client-side) | Network RPC packet sent from client to server |

### Practical Client Commands Implementation

Registering debug and client camera commands with clean unregister on resource cleanup:

```typescript
const registeredClientCommands = new Set<string>();

/**
 * Registers a client-side command and tracks it for clean resource unloading.
 */
export function registerClientCommand(
  name: string,
  handler: (id: number, args: string[]) => void,
): void {
  mp.commands.add(name, handler);
  registeredClientCommands.add(name);
}

/**
 * Unregisters all client commands registered by this resource.
 */
export function unregisterAllClientCommands(): void {
  for (const cmd of registeredClientCommands) {
    mp.commands.remove(cmd);
  }
  registeredClientCommands.clear();
}

// 1. /fov [value] - Adjust local camera FOV
registerClientCommand('fov', (localPlayerId, args) => {
  if (args.length === 0) {
    console.log('[Command] Usage: /fov <degrees 60-120>');
    return;
  }

  const fovVal = parseFloat(args[0]);
  if (isNaN(fovVal) || fovVal < 60 || fovVal > 120) {
    console.log('[Command] FOV must be a number between 60 and 120.');
    return;
  }

  const player = mp.game.GetPlayer();
  const fppCam = player?.GetFPPCameraComponent();
  if (fppCam) {
    fppCam.SetFOV(fovVal);
    console.log(`[Command] First-person FOV set to ${fovVal}°`);
  }
});

// 2. /hud - Toggle CEF HUD visibility
let hudVisible = true;
registerClientCommand('hud', (localPlayerId) => {
  hudVisible = !hudVisible;
  mp.events.emitCef('hud:setVisible', hudVisible);
  console.log(`[Command] HUD visibility: ${hudVisible ? 'Visible' : 'Hidden'}`);
});

// 3. /coords - Copy current world coordinates to console
registerClientCommand('coords', (localPlayerId) => {
  const player = mp.game.GetPlayer();
  if (!player) return;

  const pos = player.GetWorldPosition();
  const yaw = player.GetWorldYaw();
  console.log(`[Coordinates] X: ${pos.x.toFixed(3)}, Y: ${pos.y.toFixed(3)}, Z: ${pos.z.toFixed(3)}, Yaw: ${yaw.toFixed(2)}°`);
});
```
