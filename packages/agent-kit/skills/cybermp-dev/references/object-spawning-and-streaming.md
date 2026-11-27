# Object Spawning & World Streaming Reference

Use the client-local API for props visible to one client and the server API for props shared through CyberMP streaming. The depot paths below are candidates for inspection in the target game build.

---

## 1. Client-Local vs Server-Authoritative Spawning

CyberMP provides two distinct mechanisms for spawning world objects, each suited for different use cases.

| Feature | Client-Local (`mp.local.spawnObject`) | Server-Authoritative (`mp.objects.create`) |
|---|---|---|
| **Environment** | Client (`@cybermp/client-types`) | Server (`@cybermp/server-types`) |
| **Network Replication** | Local to the executing client | Streamed to eligible clients in range and in the assigned dimension |
| **Network Cost** | Zero bandwidth / RPC overhead | Synchronized state updates |
| **Removal** | Pass the local handle to `mp.local.despawnObject` when done or on resource stop | Destroy the object through `prop.destroy()` or `mp.objects.destroy` when the server resource no longer needs it |
| **Use Cases** | Decorative props, personal garage previews, client-only VFX markers, temporary scene staging | Shared barricades, public furniture, racing tracks, custom buildings, drops |

A user-run base-game prop test on 21 November 2026 confirmed shared visibility on two clients, visibility after a late connection, and removal on both clients when the resource stopped. In the subsequent streaming test, the same live server object kept its Network ID, `mp.network.getObjectGameId(networkId)` returned `0` outside streaming, and returning assigned a new local Game ID. Treat that ID as a temporary client-side mapping: resolve it again after `objectStreamIn` rather than caching it across `objectStreamOut`. Filter both events by the tracked Network ID; their arguments are `(netID, gameID)`. These observations cover the tested base-game asset and stand, not custom archive delivery or all game builds. See the [portable probe](../examples/archive-probe/README.md) and [audit](https://github.com/cybermp-community/agent-kit/blob/main/packages/agent-kit/docs/audits/2026-11-20-knowledge-base.md).

---

## 2. Client-Local Spawning (`mp.local.spawnObject`)

Use the model and appearance hashes expected by the client API. Use a `bigint` for a 64-bit hash obtained as a string, since converting it to `number` can lose precision. The numeric return value is the local handle used for cleanup. Check entity and appearance resolution in the target client. [Local entities guide](https://docs.cyber.mp/guides/client/local-entities/) · [Archive prop recipe](recipes/archive-prop.md)

```typescript env=client
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

mp.events.on('resourceStop', clearAllLocalProps);
```

---

## 3. Server-Authoritative Spawning (`mp.objects.create`)

On the server, resolve a prop depot path as a resource reference with `mp.hashes.resref`. Test visibility with clients inside and outside the streaming range and in different dimensions. Every client that should render a custom prop needs its asset and dependencies. [Server object guide](https://docs.cyber.mp/guides/server/entities/#spawning-objects) · [Archive prop recipe](recipes/archive-prop.md)

```typescript env=server
import type { MpObject, Vector3 } from '@cybermp/server-types';

/**
 * Creates a server object eligible for streaming.
 *
 * @param depotPath Resource path of the prop
 * @param position 3D coordinates
 * @param yaw Rotation in degrees (default: 0)
 * @param dimension Virtual dimension (default: 0)
 */
export function createServerProp(
  depotPath: string,
  position: Vector3,
  yaw: number = 0,
  dimension: number = 0,
): MpObject {
  const prop = mp.objects.create({
    model: mp.hashes.resref(depotPath),
    position,
    yaw,
    dynamic: false,
    dimension,
  });

  console.log(`[Server] Spawned synchronized prop (ID: ${prop.id}) in dimension ${dimension}`);
  return prop;
}
```

---

## 4. Curated `.ent` Depot Paths Catalog

The following are candidate depot paths for standard Night City assets. Verify them in the target build. Resolve a path using the hash format expected by the selected spawn API. See the [archive prop recipe](recipes/archive-prop.md).

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

Treat an interior transition as three separate checks.

1. **Player movement.** Verify the target coordinates, close interfering game menus, and use the documented native teleport flow. If the transition also changes dimension, coordinate that state with the server. [Player teleportation guide](https://docs.cyber.mp/guides/client/teleporting-player/)
2. **World streaming.** Test the destination from nearby and from far away. Check whether the floor collision and required geometry are available before releasing the player. A fixed timeout provides no collision-readiness signal. Establish a fallback destination for failed transitions.
3. **Asset visibility.** If a prop fails to render, first test the same asset at a known outdoor location to check the archive, depot path and appearance. At the interior, test the player's position and camera placement separately. Use a second client to verify shared object visibility where relevant. [Archive prop recipe](recipes/archive-prop.md)
