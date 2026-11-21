---
title: Diagnostic for an INK minimap shape
description: Add a single diagnostic widget and check geometry, color, and world projection independently.
environment: client
verificationStatus: static-cross-check
aliases: [inkCircleWidget, hud diagnostic, minimap zones, спавн, виджет]
---
# Diagnostic for an INK minimap shape

The [typed client example](../../examples/minimap-diagnostic/client.ts) creates one screen-space `inkCircleWidget` in the minimap controller's root widget by default. It discovers an existing controller through INK layer game controllers and also registers `OnInitialize` observers. It creates the child with `container.AddChild('inkCircleWidget')`, sets size through `Vector2`, and tint through `HDRColor`. It removes its own widget on resource stop and before replacing it.

On 21 November 2026, a user-run test confirmed a visible yellow square in `root` and its disappearance after the server stopped only `minimap-diagnostic`, with the server continuing to run. The same example did not produce a visible shape in `mappin` or `geom`. This is one stand's result, not universal compatibility. Game executable FileVersion was `3.0.5813403`; exact in-game CyberMP client and server builds remain unconfirmed. See the [audit record](https://github.com/mo3g666/cybermp-agent-kit/blob/main/docs/audits/2026-11-20-knowledge-base.md) for evidence and limits. There is no world-coordinate projection in this example.

## Set up the resource

Clone or copy the [example directory](../../examples/minimap-diagnostic/) into the development workspace. Bundle `client.ts` to `dist/client.js` using the [CyberMP TypeScript build guide](https://docs.cyber.mp/guides/recipes/typescript/#building-for-production), copy both the JavaScript and the provided manifest into a test resource, and enable the resource on the test server. Connect with game natives enabled. `kitminimap root` in the client console retries controller discovery and recreates one test widget. `kitminimap mappin` and `kitminimap geom` compare other containers with the same geometry and color; they are diagnostic alternatives, not established rendering paths.

## Record the result

1. Record the game build, CyberMP client and server builds, and the kit revision. Confirm that either the observer fires or the existing-controller lookup succeeds.
2. Expect a small yellow square near the player arrow in `root`, not a world-aligned area. Record the screenshot and read-back logs for child count, size, segments, tint, visibility and opacity. On the tested stand `SetSize(32, 32)` read back as `0x0`, while `SetSize(Vector2)` read back as `32x32`. Passing a byte-channel `Color` produced invalid tint values; passing `HDRColor(1, 215/255, 0, 1)` read back correctly. Both overloads exist in the declarations, so type-checking alone does not confirm bridge behavior. Test alternatives independently on the target build.
3. Stop and restart the resource and reinitialize the HUD. Check that the old widget disappears and the new HUD has at most one test widget. If a hot reload misses the notification, repeat with a fresh connection.
4. For a world-aligned zone, add and verify projection separately. Set a target with a known offset, then change the player's location, heading and minimap zoom. Repeat on foot and in a vehicle. Record clipping behavior and verify that the same world target remains under the figure. This example supplies no projection.

See [INK HUD and minimap](../ui-ink-and-minimap.md) for the decision between a HUD shape, point marker, CEF map and server geometry.
