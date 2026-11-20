---
title: Diagnostic for an INK minimap shape
description: Add a single diagnostic widget and check geometry, color, and world projection independently.
environment: client
verificationStatus: static-cross-check
aliases: [inkCircleWidget, hud diagnostic, minimap zones, спавн, виджет]
---
# Diagnostic for an INK minimap shape

The [typed client example](../../examples/minimap-diagnostic/client.ts) tests the `gameuiMinimapContainerController.OnInitialize` observer, one `inkCircleWidget`, one container and one `Color` overload. It removes the widget on resource stop. It was type-checked against `@cybermp/client-types@2.7.1`. The observer, rendering, and cleanup require a run on the target client.

## Set up the resource

Clone or copy the [example directory](../../examples/minimap-diagnostic/) into the development workspace. Bundle `client.ts` to `dist/client.js` using the [CyberMP TypeScript build guide](https://docs.cyber.mp/guides/recipes/typescript/#building-for-production), copy both the JavaScript and the provided manifest into a test resource, and enable the resource on the test server. Start the resource before the HUD initializes and connect with game natives enabled.

## Record the result

1. Record the game build, CyberMP client and server builds, and the kit revision. Confirm that initialization reaches the observer and that there is a widget reference.
2. Take a screenshot of the visible shape. Test geometry first, then the `Color` overload. Test any other tint overload as a separate run using the same shape and container.
3. Stop and restart the resource and reinitialize the HUD. Check that the old widget disappears and the new HUD has at most one test widget. If a hot reload misses the notification, repeat with a fresh connection.
4. For a world-aligned zone, add and verify projection separately. Set a target with a known offset, then change the player's location, heading and minimap zoom. Repeat on foot and in a vehicle. Record clipping behavior and verify that the same world target remains under the figure. This example supplies no projection.

See [INK HUD and minimap](../ui-ink-and-minimap.md) for the decision between a HUD shape, point marker, CEF map and server geometry.
