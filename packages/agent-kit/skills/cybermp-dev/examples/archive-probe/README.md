# Archive prop probe for CyberMP

This folder holds the sources of the `kit-archive-probe` resource, a manifest for a stock asset and an extra manifest for your own archive. The cube geometry and its generator live in the [neighbouring example](../archive-prop/). Build the JavaScript files from the sources as described below. A previously prepared hand-off ZIP contains ready scripts and a `wolvenkit-input` folder.

## Setting it up on Windows

1. Build `client.ts` and `server.ts` into `dist/client.js` and `dist/server.js` with the commands below. Copy `dist/` and `resource.toml` into `resources/kit-archive-probe` of a test CyberMP server. If you use the hand-off ZIP, copy its `kit-archive-probe` folder instead. Add `kit-archive-probe` to the `resources` list in `server.toml` and keep the other resources. A working test game mode is required for a player to appear.
2. Start the test server, connect a client and wait for the player to spawn. Move to an open, flat area. Commands are typed into the client's F8 console. Use the resource on a closed test server.
3. Run `kitprop local base` to request a stock model next to your character, then `kitprop clear` when you are done. For a shared object run `kitprop shared base`. The second client must stand nearby in the same dimension and look at the same spot. Run `kitprop status` on both clients and compare the one network ID with the local Game ID and what you see.

| Command | Action |
| --- | --- |
| `kitprop local base` | Requests a stock model on one client. |
| `kitprop shared base` | Creates one server object for the player who typed the command. Running it again replaces the previous object. |
| `kitprop status` | Writes the local handle and the shared object identifiers to the log. |
| `kitprop clear` | Removes the shared object and the local object of the client that typed the command. |

## Streaming notifications for the shared prop

After `kitprop shared base` the server sends the network ID of the test object to every connected client. A player who connects late also receives the current ID when spawning. `kitprop status` re-syncs tracking on the client that ran the command.

On `objectStreamOut` for that object the client shows "Prop left streaming" on screen and writes `[kitprop] STREAM_OUT Network ID=..., local Game ID=...` to F8. When it returns, "Prop is back in streaming" appears with a `STREAM_IN` line. Other objects and repeated events that do not change state produce no notification. The starting state is written separately as `initial state=IN/OUT`; it is a snapshot of the ID mapping, not a boundary crossing.

To check it, keep the first player next to the prop and walk the second one away until `STREAM_OUT` appears, then back until `STREAM_IN`. Compare the network ID and what both clients see. The distance is not fixed in advance. The notification reports a local streaming event for the object; a dimension change or a removal can also affect whether the entity is available. Before you deliberately remove or replace the test object, the server resets tracking.

A user-run test on 21 November 2026 confirmed the notifications, the disappearance and the reappearance of the stock prop. While the server object kept existing, its network ID stayed the same; outside streaming the local Game ID was `0`, and a new one was assigned on return. Do not keep the old local Game ID for later native calls: after the object returns, get the mapping again through `mp.network.getObjectGameId` or the `gameID` argument of the `objectStreamIn` event. This is one stand's result, and the exact distance was not measured.

## Running it with your own archive

1. In WolvenKit, import `../archive-prop/cube.glb` (or `wolvenkit-input/cube.glb` from the hand-off ZIP) as a static mesh and prepare an `.ent` with the internal path `cybermp_kit\diagnostics\cube.ent`. Check the material and that the entity shows with its default appearance. The client call uses appearance hash `0`. See the [archive prop recipe](https://github.com/cybermp-community/agent-kit/blob/main/packages/agent-kit/skills/cybermp-dev/references/recipes/archive-prop.md).
2. Pack the REDengine archive and put it at `kit-archive-probe/assets/cybermp_kit_cube.archive`. Replace `kit-archive-probe/resource.toml` with the supplied `resource.archive.toml`, keeping the name `resource.toml`. Restart the test server or reload the manifest, then restart the game clients. For a CDN, update the packaged resource.
3. Repeat the check with `kitprop local archive` and `kitprop shared archive`. Remove any manually installed copy of this archive from both test clients before testing delivery. For the local check the second client watches the first player's spot; for the shared check both clients must see one server object at the same place.
4. Record the game, CyberMP client and server versions, the WolvenKit version, the SHA-256 of the `.archive`, the `[kitprop]` lines and what both clients saw. Confirm that the object disappears after `kitprop clear` and after the resource stops.

## Rebuilding from the sources

In the repository and in the npm package the sources sit next to this README. In the hand-off ZIP they are under `source/`. After changing paths or logic, rebuild the scripts from the sources folder:

```sh
pnpm dlx esbuild@0.28.2 client.ts --bundle --platform=neutral --format=iife --outfile=dist/client.js
pnpm dlx esbuild@0.28.2 server.ts --bundle --platform=node --format=cjs --outfile=dist/server.js
```

After rebuilding, replace both files in `kit-archive-probe/dist/`.
