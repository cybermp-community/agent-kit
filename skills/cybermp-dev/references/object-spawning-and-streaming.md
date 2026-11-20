# Object Spawning & World Streaming Reference

This reference covers physical object and prop spawning in CyberMP, comparing client-local (`mp.local.spawnObject`) versus server-authoritative (`mp.objects.create`) spawning, providing a curated catalog of verified `.ent` entity depot paths, and documenting interior streaming and occlusion handling.

---

## 1. Client-Local vs Server-Authoritative Spawning

CyberMP provides two distinct mechanisms for spawning world objects, each suited for different use cases.

| Feature | Client-Local (`mp.local.spawnObject`) | Server-Authoritative (`mp.objects.create`) |
|---|---|---|
| **Environment** | Client (`@cybermp/client-types`) | Server (`@cybermp/server-types`) |
| **Network Replication** | ❌ Local to executing client only | ✅ Synced to all clients in dimension |
| **Network Cost** | Zero bandwidth / RPC overhead | Synchronized state updates |
| **Persistence** | Resets on resource reload / client quit | Persists on server across reconnects |
| **Use Cases** | Decorative props, personal garage previews, client-only VFX markers, temporary scene staging | Shared barricades, public furniture, racing tracks, custom buildings, drops |

---

## 2. Client-Local Spawning (`mp.local.spawnObject`)

`mp.local.spawnObject` instantiates an entity purely inside the local player's REDengine world instance.

```typescript
import type { Vector3, EulerAngles } from '@cybermp/client-types/game';

// Store spawned local props for lifecycle management
const activeLocalObjects: number[] = [];

/**
 * Spawns a decorative prop locally on the client without network overhead.
 *
 * @param skinHash Numeric or BigInt asset hash (e.g. BigInt('0x...'))
 * @param x World X coordinate
 * @param y World Y coordinate
 * @param z World Z coordinate
 * @param yaw Rotation in degrees
 * @param appHash Appearance hash (default: 0)
 * @param streaming Enable background streaming (default: true)
 * @returns Numeric object handle
 */
export function spawnClientProp(
  skinHash: bigint | number,
  x: number,
  y: number,
  z: number,
  yaw: number = 0,
  appHash: bigint | number = 0,
  streaming: boolean = true,
): number {
  const handle = mp.local.spawnObject(
    skinHash,
    appHash,
    x,
    y,
    z,
    0, // roll
    0, // pitch
    yaw,
    streaming,
  );
  activeLocalObjects.push(handle);
  return handle;
}

/**
 * Cleans up and despawns all locally created objects.
 */
export function clearAllLocalProps(): void {
  for (const handle of activeLocalObjects) {
    mp.local.despawnObject(handle);
  }
  activeLocalObjects.length = 0;
}
```

---

## 3. Server-Authoritative Spawning (`mp.objects.create`)

On the server, `mp.objects.create` instantiates an entity that is automatically streamed and synchronized to all players within network range and the assigned dimension.

```typescript
import { Vector3 } from '@cybermp/server-types';
import type { MpObject } from '@cybermp/server-types';

/**
 * Spawns a server-synchronized object across all connected clients.
 *
 * @param model Model hash (BigInt or number)
 * @param position 3D coordinates
 * @param yaw Rotation in degrees (default: 0)
 * @param dimension Virtual dimension (default: 0 for global)
 */
export function createServerProp(
  model: bigint | number,
  position: Vector3,
  yaw: number = 0,
  dimension: number = 0,
): MpObject {
  const prop = mp.objects.create({
    model: BigInt(model),
    position,
    yaw,
    dimension,
  });

  // Attach metadata if needed
  prop.setMeta('isCustomProp', true);
  prop.setMeta('createdAt', Date.now());

  console.log(`[Server] Spawned synchronized prop (ID: ${prop.id}) in dimension ${dimension}`);
  return prop;
}
```

---

## 4. Curated `.ent` Depot Paths Catalog

Below is a verified catalog of standard Night City asset paths from the game's depot archives. These can be passed directly to `mp.local.spawnObject` or `mp.objects.create`.

### Traffic, Barriers & Roadblocks
```
base\props\street\traffic\traffic_cone_a.ent
base\gameplay\devices\fences\police_barrier\police_barrier_a.ent
base\props\street\traffic\road_barrier_concrete_a.ent
base\props\street\traffic\warning_sign_a.ent
base\props\street\traffic\road_block_metal_a.ent
base\props\street\traffic\traffic_light_single_a.ent
```

### Neon Signs, Lighting & Billboards
```
base\props\street\advertising\neon_signs\neon_open_a.ent
base\props\street\advertising\neon_signs\neon_bar_a.ent
base\props\street\advertising\neon_signs\neon_cocktails_a.ent
base\props\street\lighting\street_lamp_modern_a.ent
base\props\street\lighting\floodlight_small_a.ent
base\props\street\lighting\neon_tube_blue_a.ent
base\props\street\lighting\neon_tube_pink_a.ent
```

### Furniture, Seating & Tables
```
base\props\furniture\chairs\bar_stool_modern_a.ent
base\props\furniture\chairs\office_chair_a.ent
base\props\furniture\chairs\chair_plastic_modern_a.ent
base\props\furniture\tables\bar_table_round_a.ent
base\props\furniture\tables\dining_table_modern_a.ent
base\props\furniture\couches\sofa_modern_3seat_a.ent
base\props\furniture\couches\armchair_leather_a.ent
```

### Industrial, Containers & Staging
```
base\props\industrial\containers\cargo_container_40ft_a.ent
base\props\industrial\containers\cargo_container_20ft_a.ent
base\props\industrial\crates\plastic_crate_stack_a.ent
base\props\industrial\pallets\wooden_pallet_a.ent
base\props\street\trash\trash_bin_metal_a.ent
base\props\industrial\barrels\metal_barrel_yellow_a.ent
```

---

## 5. Interior Streaming & Occlusion Handling

REDengine divides Night City into a hierarchy of world sectors (`worldStreamingSector`) and utilizes strict occlusion culling to optimize rendering performance.

### Understanding Streaming Traps

1. **Sector Unloading**: If a player teleports into an interior that is far away from their current position, exterior world geometry and collision sectors may take 200–500ms to stream in.
2. **Occlusion Culling (Black Voids)**: When outside a building looking in, REDengine hides interior rooms behind solid exterior walls using "occluder meshes". If you open an exterior door programmatically, the occluder might still cull the interior until the camera crosses the portal boundary.

### Best Practices for Interior Custom Staging

```typescript
/**
 * Safe teleport into an interior with streaming delay to prevent falling through collision.
 */
export function enterInteriorSafely(
  x: number,
  y: number,
  z: number,
  yaw: number = 0,
): void {
  const player = mp.game.GetPlayer();
  if (!player) return;

  // 1. Temporarily enable god mode or disable falling damage during streaming
  const statPools = mp.game.ScriptGameInstance.GetStatPoolsSystem();

  // 2. Teleport using TeleportationFacility
  const targetPos = Object.assign(new mp.game.Vector4(), { x, y, z, w: 1.0 });
  const targetRot = Object.assign(new mp.game.EulerAngles(), { roll: 0, pitch: 0, yaw });

  mp.game.ScriptGameInstance.GetTeleportationFacility().Teleport(
    player,
    targetPos,
    targetRot,
  );

  console.log(`[Streaming] Player teleported to interior (${x}, ${y}, ${z}). Streaming sectors...`);
}
```
